# 鏡行式｜展場互動

觀眾用手機選小夥伴、加照片（自動去背）和 emoji、留一句話，送出後出現在展場大螢幕上。

## 三個頁面

| 網址 | 用途 |
|---|---|
| `/` | 手機互動 App（觀眾掃 QR code 進來） |
| `/screen.html` | 展場大螢幕（點一下畫面進入全螢幕） |
| `/admin.html` | 作品管理，可以刪除不當內容 |

大螢幕可以用網址參數微調，不用改程式：
`/screen.html?max=12&speed=60&spot=7`

- `max`：畫面上最多同時幾件作品
- `speed`：飄動速度
- `spot`：每幾秒換一件作品放大

## 本機測試

```bash
npm install
npm run dev
```

終端機會顯示 `Network: http://192.168.x.x:5173`。手機和電腦連同一個 Wi-Fi 時，手機打開這個網址就能測試。

本機測試模式的作品存在 `.local-data/` 資料夾，刪掉這個資料夾就會清空所有作品。

## 其他指令

- `npm run assets`：重新壓縮 `figma-assets/` 裡的設計稿素材
- `npm run fetch-model`：下載去背模型的備份（約 56 MB）。IMG.LY 的 CDN 連不上時會改用這份
- `npm run build`：打包成正式版，輸出在 `dist/`

## 接上 Firebase（免費方案，不用綁卡）

作品圖片會壓縮成 WebP（約 150 KB），直接存在 Firestore 裡，不使用要綁卡的 Cloud Storage。

1. 到 [Firebase 主控台](https://console.firebase.google.com/) 建立專案（Spark 免費方案）
2. 新增一個「網頁應用程式」，把拿到的設定填進 `.env`（從 `.env.example` 複製）
3. 建立 Firestore Database，地區建議選 `asia-east1`（台灣）
4. 到「規則」分頁，貼上 `firestore.rules` 的內容。先把 `YOUR_ADMIN_EMAIL@gmail.com` 換成管理員的 Google 信箱，再按發布
5. 到 Authentication → 登入方式，開啟 Google 登入（管理頁刪除作品時要用）
