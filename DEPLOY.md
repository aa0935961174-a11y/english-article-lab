# 部署總覽

本專案只有一份程式碼，可部署到 Render 或 Railway。

## 推薦流程

**GitHub = 程式碼來源**

你平常只更新 GitHub。Render 或 Railway 再從 GitHub 取得同一份程式碼部署。

---

## A. Render：最接近一鍵部署

專案根目錄已經有 `render.yaml`。

上傳到 GitHub 後，在 repository README 點：

**Deploy to Render**

第一次建立時 Render 會要求你填：

- `OPENAI_API_KEY`

其他設定已寫在 `render.yaml`：

- Node.js
- Singapore region
- `npm install`
- `npm start`
- `/healthz` 健康檢查
- `gpt-6-luna`

部署完成後會得到 `*.onrender.com` 公開網址。

---

## B. Railway：GitHub 連動部署

請看 `RAILWAY-DEPLOY.md`。

流程：

GitHub repo → Railway → Add Variables → Deploy → Generate Domain

Railway 對 Node/Express 可直接自動偵測，不需要額外的舊式 Config-as-Code 檔。

---

## GitHub 建議

repository 建議名稱：

`english-article-lab`

專案已包含：

- `.gitignore`：避免把 `.env` 上傳
- `.github/workflows/check.yml`：每次 push 自動檢查 Node.js 語法
- `.env.example`：部署環境變數範例

---

## 網站使用流程

1. 朋友打開公開網址
2. 貼整篇英文文章
3. 按「開始拆解」
4. 取得：
   - 逐句英文
   - 繁體中文翻譯
   - 英／中朗讀
   - 暫停、繼續、上一句、下一句
   - 語速與系統聲音選擇
   - TOEIC 300+ 重點單字／片語
   - 詞性與中文意思
   - 單字點擊發音

---

## 費用與防濫用

AI 分析使用你的 OpenAI API Key，所以朋友的分析次數會計入你的 API 用量。

目前程式內建：

- 每 IP 每小時 20 次分析
- 每篇文章最多約 24,000 字元
- API Key 只在伺服器端

若日後公開給更多人，建議再加入：
- 登入
- 每日額度
- Redis / Upstash rate limit
