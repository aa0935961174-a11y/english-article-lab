# Railway 部署

這個專案可直接從 GitHub 部署到 Railway，不需要 `railway.json`。

## 步驟

1. 先把整個專案推到 GitHub。
2. 在 Railway 建立新 Project。
3. 選 **Deploy from GitHub repo**，選擇這個 repository。
4. 在 Variables 加入：

```env
OPENAI_API_KEY=你的 OpenAI API Key
OPENAI_MODEL=gpt-6-luna
```

5. 部署後到服務的 Networking / Settings 產生 Public Domain。
6. 把產生的 `*.up.railway.app` 網址分享給朋友。

Railway 會自動偵測這是 Node.js / Express 專案，並使用 `npm start`。

## 更新網站

之後只要把修改 push 到 GitHub，連接該 repository 的 Railway 服務就能依 GitHub 更新重新部署。

## 安全

- 不要把 `.env` 上傳到 GitHub。
- `OPENAI_API_KEY` 只放 Railway Variables。
- 朋友不需要 OpenAI 帳號；AI 用量會計入站長的 API 額度。
