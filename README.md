# 空中光弦｜Air Strings Mobile

手機瀏覽器手部追蹤互動實驗，使用一般前鏡頭、Google MediaPipe Hand Landmarker、Canvas 2D 與 Web Audio。這是獨立原創示範，不是 Sonic Deadhorse 的原始作品。

## 啟用 GitHub Pages（儲存庫擁有者操作一次）
1. 開啟 https://github.com/tornadolee1720/TEST/settings/pages
2. **Build and deployment → Source → Deploy from a branch**
3. **Branch → main → /(root) → Save**
4. 等 GitHub 顯示 **Your site is live at...**，其 HTTPS 網址預期為 https://tornadolee1720.github.io/TEST/

## 手機玩法
- 使用 iPhone Safari 或 Android Chrome 開啟 HTTPS 網址
- 點「開啟鏡頭，開始玩」，允許相機存取；首次需下載 MediaPipe 模型
- 雙手張開，食指或中指掃過光弦即可嘗試發聲；捏合再放開可觸發備援撥弦
- 單手也可拉弦；可以切換前後鏡頭、隱藏攝影機畫面、拍照、分享
- 請在明亮環境測試，保持雙手入鏡；手機需開聲音

## 資料與限制
- 網站程式不會自行將相機影格上傳到本站伺服器；辨識在瀏覽器端處理。
- 第三方 MediaPipe SDK 可能傳送使用或效能遙測資料至 Google，請參閱其隱私聲明。
- 手機相機辨識、幀率及音效尚未在實機驗收，不保證所有裝置可用。
- 需要 HTTPS、相機權限及網路下載 jsDelivr 套件與 Google 模型。
- 模型及 WASM 使用 `@mediapipe/tasks-vision@1.2.3`，聲音為 Web Audio 合成音；不使用原作者的錄音。

## 技術
原生 HTML + CSS + JavaScript；無後端、無資料庫、無商業訂閱。
