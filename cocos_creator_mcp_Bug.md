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
| 5 | `instantiate_prefab` 未傳 `type:'cc.Prefab'`，建立出**未連結**預製體的普通節點（`_prefab` 為 null） | 🟠 Medium | 實例化的節點與 prefab 無雙向連結，無法 revert/同步 prefab 更新 |

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

## 上游修正狀態（CocosMCP repo，2026-06-30）

> 已在 `cocos-mcp-server` 原始碼（`source/tools/*.ts`）統一修正並重新 `npm run build`，且**逐一以 MCP 工具實測 + 讀磁碟序列化驗證**。原始碼已提交至 `https://github.com/Tzuhuanhsu/CocosMCP.git`。

| # | Bug | 狀態 | 修正內容 |
|---|-----|------|----------|
| 1 | Vec3 transform dump 格式 | ✅ 已修+已驗 | `source/tools/node-tools.ts` 新增 `buildVec3Dump()`，三處 dump 改用 `{ type:'cc.Vec3', value:{ x, y, z } }`（**帶 `type` + 純數字軸**）。詳見下方「Bug #1 正解」 |
| 2 | `color` RGBA 物件被拒 | ✅ 已修+已驗 | 新增 `normalizeStructuredValue()`，進入 switch 前把 JSON 字串還原為物件（hex 字串維持原樣交 `parseColorString`） |
| 3 | `size`/`contentSize` 物件被拒 | ✅ 已修+已驗 | 同 #2，`size`/`vec2`/`vec3` 等結構型別字串值統一先 `JSON.parse` |
| 4 | asset 陣列塞進單一 `__uuid__` | ✅ 已修+已驗 | 新增 `assetArray`/`spriteFrameArray`/`prefabArray` 三型別；dump 改為 `{ type, isArray:true, value:[ { type, value:{ uuid } }, ... ] }`（**每元素為獨立 sub-dump**） |

### Bug #1 正解（重要）

此 Cocos 版本（3.8.x）的 `scene:set-property` 對 cc.Vec3 屬性，正確 dump 為：

```js
dump: { type: 'cc.Vec3', value: { x: 120, y: -45, z: 0 } }   // 各軸純數字
```

與 `query-node` 回傳結構對稱（正常節點的 `dump.position.value = { x:N, y:N, z:N }`）。兩個曾踩過的錯誤寫法：

- **漏 `type`**（`{ value:{x,y,z} }`）：編輯器無法解析 Vec3 路徑，對各軸做 `'value' in axis`，純數字軸拋 `Cannot use 'in' operator to search for 'value' in <number>`。
- **把軸包成 `{ value:N }`**：避開上面的例外，但包裝物件被原樣存入節點，序列化成 `"x": { "value": N }`，重載後退化為 0（即本文件最初記錄的 Bug #1 損毀現象）。

> 修正後實測：set position/rotation/scale → 存檔 → 讀磁碟，`_lpos`/`_lscale` 為純數字、`_lrot` 為正確 Quat、`_euler.z` 正確，無 `{value:N}` 殘留。

### 已知殘留（非阻斷）

- Bug #4 設定陣列成功且序列化正確，但回傳 `changeVerified: false`——`verifyPropertyChange` 尚未對陣列屬性做逐元素比對（僅驗證旗標誤報，寫入本身正確）。屬後續可改善項。

修改檔案：
- `source/tools/node-tools.ts`（新增 `buildVec3Dump()`、三處 transform dump 改用之）
- `source/tools/component-tools.ts`（`normalizeStructuredValue`、asset 陣列 case 與 dump 分支、schema enum/說明）
- 重新編譯 → `dist/tools/*.js`

⚠️ 套用方式：覆蓋目標專案 `extensions/cocos-mcp-server/dist/` 後，於 Cocos 編輯器**重載擴充套件**（或重啟編輯器）即生效。改 `dist` 後若不重載，執行中的 server 仍跑舊碼。

---

## 🟠 Bug #5（Medium）— `instantiate_prefab` 建立未連結的節點（`_prefab` 為 null）

### 問題位置
`source/tools/prefab-tools.ts` — `instantiatePrefab()`（對應 `dist/tools/prefab-tools.js`）。

### 現況程式碼（錯誤）
```ts
const createNodeOptions: any = { assetUuid: assetInfo.uuid };   // ← 只有 assetUuid，缺 type
// ...
if (args.position) { createNodeOptions.dump = { position: { value: args.position } }; } // dump 在 create-node 未被使用
```

### 根因
編輯器 `scene` 的 `create-node` 訊息由 `cce.Node.createNodeFromAsset(parent, assetUuid, options)` 處理，內部以 `switch(options.type)` 決定行為；唯有 `case 'cc.Prefab'` 會呼叫 `cce.Prefab.createNodeFromPrefabAsset(asset)` 建立帶 `_prefab.instance` 的**連結實例**。只傳 `assetUuid` 而**不帶 `type`**會落入預設分支，產生未連結的普通節點，存檔後 `_prefab` 為 `null`。

> 旁證：原始碼中的 `establishPrefabConnection()` / `manuallyEstablishPrefabConnection()` 為死碼，且呼叫 `connect-prefab-instance`、`set-prefab-connection`、`apply-prefab-link` 等**不存在**的 scene 訊息（比對 `@cocos/creator-types` 的 scene `message.d.ts`，prefab 相關僅 `create-node`、`restore-prefab`）。

### 修法（已套用）
於 `create-node` options 補上 `type: 'cc.Prefab'`，並把位置改用標準 `position` 欄位（`dump` 在此 message 未被使用）：
```ts
const createNodeOptions: any = { assetUuid: assetInfo.uuid, type: 'cc.Prefab' };
if (args.position) { createNodeOptions.position = args.position; }
```
此法重用編輯器原生管線（場景註冊、undo、metrics），不需手動拼 `PrefabInfo`/`PrefabInstance`。

### 驗證（2026-06-30，以 `assets/prefabs/SpriteFrameAnimTest.prefab` 實測）
- 引擎內 `cce.Prefab.createNodeFromPrefabAsset(asset)` 產生節點 `_prefab.instance` 已設定、`_prefab.asset` 指向 prefab uuid。
- 修正後 `instantiate_prefab` → 存檔 → 讀磁碟：節點序列化出 `cc.Node._prefab → cc.PrefabInfo{instance, asset} → cc.PrefabInstance{fileId}`，位置以 `CCPropertyOverrideInfo(['_lpos'])` 正確保存。

### 附帶修正
- `debug_execute_script` 原呼叫不存在的 scene script（`name:'console', method:'eval'`）而恆失敗；已改為呼叫本套件 scene script 新增的 `executeScript`（`source/scene.ts`，於 `package.json` 的 `scene.methods` 登錄），可在引擎行程內執行任意 JS 以供診斷。
- 移除 `prefab-tools.ts` 中一批死碼（`establishPrefabConnection` / `manuallyEstablishPrefabConnection` / `readPrefabFile` / `tryCreateNodeWithPrefab` / `tryAlternativeInstantiateMethods` / `getAssetInfo` / `createNode` / `applyPrefabToNode`），它們無任何呼叫端，且呼叫不存在的 scene 訊息。

---

## 🟠 Bug #6（Medium）— 手刻 prefab 把自訂腳本元件存成類別名稱，導致 `cc.MissingScript`

### 問題位置
`source/tools/prefab-tools.ts` — `createStandardPrefabContent()` / `createComponentData()`，第 **~1537/1550** 行：
```ts
let componentType = componentData.type || componentData.__type__ || 'cc.Component';
// ...
"__type__": componentType,   // 自訂腳本得到可讀類名 "SpriteFrameAnimation"
```

### 根因
Cocos 序列化自訂腳本元件時，`__type__` 必須是該類別的**序列化 cid**（由腳本 uuid 壓縮而來），而非 `@ccclass` 的可讀名稱。反序列化以 `getClassById(cid)` 解析；存成可讀名稱（`"SpriteFrameAnimation"`）會解析失敗 → `cc.MissingScript`。
- 實測：類別已註冊（`js.getClassByName('SpriteFrameAnimation')` 有值），其 cid 為 `d6e8dRyywVD86wJKSbTraqq`（對應腳本 uuid `d6e8d472-cb05-43f3-ac09-2926d3adaaaa`）。

### 暫時修法（已套用於既有 prefab）
手動把 `assets/prefabs/SpriteFrameAnimTest.prefab` 內 `"__type__": "SpriteFrameAnimation"` 改為 `"__type__": "d6e8dRyywVD86wJKSbTraqq"`，`reimport_asset` 後實測：元件解析為 `SpriteFrameAnimation`（非 MissingScript），場景內 2 個實例亦正常。

### 根本修法（已實作，2026-06-30）
`createStandardPrefabContent` 整條手刻序列化是**有損且脆弱**的（除 cid 錯誤外，還遺失 `spriteFrame`/`contentSize`/各 `@property` 值、`contentSize` 退回 100×100）。已改用編輯器原生路徑取代：

- `source/scene.ts` 的 `createPrefabFromNode(nodeUuid, prefabPath)` 改為兩步原生流程：
  ```ts
  const prefabUuid = await cce.Prefab.createPrefabAssetFromNode(nodeUuid, prefabPath); // 原生序列化
  const asset = await loadAny({ uuid: prefabUuid });
  await cce.Prefab.linkNodeWithPrefabAsset(nodeUuid, asset);                           // 来源节点转连结实例
  ```
  （節點可能在 Canvas 之下，故以**遞迴**查找節點，非 `scene.getChildByUuid`——後者只查直接子節點。）
- `source/tools/prefab-tools.ts` 的 `createPrefab` 改為透過 `execute-scene-script` 呼叫上述方法，並**刪除 51 個**手刻序列化死碼方法（`createStandardPrefabContent`/`createComponentObject`/`uuidToCompressedId`/各 asset-db 輔助等），檔案 2856 → 791 行。

**驗證（2026-06-30）**：以帶 Sprite(指定 spriteFrame)+自訂 contentSize 222×111+`SpriteFrameAnimation`(interval 0.25/loop false/playOnLoad false) 的節點建 prefab，讀磁碟確認：腳本 `__type__` 為正確 cid `d6e8dRyywVD86wJKSbTraqq`、spriteFrame uuid 保留、contentSize 222×111 保留、三個 @property 值保留、來源節點 `_prefab.instance` 已設定。三個問題（cid／屬性保留／來源連結）一次解決。

---

## 本次 session 的處置摘要

- 已用 perl 還原 `assets/scene/main.scene` 內所有 `{value:N}` → `N`（備份於 `main.scene.bak`）。
- 9 個符號改用專案實際的 `white_rect`（uuid `1654ce28-3f12-45b1-8a07-539abc911456@f9941`）作為彩色方塊。
- 背景 / 金框 / 轉輪原使用內建柔邊圖 `b730527c-...`（呈圓角模糊），已一併改為 `white_rect`。
