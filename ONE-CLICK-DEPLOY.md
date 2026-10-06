# 一鍵部署到 Render

這個版本已經準備好 Render Blueprint。

## 第一次只要做 3 件事

1. 把這個資料夾的內容上傳到一個 GitHub repository。
   - 請上傳「解壓後的檔案」，不要只把 ZIP 當成一個檔案上傳。
   - `.env` 不要上傳；本專案已經用 `.gitignore` 排除。

2. 在 GitHub repository 的 README 頁面點 **Deploy to Render**。
   - Render 會讀取根目錄的 `render.yaml`。
   - 若通用按鈕沒有自動抓到 repository，請在 Render 選 **New > Blueprint**，連接這個 GitHub repository。

3. Render 第一次建立時會要求你填 `OPENAI_API_KEY`。
   - 填入你自己的 OpenAI API Key。
   - 不要把 API Key 寫到 GitHub。
   - `OPENAI_MODEL` 已預設為 `gpt-6-luna`。

部署完成後，Render 會給你一個 `https://...onrender.com` 的公開網址。把這個網址傳給朋友即可。

## Render Deploy Button

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

> 最穩定的做法是在你建立 GitHub repository 後，把上面的連結改成：
> `https://render.com/deploy?repo=你的完整GitHubRepository網址`

例如：

`https://render.com/deploy?repo=https://github.com/yourname/english-article-lab`

## 已幫你設定的部署項目

- Node.js Web Service
- Singapore region
- Free plan
- `npm install` 自動安裝
- `npm start` 自動啟動
- `/healthz` 健康檢查
- API Key 在部署畫面輸入，不進 Git
- 關閉從模板來源觸發的自動部署，適合分享 Deploy button

## 注意成本

朋友使用翻譯／單字整理會使用你的 OpenAI API 額度。朗讀功能使用瀏覽器系統語音，不會呼叫 OpenAI 語音 API。
