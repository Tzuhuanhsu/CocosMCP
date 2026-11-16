# 前端開發知識庫

本目錄收錄開發過程沉澱的知識，以 Markdown 檔案逐條記錄，供 Claude 與團隊成員按需查閱。

> **載入方式**：本目錄的檔案不會被自動載入到 context。Claude 透過專案 `CLAUDE.md` 的「知識庫索引」段落得知有哪些主題、何時該來查閱。新增／刪除檔案後，請同步更新 CLAUDE.md 的索引與本檔的索引。

---

## 目錄分類

| 資料夾             | 用途                                                       | 檔名前綴   |
| ------------------ | ---------------------------------------------------------- | ---------- |
| `patterns/`        | 開發模式與慣例：架構規則、命名、可重用的 how-to            | `pattern-` |
| `troubleshooting/` | 問題排查筆記：踩過的坑、bug 根因、debug 紀錄               | `ts-`      |
| `decisions/`       | 決策紀錄 (ADR)：為什麼這樣設計、技術選型、權衡取捨的歷史紀錄 | `adr-`     |
| `guides/`          | 各模組功能的操作指南                                       | `guide-`   |

每個資料夾都有 `_TEMPLATE.md`，新增筆記時複製它開始寫。

---

## 撰寫規範

每個檔案聚焦**單一主題**，使用描述性的 kebab-case 檔名（中英文皆可），開頭加上前綴。

### 檔案開頭統一使用 frontmatter

```markdown
---
title: 物件池使用慣例
category: pattern        # pattern | troubleshooting | adr | guide
tags: [pool, performance]
updated: 2026-01-01      # 絕對日期，YYYY-MM-DD
---
```

### 內容要求

- **可操作**：寫出「怎麼做」與「為什麼」，附上實際檔案路徑與程式碼片段。
- **連結相關**：用相對連結指向同知識庫其他檔案。
- **絕對日期**：避免「上週」「最近」，一律寫成 `YYYY-MM-DD`。
- **不重複 CLAUDE.md**：CLAUDE.md 已有的通則不必照抄，這裡記錄更深入、更具體的細節與案例。

---

## 索引

> 每新增一個檔案，在下方對應分類補一行：`- [標題](路徑) — 一句話說明`

### patterns/ — 開發模式與慣例
- [類別內部的 helper 一律用 private 實例方法](patterns/pattern-private-helper-methods.md) — 不要 private static；能讀 this 的欄位就別穿透成參數（文中的程式碼例子取自來源專案）

### troubleshooting/ — 問題排查筆記
- [MCP 場景操作被腳本重編譯打斷](troubleshooting/ts-mcp-scene-lost-on-recompile.md) — .ts 存檔會重載場景；腳本與場景任務不可並行；不存檔即零代價
- [編輯器內預覽執行中，MCP 的場景改動無聲遺失](troubleshooting/ts-mcp-edit-lost-during-preview.md) — 預覽時改動在停止時還原且不算 dirty；以 query-scene-mode 與 runtime_get_status 偵測，寫入前必檢查
- [編譯通過不代表型別正確](troubleshooting/ts-editor-transpile-only-no-typecheck.md) — 編輯器走 transpile-only 不做型別檢查；查引擎 d.ts 要確認方法歸屬哪個類別

### decisions/ — 決策紀錄
（尚無）

### guides/ — 配置／工具操作指南
- [每個 worktree 各開一個 Cocos 編輯器](guides/guide-editor-worktree.md) — tools/editor-worktree 的建立、即時監看與清理腳本；清理一律走腳本（node_modules junction）；編輯器自行改寫的檔不要提交
