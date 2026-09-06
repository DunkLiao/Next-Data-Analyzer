# Next Data Analyzer TODO

更新時間：2026-09-06 08:45:00 +08:00

## 目標

將目前可編譯、核心測試已通過的 Next Data Analyzer 整理成可交付 v1。範圍聚焦在文件、測試缺口、桌面檔案 I/O 驗證、UI 冒煙檢查與小型視覺規格修正，不改變現有核心分析功能方向。

## 已確認狀態

- [x] `npm run check` 通過。
- [x] `npm test` 通過，現有 10 個測試檔、70 個案例全數通過。
- [x] `npm run build` 通過。
- [x] `npm run test:e2e` 通過，桌面與窄視窗各覆蓋 UTF-8 / Big5 範例。
- [x] `src-tauri` 目錄下 `cargo test` 通過，5 個 Rust unit tests 全數通過。
- [x] `src-tauri` 目錄下 `cargo check` 通過。
- [x] 專案目前不是 Git repository，暫不規劃 commit / push 流程。

## 待辦清單

### 1. 文件收尾

- [x] 將 `README.md` 從 Tauri 模板改寫為繁體中文使用手冊。
- [x] README 說明啟動方式：`npm run dev`、`npm run tauri dev`、`npm run build`。
- [x] README 說明支援資料來源：CSV、TSV、TXT、XLSX、XLS、剪貼簿文字、內建範例。
- [x] README 說明主要功能：總覽、缺失值分析、分布圖、相關矩陣、HTML 報告、CSV 統計匯出。
- [x] README 補上限制與疑難排解：512MB 檔案限制、Big5 / UTF-8 編碼切換、Excel 工作表切換、資料只在本機處理。

### 2. 前端與分析測試補強

- [x] 新增 `tests/encoding.test.ts`，覆蓋 UTF-8、UTF-8 BOM、Big5 強制重解碼與 fallback 行為。
- [x] 新增 `tests/excel.test.ts`，用 `xlsx` 建立記憶體活頁簿，驗證工作表讀取、空白列清理、日期 / 布林 / 數字轉字串與空欄名補齊。
- [x] 新增 `tests/report.test.ts`，驗證 `buildReportHtml` 的必要內容與 CSV 統計輸出。
- [x] 已將 CSV 匯出純格式化邏輯抽成 `buildStatsCsv(result)`，檔案選擇與寫入仍留在 `exportStatsCsv`。
- [x] 新增 worker 合約測試，覆蓋載入範例 CSV、分析、換編碼、取 rows 與 histogram。

### 3. Tauri 檔案 I/O 驗證

- [x] 將 `src-tauri/src/lib.rs` 中 `read_file_bytes` / `save_file_bytes` 的檔案讀寫核心抽成可測 helper。
- [x] 新增 Rust unit tests，驗證正常讀取、正常寫入、檔案不存在錯誤。
- [x] 新增 Rust unit test 驗證超過 512MB 的檔案會被拒絕，且錯誤訊息可讀。
- [x] 保留既有 Tauri command 名稱：`read_file_bytes`、`save_file_bytes`。

### 4. UI 冒煙測試與小型視覺收尾

- [x] 加入 `@playwright/test` dev dependency。
- [x] 新增 `test:e2e` script。
- [x] 新增 Playwright 冒煙測試：載入首頁、點選 UTF-8 / Big5 範例、切換總覽 / 缺失值 / 分布 / 相關 / 報表分頁。
- [x] 驗證主要圖表容器非空，報表匯出按鈕可見。
- [x] 將 CSS 卡片圓角從 10px 調整為 8px 或以下，並加入 e2e computed style 檢查。
- [x] 檢查主要按鈕、分頁與資料標籤在桌面與窄視窗不溢出。
- [x] 修正 `[hidden]` 元素被 `.modal-backdrop { display: flex }` 覆蓋導致初始 modal 可見的問題。
- [x] 修正窄視窗表格與分布欄寬造成的水平溢出。

### 5. 最終驗證

- [x] 執行 `npm run check`。
- [x] 執行 `npm test`。
- [x] 執行 `npm run build`。
- [x] 執行 `npm run test:e2e`。
- [x] 在 `src-tauri` 執行 `cargo test`。
- [x] 在 `src-tauri` 執行 `cargo check`。
- [x] 以 Playwright 驗收網頁版：載入兩個範例檔並切換所有分頁。
- [ ] 人工驗收桌面版：`npm run tauri dev` 後測試開檔、剪貼簿貼上、Excel 工作表切換、HTML / CSV 匯出。
  - 備註：目前環境未提供可操作原生 Tauri 視窗的人工驗收能力，因此不將此項目標記為完成。

## 不納入本輪

- [x] 不重寫核心分析演算法。
- [x] 不新增大型產品功能。
- [x] 不處理部署或雲端發布。
- [x] 不手動維護 `dist`、`node_modules`、`src-tauri/target`、`src-tauri/gen/schemas`。
