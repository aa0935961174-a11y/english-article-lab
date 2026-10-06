import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

const app = express();
const port = Number(process.env.PORT || 3000);
const model = process.env.OPENAI_MODEL || "gpt-6-luna";

if (!process.env.OPENAI_API_KEY) {
  console.warn("OPENAI_API_KEY is not set. /api/analyze will fail until you add it.");
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.set("trust proxy", 1);
app.use(express.json({ limit: "100kb" }));

// Simple in-memory rate limiter: 20 requests per IP per hour.
const buckets = new Map();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS = 20;

function rateLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || now - bucket.startedAt > WINDOW_MS) {
    bucket = { startedAt: now, count: 0 };
  }

  bucket.count += 1;
  buckets.set(key, bucket);

  if (bucket.count > MAX_REQUESTS) {
    return res.status(429).json({ error: "使用次數過多，請稍後再試。" });
  }

  next();
}

function safeJsonParse(text) {
  if (!text || typeof text !== "string") return null;

  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  try {
    return JSON.parse(cleaned);
  } catch {}

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {}
  }

  return null;
}

function countChars(text) {
  return Array.from(String(text || "").replace(/\s/g, "")).length;
}

function cleanText(value, max = 200) {
  return String(value || "").trim().slice(0, max);
}

function normalizeSummaryOptions(value) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  const result = [];

  for (const item of value) {
    const text = cleanText(item, 80);
    if (!text || countChars(text) > 30) continue;
    const key = text.replace(/\s/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length === 8) break;
  }

  return result;
}

function normalizeKeywordOptions(value) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  const result = [];

  for (const group of value) {
    if (!Array.isArray(group)) continue;
    const cleaned = group.slice(0, 3).map((x) => cleanText(x, 60)).filter(Boolean);
    if (cleaned.length !== 3) continue;

    const key = cleaned.map((x) => x.toLowerCase().replace(/\s+/g, " ")).join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length === 8) break;
  }

  return result;
}

function validatePayload(data) {
  if (!data || !Array.isArray(data.sentences) || !Array.isArray(data.vocabulary)) {
    return false;
  }

  const summaries = normalizeSummaryOptions(data.summary_options);
  const keywordGroups = normalizeKeywordOptions(data.keyword_options);

  if (summaries.length !== 8 || keywordGroups.length !== 8) return false;

  return data.sentences.every(
    (item) =>
      item &&
      typeof item.en === "string" &&
      item.en.trim() &&
      typeof item.zh === "string" &&
      item.zh.trim()
  );
}

app.post("/api/analyze", rateLimit, async (req, res) => {
  try {
    const article = typeof req.body?.article === "string" ? req.body.article.trim() : "";

    if (!article) {
      return res.status(400).json({ error: "請先貼上英文文章。" });
    }

    if (article.length > 24000) {
      return res.status(400).json({ error: "文章太長，請控制在約 24,000 個字元以內。" });
    }

    const instructions = `
You are an English learning assistant for Traditional Chinese learners in Taiwan.

Analyze the user's English article and return ONLY valid JSON.
Do not use Markdown fences.

Required JSON shape:
{
  "summary_options": [
    "Traditional Chinese summary 1",
    "Traditional Chinese summary 2",
    "Traditional Chinese summary 3",
    "Traditional Chinese summary 4",
    "Traditional Chinese summary 5",
    "Traditional Chinese summary 6",
    "Traditional Chinese summary 7",
    "Traditional Chinese summary 8"
  ],
  "keyword_options": [
    ["keyword or short phrase", "keyword or short phrase", "keyword or short phrase"],
    ["keyword or short phrase", "keyword or short phrase", "keyword or short phrase"],
    ["keyword or short phrase", "keyword or short phrase", "keyword or short phrase"],
    ["keyword or short phrase", "keyword or short phrase", "keyword or short phrase"],
    ["keyword or short phrase", "keyword or short phrase", "keyword or short phrase"],
    ["keyword or short phrase", "keyword or short phrase", "keyword or short phrase"],
    ["keyword or short phrase", "keyword or short phrase", "keyword or short phrase"],
    ["keyword or short phrase", "keyword or short phrase", "keyword or short phrase"]
  ],
  "sentences": [
    {"en": "exact English sentence", "zh": "natural Traditional Chinese translation"}
  ],
  "vocabulary": [
    {
      "word": "word or useful phrase",
      "part_of_speech": "n. / v. / adj. / adv. / phrase / etc.",
      "meaning_zh": "concise Traditional Chinese meaning"
    }
  ]
}

Rules:
1. Split the FULL article into sensible sentence-level chunks. Do not omit content.
2. Preserve the English meaning and wording faithfully; only repair obvious line-break artifacts.
3. Translate every sentence into natural Traditional Chinese used in Taiwan.
4. Create EXACTLY 8 summary_options. Each summary must be no more than 30 Chinese characters excluding spaces.
5. All 8 summaries must be faithful to the same article. They should express the central idea in meaningfully different wording or emphasis, not merely swap synonyms. Accuracy is more important than forced variety.
6. Avoid near-duplicate summaries. Use different sentence structures and, when the article supports it, different legitimate angles of emphasis.
7. Create EXACTLY 8 keyword_options. Each option must contain EXACTLY 3 English items.
8. A keyword item may be either one word or a short English phrase of about 2-4 words, such as "income inequality" or "AI-driven automation".
9. Every keyword or phrase must be directly supported by the article. Prefer words and phrases that actually appear in the article. Do not invent unrelated concepts just to create variety.
10. Make the 8 keyword groups meaningfully different where the article allows, while still representing the article accurately.
11. Vocabulary: select 24-45 useful words or phrases from THIS article that are worthwhile for a learner around TOEIC 300+ and above.
12. Do not include extremely basic words such as the, and, is, have, good, people unless they have a special phrase meaning.
13. Prefer useful academic, business, economic, workplace, and high-frequency reading vocabulary.
14. Part of speech must match the usage in the article.
15. Keep Chinese meanings short and memorization-friendly.
16. Remove duplicates and use the base form where appropriate.
17. Output JSON only.
`.trim();

    const response = await client.responses.create({
      model,
      store: false,
      max_output_tokens: 15000,
      input: [
        { role: "system", content: instructions },
        { role: "user", content: article }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "article_analysis",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              summary_options: {
                type: "array",
                minItems: 8,
                maxItems: 8,
                items: { type: "string" }
              },
              keyword_options: {
                type: "array",
                minItems: 8,
                maxItems: 8,
                items: {
                  type: "array",
                  minItems: 3,
                  maxItems: 3,
                  items: { type: "string" }
                }
              },
              sentences: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    en: { type: "string" },
                    zh: { type: "string" }
                  },
                  required: ["en", "zh"]
                }
              },
              vocabulary: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    word: { type: "string" },
                    part_of_speech: { type: "string" },
                    meaning_zh: { type: "string" }
                  },
                  required: ["word", "part_of_speech", "meaning_zh"]
                }
              }
            },
            required: ["summary_options", "keyword_options", "sentences", "vocabulary"]
          }
        }
      }
    });

    const parsed = safeJsonParse(response.output_text);

    if (!validatePayload(parsed)) {
      console.error("Invalid model JSON:", response.output_text?.slice(0, 1800));
      return res.status(502).json({
        error: "文章分析結果格式異常，請再按一次。"
      });
    }

    const summaryOptions = normalizeSummaryOptions(parsed.summary_options);
    const keywordOptions = normalizeKeywordOptions(parsed.keyword_options);

    const clean = {
      summary_options: summaryOptions,
      keyword_options: keywordOptions,
      // Keep the first choice for backward compatibility.
      summary_zh: summaryOptions[0],
      keywords: keywordOptions[0],
      sentences: parsed.sentences.slice(0, 300).map((x) => ({
        en: cleanText(x.en, 2000),
        zh: cleanText(x.zh, 2000)
      })),
      vocabulary: parsed.vocabulary
        .slice(0, 60)
        .map((x) => ({
          word: cleanText(x.word, 100),
          part_of_speech: cleanText(x.part_of_speech, 40),
          meaning_zh: cleanText(x.meaning_zh, 160)
        }))
        .filter((x) => x.word && x.meaning_zh)
    };

    res.json(clean);
  } catch (error) {
    console.error(error);
    const status = error?.status === 429 ? 429 : 500;
    res.status(status).json({
      error:
        status === 429
          ? "AI 使用量暫時達到限制，請稍後再試。"
          : "目前無法分析文章，請稍後再試。"
    });
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templatePath = path.join(__dirname, "public", "PRHW2-template.docx");

app.post("/api/export-word", rateLimit, async (req, res) => {
  try {
    const summary = cleanText(req.body?.summary, 100);
    const keywords = Array.isArray(req.body?.keywords)
      ? req.body.keywords.map((x) => cleanText(x, 60)).filter(Boolean)
      : [];
    const selectedWords = Array.isArray(req.body?.selectedWords)
      ? req.body.selectedWords.slice(0, 6).map((x) => ({
          word: cleanText(x?.word, 100),
          part_of_speech: cleanText(x?.part_of_speech, 40),
          meaning_zh: cleanText(x?.meaning_zh, 160)
        }))
      : [];

    if (!summary || countChars(summary) > 30) {
      return res.status(400).json({ error: "文章主旨必須在 30 字內。" });
    }

    if (keywords.length !== 3) {
      return res.status(400).json({ error: "請保留 3 個關鍵字或關鍵片語。" });
    }

    if (selectedWords.length !== 6 || selectedWords.some((x) => !x.word || !x.meaning_zh)) {
      return res.status(400).json({ error: "學習單需要選滿 6 個困難單字。" });
    }

    if (!fs.existsSync(templatePath)) {
      console.error("Missing worksheet template:", templatePath);
      return res.status(500).json({ error: "找不到學習單範本，請確認 PRHW2-template.docx 已放在 public 資料夾。" });
    }

    const templateBinary = fs.readFileSync(templatePath, "binary");
    const zip = new PizZip(templateBinary);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true
    });

    const keywordText = keywords.map((keyword, i) => `${i + 1}. ${keyword}`).join("    ");
    const vocabText = selectedWords
      .map((item, i) => {
        const pos = item.part_of_speech ? ` (${item.part_of_speech})` : "";
        return `${i + 1}. ${item.word}${pos}　${item.meaning_zh}`;
      })
      .join("\n");

    doc.render({
      mainIdea: summary,
      keywords: keywordText,
      vocabList: vocabText
    });

    const buffer = doc.getZip().generate({
      type: "nodebuffer",
      compression: "DEFLATE"
    });

    const filename = "PRHW2_學習單_完成版.docx";
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (error) {
    console.error("Word export failed:", error);
    res.status(500).json({ error: "Word 檔產生失敗，請稍後再試。" });
  }
});

app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(port, () => {
  console.log(`English Article Lab running on http://localhost:${port}`);
});
