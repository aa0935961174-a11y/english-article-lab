import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from "docx";

const app = express();
const port = Number(process.env.PORT || 3000);
const model = process.env.OPENAI_MODEL || "gpt-6-luna";

if (!process.env.OPENAI_API_KEY) {
  console.warn("OPENAI_API_KEY is not set. /api/analyze will fail until you add it.");
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.set("trust proxy", 1);
app.use(express.json({ limit: "100kb" }));

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

function validatePayload(data) {
  if (!data || !Array.isArray(data.sentences) || !Array.isArray(data.vocabulary)) {
    return false;
  }
  if (typeof data.summary_zh !== "string" || countChars(data.summary_zh) > 30) {
    return false;
  }
  if (!Array.isArray(data.keywords) || data.keywords.length !== 3) {
    return false;
  }
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
      return res.status(400).json({
        error: "文章太長，請控制在約 24,000 個字元以內。"
      });
    }

    const instructions = `
You are an English learning assistant for Traditional Chinese learners in Taiwan.

Analyze the user's English article and return ONLY valid JSON.
Do not use Markdown fences.

Required JSON shape:
{
  "summary_zh": "Traditional Chinese article summary, maximum 30 Chinese characters",
  "keywords": ["keyword1", "keyword2", "keyword3"],
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
4. summary_zh must capture the central idea of the FULL article in no more than 30 Chinese characters, excluding spaces. Keep it suitable for a school worksheet.
5. keywords must contain EXACTLY 3 English single-word keywords that best represent the article's central ideas. Use one word per item, not phrases.
6. Vocabulary: select 24-45 useful words or phrases from THIS article that are worthwhile for a learner around TOEIC 300+ and above.
7. Do not include extremely basic words such as the, and, is, have, good, people unless they have a special phrase meaning.
8. Prefer useful academic, business, economic, workplace, and high-frequency reading vocabulary.
9. Part of speech must match the usage in the article.
10. Keep Chinese meanings short and memorization-friendly.
11. Remove duplicates and use the base form where appropriate.
12. Output JSON only.
`.trim();

    const response = await client.responses.create({
      model,
      store: false,
      max_output_tokens: 14000,
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
              summary_zh: { type: "string" },
              keywords: {
                type: "array",
                minItems: 3,
                maxItems: 3,
                items: { type: "string" }
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
            required: ["summary_zh", "keywords", "sentences", "vocabulary"]
          }
        }
      }
    });

    const parsed = safeJsonParse(response.output_text);

    if (!validatePayload(parsed)) {
      console.error("Invalid model JSON:", response.output_text?.slice(0, 1500));
      return res.status(502).json({
        error: "文章分析結果格式異常，請再按一次。"
      });
    }

    const clean = {
      summary_zh: String(parsed.summary_zh || "").trim(),
      keywords: parsed.keywords.slice(0, 3).map((x) => String(x || "").trim()).filter(Boolean),
      sentences: parsed.sentences.slice(0, 300).map((x) => ({
        en: String(x.en).trim(),
        zh: String(x.zh).trim()
      })),
      vocabulary: parsed.vocabulary.slice(0, 60).map((x) => ({
        word: String(x.word || "").trim(),
        part_of_speech: String(x.part_of_speech || "").trim(),
        meaning_zh: String(x.meaning_zh || "").trim()
      })).filter((x) => x.word && x.meaning_zh)
    };

    if (clean.keywords.length !== 3 || countChars(clean.summary_zh) > 30) {
      return res.status(502).json({ error: "主旨或關鍵字格式異常，請再分析一次。" });
    }

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

function safeShortText(value, max) {
  const text = String(value || "").trim();
  return text.slice(0, max);
}

function worksheetTextRun(text, options = {}) {
  return new TextRun({
    text,
    font: "Microsoft JhengHei",
    size: options.size || 24,
    bold: Boolean(options.bold)
  });
}

function worksheetParagraph(text, options = {}) {
  return new Paragraph({
    alignment: options.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { after: options.after ?? 180, line: 360 },
    children: [worksheetTextRun(text, options)]
  });
}

app.post("/api/export-word", rateLimit, async (req, res) => {
  try {
    const summary = safeShortText(req.body?.summary, 100);
    const keywords = Array.isArray(req.body?.keywords)
      ? req.body.keywords.map((x) => safeShortText(x, 40)).filter(Boolean)
      : [];
    const selectedWords = Array.isArray(req.body?.selectedWords)
      ? req.body.selectedWords.slice(0, 6).map((x) => ({
          word: safeShortText(x?.word, 80),
          part_of_speech: safeShortText(x?.part_of_speech, 30),
          meaning_zh: safeShortText(x?.meaning_zh, 120)
        }))
      : [];

    if (!summary || countChars(summary) > 30) {
      return res.status(400).json({ error: "文章主旨必須在 30 字內。" });
    }
    if (keywords.length !== 3) {
      return res.status(400).json({ error: "請保留 3 個關鍵字。" });
    }
    if (selectedWords.length !== 6 || selectedWords.some((x) => !x.word || !x.meaning_zh)) {
      return res.status(400).json({ error: "學習單需要選滿 6 個困難單字。" });
    }

    const tableBorders = {
      top: { style: BorderStyle.SINGLE, size: 6, color: "B7B7B7" },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: "B7B7B7" },
      left: { style: BorderStyle.SINGLE, size: 6, color: "B7B7B7" },
      right: { style: BorderStyle.SINGLE, size: 6, color: "B7B7B7" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" }
    };

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: { top: 900, right: 900, bottom: 900, left: 900 }
            }
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 360 },
              children: [worksheetTextRun("PRHW2 學習單", { bold: true, size: 32 })]
            }),
            worksheetParagraph("壹、請問『AI-induced Productivity Growth』文章段落的主旨是什麼？（不超過 30 個字）", { bold: true, after: 120 }),
            worksheetParagraph(summary, { after: 320 }),
            worksheetParagraph("貳、針對『AI-induced Productivity Growth』文章段落，請你給該文章段落設定三個關鍵字。", { bold: true, after: 120 }),
            worksheetParagraph(`1. ${keywords[0]}    2. ${keywords[1]}    3. ${keywords[2]}`, { after: 320 }),
            worksheetParagraph("參、請從『AI-induced Productivity Growth』文章段落之中擷取六個你不懂的單字，確認中文意義，並且將之背起來。", { bold: true, after: 160 }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: tableBorders,
              rows: [
                new TableRow({
                  tableHeader: true,
                  children: [
                    new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, children: [worksheetParagraph("編號", { bold: true, center: true, after: 0 })] }),
                    new TableCell({ width: { size: 38, type: WidthType.PERCENTAGE }, children: [worksheetParagraph("單字／片語", { bold: true, center: true, after: 0 })] }),
                    new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [worksheetParagraph("中文意義", { bold: true, center: true, after: 0 })] })
                  ]
                }),
                ...selectedWords.map((item, i) => new TableRow({
                  children: [
                    new TableCell({ children: [worksheetParagraph(String(i + 1), { center: true, after: 0 })] }),
                    new TableCell({ children: [worksheetParagraph(`${item.word}${item.part_of_speech ? ` (${item.part_of_speech})` : ""}`, { after: 0 })] }),
                    new TableCell({ children: [worksheetParagraph(item.meaning_zh, { after: 0 })] })
                  ]
                }))
              ]
            })
          ]
        }
      ]
    });

    const buffer = await Packer.toBuffer(doc);
    const filename = "PRHW2_學習單_完成版.docx";
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

app.listen(port, () => {
  console.log(`English Article Lab running on http://localhost:${port}`);
});
