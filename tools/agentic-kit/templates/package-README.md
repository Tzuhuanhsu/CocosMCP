# agentic-kit 安裝包

把 Claude Code 的 Cocos 開發環境佈署到一個 Cocos Creator 專案：skills（含 agent）、知識庫骨架與通用筆記、
worktree 平行開發與 dashboard 腳本、cocos-mcp 擴充。打包資訊（建置時間、來源 commit、Creator 版本）見 `kit.json`。

## 需求

- Windows、PowerShell 7（`pwsh`）、git
- 目標是 git repo 裡的 Cocos Creator 專案（含 `package.json` 的那層目錄）

## 安裝

把目標專案的資料夾拖到 `install.cmd` 上，或在這個資料夾執行：

```
install.cmd D:\yourGame\Model.Cocos -DryRun     先看會做什麼，不寫入
install.cmd D:\yourGame\Model.Cocos
```

也可以直接執行 `pwsh -File Install-AgenticKit.ps1 -TargetProject <目錄> [-DryRun] [-Force]`。

- 目標已有的檔案一律略過並列出，加 `-Force` 才覆蓋。
- 目標沒有 `CLAUDE.md` 時會建立一份；已經有就不動，改為提示要併入哪兩節（範本在 `templates\CLAUDE.md`）。
- 只會補 repo `.gitignore` 裡缺的規則，不 commit。

## 安裝後

1. 用 Cocos Creator 開啟目標專案一次：cocos-mcp 會自動啟動，埠依專案 UUID 決定，並寫出 `.mcp.json`。
2. 在目標專案目錄以互動模式執行 `claude`，接受「信任這個資料夾」與 `.mcp.json` 的 cocos-mcp。
   **沒信任時 skill 仍可用，但 skill 附的 agent 不會註冊，而且沒有任何提示。**
3. 要從 Windows Terminal 下拉選單一鍵開 dashboard：執行目標的 `tools\editor-worktree\Install-DashboardProfile.ps1`（每台電腦一次）。
4. 在 claude 裡輸入 `/agentic-cocos help` 看可用指令；用法與常見錯誤見目標的 `.claude\library\guides\guide-editor-worktree.md`。

## 注意

- cocos-mcp 擴充含 `node_modules`（約 30 MB）。目標 repo 通常忽略 `node_modules/`，要讓其他成員免 `npm install`
  就能載入擴充，得另外 `git add -f extensions/cocos-mcp-server/node_modules`。
- `ts-review-skill` 的審查標準裡有「Framework 層禁止 `Math.random()`、FrameSync 層」的分層規則，來自原專案；
  目標專案沒有這種分層時，請修改 `.claude\skills\ts-review-skill\` 底下的對應條目。
- 從網路下載的 zip 解壓後，若 PowerShell 擋下腳本，用 `install.cmd`（已帶 `-ExecutionPolicy Bypass`），
  或先執行 `Get-ChildItem -Recurse | Unblock-File`。
