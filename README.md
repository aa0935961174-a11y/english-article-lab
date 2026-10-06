# English Article Lab — Homework Edition

公開英文學習網頁：貼上完整英文文章，一鍵產生逐句英中對照、朗讀、重點單字與課堂學習單，最後可直接下載 Word。

## 功能

- 整篇英文文章一鍵分析
- 逐句英文＋繁體中文翻譯
- 英文／中文朗讀
- 暫停、繼續、上一句、下一句
- 語速與系統語音選擇
- 自動播放下一句
- TOEIC 300+ 實用單字／片語整理
- 詞性＋繁體中文意思
- 點單字即可發音
- 自動整理 30 字內中文主旨
- 自動整理 3 個英文關鍵字
- 自己挑選困難單字
- 先選 3 個可當作本週重點；學習單模式要求選滿 6 個
- 一鍵下載 `PRHW2_學習單_完成版.docx`

## 學習單對應

目前 Word 匯出對應 PRHW2：

1. AI-induced Productivity Growth 文章主旨（不超過 30 字）
2. 三個關鍵字
3. 六個不懂的單字＋中文意義

## 架構

```text
朋友的瀏覽器
      ↓
公開網站（Render / Railway）
      ↓
Node.js + Express 後端
      ↓
OpenAI Responses API
      ↓
翻譯＋主旨＋關鍵字＋單字整理
      ↓
Word (.docx) 匯出
```

朗讀使用瀏覽器 `SpeechSynthesis`，不另外呼叫語音 API。
Word 使用 `docx` 套件在伺服器端即時產生。

## 本機執行

需要 Node.js 20+：

```bash
npm install
cp .env.example .env
npm start
```

`.env`：

```env
OPENAI_API_KEY=你的_OpenAI_API_Key
OPENAI_MODEL=gpt-6-luna
PORT=3000
```

開啟：

```text
http://localhost:3000
```

## 部署

原本的 Render / Railway 部署方式可繼續使用。部署平台需要設定：

- `OPENAI_API_KEY`
- `OPENAI_MODEL=gpt-6-luna`

## 安全與成本

- `.env` 已被 `.gitignore` 排除。
- API Key 只放伺服器端。
- AI 分析會計入站長的 OpenAI API 用量。
- 朋友不需要自己的 OpenAI 帳號。
- 每 IP 每小時最多 20 次 API 請求。

## Word 輸出示範

專案的 `samples/PRHW2_示範輸出.docx` 是排版示範。網站正式使用時，會依使用者輸入的文章、AI 主旨與關鍵字，以及使用者自己挑選的 6 個困難單字，即時產生新的 Word 檔。
