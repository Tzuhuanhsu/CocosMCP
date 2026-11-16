# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概況

本目錄是一個 **Cocos Creator {{CREATOR_VERSION}}** 專案（專案 UUID 定義於 `package.json`）。

型別檢查請用編輯器內建的 TypeScript：
`C:/ProgramData/cocos/editors/Creator/{{CREATOR_VERSION}}/resources/app.asar.unpacked/node_modules/typescript/lib/tsc.js`。
只檢查 `assets/` 的錯誤可執行 `node tools/editor-worktree/check-assets-types.mjs`。

## 開發守則

撰寫或審查 TypeScript 前，先讀 `.claude/instruction/typescript-code-standards.md`，新寫的程式碼須符合該文件。

### 決策與變更經過記在 decisions，不寫進程式碼註解

變更經過、決策理由、與上游或其他專案的差異不寫進程式碼註解，一律記錄在 `.claude/library/decisions/`
（依 `decisions/_TEMPLATE.md` 新增 `adr-*.md`）。註解只描述程式碼**現在**做什麼、呼叫前提與限制；
需要交代理由時只寫一句結論並指向 ADR。

## 知識庫索引

`.claude/library/` 收錄開發過程沉澱的知識，**不會自動載入 context**。
遇到下列主題時主動去讀對應檔案；新增或刪除筆記後同步更新此索引與 `.claude/library/README.md`。

| 主題 | 檔案 | 什麼時候該讀 |
|---|---|---|
| MCP 場景操作被打斷 | `troubleshooting/ts-mcp-scene-lost-on-recompile.md` | MCP 節點操作無聲失效、`Node not found`、當前場景莫名被抽換時；分派並行 agent 前也該讀 |
| 預覽中改動遺失 | `troubleshooting/ts-mcp-edit-lost-during-preview.md` | MCP 回成功但存檔沒寫入、讀回值莫名在變、`query-dirty` 恆為 false 時 |
| 類別 helper 的寫法 | `patterns/pattern-private-helper-methods.md` | 要在類別內加 helper 方法、猶豫該不該用 `static` 時 |
| 編譯通過 ≠ 型別正確 | `troubleshooting/ts-editor-transpile-only-no-typecheck.md` | 改到引擎 API、或從其他專案匯入程式碼並接線時；執行期炸在「不存在的方法」上時 |
| worktree 平行開發 | `guides/guide-editor-worktree.md` | 要讓多個 agent／session 各自在 worktree 開編輯器與 cocos-mcp 平行開發、跑 `tools/editor-worktree/` 的腳本、用 `/agentic-cocos` 或 `Get-EditorWorktree.ps1 -Watch` 看各 session 狀態、或要刪 worktree 時 |

分類與撰寫規範見 `.claude/library/README.md`。

## Claude 工具

- `/cocos-develop`：Cocos 開發流程總控（內附 `cocos-creator-developer`、`cocos-mcp-dev-assistant` 兩個 agent）。
- `/ts-review-skill`：TypeScript review 與 commit（內附 `TypescriptReview-Agent`、`GitCommit-Agent`）。
- `/agentic-cocos`：worktree 平行派工與即時監看（`/agentic-cocos help` 列出指令）。
- skill 內附的 agent 以 plugin 形式註冊，**Claude Code 必須從本目錄啟動**才會出現。
- cocos-mcp 擴充在 `extensions/cocos-mcp-server/`：編輯器啟動後自動開 MCP server，埠依專案 UUID 決定，並寫進本目錄的 `.mcp.json`。
