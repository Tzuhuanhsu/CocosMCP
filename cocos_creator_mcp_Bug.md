# Cocos Creator MCP Server — Bug 記錄

> 記錄 `cocos-mcp-server` 擴充套件透過 MCP 操作場景時發現的缺陷，供**後續統一修正**。
> 每個 bug 皆附：問題位置（檔案:行號）、錯誤碼片段、根因、建議修法、暫時 workaround。

## 環境資訊

| 項目 | 內容 |
|------|------|
| 套件名稱 | `cocos-mcp-server` |
| 版本 | `1.4.0`（author: LiDaxian） |
| 套件位置 | `extensions/cocos-mcp-server/` |
| 執行檔 | 以編譯後的 `dist/*.js` 執行（套件**未隨附 `source/` TS 原始碼**，sourcemap 指向 `../source/...`） |
| 修正方式 | 直接改 `dist/*.js`；若取得上游 TS 原始碼則改 `.ts` 後 `npm run build` |
| 發現日期 | 2026-06-23 |
| Cocos 設計解析度（測試場景） | 960 × 640 |

## 嚴重度總覽

| # | Bug | 嚴重度 | 影響範圍 |
|---|-----|--------|----------|
| 1 | `set_node_transform` 把 Vec3 每個軸多包一層 `{value}` | 🔴 Critical | 所有經此工具設定的 position / rotation / scale 全部損毀；`create_node` 初始 transform 亦受影響 |
| 2 | `color` 實際只接受 hex 字串，RGBA 物件被拒 | 🟠 Medium | 與工具說明（宣稱支援物件）不符，誤導呼叫端 |
| 3 | `size` / `contentSize` 物件值被拒 | 🟠 Medium | 無法透過 `set_component_property` 設定 UITransform 尺寸 |
| 4 | `set_component_property` 設定 **asset 陣列**時，整個陣列被塞進單一 `__uuid__` | 🟠 Medium | 無法設定 `SpriteFrame[]` / `Node[]` / 任意 asset 陣列型別的屬性 |

---

## 🔴 Bug #1（Critical）— `set_node_transform` 寫出畸形 Vec3，導致縮放/位置歸零

### 問題位置
`extensions/cocos-mcp-server/dist/tools/node-tools.js` — `setNodeTransform()`，第 **747 / 760 / 773** 行（position / rotation / scale 三處）。

### 現況程式碼（錯誤）
```js
// position (line 747)
dump: { type: 'cc.Vec3', value: { x: { value: pv.x }, y: { value: pv.y }, z: { value: pv.z } } }
// rotation (line 760)
dump: { type: 'cc.Vec3', value: { x: { value: rv.x }, y: { value: rv.y }, z: { value: rv.z } } }
// scale (line 773)
dump: { type: 'cc.Vec3', value: { x: { value: sv.x }, y: { value: sv.y }, z: { value: sv.z } } }
```

### 建議修正
每個軸 x / y / z 應為**純數字**，不可再包一層 `{ value: ... }`：
```js
// position
dump: { type: 'cc.Vec3', value: { x: pv.x, y: pv.y, z: pv.z } }
// rotation
dump: { type: 'cc.Vec3', value: { x: rv.x, y: rv.y, z: rv.z } }
// scale
dump: { type: 'cc.Vec3', value: { x: sv.x, y: sv.y, z: sv.z } }
```

### 根因
Cocos 的 `Editor.Message.request('scene', 'set-property', { dump })` 中，dump 的「最外層屬性」要包成 `{ type, value }`（正確），但 Vec3 內部的 `x/y/z` 應是純數字。作者把「外層包 `{value}`」的規則**多套用了一層到每個軸**，於是把物件 `{ value: 0.7333 }` 塞進只接受數字的 `vec.x`。

### 因果鏈（為何 Scale 會變 0）
1. `vec.x = { value: 0.7333 }` → 物件被存進節點
2. 序列化進場景檔 → `"x": { "value": 0.7333 }`（正常應為 `"x": 0.7333`）
3. 重新載入 / Inspector 顯示 / 引擎渲染時，把物件當數字讀 → 無法轉換 → **退化為 0**
4. scale=0 → 節點不顯示；position 各軸亦歸零 → 節點全部疊到原點

### 症狀
- Inspector 中該節點 **Scale 顯示 0**、Position 歸零
- 節點在場景 / 預覽中**不可見**
- 工具當下回報 `success / changeVerified: true`（**假性成功**，見下）

### 為何工具會「假性成功」
`setNodeTransform` 設定後立即 `getNodeInfo` 讀回驗證，但讀回的就是**已損毀**的 `{value:N}` 結構，比對「有變更」即回報成功。實際錯誤要到引擎渲染 / 場景重載 / Inspector 以數字呈現時才暴露。

### 對照組（為何顏色、貼圖正常）
`setNodeProperty()`（同檔 **第 679 行**）用單層 `dump: { value: value }`，未多包，格式正確；顏色 / spriteFrame 等元件屬性走另一條路，故能正常生效。問題**僅出在 `setNodeTransform`**。

### 暫時 workaround（本次採用）
1. 用 `set_node_transform` 設定後，直接修正存檔的 `.scene`：把 `{ "value": N }` 還原成 `N`：
   ```bash
   perl -0777 -i -pe 's/\{\s*"value":\s*(-?\d+(?:\.\d+)?)\s*\}/$1/g' assets/scene/main.scene
   ```
   修完需在編輯器**重新載入場景**（勿先存檔，以免記憶體舊值覆蓋）。
2. 或改用 `set_node_property`（`path: 'position'`，單層 dump，格式正確）作為替代設定途徑。

---

## 🟠 Bug #2（Medium）— `color` 實際只吃 hex 字串，RGBA 物件被拒

### 問題位置
`extensions/cocos-mcp-server/dist/tools/component-tools.js`
- `parseColorString()` 第 **1490–1508** 行：**只**支援 `#RRGGBB` / `#RRGGBBAA`
- `color` 分支第 **582–598** 行
- 值正規化第 **567–568** 行

### 症狀（實測）
傳入 RGBA 物件 `{"r":26,"g":26,"b":46,"a":255}` 時回報：
```
Invalid color format: "{"r":26,"g":26,"b":46,"a":255}".
Only hexadecimal format is supported (e.g., "#FF0000" or "#FF0000FF")
```
即：物件值以**字串形式**抵達，未被穩定還原為物件，落入只支援 hex 的 `parseColorString` 而被拒。

### 與文件不符
工具 schema 的 `value` 說明明確宣稱支援 `color: {"r":255,"g":0,"b":0,"a":255}`（物件），但實作只在「值已是物件」時走 587–595 分支；經 MCP 傳入的物件常以字串到達，導致與說明不一致。

### 建議修正
1. 在第 567–568 的正規化，確保 `color` 的字串值一律先 `JSON.parse`（失敗才視為色彩字串）；或
2. 讓 `parseColorString` 在偵測到 JSON 物件字串時轉交物件分支處理；並
3. 同步修正 schema 說明，明確標示實際支援格式。

### 暫時 workaround（本次採用）
一律傳 **hex 字串** `#RRGGBBAA`（例：`#1A1A2EFF`）。

---

## 🟠 Bug #3（Medium）— `size` / `contentSize` 物件值被拒

### 問題位置
`extensions/cocos-mcp-server/dist/tools/component-tools.js` — `size` 分支第 **623–632** 行；值正規化第 **567–568** 行。

### 症狀（實測）
以 `propertyType: 'size'`、`value: {"width":110,"height":110}` 設定 `cc.UITransform.contentSize` 時回報：
```
Size value must be an object with width, height properties
```
即：值未以物件形式抵達第 624 行的 `typeof value === 'object'` 檢查（被當字串），於是在第 631 行被拒。

### 建議修正
與 Bug #2 同源 — 強化第 567–568 的值正規化，對 `size`/`vec2`/`vec3`/`color` 等結構型別，無論傳入字串或物件都先穩定 `JSON.parse` / 正規化後再進入各 `case` 驗證。

### 暫時 workaround（本次採用）
改用 `set_node_transform` 的 **scale**（強型別物件參數）間接控制視覺大小（例：原 150×150 以 scale 0.733 縮為 ~110×110）。
⚠️ 注意：此 workaround 會踩到 **Bug #1**，故需再搭配 Bug #1 的存檔修正。

---

## 🟠 Bug #4（Medium）— `set_component_property` 設定 asset 陣列時，整個陣列被塞進單一 `__uuid__`

### 問題位置
`extensions/cocos-mcp-server/dist/tools/component-tools.js` — `set_component_property` 處理 `propertyType: 'asset'`（及 `spriteFrame` / `prefab` 等 asset 型別）的分支；值正規化第 **567–568** 行附近。

### 症狀（實測）
對自訂腳本的 `spriteFrames: SpriteFrame[]` 屬性，以 `propertyType: 'asset'`、`value: ["uuidA@f9941", "uuidB@f9941", "uuidC@f9941"]`（uuid 陣列）設定時，工具回報 `success`（但 `changeVerified: false`），實際寫入 `.scene` 卻是：
```jsonc
// 錯誤：整個 JSON 陣列字串被當成單一 asset 的 uuid
"spriteFrames": {
  "__uuid__": "[\"uuidA@f9941\", \"uuidB@f9941\", \"uuidC@f9941\"]",
  "__expectedType__": "cc.SpriteFrame"
}
```
正確應為 asset 參考的**陣列**：
```jsonc
"spriteFrames": [
  { "__uuid__": "uuidA@f9941", "__expectedType__": "cc.SpriteFrame" },
  { "__uuid__": "uuidB@f9941", "__expectedType__": "cc.SpriteFrame" },
  { "__uuid__": "uuidC@f9941", "__expectedType__": "cc.SpriteFrame" }
]
```

### 根因
asset 分支未針對「陣列值」做展開：直接把整個傳入值（陣列被序列化成字串）填入單一 dump 的 `__uuid__`。工具也**缺少 asset 陣列型別**（schema 僅有 `nodeArray` / `colorArray` / `numberArray` / `stringArray`，無 `assetArray` / `spriteFrameArray`），故無正規路徑可設定 `SpriteFrame[]`。`changeVerified: false` 即為徵兆。

### 建議修正
1. asset 分支偵測到傳入值為陣列時，逐元素產生 `{ __uuid__, __expectedType__ }` 並組成陣列 dump。
2. schema 補上 asset 陣列型別（如 `assetArray` / `spriteFrameArray` / `prefabArray`），並在說明標示每元素為 uuid。
3. `changeVerified` 對陣列屬性亦應確實比對（目前回報 false 卻仍寫入錯誤值）。

### 暫時 workaround（本次採用）
存檔後直接修正 `.scene`：把畸形的單一 `{ __uuid__: "[...]" }` 還原為正確的 asset 參考陣列，再於編輯器**重新載入場景**（勿先存檔，以免記憶體舊值覆蓋）。

---

## ⚠️ 共通注意事項 — 磁碟編輯 `.scene` 的快取陷阱

凡是採用「直接修改 `.scene` 檔」的 workaround（Bug #1 / #4），務必注意：**編輯器服務的是 `library/` 的快取解析結果，不是磁碟原檔**。

實測：改完 `.scene` 後，以下方式**都讀不到**新內容（仍回舊快取）：
- `scene_open_scene`（對已開啟的場景是 no-op，不重讀磁碟）
- `sceneAdvanced_soft_reload_scene`
- `scene_close_scene` + `scene_open_scene`

**正確流程**（缺一不可）：
1. 編輯磁碟 `.scene`（確認場景在編輯器內為 clean，避免記憶體舊值於存檔時覆蓋磁碟）。
2. `project_reimport_asset`（url = 該 `.scene`）→ 清掉 library 快取、以新檔重建。
3. `scene_close_scene` → `scene_open_scene` → 編輯器才真正載入磁碟新內容。
4. 用 `component_get_components` 比對 uuid 確認**編輯器記憶體**已與磁碟一致（非只看磁碟）。

> 補充：`project_get_asset_details` 會對 `type: "texture"` 的圖片**誤報**一個不存在的 `@f9941` spriteFrame 子資源；以該幻影 uuid 設給 `SpriteFrame` 屬性會變成 missing。需用 sprite-frame 類型的圖片（檢查 `.meta` 的 `userData.type` 應為 `sprite-frame`），或以 `save_asset_meta` 改類型後重匯入。

## 共同根因（主題）

此套件是包裝 Cocos 編輯器 `Editor.Message.request('scene', 'set-property', { dump })` 的第三方插件。核心問題集中在 **MCP JSON 值 ↔ Cocos dump 格式之間的值轉換（marshalling）不一致**：

- **Bug #1**：dump 的 Vec3 巢狀層級模型錯誤（多包一層 `{value}`）。
- **Bug #2 / #3**：結構型別（color/size/vec）的值在「字串 vs 物件」之間正規化不穩定，導致落入過嚴的驗證而被拒。
- **Bug #4**：asset 陣列值未展開，整個陣列字串塞進單一 `__uuid__`；且缺少 asset 陣列型別的正規路徑。

非 MCP 協定或 Cocos 引擎的問題，而是插件實作缺陷。

## 建議的統一修正方向

1. **修 Bug #1（最優先）**：移除 `setNodeTransform` 三處 dump 內每軸的 `{ value: ... }` 包裝（改純數字）。
2. **統一值正規化**：在 `set_component_property` 進入各 `case` 前，對所有結構型別（color / size / vec2 / vec3）做一致的「字串→物件」解析與型別正規化。
3. **修正驗證邏輯**：`changeVerified` 不應只比對「設定後讀回的 dump」，應比對**正規化後的目標值 vs 實際純量值**，避免假性成功。
4. **同步更新 schema 說明**：讓 `value` 各型別的「實際接受格式」與說明一致。
5. 修正後若改的是 `dist/`，務必重載插件；若有 TS 原始碼則 `npm run build` 後重載。

## 驗證方式

- **Bug #1**：用 `set_node_transform` 設定任一節點 scale 後，檢查 `assets/scene/*.scene` 中該節點 `_lscale`，應為 `"x": 0.733`（純數字）而非 `"x": { "value": 0.733 }`；Inspector 的 Scale 不應為 0。
- **Bug #2 / #3**：以物件值（非字串）呼叫 `set_component_property` 設定 `color` / `contentSize`，應成功而非回報格式錯誤。

## 上游修正狀態（cocoscratorMCP repo，2026-06-30）

> 已在 `cocos-mcp-server` 原始碼（`source/tools/*.ts`）統一修正並重新 `npm run build`。

| # | Bug | 狀態 | 修正內容 |
|---|-----|------|----------|
| 1 | Vec3 多包一層 `{value}` | ✅ 此版已正確 | `source/tools/node-tools.ts` `setNodeTransform()` 已用單層 `dump:{ value:{x,y,z} }`（純數字，經 `normalizeTransformValue` 產生），無需再改 |
| 2 | `color` RGBA 物件被拒 | ✅ 已修 | 新增 `normalizeStructuredValue()`，進入 switch 前把 JSON 字串還原為物件（hex 字串維持原樣交 `parseColorString`） |
| 3 | `size`/`contentSize` 物件被拒 | ✅ 已修 | 同 #2，`size`/`vec2`/`vec3` 等結構型別字串值統一先 `JSON.parse` |
| 4 | asset 陣列塞進單一 `__uuid__` | ✅ 已修 | 新增 `assetArray`/`spriteFrameArray`/`prefabArray` 三型別：switch 逐元素展開為 `{uuid}`，dump 分支以陣列＋element asset type 設定；schema enum/說明同步補上 |

修改檔案：
- `source/tools/component-tools.ts`（新增 `normalizeStructuredValue`、asset 陣列 case 與 dump 分支、schema enum/說明）
- 重新編譯 → `dist/tools/component-tools.js`

⚠️ 套用方式：覆蓋目標專案 `extensions/cocos-mcp-server/dist/` 後，於 Cocos 編輯器**重載擴充套件**（或重啟編輯器）即生效。

---

## 本次 session 的處置摘要

- 已用 perl 還原 `assets/scene/main.scene` 內所有 `{value:N}` → `N`（備份於 `main.scene.bak`）。
- 9 個符號改用專案實際的 `white_rect`（uuid `1654ce28-3f12-45b1-8a07-539abc911456@f9941`）作為彩色方塊。
- 背景 / 金框 / 轉輪原使用內建柔邊圖 `b730527c-...`（呈圓角模糊），已一併改為 `white_rect`。
