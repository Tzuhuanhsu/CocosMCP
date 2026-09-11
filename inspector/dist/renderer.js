"use strict";
(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // src/renderer/app.ts
  var fs3 = __toESM(__require("fs"));
  var path2 = __toESM(__require("path"));

  // src/shared/protocol.ts
  var PKG_NAME = "cocos-mcp-server";
  var IpcSend = {
    focusNode: `${PKG_NAME}:focusNode`,
    focusAsset: `${PKG_NAME}:focusAsset`
  };
  var IpcInvoke = {
    wireDevtools: `${PKG_NAME}:wire-devtools`,
    setAudioMuted: `${PKG_NAME}:set-audio-muted`,
    showMenu: `${PKG_NAME}:show-menu`,
    showOpenDialog: `${PKG_NAME}:show-open-dialog`,
    getLocale: `${PKG_NAME}:get-locale`,
    syncWindowMode: `${PKG_NAME}:sync-window-mode`,
    openAppDevtools: `${PKG_NAME}:open-app-devtools`
  };
  var IpcEvent = {
    debuggerPaused: `${PKG_NAME}:debugger-paused`,
    menuClicked: `${PKG_NAME}:menu-clicked`
  };
  var HostChannel = {
    gameState: "gameState",
    locateNode: "locateNode",
    consoleLog: "consoleLog",
    consoleError: "consoleError",
    consoleWarn: "consoleWarn",
    updateTree: "updateTree",
    showNodeDetail: "showNodeDetail",
    sendStatistic: "sendStatistic",
    canUpdateTree: "canUpdateTree"
  };

  // src/renderer/context.ts
  var context = {
    /** the game webview element */
    wv: null,
    /** the devtools webview element */
    dwv: null,
    /** main Vue instance (window.v) */
    vueApp: null,
    /** settings Vue instance (window.setting) */
    settingApp: null,
    /** node uuid the last tree context menu was opened on */
    menuNodeId: "",
    /** component uuid / display name the last component menu was opened on */
    menuCompId: "",
    menuCompName: ""
  };
  function execInGame(code) {
    if (!context.wv) return Promise.resolve(void 0);
    return context.wv.executeJavaScript(code);
  }

  // src/renderer/ipc.ts
  var import_electron = __require("electron");
  var menuAutoId = 0;
  async function popupMenu(entries) {
    const actions = /* @__PURE__ */ new Map();
    const toSpec = (entry) => {
      var _a;
      const id = entry.id ?? `menu-${menuAutoId++}`;
      if (entry.action) actions.set(id, entry.action);
      return {
        id,
        label: entry.label,
        type: entry.type,
        checked: entry.checked,
        enabled: entry.enabled,
        submenu: (_a = entry.submenuEntries) == null ? void 0 : _a.map(toSpec)
      };
    };
    const specs = entries.map(toSpec);
    const clickedId = await import_electron.ipcRenderer.invoke(IpcInvoke.showMenu, specs);
    if (clickedId && actions.has(clickedId)) actions.get(clickedId)();
  }
  function wireDevtoolsIpc(gameWcId, devtoolsWcId) {
    return import_electron.ipcRenderer.invoke(IpcInvoke.wireDevtools, gameWcId, devtoolsWcId);
  }
  function setAudioMutedIpc(gameWcId, muted) {
    import_electron.ipcRenderer.invoke(IpcInvoke.setAudioMuted, gameWcId, muted);
  }
  function showOpenDialogIpc(extensions) {
    return import_electron.ipcRenderer.invoke(IpcInvoke.showOpenDialog, extensions);
  }
  function getLocaleIpc() {
    return import_electron.ipcRenderer.invoke(IpcInvoke.getLocale);
  }
  function syncWindowModeIpc(width, height, simpleMode, minHeightExtra) {
    import_electron.ipcRenderer.invoke(IpcInvoke.syncWindowMode, width, height, simpleMode, minHeightExtra);
  }
  function focusNodeInEditor(uuid) {
    import_electron.ipcRenderer.send(IpcSend.focusNode, uuid);
  }
  function focusAssetInEditor(uuid) {
    import_electron.ipcRenderer.send(IpcSend.focusAsset, uuid);
  }
  function onDebuggerPaused(handler) {
    import_electron.ipcRenderer.on(IpcEvent.debuggerPaused, handler);
  }
  function openExternal(url) {
    import_electron.shell.openExternal(url);
  }
  function copyToClipboard(text) {
    import_electron.clipboard.writeText(text);
  }

  // src/renderer/menus.ts
  var import_electron2 = __require("electron");
  var NODE_BREAK_EVENTS = [
    "size-changed",
    "color-changed",
    "child-removed",
    "child-added",
    "layer-changed",
    "sibling-order-changed",
    "active-in-hierarchy-changed"
  ];
  var TRANSFORM_BITS = ["POSITION", "ROTATION", "SCALE"];
  var extensionMenus = {
    node: [],
    component: []
  };
  function showAppMenu() {
    const setting2 = context.settingApp;
    const v2 = context.vueApp;
    const entries = [
      { label: "Toggle Mini Mode", action: () => setting2.toggleSimpleMode() },
      { type: "separator" },
      { label: "Rotate Portrait/Landscape", action: () => setting2.togglePortrait() },
      { label: "Custom Resolution", action: () => {
        v2.showResolutionSelector = !v2.showResolutionSelector;
      } },
      {
        label: "Open DevTools",
        action: () => {
          if (!setting2.showDevToolInTab) v2.openWvDevTool();
          else {
            if (setting2.simpleMode) setting2.toggleSimpleMode();
            v2.tab = 1;
          }
        }
      },
      { type: "separator" },
      { label: "Help", action: () => v2.showHelp() },
      { label: "Setting", action: () => v2.showSetting() },
      { type: "separator" },
      { label: "Open App DevTools", action: () => import_electron2.ipcRenderer.invoke(IpcInvoke.openAppDevtools) }
    ];
    popupMenu(entries);
  }
  function showNodeMenu(nodeId) {
    context.menuNodeId = nodeId;
    const v2 = context.vueApp;
    const entries = [
      { label: "Remove", action: () => execInGame(`__removeNode('${nodeId}')`) },
      { type: "separator" },
      { label: "Copy uuid", action: () => copyToClipboard(nodeId) },
      { label: "Print Path", action: () => execInGame(`__printPath('${nodeId}')`) },
      { label: "Store in Global", action: () => execInGame(`__storeInGlobal('${nodeId}')`) },
      { label: "Lock/Unlock Drag", action: () => v2.toggleDrag(nodeId) },
      { label: "Toggle Auto Update Node", action: () => execInGame(`__donotAutoUpdate('${nodeId}')`) },
      { type: "separator" },
      {
        label: "Break On",
        submenuEntries: [
          {
            label: "transform-changed",
            submenuEntries: TRANSFORM_BITS.map((bit) => ({
              label: bit,
              action: () => execInGame(`__setBreakPoint('${nodeId}', 'transform-changed', '${bit}')`)
            }))
          },
          ...NODE_BREAK_EVENTS.map((eventName) => ({
            label: eventName,
            action: () => execInGame(`__setBreakPoint('${nodeId}', '${eventName}')`)
          }))
        ]
      },
      { label: "Remove Break Points", action: () => execInGame(`__removeBreakPoint('${nodeId}')`) },
      { label: "Remove All Break Points", action: () => execInGame("__removeAllBreakPoint()") },
      { type: "separator" },
      { label: "Select in Editor", action: () => focusNodeInEditor(nodeId) }
    ];
    for (const [label, functionName] of extensionMenus.node) {
      entries.push({ label, action: () => execInGame(`${functionName}(__nd['${nodeId}'])`) });
    }
    popupMenu(entries);
  }
  function showComponentMenu(compId, compName, methodNames, execMethod) {
    context.menuCompId = compId;
    context.menuCompName = compName;
    const v2 = context.vueApp;
    const setting2 = context.settingApp;
    const entries = [
      { label: "Remove", action: () => execInGame(`__removeComp('${v2.selectedNode}','${compId}')`) },
      { label: "Store in Global", action: () => execInGame(`__storeCompInGlobal('${v2.selectedNode}','${compId}')`) },
      { label: "Fields Sort", action: () => setting2.toggleSortComp(compName) }
    ];
    for (const [label, functionName] of extensionMenus.component) {
      entries.push({ label, action: () => execInGame(`${functionName}(__getComp('${v2.selectedNode}','${compId}'))`) });
    }
    if (methodNames.length > 0) {
      entries.push({ type: "separator" });
      for (const methodName of methodNames) {
        entries.push({ label: `${methodName}()`, action: () => execMethod(methodName) });
      }
    }
    popupMenu(entries);
  }
  function showTreeMenu() {
    const v2 = context.vueApp;
    popupMenu([
      { label: "Toggle Draw Call (beta)", action: () => execInGame("__toggleDC()") },
      { label: "Toggle Root Node of 3D Node", action: () => {
        v2.hide3dRootNode = !v2.hide3dRootNode;
      } },
      { label: "Toggle Children Count", action: () => {
        v2.showChildrenCount = !v2.showChildrenCount;
      } }
    ]);
  }
  function showConsoleMenu() {
    const v2 = context.vueApp;
    popupMenu([{ label: "Clear Logs", action: () => {
      v2.logs = [];
    } }]);
  }

  // src/renderer/setting.ts
  var fs = __toESM(__require("fs"));
  var os = __toESM(__require("os"));
  var isWindows = os.type().includes("Windows");
  var CHROME_EXTRA_WIDTH = 546;
  var CHROME_EXTRA_HEIGHT = 45;
  var WINDOWS_SCROLLBAR_WIDTH = 18;
  function createSettingApp() {
    const setting2 = new Vue({
      el: "#setting",
      data: {
        logCount: 3,
        retinaEnable: true,
        autoUpdateTree: true,
        displayAsFairyTree: false,
        hideFairyComContainer: false,
        syncNodeDetail: true,
        disableWebSec: false,
        showDevToolInTab: true,
        // default to a landscape / desktop view (not phone-portrait); size is
        // [shorterEdge, longerEdge], so landscape shows longerEdge x shorterEdge = 640x480.
        // 640-wide keeps the whole window (game + ~564px panels) fitting on a 1366 laptop.
        size: [480, 640],
        extraSizes: [],
        isPortrait: false,
        // game view follows the project design resolution until the user picks another size
        matchDesign: true,
        show: false,
        urlParams: "",
        customUrl: "",
        clearLogAfterRefresh: true,
        extensionFile: "",
        enableExtension: true,
        statisticing: false,
        statistics: null,
        sortCompProperties: {},
        simpleMode: false
      },
      created() {
        const stored = readConfig();
        if (stored) {
          Object.assign(this, stored);
          this.show = false;
        }
        this.applyDesignSize();
        if (this.enableExtension && this.extensionFile && this.extensionFile !== "") {
          try {
            const raw = fs.readFileSync(this.extensionFile, { encoding: "utf-8" });
            const { menu: { node, component } } = JSON.parse(raw);
            if ((node == null ? void 0 : node.length) > 0) extensionMenus.node.push(...node);
            if ((component == null ? void 0 : component.length) > 0) extensionMenus.component.push(...component);
          } catch (error) {
            console.error("[inspector] failed to load extension menu file", error);
          }
        }
      },
      computed: {
        w() {
          return this.isPortrait ? this.size[0] : this.size[1];
        },
        h() {
          return this.isPortrait ? this.size[1] : this.size[0];
        },
        webviewStyle() {
          let width = this.w + CHROME_EXTRA_WIDTH;
          const height = this.h + CHROME_EXTRA_HEIGHT;
          if (this.simpleMode) width = this.w;
          else if (isWindows) width += WINDOWS_SCROLLBAR_WIDTH;
          syncWindowModeIpc(width, height, this.simpleMode, isWindows ? 45 : 37);
          return `width:${this.w}px;height:${this.h}px;min-width:${this.w}px;min-height:${this.h}px`;
        },
        gamePanelStyle() {
          return `max-width:${this.w}px`;
        },
        configDataForMain() {
          return { simpleMode: this.simpleMode, isPortrait: this.isPortrait, size: this.size };
        }
      },
      methods: {
        openExternal(url) {
          openExternal(url);
        },
        /** Sizes the game view to the project design resolution so nothing gets cropped by the fit policy. */
        applyDesignSize() {
          const design = readDesignSize();
          if (this.matchDesign === false || !design) return;
          this.isPortrait = design[1] > design[0];
          this.size = [Math.min(...design), Math.max(...design)];
        },
        togglePortrait() {
          this.isPortrait = !this.isPortrait;
          this.syncPortrait();
        },
        syncPortrait() {
          this.saveToStorage();
          this.$nextTick().then(() => execInGame("setTimeout(__resizeCvn,200)"));
          context.vueApp.showResolutionSelector = false;
        },
        toggleSimpleMode() {
          this.simpleMode = !this.simpleMode;
          this.saveToStorage();
        },
        toggleSortComp(comName) {
          this.sortCompProperties[comName] = this.sortCompProperties[comName] ? 0 : 1;
          this.saveToStorage("toggleSortComp");
        },
        toggleStatistic() {
          this.statisticing = !this.statisticing;
          execInGame(`__startStatistic(${this.statisticing})`);
        },
        /** Pushes host-controlled flags + retina hook into a freshly loaded game page. */
        initMv(vars = {}) {
          let script = `__autoUpdateTree=${this.autoUpdateTree};__syncNodeDetail=${this.syncNodeDetail};`;
          for (const name in vars) {
            const value = vars[name];
            script += typeof value === "string" ? `${name}='${value}';` : `${name}=${value};`;
          }
          script += `var dectedCC = setInterval(function(){
                if(!window["cc"]){
                    return
                }
                clearInterval(dectedCC)
                cc.director.once(cc.Director.EVENT_BEFORE_SCENE_LAUNCH,function(){if(!__moreThen3_4_0())cc.view.enableRetina(${this.retinaEnable})})
            }, 10)
                `;
          execInGame(script);
          return script;
        },
        changeSetting() {
          const v2 = context.vueApp;
          if (this.autoUpdateTree && v2.canUpdateTree) v2.forceUpdateTree();
          execInGame(`__autoUpdateTree=${this.autoUpdateTree};__syncNodeDetail=${this.syncNodeDetail};`);
        },
        saveToStorage(eventName) {
          this.changeSetting();
          saveConfig(this.$data);
          this.$emit(eventName || "settingSize_change");
        },
        close() {
          this.show = false;
        }
      }
    });
    context.settingApp = setting2;
    window.setting = setting2;
    return setting2;
  }

  // src/renderer/components/node-detail.ts
  var widgetSort = (a, b) => b.split("").reverse().join("").localeCompare(a.split("").reverse().join(""));
  var NON_PROPERTY_KEYS = /* @__PURE__ */ new Set(["uuid", "name", "enabled", "isCC_COM", "packageItem", "node", "__methods___"]);
  function registerNodeDetailComponents() {
    Vue.component("NodeComponent", {
      props: { com: Object },
      data() {
        return { filterStr: "", sort: false };
      },
      created() {
        const self = this;
        this.fupdate = function() {
          const setting2 = context.settingApp;
          if (setting2.sortCompProperties[self.comName] === void 0) {
            setting2.sortCompProperties[self.comName] = self.sort = self.defaultSort;
          } else {
            self.sort = Boolean(setting2.sortCompProperties[self.comName]);
          }
        };
        context.settingApp.$on("toggleSortComp", this.fupdate);
        this.fupdate();
      },
      beforeDestroy() {
        context.settingApp.$off("toggleSortComp", this.fupdate);
      },
      computed: {
        comName() {
          const name = this.com.name;
          if (!this.com.isCC_COM) return name;
          return "<" + name.split("<")[1];
        },
        defaultSort() {
          return this.comName === "<Widget>" || this.comName === "<Button>" || this.comName === "<Label>";
        },
        afterFilters() {
          const sorter = this.sort ? widgetSort : void 0;
          const keys = Object.keys(this.com).sort(sorter);
          if (this.filterStr.trim() === "") return keys.filter((key) => !NON_PROPERTY_KEYS.has(key));
          return keys.filter((key) => !NON_PROPERTY_KEYS.has(key) && key.toLowerCase().includes(this.filterStr.toLowerCase()));
        },
        showSearch() {
          return Object.keys(this.com).length > 8;
        },
        checkVisible() {
          return this.com.isCC_COM ? "visible" : "hidden";
        }
      },
      methods: {
        showMenu2() {
          showComponentMenu(this.com.uuid, this.comName, this.com.__methods___ || [], (methodName) => this.execCompMethod(methodName));
        },
        execCompMethod(methodName) {
          execInGame(`__execCompMethod('${context.vueApp.selectedNode}','${this.com.uuid}','${methodName}')`);
        },
        toggleComp() {
          execInGame(`__toggleComp('${context.vueApp.selectedNode}','${this.com.uuid}')`);
        },
        setKV(key, value) {
          this.com[key][0] = value;
          const encoded = typeof value === "string" ? "`" + value + "`" : value;
          execInGame(`__setComAttr('${context.vueApp.selectedNode}','${this.com.uuid}','${key}',${encoded})`);
        }
      },
      template: `
    <div class="Component">
        <div style="height:1em;"></div>
        <div class="nodeName">
            <label>
                <input :style="{visibility:checkVisible}" @change="toggleComp" type="checkbox"  v-model="com.enabled" />
                {{comName}}
            </label>
            <span style="flex:1"></span>
            <span v-if="com.isCC_COM" @click.prevent="showMenu2" class="iconfont icon-menu"></span>
        </div>
        <input placeholder="filter properties" type="search" v-model="filterStr" v-if="showSearch"/>
        <com-property v-for="k in afterFilters" :param="com[k][2]" :setKV="setKV" :k="k" :val="com[k][0]" :t="com[k][1]" :isc="com.isCC_COM" :key="com+k"></com-property>
    </div>
    `
    });
    Vue.component("ComProperty", {
      props: ["k", "val", "t", "isc", "setKV", "param"],
      created() {
        this.vl = this.val;
        if (this.isEnum) this.vl = this.param.find((entry) => entry.value === this.val.value);
        this.link = this.canLink();
      },
      data() {
        return { link: null, vl: null, numberEdit: false };
      },
      methods: {
        canLink() {
          const value = this.vl;
          if (typeof value !== "string") return null;
          if (!value.includes(":@") || !value.includes("|")) return null;
          if (value.includes("||")) {
            const [name2, uuidPath2] = value.split("||");
            return { name: name2, uuidPath: uuidPath2, type: "asset" };
          }
          const [rawName, rawPath] = value.split("|");
          let name = rawName;
          const uuidPath = rawPath.split("//");
          if (uuidPath.slice(-1)[0] === context.vueApp.selectedNode) {
            const parts = name.split(":@");
            parts.pop();
            parts.push("[self]");
            name = parts.join(":@");
          }
          return { name, uuidPath, type: "node" };
        },
        locate() {
          if (this.link.type === "node") context.vueApp.locateNode(this.link.uuidPath);
          if (this.link.type === "asset") focusAssetInEditor(this.link.uuidPath);
        },
        clickBool() {
          if (!this.isc) return;
          this.vl = !this.vl;
          this.setKV(this.k, this.vl);
        },
        changeColor() {
          this.setKV(this.k, this.vl);
        },
        changeEnum() {
          this.setKV(this.k, this.vl.value);
        },
        changeNumber() {
          this.setKV(this.k, Number(this.vl));
        },
        changeString() {
          this.setKV(this.k, this.vl);
        },
        closeNumberEdit() {
          this.numberEdit = false;
        },
        openNumberEdit() {
          this.numberEdit = true;
          this.$nextTick().then(() => {
            var _a;
            (_a = this.$refs.numInput) == null ? void 0 : _a.focus();
          });
        }
      },
      computed: {
        isColor() {
          if (this.t === "color") return true;
          if (typeof this.vl !== "string") return false;
          return this.vl.startsWith("Color:rgba(");
        },
        isEnum() {
          return this.t === "enum";
        },
        color() {
          return "background:" + this.vl;
        },
        isBool() {
          return typeof this.vl === "boolean";
        },
        isTrue() {
          return this.vl === true;
        },
        isFalse() {
          return this.vl === false;
        },
        isNumber() {
          return this.t === "number";
        },
        isString() {
          return this.t === "string";
        },
        transStr() {
          return this.vl.replace(/\n/g, "\\n");
        },
        isNormal() {
          return !this.isString && !this.isNumber && !this.isEnum && !this.isColor && !this.isBool && !this.link;
        },
        boolIcon() {
          return this.isTrue ? "iconfont icon-right" : "iconfont icon-wrong2";
        }
      },
      template: `
    <div class="comProperty">
        <div class="nodePropertyTitle">{{k}}:</div>

        <div v-if="isColor" class="nodePropertySubTitle">
            <span v-if="!isc" :style="color" class="colorRect"></span>
            <input v-if="isc" @input="changeColor" type="color" v-model="vl" />
            <span >{{vl}}</span>
        </div>
        <div v-if="isEnum && isc" class="nodePropertySubTitle">
            <select v-model="vl" @change="changeEnum">
                <option v-for="p in param" :value="p">{{p.name}}</option>
            </select>
        </div>
        <div v-if="isEnum && !isc" class="nodePropertySubTitle prewrap">{{vl.value}}</div>
        <div v-if="isNumber" class="nodePropertySubTitle" >
            <span v-if="!numberEdit" @click="openNumberEdit">{{vl}}</span>
            <input ref="numInput" @blur="closeNumberEdit" @keyup.esc.stop="closeNumberEdit" @keyup.enter.stop="closeNumberEdit" v-if="numberEdit" type="number" v-model="vl" @input="changeNumber" />
        </div>

        <div v-if="isString" class="nodePropertySubTitle" >
            <span v-if="!numberEdit" @click="openNumberEdit">{{ transStr }}</span>
            <textarea ref="numInput" @blur="closeNumberEdit" @keyup.esc.stop="closeNumberEdit" v-if="numberEdit" v-model="vl" @input="changeString" ></textarea>
        </div>

        <div v-if="isBool" class="nodePropertySubTitle" @click="clickBool">
            <span :class="boolIcon" ></span>
        </div>
        <div v-if="isNormal" class="nodePropertySubTitle prewrap">{{String(vl)}}</div>
        <a v-if="link" class="nodePropertySubTitle prewrap" @click="locate()">{{link.name}}</a>
    </div>
    `
    });
    Vue.component("NodeDetailView", {
      props: { detail: Object },
      data() {
        return { close: false };
      },
      computed: {
        iconTransform() {
          const rotate = this.close ? "transform:rotate(90deg)" : "transform:rotate(180deg)";
          return "display: inline-block;" + rotate;
        }
      },
      methods: {
        toggleNode() {
          this.close = !this.close;
        },
        syncNode(propPath) {
          const parts = propPath.split(".");
          let value = parts.length > 1 ? this.detail[parts[0]][parts[1]] : this.detail[parts[0]];
          if (typeof value === "string") value = `'${value}'`;
          execInGame(`__syncNode('${this.detail.id}','${propPath}',${value})`);
        }
      },
      template: `
    <div class="nodeDetail">
        <div class="nodeName">
            <label>
                <input @change="syncNode('active')" type="checkbox" value="detail.name" v-model="detail.active" />
                Node: {{detail.name}}
            </label>
            <span style="flex:1"></span>
            <span @click.stop="toggleNode()" :style="iconTransform"  class="nodearrow iconfont icon-shangsanjiao"></span>
        </div>

    <div v-show="!close" class="nodeProperties">
    <div class="nodeProperty">
        <div class="nodePropertyTitle">Position:</div>
        <div class="nodePropertySubTitle">X:</div>
        <input @input="syncNode('position.x')" step="0.02" type="number" v-model="detail.position.x" />
        <div class="nodePropertySubTitle">Y:</div>
        <input @input="syncNode('position.y')" step="0.02" type="number" v-model="detail.position.y" />
        <div class="nodePropertySubTitle">Z:</div>
        <input @input="syncNode('position.z')" step="0.02" type="number" v-model="detail.position.z" />
    </div>
    <div class="nodeProperty">
        <div class="nodePropertyTitle">Rotation:</div>
        <div class="nodePropertySubTitle">X:</div>
        <input @input="syncNode('eulerAngles.x')" step="5" type="number" v-model="detail.eulerAngles.x" />
        <div class="nodePropertySubTitle">Y:</div>
        <input @input="syncNode('eulerAngles.y')" step="5" type="number" v-model="detail.eulerAngles.y" />
        <div class="nodePropertySubTitle">Z:</div>
        <input @input="syncNode('eulerAngles.z')" step="5" type="number" v-model="detail.eulerAngles.z" />
    </div>
    <div class="nodeProperty">
        <div class="nodePropertyTitle">Scale:</div>
        <div class="nodePropertySubTitle">X:</div>
        <input @input="syncNode('scale.x')" step="0.02" type="number" v-model="detail.scale.x" />
        <div class="nodePropertySubTitle">Y:</div>
        <input @input="syncNode('scale.y')" step="0.02" type="number" v-model="detail.scale.y" />
        <div class="nodePropertySubTitle">Z:</div>
        <input @input="syncNode('scale.z')" step="0.02" type="number" v-model="detail.scale.z" />
    </div>

    <hr>

    <div class="nodeProperty">
        <div class="nodePropertyTitle">Layer:</div>
        <div class="nodePropertySubTitle">{{detail.layer}}</div>
    </div>
    </div>
    </div>
    `
    });
  }

  // src/renderer/components/node-tree.ts
  function registerNodeTreeComponents() {
    Vue.component("NodeView", {
      props: { n: Object, deep: Number },
      data() {
        const v2 = context.vueApp;
        return {
          bold: false,
          close: !(this.n.name === "Canvas" && this.deep === 1) && !v2.openNodes.has(this.n.id),
          selected: this.n.id === v2.selectedNode
        };
      },
      watch: {
        close(value) {
          const setting2 = context.settingApp;
          if (!value && this.n.isFairyCom && setting2.displayAsFairyTree && setting2.hideFairyComContainer) {
            context.vueApp.syncOpenFcom(this.n.id);
          }
        }
      },
      computed: {
        needUseChildChilren() {
          var _a;
          const setting2 = context.settingApp;
          const v2 = context.vueApp;
          return setting2.displayAsFairyTree && setting2.hideFairyComContainer && this.n.isFairyCom && this.n.children.length === 1 && this.n.children[0].name === "Container" || v2.hide3dRootNode && this.n.children.length === 1 && this.n.children[0].name === "RootNode" && ((_a = this.n.children[0].children[0]) == null ? void 0 : _a.isMeshRender);
        },
        children() {
          return this.needUseChildChilren ? this.n.children[0].children : this.n.children;
        },
        realDeep() {
          return this.deep;
        },
        isShowLine() {
          var _a;
          return ((_a = context.vueApp.dragingEN) == null ? void 0 : _a.id) === this.n.id;
        }
      },
      created() {
        const v2 = context.vueApp;
        v2.$on("selectedNode_changed", this.updateSelected);
        v2.$on("locateNode", this.onLocateNode);
        this.bold = v2.openNodes.has(this.n.id);
        if (this.n.name === "Canvas") v2.syncOpen(this.n.id, !this.close);
      },
      beforeDestroy() {
        const v2 = context.vueApp;
        v2.$off("locateNode", this.onLocateNode);
        v2.$off("selectedNode_changed", this.updateSelected);
      },
      methods: {
        onLocateNode(openSet) {
          if (openSet.has(this.n.id)) this.close = false;
          this.bold = openSet.has(this.n.id);
        },
        updateSelected() {
          this.selected = this.n.id === context.vueApp.selectedNode;
        },
        dragstart(node) {
          context.vueApp.dragingSN = node;
        },
        dragenter(node) {
          const v2 = context.vueApp;
          v2.pushLog((/* @__PURE__ */ new Date()).toLocaleTimeString(), "consoleLog", node.name);
          v2.dragingEN = node;
        },
        dragend() {
          const v2 = context.vueApp;
          execInGame(`__swapPos('${v2.dragingSN.id}','${v2.dragingEN.id}')`);
          v2.dragingEN = null;
          v2.dragingSN = null;
        }
      },
      template: `
    <div class="node" draggable
        @dragstart.stop="dragstart(n)" @dragenter.stop="dragenter(n)" @dragend.stop="dragend">
        <hr v-if="isShowLine">
        <node-view-title :bold="bold" :selected="selected" :n="n" :childCount="n.childCount" v-model="close" :deep="deep"></node-view-title>
        <node-view v-if="!close"  v-for="sn in children" :n="sn" :deep="realDeep+1" :key="sn.id">
        </node-view>

    </div>`
    });
    Vue.component("NodeViewTitle", {
      props: ["n", "bold", "deep", "close", "selected", "childCount"],
      model: { prop: "close", event: "change" },
      template: `
        <div :id="refName" @mouseover="overNode" @mouseout="outNode" class="nodeTitle" @click="selectNode()" :style="nodePadding+selectedBg+isBold" @contextmenu.stop="onContextMenu">
            <span @click.stop="toggleNode()" :style="iconTransform" v-if="childCount>0" class="nodearrow iconfont icon-shangsanjiao"></span>
            <span :style="disable" >{{nodeName}}</span><span class="dcDesc" :style="selectedDc">{{dcDesc}}</span>
            <a v-if="!n.autoUpdate" @click.stop="forceUpdateTree" class="iconfont icon-shuaxin"></a>
            <span v-if="isLockedDragNode" class="iconfont icon-drag"></span>
        </div>
    `,
      watch: {
        childCount() {
          if (this.deep === 1) this.$el.style = this.nodePadding + this.selectedBg + this.isBold;
        }
      },
      computed: {
        isLockedDragNode() {
          return context.vueApp.lockNode === this.n.id;
        },
        isBold() {
          return "";
        },
        nodeName() {
          if (context.settingApp.displayAsFairyTree) {
            return this.pre + (this.n.gobjName || this.n.name) + this.childrenCount;
          }
          return this.pre + this.n.name + this.childrenCount;
        },
        childrenCount() {
          const count = this.n.childCount;
          return context.vueApp.showChildrenCount && count > 0 ? ` [${count}]` : "";
        },
        pre() {
          return this.n.breaks ? "\u2B55\uFE0F" : "";
        },
        iconTransform() {
          const rotate = this.close ? "transform:rotate(90deg)" : "transform:rotate(180deg)";
          return "display: inline-block;" + rotate;
        },
        refName() {
          return this.selected ? "selectedNode" : "";
        },
        nodePadding() {
          const arrowWidth = this.n.childCount > 0 ? 21 : 0;
          return `padding-left:${this.deep * 20 - arrowWidth}px;`;
        },
        selectedBg() {
          return this.selected ? "color:black;background-color:#cccccc;" : "";
        },
        selectedDc() {
          return this.selected ? "color:rgb(14, 127, 233)" : "";
        },
        disable() {
          return this.n.activeInHierarchy && this.n.opacityInHierarchy ? "" : "opacity:0.5";
        },
        dcDesc() {
          if (this.n.dc === void 0) return "";
          if (this.n.rtype) return ` ${this.n.dc} + ${this.n.rtype}`;
          if (this.n.dc === 0) return "";
          return ` ${this.n.dc}`;
        }
      },
      methods: {
        forceUpdateTree() {
          context.vueApp.forceUpdateTree();
        },
        toggleNode() {
          context.vueApp.syncOpen(this.n.id, this.close);
          this.$emit("change", !this.close);
        },
        selectNode() {
          context.vueApp.selectNode(this.n.id);
        },
        onContextMenu() {
          showNodeMenu(this.n.id);
        },
        overNode() {
          execInGame(`if(window["__drawRect"])__drawRect('${this.n.id}')`);
        },
        outNode() {
          execInGame('if(window["__clearRect"])__clearRect()');
        }
      }
    });
  }

  // src/renderer/components/console-panel.ts
  var STORE_URL = "https://store.cocos.com/app/detail/2940";
  var SHORTCUTS_URL = "https://forum.cocos.org/t/topic/116310";
  function registerConsolePanel() {
    Vue.component("ConsolePanel", {
      data() {
        return {
          type: "All",
          types: ["All", "Log", "Error", "Warn"],
          filterStr: "",
          code: "",
          codeTip: [],
          tipIndex: 0,
          atBottom: true
        };
      },
      computed: {
        logs() {
          const v2 = context.vueApp;
          if (this.type === "All") {
            return v2.bigLogs.filter((log) => log.d.toLowerCase().includes(this.filterStr.toLowerCase()));
          }
          return v2.bigLogs.filter((log) => log.t.endsWith(this.type) && log.d.includes(this.filterStr));
        }
      },
      mounted() {
        this.scrollLogToBottom();
      },
      updated() {
        this.scrollLogToBottom();
      },
      methods: {
        checkBottom() {
          const el = this.$refs.logsMain;
          this.atBottom = el.scrollHeight - el.clientHeight === el.scrollTop;
        },
        showMenu() {
          showConsoleMenu();
        },
        clearLogs() {
          context.vueApp.logs = [];
        },
        scrollLogToBottom() {
          if (!this.atBottom) return;
          const el = this.$refs.logsMain;
          this.$nextTick(() => {
            el.scrollTop = el.scrollHeight;
          });
        },
        gotoStore() {
          openExternal(STORE_URL);
        },
        gotoScM() {
          openExternal(SHORTCUTS_URL);
        },
        exec() {
          this.codeTip = [];
          if (this.code.trim() === "") return;
          let code = this.code;
          context.vueApp.pushLog((/* @__PURE__ */ new Date()).toLocaleTimeString(), "consoleLog", "> " + code + ":");
          if (!code.startsWith("let ") && !code.startsWith("var ") && !code.startsWith("console.") && !code.startsWith("cc.log")) {
            code = `console.log(${code})`;
          }
          execInGame(code).then((result) => {
            if (result !== null) context.vueApp.pushLog((/* @__PURE__ */ new Date()).toLocaleTimeString(), "consoleLog", `${result}`);
            this.code = "";
          });
        },
        up() {
          this.tipIndex = this.tipIndex === 0 ? this.codeTip.length - 1 : this.tipIndex - 1;
          this.$nextTick().then(() => {
            var _a, _b;
            (_b = (_a = this.$refs.selected) == null ? void 0 : _a[0]) == null ? void 0 : _b.scrollIntoViewIfNeeded(false);
          });
        },
        down() {
          this.tipIndex = this.tipIndex === this.codeTip.length - 1 ? 0 : this.tipIndex + 1;
          this.$nextTick().then(() => {
            var _a, _b;
            (_b = (_a = this.$refs.selected) == null ? void 0 : _a[0]) == null ? void 0 : _b.scrollIntoViewIfNeeded(false);
          });
        },
        esc() {
          this.codeTip = [];
        },
        tab() {
          const chosen = this.codeTip[this.tipIndex][0];
          const parts = this.code.split(".");
          parts.pop();
          if (!isNaN(chosen)) {
            this.code = parts.join(".") + "[" + chosen + "]";
          } else {
            parts.push(chosen);
            this.code = parts.join(".");
          }
          this.codeTip = [];
          return false;
        },
        getTip() {
          if (this.code.trim() === "") {
            this.codeTip = [];
            return;
          }
          execInGame(`__codeTip('${this.code}')`).then((tips) => {
            this.tipIndex = 0;
            this.codeTip = tips;
          });
        },
        splitMsg(message) {
          return message.split(RegExp(`(${this.filterStr})`, "i"));
        }
      },
      template: `
    <div class="consolePanel">
        <div class="topMenu">
            <input placeholder="type to filter logs" type="search" v-model="filterStr" />
            <label v-for="t in types"><input type="radio" :value="t" v-model="type">{{t}}</label>

            <label><input @change="setting.saveToStorage()" type="checkbox" v-model="setting.clearLogAfterRefresh" />clearLogAfterRefresh</label>
            <a @click="gotoStore">Useful? 5 stars?</a>
            new:<a @click="gotoScM">Shortcuts Manager</a>
        </div>
        <hr>
        <div class="logs flex1" ref="logsMain" @contextmenu.stop="showMenu" @scroll="checkBottom">
            <div class="logItem" v-for="l in logs" :style="{color:v.logColor(l.t)}">
                <span class="logTime">{{l.time}}:</span>
                <span v-if="filterStr.trim()==''">{{l.d}}</span>
                <span v-if="filterStr.trim()!=''" v-for="d in splitMsg(l.d)" :class="{filter:d.toLowerCase()==filterStr.toLowerCase()}">{{d}}</span>
            </div>
        </div>
        <input @keydown.tab.prevent="tab" @keyup.esc.stop="esc" @keydown.up.prevent="up" @keydown.down.prevent="down" @keyup.enter="exec" @input="getTip" placeholder="type code here" type="text" v-model="code"/>
        <div class="codeTips" v-show="codeTip.length>0">
            <div class="helpCon">
                <span class="help"><b>TAB</b>: choose&fill</span>
                <span class="help"><b>UP/DOWN</b>: switch</span>
                <span class="help"><b>ENTER</b>: execute</span>
            </div>
            <hr>
            <div class="tipsCon">
                <div :ref="tipIndex==i?'selected':null" :class="{tipItem:true,selected:tipIndex==i}" v-for="(t,i) in codeTip" :key="t">
                    <b>{{t[0]}}</b>:<span>{{t[1]}}</span>
                </div>
            </div>
        </div>
    </div>
    `
    });
  }

  // src/renderer/components/cocos-panel.ts
  var FILTERED_VARS = /* @__PURE__ */ new Set(["CollisionManager", "Collision_DebugDraw", "isDynamicAtlasDebugShow"]);
  var COLLECT_VARS_SCRIPT = `
            var o = {}
            for(let k in window){
                if(k.startsWith("CC_")){
                    o[k] = window[k]
                }
            }
            if(cc){
                for(let k in cc.sys){
                    if(k.startsWith("is")){
                        if(typeof cc.sys[k] != "function"){
                            o[k] = cc.sys[k]
                        }
                    }
                }
                try{
                o["enabledDynamicAtlas"] = cc.dynamicAtlasManager.enabled
                }catch(e){
                }
                try{
                    o["isDynamicAtlasDebugShow"] = cc.find("DYNAMIC_ATLAS_DEBUG_NODE") != null
                }catch(e){
                }

                try{
                    o["enabledRetina"] = cc.view.isRetinaEnabled()
                }catch(e){
                }

                try{
                    o["ENGINE_VERSION"] = cc.ENGINE_VERSION
                }catch(e){
                }

                try{
                    o["CollisionManager"] = cc.director.getCollisionManager().enabled
                }catch(e){
                }

                try{
                    o["Collision_DebugDraw"] = cc.director.getCollisionManager().enabledDebugDraw
                }catch(e){
                }

            }

            o
            `;
  var COLLECT_LOCAL_STORAGE_SCRIPT = `
        var o2 = {}
        Object.keys(cc.sys.localStorage).forEach(function(k){
            o2[k] = cc.sys.localStorage[k]
        })
        o2
        `;
  function registerCocosPanels() {
    Vue.component("LocalStoragePanel", {
      data() {
        return { lcStorage: {} };
      },
      computed: {
        keys() {
          return Object.keys(this.lcStorage);
        }
      },
      created() {
        execInGame(COLLECT_LOCAL_STORAGE_SCRIPT).then((storage) => {
          this.lcStorage = storage;
        });
      },
      methods: {
        del(key) {
          execInGame(`cc.sys.localStorage.removeItem('${key}')`);
          Vue.delete(this.lcStorage, key);
        }
      },
      template: `
    <div>
        <br>
        <div class="topSticky">Local Storage</div>
        <div class="localStorageCon">
            <span v-for="k in keys" :key="k" class="varItem" style="color:white">
                {{k}}:
                <span class="varItemValue">{{lcStorage[k]}}</span>
                <a @click.stop="del(k)"><span class="iconfont icon-wrong2"></span></a>
            </span>
        </div>
    </div>`
    });
    Vue.component("StatisticPanel", {
      methods: {
        toggle() {
          context.vueApp.toggleStatistic();
        }
      },
      computed: {
        btnLabel() {
          return context.vueApp.statisticing ? "Stop" : "Start";
        }
      },
      template: `
    <div class="cocosPanel">
        <button @click="toggle">{{btnLabel}}</button>
    </div>
    `
    });
    Vue.component("CocosPanel", {
      data() {
        return { ccVars: {}, lcStorage: {} };
      },
      computed: {
        keys() {
          return Object.keys(this.ccVars).sort().filter((key) => !FILTERED_VARS.has(key));
        }
      },
      created() {
        this.refreshVars();
      },
      methods: {
        refreshVars() {
          execInGame(COLLECT_VARS_SCRIPT).then((vars) => {
            this.ccVars = vars;
          });
        },
        getStyle(key) {
          return this.ccVars[key] ? "color:white;" : "color:grey;";
        },
        syncColEnable() {
          execInGame(`cc.director.getCollisionManager().enabled = ${this.ccVars.CollisionManager}`);
        },
        syncColDebugDraw() {
          execInGame(`cc.director.getCollisionManager().enabledDebugDraw = ${this.ccVars.Collision_DebugDraw}`);
        },
        toggleDynamicAtlasShow() {
          execInGame(`cc.dynamicAtlasManager.showDebug(${this.ccVars.isDynamicAtlasDebugShow});${this.ccVars.isDynamicAtlasDebugShow}`);
        }
      },
      template: `
    <div class="cocosPanel">
        <div class="topSticky"> ENGINE_VERSION: {{ccVars.ENGINE_VERSION}}</div>
        <div class="varsCon">
            <span v-for="k in keys" :key="k" class="varItem" :style="getStyle(k)">{{k}}: {{ccVars[k]}}</span>
        </div>
        <div class="varsCon">
        </div>
        <local-storage-panel></local-storage-panel>
    </div>
    `
    });
  }

  // src/renderer/components/panels.ts
  var fs2 = __toESM(__require("fs"));
  var path = __toESM(__require("path"));
  var ESC_KEY = 27;
  function registerPanels() {
    Vue.component("SearchPanel", {
      data() {
        return { searchStr: "", list: [], includeInvisible: true, kd: null };
      },
      created() {
        this.kd = (event) => {
          if ((event.key === String(ESC_KEY) || event.keyCode === ESC_KEY) && this.searchStr.trim() !== "") {
            this.clearSearch();
            event.stopImmediatePropagation();
            event.stopPropagation();
          }
        };
        document.addEventListener("keydown", this.kd);
      },
      beforeDestroy() {
        document.removeEventListener("keydown", this.kd);
      },
      methods: {
        onChange() {
          if (this.searchStr.trim() === "") {
            this.list = [];
            return;
          }
          execInGame(`__searchComs('${this.searchStr}')`).then((list) => {
            this.list = list || [];
          });
        },
        locate(uuidPath) {
          context.vueApp.locateNode(uuidPath);
        },
        clearSearch() {
          this.searchStr = "";
          this.list.length = 0;
        }
      },
      computed: {
        filteredList() {
          return this.includeInvisible ? this.list : this.list.filter((entry) => entry.visible);
        }
      },
      template: `
    <div class="searchPanel">
        <div class="searchTitle" v-show="list.length>0" style="display:flex">
            <label>Result:{{filteredList.length}}/{{list.length}}</label>
            <div style="flex:1"></div>
            <label><input type="checkbox" v-model="includeInvisible" />Includes Invisible   </label>
            <span class="iconfont icon-shanchu" @click="clearSearch"></span>
        </div>
        <div class="searchList" v-show="list.length>0">
            <div class="searcItem" v-for="(c,i) in filteredList" >
                <hr>
                <span>{{c.name}}</span>
                <a @click="locate(c.uuidPath)">
                <span class="iconfont icon-dingwei"></span>
                </a>
                <span v-if="!c.visible" >invisible</span>
                <br>
                <div class="itemPath">{{c.path}}</div>
            </div>
        </div>
        <div class="searchBox">
            <span class="iconfont icon-sousuo"></span><input @input="onChange" type="search" placeholder="search component" v-model="searchStr" />
        </div>
    </div>
    `
    });
    Vue.component("ExtensionPanel", {
      data() {
        return { example: "" };
      },
      methods: {
        onSelectedFile() {
        },
        async chooseFile() {
          const files = await showOpenDialogIpc(["json"]);
          if (!files) return;
          const file = files[0];
          if (file && file.trim() !== "") {
            context.settingApp.extensionFile = file;
            context.settingApp.saveToStorage();
          }
        }
      },
      created() {
        const example = fs2.readFileSync(path.join(__dirname, "plugins.json"), { encoding: "utf-8" });
        this.example = JSON.stringify(JSON.parse(example), null, "	");
      },
      template: `
    <div class="extensionPanel">
        <label>
            <input @change="setting.saveToStorage" type="checkbox" v-model="setting.enableExtension">
            Enable Extension
        </label>
        <hr>
        <div>Current Extension File:<br>{{setting.extensionFile}}</div>
        <button @click="chooseFile">Choose File</button>
        <hr>
        <div>Example:</div>
        <textarea readonly>{{example}}</textarea>
    </div>
    `
    });
    Vue.component("Spacer", { template: `
    <div class="flex1"></div>
    ` });
  }

  // src/renderer/components/resolution.ts
  var PRESET_SIZES = [
    { name: "iPhone 4", s: [320, 480] },
    { name: "iPhone 5", s: [320, 568] },
    { name: "iPhone 7", s: [375, 667] },
    { name: "iPhone 7 Plus", s: [414, 736] },
    { name: "iPhone X", s: [375, 812] },
    { name: "iPad", s: [768, 1024] },
    { name: "HW P9", s: [540, 960] },
    { name: "HW Mate9 Pro", s: [720, 1280] }
  ];
  function registerResolutionComponents() {
    Vue.component("ResolutionResizer", {
      // top offset of the fixed overlay (below the toolbar); the game view starts at (0, RESIZER_TOP)
      data() {
        return { RESIZER_TOP: 31 };
      },
      computed: {
        // read the live setting values directly so the overlay + handle track the cursor
        // during a drag (a local copy only synced on save would lag until mouseup)
        w() {
          const s = context.settingApp;
          return s.isPortrait ? s.size[0] : s.size[1];
        },
        h() {
          const s = context.settingApp;
          return s.isPortrait ? s.size[1] : s.size[0];
        },
        whStyle() {
          return `width:${this.w}px;height:${this.h}px;`;
        }
      },
      methods: {
        /** Applies a new game-view size (px) live. size is stored as [shorterEdge, longerEdge]. */
        setSize(size) {
          if (size[0] === 0 || size[1] === 0) return;
          size.sort((a, b) => a - b);
          if (size.join(",") === context.settingApp.size.join(",")) return;
          context.settingApp.size = size;
          context.settingApp.matchDesign = false;
          execInGame("__resizeCvn && __resizeCvn()");
        },
        /** Starts a corner drag-resize of the game view. */
        startResize(event) {
          event.preventDefault();
          context.wv.style.pointerEvents = "none";
          if (context.dwv) context.dwv.style.pointerEvents = "none";
          this._onMove = (e) => this.onResizeMove(e);
          this._onUp = () => this.endResize();
          window.addEventListener("mousemove", this._onMove, true);
          window.addEventListener("mouseup", this._onUp, true);
        },
        onResizeMove(event) {
          const w = Math.max(50, Math.round(event.clientX));
          const h = Math.max(50, Math.round(event.clientY - this.RESIZER_TOP));
          context.settingApp.isPortrait = w < h;
          this.setSize([w, h]);
        },
        endResize() {
          context.wv.style.pointerEvents = "unset";
          if (context.dwv) context.dwv.style.pointerEvents = "unset";
          window.removeEventListener("mousemove", this._onMove, true);
          window.removeEventListener("mouseup", this._onUp, true);
          context.settingApp.saveToStorage();
        }
      },
      template: `
    <div class="ResolutionResizer" :style="whStyle">
        <div class="resizeHandle" @mousedown.stop.prevent="startResize" title="drag to resize the game view"></div>
    </div>
    `
    });
    Vue.component("ResolutionSelector", {
      data() {
        const design = readDesignSize();
        const designPreset = design ? [{ name: `Design ${design[0]}x${design[1]}`, s: [Math.min(...design), Math.max(...design)], portrait: design[1] > design[0], design: true }] : [];
        return {
          sizes: designPreset.concat(PRESET_SIZES),
          showCustom: false,
          costomSize: { name: "custom", s: [640, 960] }
        };
      },
      created() {
        context.settingApp.extraSizes = context.settingApp.extraSizes.filter((entry) => !Array.isArray(entry));
      },
      methods: {
        isCurrSize(size) {
          return context.settingApp.size.join(",") === size.join(",");
        },
        setSize(size, preset) {
          context.settingApp.size = size;
          context.settingApp.matchDesign = Boolean(preset == null ? void 0 : preset.design);
          if (preset == null ? void 0 : preset.design) context.settingApp.isPortrait = Boolean(preset.portrait);
          context.settingApp.saveToStorage();
          this.$nextTick().then(() => execInGame("setTimeout(__resizeCvn,100)"));
          context.vueApp.showResolutionSelector = false;
        },
        addCustom() {
          const size = this.costomSize.s.concat();
          size.sort((a, b) => a - b);
          context.settingApp.extraSizes.push({ name: this.costomSize.name, s: size });
          context.settingApp.saveToStorage();
          this.showCustom = false;
        },
        delSize(index) {
          context.settingApp.extraSizes.splice(index, 1);
          context.settingApp.saveToStorage();
        }
      },
      template: `
    <div class="ResolutionSelector">
        <label>
            <input @change="setting.syncPortrait" type="checkbox"  v-model="setting.isPortrait" />
            isPortrait
        </label>
        <hr>

        <div @click="setSize(s.s, s)" class="resoItem" v-for="s in sizes" :key="s" >
            <span class="sizeName">
                {{s.name}}
                <spacer />
                {{s.s.join("*")}}
            </span>
            <span class="iconfont icon-right" v-if="isCurrSize(s.s)"></span>
            <span class="flex1"></span>
        </div>
        <hr v-if="setting.extraSizes.length>0">
        <div @click="setSize(s.s)" class="resoItem" v-for="(s,i) in setting.extraSizes" :key="s" >
            <span class="sizeName">
                {{s.name}}
                <spacer />
                {{s.s.join("*")}}
            </span>
            <span class="iconfont icon-right" v-if="isCurrSize(s.s)"></span>
            <a @click.stop="delSize(i)"><span class="iconfont icon-wrong2"></span></a>
        </div>
        <hr>
        <a v-show="!showCustom" @click.stop="showCustom=true">+Custom</a>
        <div v-show="showCustom" style="display:flex;flex-direction:column;">
            name:<input type="text" v-model="costomSize.name" />
            width: <input type="number" v-model.number="costomSize.s[0]" />

            height:<input type="number" v-model.number="costomSize.s[1]" />

            <div style="display:flex">
                <a @click.stop="addCustom()">Confirm</a>
                <spacer />
                <a @click.stop="showCustom=false">Cancel</a>
            </div>
        </div>
    </div>`
    });
  }

  // src/renderer/components/help.ts
  var VIDEO_PLUGIN_URL = "https://www.bilibili.com/video/BV1Nh411h72h";
  var VIDEO_MAC_URL = "https://www.bilibili.com/video/BV1KK4y1R7L1";
  function registerHelpComponent() {
    Vue.component("MyHelp", {
      data() {
        return { show: false, lang: "en" };
      },
      created() {
        getLocaleIpc().then((locale) => {
          this.lang = locale === "zh-CN" ? "cn" : "en";
        });
      },
      computed: {
        isCN() {
          return this.lang === "cn";
        }
      },
      methods: {
        openExternal(url) {
          openExternal(url);
        }
      },
      template: `
    <div class="helpPanel setting" v-show="show">
    <div class="settingHeader">
        <span class="iconfont icon-shanchu" @click="show=false" style="font-size: 1.5em;"></span>
        <div class="settingTitle" v-show="!isCN">Help</div>
        <div class="settingTitle" v-show="isCN">\u5E2E\u52A9</div>
        <a @click="lang='cn'" v-show="!isCN">Chinese</a>
        <a @click="lang='en'" v-show="isCN">English</a>
    </div>
    <div v-show="lang=='en'">
        <h1>DrawCall</h1>
        <ul>
            <li>
                <div class="helpTitle">How to open</div>
                right click scene name Tab
            </li>
            <li>
                <div class="helpTitle">Why not accurate?</div>
                number + mk + gh + ot is total drawcall, not only number;
                <br>
                and now is beta, only calculate Sprite and label, in AutoAtlas, DynamicAtlas,Static Atlas.
                <br>
                Shader and Material still not calculate;
            </li>
            <li>
                <div class="helpTitle">What's the means of: mk, gh, ot?</div>
                mk is Mask, gh is Graphics, ot is other RenderComponents;
                <br>
                they have many different cases about DrawCall, so now only mark them in node Tree
            </li>
        </ul>
        <hr>
        <h1>Video Tutorial</h1>
        <ul>
            <li>
                <div class="helpTitle">Plugin Version</div>
                In Recording
                <a @click="openExternal('${VIDEO_PLUGIN_URL}')" >${VIDEO_PLUGIN_URL}</a>
            </li>
            <li>
                <div class="helpTitle">Mac Native Version</div>
                not same as Plugin Version
                <a @click="openExternal('${VIDEO_MAC_URL}')" >${VIDEO_PLUGIN_URL}</a>
            </li>
        </ul>
        </div>
        <div v-show="lang=='cn'">
        <h1>DrawCall\u5206\u6790</h1>
        <ul>
            <li>
                <div class="helpTitle">\u600E\u4E48\u6253\u5F00DrawCall\u5206\u6790</div>
                \u5728\u573A\u666F\u540D\u79F0\u4E0A\u53F3\u952E
            </li>
            <li>
                <div class="helpTitle">\u4E3A\u4EC0\u4E48\u6709\u65F6\u4E0D\u592A\u51C6\u786E?</div>
                drawcall\u5305\u542B \u6570\u5B57 + mk + gh + ot\uFF0C \u4E0D\u4EC5\u4EC5\u662F\u6570\u5B57;
                <br>
                \u76EE\u524D\u4EC5\u8BA1\u7B97\u4E86Sprite\u548CLabel(\u5305\u542B\u81EA\u52A8\u56FE\u96C6\uFF0C\u52A8\u6001\u56FE\u96C6\uFF0C\u9759\u6001\u56FE\u96C6\u7B49\u56E0\u7D20)
                <br>
                Shader\uFF0CMeterial\u4EA7\u751F\u7684DrawCall\u6682\u65F6\u5E76\u672A\u5305\u542B
            </li>
            <li>
                <div class="helpTitle">mk, gh, ot\u662F\u4EC0\u4E48\u610F\u601D?</div>
                mk \u662F Mask, gh \u662F Graphics, ot is \u5176\u4ED6\u6E32\u67D3\u7EC4\u4EF6;
                <br>
                \u4ED6\u4EEC\u6709\u5F88\u591A\u56E0\u7D20\u6765\u5F71\u54CDDrawCall\uFF0C\u6682\u65F6\u4E0D\u65B9\u4FBF\u8BA1\u7B97\uFF0C\u6240\u4EE5\u73B0\u5728\u4EC5\u4EC5\u5728\u8282\u70B9\u6811\u6807\u8BB0\u51FA\u6765\uFF0C\u65B9\u4FBF\u77E5\u9053\u5F71\u54CDDrawCall\u7684\u53EF\u80FD\u56E0\u7D20
            </li>
        </ul>
        <hr>
        <h1>FGUI\u652F\u6301</h1>
        <ul>
            <li>
                <div class="helpTitle">\u4E3A\u4EC0\u4E48\u8282\u70B9\u6CA1\u6709\u663E\u793A\u6210FGUI\u7ED3\u6784</div>
                \u9996\u5148\u8981\u5728\u8BBE\u7F6E\u5F00\u542FfairyGUI\uFF0C\u5176\u6B21\uFF0Cccc3.x\u7248\u672C\u8981\u4FDD\u8BC1window["fgui"]\u53EF\u4EE5\u8BBF\u95EE
            </li>
        </ul>
        <hr>
        <h1>\u89C6\u9891\u6559\u7A0B</h1>
        <ul>
            <li>
                <div class="helpTitle">\u63D2\u4EF6\u7248</div>
                \u5F55\u5236\u4E2D...
                <a @click="openExternal('${VIDEO_PLUGIN_URL}')" >${VIDEO_PLUGIN_URL}</a>
            </li>
            <li>
                <div class="helpTitle">Mac\u539F\u751F\u7248\u672C</div>
                \u8DDF\u63D2\u4EF6\u7248\u4E0D\u4E00\u6837\uFF0C\u4EC5\u4F9B\u53C2\u8003
                <a @click="openExternal('${VIDEO_MAC_URL}')" >${VIDEO_PLUGIN_URL}</a>
            </li>
        </ul>
        </div>
    </div>
    `
    });
  }

  // src/renderer/app.ts
  var injectedSource = fs3.readFileSync(path2.join(__dirname, "dist/injected.js"), { encoding: "utf-8" });
  registerNodeDetailComponents();
  registerNodeTreeComponents();
  registerConsolePanel();
  registerCocosPanels();
  registerPanels();
  registerResolutionComponents();
  registerHelpComponent();
  var setting = createSettingApp();
  var tempNodeTree = null;
  var lastNodeSet = /* @__PURE__ */ new Set();
  var tempLogs = [];
  onDebuggerPaused(() => {
    if (context.vueApp) context.vueApp.tab = 1;
  });
  function wireDevtoolsInTab() {
    const v2 = context.vueApp;
    if (!context.wv || !v2 || !setting.showDevToolInTab) return;
    const devtoolsView = v2.$refs.devtools;
    if (!devtoolsView) return;
    context.dwv = devtoolsView;
    let gameId;
    let devtoolsId;
    try {
      gameId = context.wv.getWebContentsId();
      devtoolsId = devtoolsView.getWebContentsId();
    } catch {
      return;
    }
    wireDevtoolsIpc(gameId, devtoolsId).then((result) => {
      if ((result == null ? void 0 : result.error) === "game page not loaded yet") return;
      if (!(result == null ? void 0 : result.ok)) {
        const message = `[inspector] devtools wiring failed: ${result == null ? void 0 : result.error}`;
        console.error(message);
        v2.pushLog((/* @__PURE__ */ new Date()).toLocaleTimeString(), HostChannel.consoleError, message);
        return;
      }
      if (typeof result.muted === "boolean") v2.isMuted = result.muted;
    }).catch((error) => {
      const message = `[inspector] devtools wiring failed (is main.js updated? restart CocosCreator): ${error.message}`;
      console.error(message);
      v2.pushLog((/* @__PURE__ */ new Date()).toLocaleTimeString(), HostChannel.consoleError, message);
    });
  }
  var v = new Vue({
    el: "#app",
    mounted() {
      this.$watch("tab", (tab) => {
        if (tab === 1) wireDevtoolsInTab();
      });
      document.addEventListener("keydown", (event) => {
        if ((event.key === "Escape" || event.keyCode === 27) && this.showResolutionSelector) {
          this.showResolutionSelector = false;
        }
      });
      const wv = this.$refs.wv;
      context.wv = wv;
      wv.addEventListener("did-start-loading", () => setTimeout(wireDevtoolsInTab, 200));
      wv.addEventListener("dom-ready", () => {
        execInGame(`var __logCount=${setting.logCount};var __showDevToolInTab=${setting.showDevToolInTab}`);
        execInGame(injectedSource);
        setting.initMv({
          __lockDragNode: this.lockNode,
          __hover: this.hover,
          __designMode: this.designMode
        });
        wireDevtoolsInTab();
      });
      wv.addEventListener("did-finish-load", () => v.clearTree());
      wv.addEventListener("ipc-message", (event) => {
        const { args, channel } = event;
        switch (channel) {
          case HostChannel.gameState:
            this.gamePaused = args[0];
            break;
          case HostChannel.locateNode:
            if (setting.simpleMode) setting.toggleSimpleMode();
            this.locateNode(args[0]);
            break;
          case HostChannel.consoleLog:
          case HostChannel.consoleError:
          case HostChannel.consoleWarn:
            this.pushLog((/* @__PURE__ */ new Date()).toLocaleTimeString(), channel, args[0]);
            break;
          case HostChannel.canUpdateTree:
            this.canUpdateTree = args[0];
            break;
          case HostChannel.updateTree:
            tempNodeTree = args[0];
            this.treeUpdate = 0;
            break;
          case HostChannel.sendStatistic:
            this.statistics = args[0];
            break;
          case HostChannel.showNodeDetail:
            if (this.nodeDetail) Object.assign(this.nodeDetail, args[0]);
            else this.nodeDetail = args[0];
            break;
        }
      });
    },
    data: {
      treeUpdate: 0,
      logUpdate: 0,
      gamePaused: false,
      canUpdateTree: false,
      logs: [],
      nodeTree: null,
      openNodes: /* @__PURE__ */ new Set(),
      selectedNode: "",
      needScrollOneTime: false,
      nodeDetail: null,
      port: null,
      showResolutionSelector: false,
      designMode: false,
      tab: 0,
      mode: 0,
      urlParams: "",
      hover: 0,
      hide3dRootNode: false,
      dragingSN: null,
      dragingEN: null,
      lockNode: null,
      isMuted: false,
      showChildrenCount: false,
      // statistic feature state lived half on `setting` upstream; consolidated on `v`
      statistics: null,
      statisticing: false
    },
    computed: {
      showDevToolInTab() {
        return setting.showDevToolInTab;
      },
      designBtnStyle() {
        return this.designMode ? "position:relative;color:rgb(52, 146, 235);" : "position:relative;";
      },
      hoverBtnStyle() {
        return this.hover ? "position:relative;color:rgb(52, 146, 235);" : "position:relative;";
      },
      resolutionBtnStyle() {
        return this.showResolutionSelector ? "color:rgb(52, 146, 235);" : "";
      },
      hoverMark() {
        switch (this.hover) {
          case 1:
            return "2D";
          case 2:
            return "3D";
          default:
            return "";
        }
      },
      disableWebSec() {
        return setting.disableWebSec;
      },
      gameUrl() {
        if (this.mode == 2 && setting.customUrl) return setting.customUrl;
        let page = "";
        if (this.mode > 0) {
          page = this.mode == 1 ? "web-mobile/web-mobile/index.html" : "web-desktop/web-desktop/index.html";
        }
        const params = this.urlParams.trim();
        if (params !== "") page += params.startsWith("?") ? params : "?" + params;
        return `http://localhost:${this.port}/${page}`;
      },
      pauseIcon() {
        return "iconfont " + (this.gamePaused ? "icon-bofangsanjiaoxing" : "icon-iconfront-");
      },
      showRefreshTreeBtn() {
        return this.canUpdateTree && !setting.autoUpdateTree;
      },
      sceneName() {
        return this.nodeTree ? this.nodeTree.name : "";
      },
      smallLogs() {
        if (setting.logCount == 0) return [];
        return this.logs.slice(-setting.logCount);
      },
      bigLogs() {
        return this.logs.slice(-100);
      },
      simpleMode() {
        return setting.simpleMode;
      }
    },
    created() {
      context.vueApp = this;
      window.v = this;
      this.checkUrlParams();
      const query = location.search.slice(1).split("&");
      this.port = query[0].split("=")[1];
      this.mode = query[1].split("=")[1];
      this.$nextTick().then(() => {
        this.$el.style.visibility = "visible";
      });
      requestAnimationFrame(this.everyFrame);
    },
    methods: {
      toggleDrag(nodeId) {
        this.lockNode = this.lockNode !== nodeId ? nodeId : null;
        if (this.lockNode && !this.designMode) this.toggleDesignMode();
        execInGame(`__toggleDrag('${this.lockNode}')`);
      },
      syncOpenFcom(nodeId) {
        execInGame(`__syncOpenFcom('${nodeId}')`);
      },
      syncOpen(nodeId, open, update = true) {
        if (open) this.openNodes.add(nodeId);
        else this.openNodes.delete(nodeId);
        execInGame(`__syncOpen('${nodeId}', ${open}, ${update})`);
      },
      toggleSnd() {
        this.isMuted = !this.isMuted;
        setAudioMutedIpc(context.wv.getWebContentsId(), this.isMuted);
      },
      everyFrame() {
        if (this.treeUpdate == 1 && tempNodeTree) {
          this.nodeTree = tempNodeTree;
          if (this.needScrollOneTime) {
            this.$nextTick().then(() => {
              var _a, _b;
              (_b = (_a = document.querySelector("#selectedNode")) == null ? void 0 : _a.firstElementChild) == null ? void 0 : _b.scrollIntoViewIfNeeded();
            });
            this.needScrollOneTime = false;
          }
          tempNodeTree = null;
        }
        if (tempLogs.length > 0) {
          this.logs.push(...tempLogs);
          this.scrollLogToBottom();
          tempLogs.length = 0;
        }
        requestAnimationFrame(this.everyFrame);
        if (this.treeUpdate < 1) this.treeUpdate++;
        if (this.logUpdate < 1) this.logUpdate++;
      },
      checkUrlParams() {
        if (setting.urlParams !== this.urlParams) {
          this.urlParams = setting.urlParams;
          return true;
        }
        return false;
      },
      showAppMenu(event) {
        if (event.target instanceof HTMLInputElement) return;
        if (event.target instanceof HTMLButtonElement) return;
        showAppMenu();
      },
      showMenu() {
        showTreeMenu();
      },
      switchMode(mode) {
        this.mode = mode;
      },
      pushLog(time, type2, data) {
        tempLogs.push({ time, t: type2, d: data });
        this.logUpdate = 0;
      },
      scrollLogToBottom() {
        const el = this.$refs.logs;
        this.$nextTick(() => {
          el.scrollTop = el.scrollHeight;
        });
      },
      forceUpdateTree() {
        this.canUpdateTree = false;
        execInGame("__updateTree()");
      },
      selectNode(nodeId, withDetail = true) {
        this.selectedNode = nodeId;
        this.$emit("selectedNode_changed");
        if (!withDetail) return;
        execInGame(`__getNodeDetail('${nodeId}')`);
      },
      locateNode(uuidPath) {
        this.tab = 0;
        const lastId = uuidPath.slice(-1)[0];
        const openSet = new Set(uuidPath);
        openSet.delete(lastId);
        openSet.forEach((uuid) => this.openNodes.add(uuid));
        this.needScrollOneTime = true;
        execInGame(`__locateNode([${uuidPath.map((uuid) => `"${uuid}"`)}])`);
        lastNodeSet = openSet;
        this.$emit("locateNode", openSet);
        this.selectNode(lastId, false);
      },
      toggleNode(nodeId) {
        if (this.openNodes.has(nodeId)) this.openNodes.delete(nodeId);
        else this.openNodes.add(nodeId);
      },
      logColor(type2) {
        switch (type2) {
          case HostChannel.consoleLog:
            return "unset";
          case HostChannel.consoleError:
            return "red";
          case HostChannel.consoleWarn:
            return "#cc9138";
        }
        return void 0;
      },
      playOrPause() {
        execInGame(this.gamePaused ? "cc.game.resume()" : "cc.game.pause()");
      },
      refresh() {
        if (!this.checkUrlParams()) context.wv.reloadIgnoringCache();
        this.clearTree();
      },
      clearTree() {
        this.nodeTree = null;
        this.selectedNode = null;
        this.nodeDetail = null;
        if (setting.clearLogAfterRefresh) this.logs = [];
        this.openNodes.clear();
        lastNodeSet == null ? void 0 : lastNodeSet.clear();
      },
      toggleFps() {
        execInGame("__toggleFps()");
      },
      toggleDesignMode() {
        this.designMode = !this.designMode;
        execInGame(`__toggleDesignMode(${this.designMode})`);
      },
      toggleHover() {
        this.hover = this.hover == 0 ? 1 : 0;
        execInGame(`__setHover(${this.hover})`);
      },
      toggle3dHover() {
        this.hover = this.hover == 0 ? 2 : 0;
        execInGame(`__setHover(${this.hover})`);
      },
      compile() {
        this.pushLog((/* @__PURE__ */ new Date()).toLocaleTimeString(), HostChannel.consoleLog, "reCompiling...");
        execInGame("__reCompile()");
      },
      openWvDevTool() {
        context.wv.openDevTools();
      },
      showSetting() {
        setting.show = true;
      },
      showHelp() {
        v.$refs.help.show = true;
      },
      toggleStatistic() {
        this.statisticing = !this.statisticing;
        execInGame(`__startStatistic(${this.statisticing})`);
      }
    }
  });
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL3JlbmRlcmVyL2FwcC50cyIsICIuLi9zcmMvc2hhcmVkL3Byb3RvY29sLnRzIiwgIi4uL3NyYy9yZW5kZXJlci9jb250ZXh0LnRzIiwgIi4uL3NyYy9yZW5kZXJlci9pcGMudHMiLCAiLi4vc3JjL3JlbmRlcmVyL21lbnVzLnRzIiwgIi4uL3NyYy9yZW5kZXJlci9zZXR0aW5nLnRzIiwgIi4uL3NyYy9yZW5kZXJlci9jb21wb25lbnRzL25vZGUtZGV0YWlsLnRzIiwgIi4uL3NyYy9yZW5kZXJlci9jb21wb25lbnRzL25vZGUtdHJlZS50cyIsICIuLi9zcmMvcmVuZGVyZXIvY29tcG9uZW50cy9jb25zb2xlLXBhbmVsLnRzIiwgIi4uL3NyYy9yZW5kZXJlci9jb21wb25lbnRzL2NvY29zLXBhbmVsLnRzIiwgIi4uL3NyYy9yZW5kZXJlci9jb21wb25lbnRzL3BhbmVscy50cyIsICIuLi9zcmMvcmVuZGVyZXIvY29tcG9uZW50cy9yZXNvbHV0aW9uLnRzIiwgIi4uL3NyYy9yZW5kZXJlci9jb21wb25lbnRzL2hlbHAudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIEluc3BlY3RvciByZW5kZXJlciBlbnRyeSBwb2ludDogcmVnaXN0ZXJzIGNvbXBvbmVudHMsIGNyZWF0ZXMgdGhlIHNldHRpbmcgKyBtYWluIFZ1ZVxuLy8gaW5zdGFuY2VzLCB3aXJlcyB0aGUgZ2FtZSB3ZWJ2aWV3IGFuZCB0aGUgaW4tdGFiIERldlRvb2xzLlxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IEhvc3RDaGFubmVsIH0gZnJvbSAnQHNoYXJlZC9wcm90b2NvbCc7XG5pbXBvcnQgeyBjb250ZXh0LCBleGVjSW5HYW1lIH0gZnJvbSAnLi9jb250ZXh0JztcbmltcG9ydCB7IHdpcmVEZXZ0b29sc0lwYywgc2V0QXVkaW9NdXRlZElwYywgb25EZWJ1Z2dlclBhdXNlZCB9IGZyb20gJy4vaXBjJztcbmltcG9ydCB7IHNob3dBcHBNZW51LCBzaG93VHJlZU1lbnUgfSBmcm9tICcuL21lbnVzJztcbmltcG9ydCB7IGNyZWF0ZVNldHRpbmdBcHAgfSBmcm9tICcuL3NldHRpbmcnO1xuaW1wb3J0IHsgcmVnaXN0ZXJOb2RlRGV0YWlsQ29tcG9uZW50cyB9IGZyb20gJy4vY29tcG9uZW50cy9ub2RlLWRldGFpbCc7XG5pbXBvcnQgeyByZWdpc3Rlck5vZGVUcmVlQ29tcG9uZW50cyB9IGZyb20gJy4vY29tcG9uZW50cy9ub2RlLXRyZWUnO1xuaW1wb3J0IHsgcmVnaXN0ZXJDb25zb2xlUGFuZWwgfSBmcm9tICcuL2NvbXBvbmVudHMvY29uc29sZS1wYW5lbCc7XG5pbXBvcnQgeyByZWdpc3RlckNvY29zUGFuZWxzIH0gZnJvbSAnLi9jb21wb25lbnRzL2NvY29zLXBhbmVsJztcbmltcG9ydCB7IHJlZ2lzdGVyUGFuZWxzIH0gZnJvbSAnLi9jb21wb25lbnRzL3BhbmVscyc7XG5pbXBvcnQgeyByZWdpc3RlclJlc29sdXRpb25Db21wb25lbnRzIH0gZnJvbSAnLi9jb21wb25lbnRzL3Jlc29sdXRpb24nO1xuaW1wb3J0IHsgcmVnaXN0ZXJIZWxwQ29tcG9uZW50IH0gZnJvbSAnLi9jb21wb25lbnRzL2hlbHAnO1xuXG5jb25zdCBpbmplY3RlZFNvdXJjZSA9IGZzLnJlYWRGaWxlU3luYyggcGF0aC5qb2luKCBfX2Rpcm5hbWUsICdkaXN0L2luamVjdGVkLmpzJyApLCB7IGVuY29kaW5nOiAndXRmLTgnIH0gKTtcblxucmVnaXN0ZXJOb2RlRGV0YWlsQ29tcG9uZW50cygpO1xucmVnaXN0ZXJOb2RlVHJlZUNvbXBvbmVudHMoKTtcbnJlZ2lzdGVyQ29uc29sZVBhbmVsKCk7XG5yZWdpc3RlckNvY29zUGFuZWxzKCk7XG5yZWdpc3RlclBhbmVscygpO1xucmVnaXN0ZXJSZXNvbHV0aW9uQ29tcG9uZW50cygpO1xucmVnaXN0ZXJIZWxwQ29tcG9uZW50KCk7XG5cbmNvbnN0IHNldHRpbmcgPSBjcmVhdGVTZXR0aW5nQXBwKCk7XG5cbi8vIHN0YWdpbmcgYnVmZmVycyBmbHVzaGVkIG9uY2UgcGVyIGFuaW1hdGlvbiBmcmFtZSAoaGlnaC1mcmVxdWVuY3kgdXBkYXRlcyBmcm9tIHRoZSBnYW1lKVxubGV0IHRlbXBOb2RlVHJlZTogdW5rbm93biA9IG51bGw7XG5sZXQgbGFzdE5vZGVTZXQ6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpO1xuY29uc3QgdGVtcExvZ3M6IEFycmF5PHsgdGltZTogc3RyaW5nOyB0OiBzdHJpbmc7IGQ6IHN0cmluZyB9PiA9IFtdO1xuXG5vbkRlYnVnZ2VyUGF1c2VkKCAoKSA9PiB7XG4gICAgaWYgKCBjb250ZXh0LnZ1ZUFwcCApIGNvbnRleHQudnVlQXBwLnRhYiA9IDE7XG59ICk7XG5cbi8qKlxuICogSWRlbXBvdGVudCBEZXZUb29scy1pbi10YWIgd2lyaW5nIChydW5zIGluIHRoZSBleHRlbnNpb24gbWFpbiBwcm9jZXNzIHZpYSBJUEMpLlxuICogVHJpZ2dlcmVkIG9uIGdhbWUtd2VidmlldyBsb2FkIEFORCB3aGVuIHRoZSBEZXZUb29sIHRhYiBpcyBvcGVuZWQsIHNvIGVuYWJsaW5nXG4gKiBcIlNob3cgRGV2VG9vbCBJbiBUYWJcIiBkb2VzIG5vdCByZXF1aXJlIGFuIGluc3BlY3RvciByZXN0YXJ0LlxuICovXG5mdW5jdGlvbiB3aXJlRGV2dG9vbHNJblRhYigpOiB2b2lkIHtcbiAgICBjb25zdCB2ID0gY29udGV4dC52dWVBcHA7XG4gICAgaWYgKCAhY29udGV4dC53diB8fCAhdiB8fCAhc2V0dGluZy5zaG93RGV2VG9vbEluVGFiICkgcmV0dXJuO1xuICAgIGNvbnN0IGRldnRvb2xzVmlldyA9IHYuJHJlZnMuZGV2dG9vbHMgYXMgSFRNTFdlYlZpZXdFbGVtZW50IHwgdW5kZWZpbmVkO1xuICAgIGlmICggIWRldnRvb2xzVmlldyApIHJldHVybjtcbiAgICBjb250ZXh0LmR3diA9IGRldnRvb2xzVmlldztcbiAgICBsZXQgZ2FtZUlkOiBudW1iZXI7XG4gICAgbGV0IGRldnRvb2xzSWQ6IG51bWJlcjtcbiAgICB0cnkge1xuICAgICAgICBnYW1lSWQgPSBjb250ZXh0Lnd2LmdldFdlYkNvbnRlbnRzSWQoKTtcbiAgICAgICAgZGV2dG9vbHNJZCA9IGRldnRvb2xzVmlldy5nZXRXZWJDb250ZW50c0lkKCk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybjsgLy8gd2VidmlldyBub3QgYXR0YWNoZWQgeWV0XG4gICAgfVxuICAgIHdpcmVEZXZ0b29sc0lwYyggZ2FtZUlkLCBkZXZ0b29sc0lkICkudGhlbiggKCByZXN1bHQgKSA9PiB7XG4gICAgICAgIGlmICggcmVzdWx0Py5lcnJvciA9PT0gJ2dhbWUgcGFnZSBub3QgbG9hZGVkIHlldCcgKSByZXR1cm47XG4gICAgICAgIGlmICggIXJlc3VsdD8ub2sgKSB7XG4gICAgICAgICAgICBjb25zdCBtZXNzYWdlID0gYFtpbnNwZWN0b3JdIGRldnRvb2xzIHdpcmluZyBmYWlsZWQ6ICR7IHJlc3VsdD8uZXJyb3IgfWA7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCBtZXNzYWdlICk7XG4gICAgICAgICAgICB2LnB1c2hMb2coIG5ldyBEYXRlKCkudG9Mb2NhbGVUaW1lU3RyaW5nKCksIEhvc3RDaGFubmVsLmNvbnNvbGVFcnJvciwgbWVzc2FnZSApO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmICggdHlwZW9mIHJlc3VsdC5tdXRlZCA9PT0gJ2Jvb2xlYW4nICkgdi5pc011dGVkID0gcmVzdWx0Lm11dGVkO1xuICAgIH0gKS5jYXRjaCggKCBlcnJvcjogRXJyb3IgKSA9PiB7XG4gICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBgW2luc3BlY3Rvcl0gZGV2dG9vbHMgd2lyaW5nIGZhaWxlZCAoaXMgbWFpbi5qcyB1cGRhdGVkPyByZXN0YXJ0IENvY29zQ3JlYXRvcik6ICR7IGVycm9yLm1lc3NhZ2UgfWA7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoIG1lc3NhZ2UgKTtcbiAgICAgICAgdi5wdXNoTG9nKCBuZXcgRGF0ZSgpLnRvTG9jYWxlVGltZVN0cmluZygpLCBIb3N0Q2hhbm5lbC5jb25zb2xlRXJyb3IsIG1lc3NhZ2UgKTtcbiAgICB9ICk7XG59XG5cbmNvbnN0IHYgPSBuZXcgVnVlKCB7XG4gICAgZWw6ICcjYXBwJyxcbiAgICBtb3VudGVkKCkge1xuICAgICAgICB0aGlzLiR3YXRjaCggJ3RhYicsICggdGFiOiBudW1iZXIgKSA9PiB7XG4gICAgICAgICAgICBpZiAoIHRhYiA9PT0gMSApIHdpcmVEZXZ0b29sc0luVGFiKCk7XG4gICAgICAgIH0gKTtcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lciggJ2tleWRvd24nLCAoIGV2ZW50OiBLZXlib2FyZEV2ZW50ICkgPT4ge1xuICAgICAgICAgICAgaWYgKCAoIGV2ZW50LmtleSA9PT0gJ0VzY2FwZScgfHwgZXZlbnQua2V5Q29kZSA9PT0gMjcgKSAmJiB0aGlzLnNob3dSZXNvbHV0aW9uU2VsZWN0b3IgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zaG93UmVzb2x1dGlvblNlbGVjdG9yID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gKTtcbiAgICAgICAgY29uc3Qgd3YgPSB0aGlzLiRyZWZzLnd2IGFzIEhUTUxXZWJWaWV3RWxlbWVudDtcbiAgICAgICAgY29udGV4dC53diA9IHd2O1xuICAgICAgICAvLyB3aXJlIGFzIGVhcmx5IGFzIHBvc3NpYmxlIHNvIERldlRvb2xzIGNhdGNoZXMgdGhlIGdhbWUncyBib290LXRpbWUgY29uc29sZSBvdXRwdXRcbiAgICAgICAgd3YuYWRkRXZlbnRMaXN0ZW5lciggJ2RpZC1zdGFydC1sb2FkaW5nJywgKCkgPT4gc2V0VGltZW91dCggd2lyZURldnRvb2xzSW5UYWIsIDIwMCApICk7XG4gICAgICAgIHd2LmFkZEV2ZW50TGlzdGVuZXIoICdkb20tcmVhZHknLCAoKSA9PiB7XG4gICAgICAgICAgICBleGVjSW5HYW1lKCBgdmFyIF9fbG9nQ291bnQ9JHsgc2V0dGluZy5sb2dDb3VudCB9O3ZhciBfX3Nob3dEZXZUb29sSW5UYWI9JHsgc2V0dGluZy5zaG93RGV2VG9vbEluVGFiIH1gICk7XG4gICAgICAgICAgICBleGVjSW5HYW1lKCBpbmplY3RlZFNvdXJjZSApO1xuICAgICAgICAgICAgc2V0dGluZy5pbml0TXYoIHtcbiAgICAgICAgICAgICAgICBfX2xvY2tEcmFnTm9kZTogdGhpcy5sb2NrTm9kZSxcbiAgICAgICAgICAgICAgICBfX2hvdmVyOiB0aGlzLmhvdmVyLFxuICAgICAgICAgICAgICAgIF9fZGVzaWduTW9kZTogdGhpcy5kZXNpZ25Nb2RlLFxuICAgICAgICAgICAgfSApO1xuICAgICAgICAgICAgd2lyZURldnRvb2xzSW5UYWIoKTtcbiAgICAgICAgfSApO1xuICAgICAgICB3di5hZGRFdmVudExpc3RlbmVyKCAnZGlkLWZpbmlzaC1sb2FkJywgKCkgPT4gdi5jbGVhclRyZWUoKSApO1xuICAgICAgICB3di5hZGRFdmVudExpc3RlbmVyKCAnaXBjLW1lc3NhZ2UnLCAoIGV2ZW50OiB7IGNoYW5uZWw6IHN0cmluZzsgYXJnczogdW5rbm93bltdIH0gKSA9PiB7XG4gICAgICAgICAgICBjb25zdCB7IGFyZ3MsIGNoYW5uZWwgfSA9IGV2ZW50O1xuICAgICAgICAgICAgc3dpdGNoICggY2hhbm5lbCApIHtcbiAgICAgICAgICAgICAgICBjYXNlIEhvc3RDaGFubmVsLmdhbWVTdGF0ZTpcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5nYW1lUGF1c2VkID0gYXJnc1sgMCBdO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIEhvc3RDaGFubmVsLmxvY2F0ZU5vZGU6XG4gICAgICAgICAgICAgICAgICAgIGlmICggc2V0dGluZy5zaW1wbGVNb2RlICkgc2V0dGluZy50b2dnbGVTaW1wbGVNb2RlKCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubG9jYXRlTm9kZSggYXJnc1sgMCBdICk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgSG9zdENoYW5uZWwuY29uc29sZUxvZzpcbiAgICAgICAgICAgICAgICBjYXNlIEhvc3RDaGFubmVsLmNvbnNvbGVFcnJvcjpcbiAgICAgICAgICAgICAgICBjYXNlIEhvc3RDaGFubmVsLmNvbnNvbGVXYXJuOlxuICAgICAgICAgICAgICAgICAgICB0aGlzLnB1c2hMb2coIG5ldyBEYXRlKCkudG9Mb2NhbGVUaW1lU3RyaW5nKCksIGNoYW5uZWwsIGFyZ3NbIDAgXSApO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIEhvc3RDaGFubmVsLmNhblVwZGF0ZVRyZWU6XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2FuVXBkYXRlVHJlZSA9IGFyZ3NbIDAgXTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSBIb3N0Q2hhbm5lbC51cGRhdGVUcmVlOlxuICAgICAgICAgICAgICAgICAgICB0ZW1wTm9kZVRyZWUgPSBhcmdzWyAwIF07XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudHJlZVVwZGF0ZSA9IDA7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgSG9zdENoYW5uZWwuc2VuZFN0YXRpc3RpYzpcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zdGF0aXN0aWNzID0gYXJnc1sgMCBdO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIEhvc3RDaGFubmVsLnNob3dOb2RlRGV0YWlsOlxuICAgICAgICAgICAgICAgICAgICBpZiAoIHRoaXMubm9kZURldGFpbCApIE9iamVjdC5hc3NpZ24oIHRoaXMubm9kZURldGFpbCwgYXJnc1sgMCBdICk7XG4gICAgICAgICAgICAgICAgICAgIGVsc2UgdGhpcy5ub2RlRGV0YWlsID0gYXJnc1sgMCBdO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSApO1xuICAgIH0sXG4gICAgZGF0YToge1xuICAgICAgICB0cmVlVXBkYXRlOiAwLFxuICAgICAgICBsb2dVcGRhdGU6IDAsXG4gICAgICAgIGdhbWVQYXVzZWQ6IGZhbHNlLFxuICAgICAgICBjYW5VcGRhdGVUcmVlOiBmYWxzZSxcbiAgICAgICAgbG9nczogW10sXG4gICAgICAgIG5vZGVUcmVlOiBudWxsLFxuICAgICAgICBvcGVuTm9kZXM6IG5ldyBTZXQoKSxcbiAgICAgICAgc2VsZWN0ZWROb2RlOiAnJyxcbiAgICAgICAgbmVlZFNjcm9sbE9uZVRpbWU6IGZhbHNlLFxuICAgICAgICBub2RlRGV0YWlsOiBudWxsLFxuICAgICAgICBwb3J0OiBudWxsLFxuICAgICAgICBzaG93UmVzb2x1dGlvblNlbGVjdG9yOiBmYWxzZSxcbiAgICAgICAgZGVzaWduTW9kZTogZmFsc2UsXG4gICAgICAgIHRhYjogMCxcbiAgICAgICAgbW9kZTogMCxcbiAgICAgICAgdXJsUGFyYW1zOiAnJyxcbiAgICAgICAgaG92ZXI6IDAsXG4gICAgICAgIGhpZGUzZFJvb3ROb2RlOiBmYWxzZSxcbiAgICAgICAgZHJhZ2luZ1NOOiBudWxsLFxuICAgICAgICBkcmFnaW5nRU46IG51bGwsXG4gICAgICAgIGxvY2tOb2RlOiBudWxsLFxuICAgICAgICBpc011dGVkOiBmYWxzZSxcbiAgICAgICAgc2hvd0NoaWxkcmVuQ291bnQ6IGZhbHNlLFxuICAgICAgICAvLyBzdGF0aXN0aWMgZmVhdHVyZSBzdGF0ZSBsaXZlZCBoYWxmIG9uIGBzZXR0aW5nYCB1cHN0cmVhbTsgY29uc29saWRhdGVkIG9uIGB2YFxuICAgICAgICBzdGF0aXN0aWNzOiBudWxsLFxuICAgICAgICBzdGF0aXN0aWNpbmc6IGZhbHNlLFxuICAgIH0sXG4gICAgY29tcHV0ZWQ6IHtcbiAgICAgICAgc2hvd0RldlRvb2xJblRhYigpOiBib29sZWFuIHtcbiAgICAgICAgICAgIHJldHVybiBzZXR0aW5nLnNob3dEZXZUb29sSW5UYWI7XG4gICAgICAgIH0sXG4gICAgICAgIGRlc2lnbkJ0blN0eWxlKCk6IHN0cmluZyB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5kZXNpZ25Nb2RlID8gJ3Bvc2l0aW9uOnJlbGF0aXZlO2NvbG9yOnJnYig1MiwgMTQ2LCAyMzUpOycgOiAncG9zaXRpb246cmVsYXRpdmU7JztcbiAgICAgICAgfSxcbiAgICAgICAgaG92ZXJCdG5TdHlsZSgpOiBzdHJpbmcge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaG92ZXIgPyAncG9zaXRpb246cmVsYXRpdmU7Y29sb3I6cmdiKDUyLCAxNDYsIDIzNSk7JyA6ICdwb3NpdGlvbjpyZWxhdGl2ZTsnO1xuICAgICAgICB9LFxuICAgICAgICByZXNvbHV0aW9uQnRuU3R5bGUoKTogc3RyaW5nIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNob3dSZXNvbHV0aW9uU2VsZWN0b3IgPyAnY29sb3I6cmdiKDUyLCAxNDYsIDIzNSk7JyA6ICcnO1xuICAgICAgICB9LFxuICAgICAgICBob3Zlck1hcmsoKTogc3RyaW5nIHtcbiAgICAgICAgICAgIHN3aXRjaCAoIHRoaXMuaG92ZXIgKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAxOiByZXR1cm4gJzJEJztcbiAgICAgICAgICAgICAgICBjYXNlIDI6IHJldHVybiAnM0QnO1xuICAgICAgICAgICAgICAgIGRlZmF1bHQ6IHJldHVybiAnJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgZGlzYWJsZVdlYlNlYygpOiBib29sZWFuIHtcbiAgICAgICAgICAgIHJldHVybiBzZXR0aW5nLmRpc2FibGVXZWJTZWM7XG4gICAgICAgIH0sXG4gICAgICAgIGdhbWVVcmwoKTogc3RyaW5nIHtcbiAgICAgICAgICAgIGlmICggdGhpcy5tb2RlID09IDIgJiYgc2V0dGluZy5jdXN0b21VcmwgKSByZXR1cm4gc2V0dGluZy5jdXN0b21Vcmw7XG4gICAgICAgICAgICBsZXQgcGFnZSA9ICcnO1xuICAgICAgICAgICAgaWYgKCB0aGlzLm1vZGUgPiAwICkge1xuICAgICAgICAgICAgICAgIHBhZ2UgPSB0aGlzLm1vZGUgPT0gMSA/ICd3ZWItbW9iaWxlL3dlYi1tb2JpbGUvaW5kZXguaHRtbCcgOiAnd2ViLWRlc2t0b3Avd2ViLWRlc2t0b3AvaW5kZXguaHRtbCc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBwYXJhbXMgPSB0aGlzLnVybFBhcmFtcy50cmltKCk7XG4gICAgICAgICAgICBpZiAoIHBhcmFtcyAhPT0gJycgKSBwYWdlICs9IHBhcmFtcy5zdGFydHNXaXRoKCAnPycgKSA/IHBhcmFtcyA6ICc/JyArIHBhcmFtcztcbiAgICAgICAgICAgIHJldHVybiBgaHR0cDovL2xvY2FsaG9zdDokeyB0aGlzLnBvcnQgfS8keyBwYWdlIH1gO1xuICAgICAgICB9LFxuICAgICAgICBwYXVzZUljb24oKTogc3RyaW5nIHtcbiAgICAgICAgICAgIHJldHVybiAnaWNvbmZvbnQgJyArICggdGhpcy5nYW1lUGF1c2VkID8gJ2ljb24tYm9mYW5nc2Fuamlhb3hpbmcnIDogJ2ljb24taWNvbmZyb250LScgKTtcbiAgICAgICAgfSxcbiAgICAgICAgc2hvd1JlZnJlc2hUcmVlQnRuKCk6IGJvb2xlYW4ge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY2FuVXBkYXRlVHJlZSAmJiAhc2V0dGluZy5hdXRvVXBkYXRlVHJlZTtcbiAgICAgICAgfSxcbiAgICAgICAgc2NlbmVOYW1lKCk6IHN0cmluZyB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5ub2RlVHJlZSA/IHRoaXMubm9kZVRyZWUubmFtZSA6ICcnO1xuICAgICAgICB9LFxuICAgICAgICBzbWFsbExvZ3MoKTogdW5rbm93bltdIHtcbiAgICAgICAgICAgIGlmICggc2V0dGluZy5sb2dDb3VudCA9PSAwICkgcmV0dXJuIFtdO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMubG9ncy5zbGljZSggLXNldHRpbmcubG9nQ291bnQgKTtcbiAgICAgICAgfSxcbiAgICAgICAgYmlnTG9ncygpOiB1bmtub3duW10ge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMubG9ncy5zbGljZSggLTEwMCApO1xuICAgICAgICB9LFxuICAgICAgICBzaW1wbGVNb2RlKCk6IGJvb2xlYW4ge1xuICAgICAgICAgICAgcmV0dXJuIHNldHRpbmcuc2ltcGxlTW9kZTtcbiAgICAgICAgfSxcbiAgICB9LFxuICAgIGNyZWF0ZWQoKSB7XG4gICAgICAgIGNvbnRleHQudnVlQXBwID0gdGhpcztcbiAgICAgICAgKCB3aW5kb3cgYXMgYW55ICkudiA9IHRoaXM7XG4gICAgICAgIHRoaXMuY2hlY2tVcmxQYXJhbXMoKTtcbiAgICAgICAgY29uc3QgcXVlcnkgPSBsb2NhdGlvbi5zZWFyY2guc2xpY2UoIDEgKS5zcGxpdCggJyYnICk7XG4gICAgICAgIHRoaXMucG9ydCA9IHF1ZXJ5WyAwIF0uc3BsaXQoICc9JyApWyAxIF07XG4gICAgICAgIHRoaXMubW9kZSA9IHF1ZXJ5WyAxIF0uc3BsaXQoICc9JyApWyAxIF07XG4gICAgICAgIHRoaXMuJG5leHRUaWNrKCkudGhlbiggKCkgPT4ge1xuICAgICAgICAgICAgdGhpcy4kZWwuc3R5bGUudmlzaWJpbGl0eSA9ICd2aXNpYmxlJztcbiAgICAgICAgfSApO1xuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoIHRoaXMuZXZlcnlGcmFtZSApO1xuICAgIH0sXG4gICAgbWV0aG9kczoge1xuICAgICAgICB0b2dnbGVEcmFnKCBub2RlSWQ6IHN0cmluZyApIHtcbiAgICAgICAgICAgIHRoaXMubG9ja05vZGUgPSB0aGlzLmxvY2tOb2RlICE9PSBub2RlSWQgPyBub2RlSWQgOiBudWxsO1xuICAgICAgICAgICAgaWYgKCB0aGlzLmxvY2tOb2RlICYmICF0aGlzLmRlc2lnbk1vZGUgKSB0aGlzLnRvZ2dsZURlc2lnbk1vZGUoKTtcbiAgICAgICAgICAgIGV4ZWNJbkdhbWUoIGBfX3RvZ2dsZURyYWcoJyR7IHRoaXMubG9ja05vZGUgfScpYCApO1xuICAgICAgICB9LFxuICAgICAgICBzeW5jT3BlbkZjb20oIG5vZGVJZDogc3RyaW5nICkge1xuICAgICAgICAgICAgZXhlY0luR2FtZSggYF9fc3luY09wZW5GY29tKCckeyBub2RlSWQgfScpYCApO1xuICAgICAgICB9LFxuICAgICAgICBzeW5jT3Blbiggbm9kZUlkOiBzdHJpbmcsIG9wZW46IGJvb2xlYW4sIHVwZGF0ZSA9IHRydWUgKSB7XG4gICAgICAgICAgICBpZiAoIG9wZW4gKSB0aGlzLm9wZW5Ob2Rlcy5hZGQoIG5vZGVJZCApO1xuICAgICAgICAgICAgZWxzZSB0aGlzLm9wZW5Ob2Rlcy5kZWxldGUoIG5vZGVJZCApO1xuICAgICAgICAgICAgZXhlY0luR2FtZSggYF9fc3luY09wZW4oJyR7IG5vZGVJZCB9JywgJHsgb3BlbiB9LCAkeyB1cGRhdGUgfSlgICk7XG4gICAgICAgIH0sXG4gICAgICAgIHRvZ2dsZVNuZCgpIHtcbiAgICAgICAgICAgIHRoaXMuaXNNdXRlZCA9ICF0aGlzLmlzTXV0ZWQ7XG4gICAgICAgICAgICBzZXRBdWRpb011dGVkSXBjKCBjb250ZXh0Lnd2IS5nZXRXZWJDb250ZW50c0lkKCksIHRoaXMuaXNNdXRlZCApO1xuICAgICAgICB9LFxuICAgICAgICBldmVyeUZyYW1lKCkge1xuICAgICAgICAgICAgaWYgKCB0aGlzLnRyZWVVcGRhdGUgPT0gMSAmJiB0ZW1wTm9kZVRyZWUgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5ub2RlVHJlZSA9IHRlbXBOb2RlVHJlZTtcbiAgICAgICAgICAgICAgICBpZiAoIHRoaXMubmVlZFNjcm9sbE9uZVRpbWUgKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuJG5leHRUaWNrKCkudGhlbiggKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgKCBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCAnI3NlbGVjdGVkTm9kZScgKT8uZmlyc3RFbGVtZW50Q2hpbGQgYXMgYW55ICk/LnNjcm9sbEludG9WaWV3SWZOZWVkZWQoKTtcbiAgICAgICAgICAgICAgICAgICAgfSApO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm5lZWRTY3JvbGxPbmVUaW1lID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRlbXBOb2RlVHJlZSA9IG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIHRlbXBMb2dzLmxlbmd0aCA+IDAgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5sb2dzLnB1c2goIC4uLnRlbXBMb2dzICk7XG4gICAgICAgICAgICAgICAgdGhpcy5zY3JvbGxMb2dUb0JvdHRvbSgpO1xuICAgICAgICAgICAgICAgIHRlbXBMb2dzLmxlbmd0aCA9IDA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoIHRoaXMuZXZlcnlGcmFtZSApO1xuICAgICAgICAgICAgaWYgKCB0aGlzLnRyZWVVcGRhdGUgPCAxICkgdGhpcy50cmVlVXBkYXRlKys7XG4gICAgICAgICAgICBpZiAoIHRoaXMubG9nVXBkYXRlIDwgMSApIHRoaXMubG9nVXBkYXRlKys7XG4gICAgICAgIH0sXG4gICAgICAgIGNoZWNrVXJsUGFyYW1zKCk6IGJvb2xlYW4ge1xuICAgICAgICAgICAgaWYgKCBzZXR0aW5nLnVybFBhcmFtcyAhPT0gdGhpcy51cmxQYXJhbXMgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy51cmxQYXJhbXMgPSBzZXR0aW5nLnVybFBhcmFtcztcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSxcbiAgICAgICAgc2hvd0FwcE1lbnUoIGV2ZW50OiBNb3VzZUV2ZW50ICkge1xuICAgICAgICAgICAgaWYgKCBldmVudC50YXJnZXQgaW5zdGFuY2VvZiBIVE1MSW5wdXRFbGVtZW50ICkgcmV0dXJuO1xuICAgICAgICAgICAgaWYgKCBldmVudC50YXJnZXQgaW5zdGFuY2VvZiBIVE1MQnV0dG9uRWxlbWVudCApIHJldHVybjtcbiAgICAgICAgICAgIHNob3dBcHBNZW51KCk7XG4gICAgICAgIH0sXG4gICAgICAgIHNob3dNZW51KCkge1xuICAgICAgICAgICAgc2hvd1RyZWVNZW51KCk7XG4gICAgICAgIH0sXG4gICAgICAgIHN3aXRjaE1vZGUoIG1vZGU6IG51bWJlciApIHtcbiAgICAgICAgICAgIHRoaXMubW9kZSA9IG1vZGU7XG4gICAgICAgIH0sXG4gICAgICAgIHB1c2hMb2coIHRpbWU6IHN0cmluZywgdHlwZTogc3RyaW5nLCBkYXRhOiBzdHJpbmcgKSB7XG4gICAgICAgICAgICB0ZW1wTG9ncy5wdXNoKCB7IHRpbWUsIHQ6IHR5cGUsIGQ6IGRhdGEgfSApO1xuICAgICAgICAgICAgdGhpcy5sb2dVcGRhdGUgPSAwO1xuICAgICAgICB9LFxuICAgICAgICBzY3JvbGxMb2dUb0JvdHRvbSgpIHtcbiAgICAgICAgICAgIGNvbnN0IGVsID0gdGhpcy4kcmVmcy5sb2dzO1xuICAgICAgICAgICAgdGhpcy4kbmV4dFRpY2soICgpID0+IHsgZWwuc2Nyb2xsVG9wID0gZWwuc2Nyb2xsSGVpZ2h0OyB9ICk7XG4gICAgICAgIH0sXG4gICAgICAgIGZvcmNlVXBkYXRlVHJlZSgpIHtcbiAgICAgICAgICAgIHRoaXMuY2FuVXBkYXRlVHJlZSA9IGZhbHNlO1xuICAgICAgICAgICAgZXhlY0luR2FtZSggJ19fdXBkYXRlVHJlZSgpJyApO1xuICAgICAgICB9LFxuICAgICAgICBzZWxlY3ROb2RlKCBub2RlSWQ6IHN0cmluZywgd2l0aERldGFpbCA9IHRydWUgKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGVkTm9kZSA9IG5vZGVJZDtcbiAgICAgICAgICAgIHRoaXMuJGVtaXQoICdzZWxlY3RlZE5vZGVfY2hhbmdlZCcgKTtcbiAgICAgICAgICAgIGlmICggIXdpdGhEZXRhaWwgKSByZXR1cm47XG4gICAgICAgICAgICBleGVjSW5HYW1lKCBgX19nZXROb2RlRGV0YWlsKCckeyBub2RlSWQgfScpYCApO1xuICAgICAgICB9LFxuICAgICAgICBsb2NhdGVOb2RlKCB1dWlkUGF0aDogc3RyaW5nW10gKSB7XG4gICAgICAgICAgICB0aGlzLnRhYiA9IDA7XG4gICAgICAgICAgICBjb25zdCBsYXN0SWQgPSB1dWlkUGF0aC5zbGljZSggLTEgKVsgMCBdO1xuICAgICAgICAgICAgY29uc3Qgb3BlblNldCA9IG5ldyBTZXQoIHV1aWRQYXRoICk7XG4gICAgICAgICAgICBvcGVuU2V0LmRlbGV0ZSggbGFzdElkICk7XG4gICAgICAgICAgICBvcGVuU2V0LmZvckVhY2goICggdXVpZCApID0+IHRoaXMub3Blbk5vZGVzLmFkZCggdXVpZCApICk7XG4gICAgICAgICAgICB0aGlzLm5lZWRTY3JvbGxPbmVUaW1lID0gdHJ1ZTtcbiAgICAgICAgICAgIGV4ZWNJbkdhbWUoIGBfX2xvY2F0ZU5vZGUoWyR7IHV1aWRQYXRoLm1hcCggKCB1dWlkICkgPT4gYFwiJHsgdXVpZCB9XCJgICkgfV0pYCApO1xuICAgICAgICAgICAgbGFzdE5vZGVTZXQgPSBvcGVuU2V0O1xuICAgICAgICAgICAgdGhpcy4kZW1pdCggJ2xvY2F0ZU5vZGUnLCBvcGVuU2V0ICk7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdE5vZGUoIGxhc3RJZCwgZmFsc2UgKTtcbiAgICAgICAgfSxcbiAgICAgICAgdG9nZ2xlTm9kZSggbm9kZUlkOiBzdHJpbmcgKSB7XG4gICAgICAgICAgICBpZiAoIHRoaXMub3Blbk5vZGVzLmhhcyggbm9kZUlkICkgKSB0aGlzLm9wZW5Ob2Rlcy5kZWxldGUoIG5vZGVJZCApO1xuICAgICAgICAgICAgZWxzZSB0aGlzLm9wZW5Ob2Rlcy5hZGQoIG5vZGVJZCApO1xuICAgICAgICB9LFxuICAgICAgICBsb2dDb2xvciggdHlwZTogc3RyaW5nICk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gICAgICAgICAgICBzd2l0Y2ggKCB0eXBlICkge1xuICAgICAgICAgICAgICAgIGNhc2UgSG9zdENoYW5uZWwuY29uc29sZUxvZzogcmV0dXJuICd1bnNldCc7XG4gICAgICAgICAgICAgICAgY2FzZSBIb3N0Q2hhbm5lbC5jb25zb2xlRXJyb3I6IHJldHVybiAncmVkJztcbiAgICAgICAgICAgICAgICBjYXNlIEhvc3RDaGFubmVsLmNvbnNvbGVXYXJuOiByZXR1cm4gJyNjYzkxMzgnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfSxcbiAgICAgICAgcGxheU9yUGF1c2UoKSB7XG4gICAgICAgICAgICBleGVjSW5HYW1lKCB0aGlzLmdhbWVQYXVzZWQgPyAnY2MuZ2FtZS5yZXN1bWUoKScgOiAnY2MuZ2FtZS5wYXVzZSgpJyApO1xuICAgICAgICB9LFxuICAgICAgICByZWZyZXNoKCkge1xuICAgICAgICAgICAgaWYgKCAhdGhpcy5jaGVja1VybFBhcmFtcygpICkgY29udGV4dC53diEucmVsb2FkSWdub3JpbmdDYWNoZSgpO1xuICAgICAgICAgICAgdGhpcy5jbGVhclRyZWUoKTtcbiAgICAgICAgfSxcbiAgICAgICAgY2xlYXJUcmVlKCkge1xuICAgICAgICAgICAgdGhpcy5ub2RlVHJlZSA9IG51bGw7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGVkTm9kZSA9IG51bGw7XG4gICAgICAgICAgICB0aGlzLm5vZGVEZXRhaWwgPSBudWxsO1xuICAgICAgICAgICAgaWYgKCBzZXR0aW5nLmNsZWFyTG9nQWZ0ZXJSZWZyZXNoICkgdGhpcy5sb2dzID0gW107XG4gICAgICAgICAgICB0aGlzLm9wZW5Ob2Rlcy5jbGVhcigpO1xuICAgICAgICAgICAgbGFzdE5vZGVTZXQ/LmNsZWFyKCk7XG4gICAgICAgIH0sXG4gICAgICAgIHRvZ2dsZUZwcygpIHtcbiAgICAgICAgICAgIGV4ZWNJbkdhbWUoICdfX3RvZ2dsZUZwcygpJyApO1xuICAgICAgICB9LFxuICAgICAgICB0b2dnbGVEZXNpZ25Nb2RlKCkge1xuICAgICAgICAgICAgdGhpcy5kZXNpZ25Nb2RlID0gIXRoaXMuZGVzaWduTW9kZTtcbiAgICAgICAgICAgIGV4ZWNJbkdhbWUoIGBfX3RvZ2dsZURlc2lnbk1vZGUoJHsgdGhpcy5kZXNpZ25Nb2RlIH0pYCApO1xuICAgICAgICB9LFxuICAgICAgICB0b2dnbGVIb3ZlcigpIHtcbiAgICAgICAgICAgIHRoaXMuaG92ZXIgPSB0aGlzLmhvdmVyID09IDAgPyAxIDogMDtcbiAgICAgICAgICAgIGV4ZWNJbkdhbWUoIGBfX3NldEhvdmVyKCR7IHRoaXMuaG92ZXIgfSlgICk7XG4gICAgICAgIH0sXG4gICAgICAgIHRvZ2dsZTNkSG92ZXIoKSB7XG4gICAgICAgICAgICB0aGlzLmhvdmVyID0gdGhpcy5ob3ZlciA9PSAwID8gMiA6IDA7XG4gICAgICAgICAgICBleGVjSW5HYW1lKCBgX19zZXRIb3ZlcigkeyB0aGlzLmhvdmVyIH0pYCApO1xuICAgICAgICB9LFxuICAgICAgICBjb21waWxlKCkge1xuICAgICAgICAgICAgdGhpcy5wdXNoTG9nKCBuZXcgRGF0ZSgpLnRvTG9jYWxlVGltZVN0cmluZygpLCBIb3N0Q2hhbm5lbC5jb25zb2xlTG9nLCAncmVDb21waWxpbmcuLi4nICk7XG4gICAgICAgICAgICBleGVjSW5HYW1lKCAnX19yZUNvbXBpbGUoKScgKTtcbiAgICAgICAgfSxcbiAgICAgICAgb3Blbld2RGV2VG9vbCgpIHtcbiAgICAgICAgICAgIGNvbnRleHQud3YhLm9wZW5EZXZUb29scygpO1xuICAgICAgICB9LFxuICAgICAgICBzaG93U2V0dGluZygpIHtcbiAgICAgICAgICAgIHNldHRpbmcuc2hvdyA9IHRydWU7XG4gICAgICAgIH0sXG4gICAgICAgIHNob3dIZWxwKCkge1xuICAgICAgICAgICAgdi4kcmVmcy5oZWxwLnNob3cgPSB0cnVlO1xuICAgICAgICB9LFxuICAgICAgICB0b2dnbGVTdGF0aXN0aWMoKSB7XG4gICAgICAgICAgICB0aGlzLnN0YXRpc3RpY2luZyA9ICF0aGlzLnN0YXRpc3RpY2luZztcbiAgICAgICAgICAgIGV4ZWNJbkdhbWUoIGBfX3N0YXJ0U3RhdGlzdGljKCR7IHRoaXMuc3RhdGlzdGljaW5nIH0pYCApO1xuICAgICAgICB9LFxuICAgIH0sXG59ICk7XG4iLCAiLy8gTWVzc2FnZSBwcm90b2NvbCBzaGFyZWQgYmV0d2VlbiB0aGUgZXh0ZW5zaW9uIG1haW4gcHJvY2VzcywgdGhlIGluc3BlY3RvciByZW5kZXJlcixcbi8vIHRoZSBnYW1lLXdlYnZpZXcgcHJlbG9hZCwgYW5kIHRoZSBpbmplY3RlZCBwcm9iZSBzY3JpcHQuXG5cbi8qKiBIb3N0IGV4dGVuc2lvbiBwYWNrYWdlIG5hbWUgKHRoZSBpbnNwZWN0b3Igc2hpcHMgaW5zaWRlIGNvY29zLW1jcC1zZXJ2ZXIpOyBldmVyeSBJUEMgY2hhbm5lbCBpcyBwcmVmaXhlZCB3aXRoIGl0LiAqL1xuZXhwb3J0IGNvbnN0IFBLR19OQU1FID0gJ2NvY29zLW1jcC1zZXJ2ZXInO1xuXG4vKiogV2luZG93IG9wZW4gbW9kZXMgdHJpZ2dlcmVkIGZyb20gdGhlIENyZWF0b3IgZXh0ZW5zaW9uIG1lbnUuICovXG5leHBvcnQgZW51bSBJbnNwZWN0b3JNb2RlIHtcbiAgICBQcmV2aWV3ID0gMCxcbiAgICBCdWlsZE1vYmlsZSA9IDEsXG4gICAgQ3VzdG9tUGFnZSA9IDIsXG4gICAgQnVpbGREZXNrdG9wID0gMyxcbn1cblxuLyoqIHJlbmRlcmVyIC0+IG1haW4gKGlwY1JlbmRlcmVyLnNlbmQpLiAqL1xuZXhwb3J0IGNvbnN0IElwY1NlbmQgPSB7XG4gICAgZm9jdXNOb2RlOiBgJHsgUEtHX05BTUUgfTpmb2N1c05vZGVgLFxuICAgIGZvY3VzQXNzZXQ6IGAkeyBQS0dfTkFNRSB9OmZvY3VzQXNzZXRgLFxufSBhcyBjb25zdDtcblxuLyoqIHJlbmRlcmVyIC0+IG1haW4gKGlwY1JlbmRlcmVyLmludm9rZSkuICovXG5leHBvcnQgY29uc3QgSXBjSW52b2tlID0ge1xuICAgIHdpcmVEZXZ0b29sczogYCR7IFBLR19OQU1FIH06d2lyZS1kZXZ0b29sc2AsXG4gICAgc2V0QXVkaW9NdXRlZDogYCR7IFBLR19OQU1FIH06c2V0LWF1ZGlvLW11dGVkYCxcbiAgICBzaG93TWVudTogYCR7IFBLR19OQU1FIH06c2hvdy1tZW51YCxcbiAgICBzaG93T3BlbkRpYWxvZzogYCR7IFBLR19OQU1FIH06c2hvdy1vcGVuLWRpYWxvZ2AsXG4gICAgZ2V0TG9jYWxlOiBgJHsgUEtHX05BTUUgfTpnZXQtbG9jYWxlYCxcbiAgICBzeW5jV2luZG93TW9kZTogYCR7IFBLR19OQU1FIH06c3luYy13aW5kb3ctbW9kZWAsXG4gICAgb3BlbkFwcERldnRvb2xzOiBgJHsgUEtHX05BTUUgfTpvcGVuLWFwcC1kZXZ0b29sc2AsXG59IGFzIGNvbnN0O1xuXG4vKiogbWFpbiAtPiByZW5kZXJlciAod2ViQ29udGVudHMuc2VuZCkuICovXG5leHBvcnQgY29uc3QgSXBjRXZlbnQgPSB7XG4gICAgZGVidWdnZXJQYXVzZWQ6IGAkeyBQS0dfTkFNRSB9OmRlYnVnZ2VyLXBhdXNlZGAsXG4gICAgbWVudUNsaWNrZWQ6IGAkeyBQS0dfTkFNRSB9Om1lbnUtY2xpY2tlZGAsXG59IGFzIGNvbnN0O1xuXG5leHBvcnQgaW50ZXJmYWNlIFdpcmVEZXZ0b29sc1Jlc3VsdCB7XG4gICAgb2s6IGJvb2xlYW47XG4gICAgZXJyb3I/OiBzdHJpbmc7XG4gICAgbXV0ZWQ/OiBib29sZWFuO1xufVxuXG4vKiogT25lIGVudHJ5IG9mIGEgY29udGV4dCBtZW51IHJlcXVlc3RlZCBieSB0aGUgcmVuZGVyZXIuICovXG5leHBvcnQgaW50ZXJmYWNlIE1lbnVJdGVtU3BlYyB7XG4gICAgaWQ/OiBzdHJpbmc7XG4gICAgbGFiZWw/OiBzdHJpbmc7XG4gICAgdHlwZT86ICdub3JtYWwnIHwgJ3NlcGFyYXRvcicgfCAnY2hlY2tib3gnO1xuICAgIGNoZWNrZWQ/OiBib29sZWFuO1xuICAgIGVuYWJsZWQ/OiBib29sZWFuO1xuICAgIHN1Ym1lbnU/OiBNZW51SXRlbVNwZWNbXTtcbn1cblxuLyoqXG4gKiBDaGFubmVscyB1c2VkIGJ5IHRoZSBnYW1lLXdlYnZpZXcgcHJlbG9hZDogdGhlIGluamVjdGVkIHByb2JlIGNhbGxzIHRoZSBtYXRjaGluZyBnbG9iYWxcbiAqIGZ1bmN0aW9uLCB0aGUgcHJlbG9hZCBmb3J3YXJkcyBpdCB0byB0aGUgaW5zcGVjdG9yIHJlbmRlcmVyIHZpYSBpcGNSZW5kZXJlci5zZW5kVG9Ib3N0LlxuICovXG5leHBvcnQgY29uc3QgSG9zdENoYW5uZWwgPSB7XG4gICAgZ2FtZVN0YXRlOiAnZ2FtZVN0YXRlJyxcbiAgICBsb2NhdGVOb2RlOiAnbG9jYXRlTm9kZScsXG4gICAgY29uc29sZUxvZzogJ2NvbnNvbGVMb2cnLFxuICAgIGNvbnNvbGVFcnJvcjogJ2NvbnNvbGVFcnJvcicsXG4gICAgY29uc29sZVdhcm46ICdjb25zb2xlV2FybicsXG4gICAgdXBkYXRlVHJlZTogJ3VwZGF0ZVRyZWUnLFxuICAgIHNob3dOb2RlRGV0YWlsOiAnc2hvd05vZGVEZXRhaWwnLFxuICAgIHNlbmRTdGF0aXN0aWM6ICdzZW5kU3RhdGlzdGljJyxcbiAgICBjYW5VcGRhdGVUcmVlOiAnY2FuVXBkYXRlVHJlZScsXG59IGFzIGNvbnN0O1xuXG4vKiogUGVyc2lzdGVkIGluc3BlY3RvciBzZXR0aW5ncyAoZXh0ZW5zaW9ucy9jb2Nvcy1pbnNwZWN0b3ItY29uZmlnLmpzb24pLiAqL1xuZXhwb3J0IGludGVyZmFjZSBJbnNwZWN0b3JDb25maWcge1xuICAgIGxvZ0NvdW50OiBudW1iZXIgfCBzdHJpbmc7XG4gICAgcmV0aW5hRW5hYmxlOiBib29sZWFuO1xuICAgIGF1dG9VcGRhdGVUcmVlOiBib29sZWFuO1xuICAgIGRpc3BsYXlBc0ZhaXJ5VHJlZT86IGJvb2xlYW47XG4gICAgaGlkZUZhaXJ5Q29tQ29udGFpbmVyPzogYm9vbGVhbjtcbiAgICBzeW5jTm9kZURldGFpbD86IGJvb2xlYW47XG4gICAgZGlzYWJsZVdlYlNlYz86IGJvb2xlYW47XG4gICAgc2hvd0RldlRvb2xJblRhYj86IGJvb2xlYW47XG4gICAgc2l6ZTogWyBudW1iZXIsIG51bWJlciBdO1xuICAgIGV4dHJhU2l6ZXM/OiB1bmtub3duW107XG4gICAgaXNQb3J0cmFpdDogYm9vbGVhbjtcbiAgICBzaG93OiBib29sZWFuO1xuICAgIHVybFBhcmFtcz86IHN0cmluZztcbiAgICBjdXN0b21Vcmw/OiBzdHJpbmc7XG4gICAgY2xlYXJMb2dBZnRlclJlZnJlc2g/OiBib29sZWFuO1xuICAgIGV4dGVuc2lvbkZpbGU/OiBzdHJpbmc7XG4gICAgZW5hYmxlRXh0ZW5zaW9uPzogYm9vbGVhbjtcbiAgICBzdGF0aXN0aWNpbmc/OiBib29sZWFuO1xuICAgIHN0YXRpc3RpY3M/OiB1bmtub3duO1xuICAgIHNvcnRDb21wUHJvcGVydGllcz86IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+O1xuICAgIHNpbXBsZU1vZGU/OiBib29sZWFuO1xuICAgIC8qKiB0cnVlIChkZWZhdWx0KTogZ2FtZSB2aWV3IGZvbGxvd3MgdGhlIHByb2plY3QgZGVzaWduIHJlc29sdXRpb247IGZhbHNlOiB1c2VyLXBpY2tlZCBzaXplICovXG4gICAgbWF0Y2hEZXNpZ24/OiBib29sZWFuO1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIFJ1bnRpbWUgQVBJIGV4cG9zZWQgdG8gb3RoZXIgZXh0ZW5zaW9ucyB0aHJvdWdoIEVkaXRvci5NZXNzYWdlIChwYWNrYWdlLmpzb24gXCJydW50aW1lLSpcIikuXG4vLyBQYXlsb2FkcyBtdXN0IHN0YXkgSlNPTi1zZXJpYWxpemFibGU6IHRoZXkgY3Jvc3MgdGhlIENyZWF0b3IgSVBDIGJvdW5kYXJ5LlxuXG5leHBvcnQgdHlwZSBSdW50aW1lQ29uc29sZUxldmVsID0gJ3ZlcmJvc2UnIHwgJ2luZm8nIHwgJ3dhcm5pbmcnIHwgJ2Vycm9yJztcblxuZXhwb3J0IGludGVyZmFjZSBSdW50aW1lU3RhdHVzIHtcbiAgICB3aW5kb3dPcGVuOiBib29sZWFuO1xuICAgIGdhbWVSZWFkeTogYm9vbGVhbjtcbiAgICBnYW1lVXJsOiBzdHJpbmcgfCBudWxsO1xuICAgIHByZXZpZXdQb3J0OiBudW1iZXIgfCBudWxsO1xuICAgIGNvbnNvbGVTZXE6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSdW50aW1lRXZhbFJlc3VsdCB7XG4gICAgb2s6IGJvb2xlYW47XG4gICAgdmFsdWU/OiB1bmtub3duO1xuICAgIGVycm9yPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJ1bnRpbWVDb25zb2xlRW50cnkge1xuICAgIHNlcTogbnVtYmVyO1xuICAgIHQ6IG51bWJlcjtcbiAgICBsZXZlbDogUnVudGltZUNvbnNvbGVMZXZlbDtcbiAgICBtZXNzYWdlOiBzdHJpbmc7XG4gICAgbGluZTogbnVtYmVyO1xuICAgIHNvdXJjZUlkOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUnVudGltZUNvbnNvbGVSZXN1bHQge1xuICAgIG9rOiBib29sZWFuO1xuICAgIGVudHJpZXM6IFJ1bnRpbWVDb25zb2xlRW50cnlbXTtcbiAgICBsYXRlc3RTZXE6IG51bWJlcjtcbiAgICBlcnJvcj86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSdW50aW1lQ2FwdHVyZVJlc3VsdCB7XG4gICAgb2s6IGJvb2xlYW47XG4gICAgcGF0aD86IHN0cmluZztcbiAgICB3aWR0aD86IG51bWJlcjtcbiAgICBoZWlnaHQ/OiBudW1iZXI7XG4gICAgYnl0ZXM/OiBudW1iZXI7XG4gICAgZXJyb3I/OiBzdHJpbmc7XG59XG4iLCAiLy8gU2hhcmVkIHJlbmRlcmVyIGNvbnRleHQ6IGxhdGUtYm91bmQgcmVmZXJlbmNlcyB1c2VkIGFjcm9zcyBjb21wb25lbnRzIGFuZCBtZW51cy5cbi8vIGB2dWVBcHBgIC8gYHNldHRpbmdBcHBgIGFyZSBhbHNvIGV4cG9zZWQgb24gd2luZG93IGJlY2F1c2UgKGEpIHRoZSBleHRlbnNpb24gbWFpbiBwcm9jZXNzXG4vLyBkcml2ZXMgdGhlbSB0aHJvdWdoIGV4ZWN1dGVKYXZhU2NyaXB0IChcInYuc3dpdGNoTW9kZSgwKVwiLCBcInNldHRpbmcuY29uZmlnRGF0YUZvck1haW5cIikgYW5kXG4vLyAoYikgVnVlIHRlbXBsYXRlcyBjb21waWxlZCBmcm9tIHN0cmluZ3MgcmVzb2x2ZSBiYXJlIGlkZW50aWZpZXJzIHZpYSB0aGUgZ2xvYmFsIHNjb3BlLlxuXG5leHBvcnQgY29uc3QgY29udGV4dCA9IHtcbiAgICAvKiogdGhlIGdhbWUgd2VidmlldyBlbGVtZW50ICovXG4gICAgd3Y6IG51bGwgYXMgSFRNTFdlYlZpZXdFbGVtZW50IHwgbnVsbCxcbiAgICAvKiogdGhlIGRldnRvb2xzIHdlYnZpZXcgZWxlbWVudCAqL1xuICAgIGR3djogbnVsbCBhcyBIVE1MV2ViVmlld0VsZW1lbnQgfCBudWxsLFxuICAgIC8qKiBtYWluIFZ1ZSBpbnN0YW5jZSAod2luZG93LnYpICovXG4gICAgdnVlQXBwOiBudWxsIGFzIGFueSxcbiAgICAvKiogc2V0dGluZ3MgVnVlIGluc3RhbmNlICh3aW5kb3cuc2V0dGluZykgKi9cbiAgICBzZXR0aW5nQXBwOiBudWxsIGFzIGFueSxcbiAgICAvKiogbm9kZSB1dWlkIHRoZSBsYXN0IHRyZWUgY29udGV4dCBtZW51IHdhcyBvcGVuZWQgb24gKi9cbiAgICBtZW51Tm9kZUlkOiAnJyxcbiAgICAvKiogY29tcG9uZW50IHV1aWQgLyBkaXNwbGF5IG5hbWUgdGhlIGxhc3QgY29tcG9uZW50IG1lbnUgd2FzIG9wZW5lZCBvbiAqL1xuICAgIG1lbnVDb21wSWQ6ICcnLFxuICAgIG1lbnVDb21wTmFtZTogJycsXG59O1xuXG4vKiogUnVucyBhIHNjcmlwdCBpbnNpZGUgdGhlIGdhbWUgcGFnZSAodGhlIGluamVjdGVkIHByb2JlIGV4cG9zZXMgdGhlIF9fIGdsb2JhbHMpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGV4ZWNJbkdhbWUoIGNvZGU6IHN0cmluZyApOiBQcm9taXNlPGFueT4ge1xuICAgIGlmICggIWNvbnRleHQud3YgKSByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCB1bmRlZmluZWQgKTtcbiAgICByZXR1cm4gY29udGV4dC53di5leGVjdXRlSmF2YVNjcmlwdCggY29kZSApO1xufVxuIiwgIi8vIFJlbmRlcmVyLXNpZGUgSVBDIGhlbHBlcnMgKGFsbCBtYWluLXByb2Nlc3MgYWNjZXNzIGdvZXMgdGhyb3VnaCBoZXJlIC0gbm8gYHJlbW90ZWApLlxuaW1wb3J0IHsgaXBjUmVuZGVyZXIsIHNoZWxsLCBjbGlwYm9hcmQgfSBmcm9tICdlbGVjdHJvbic7XG5pbXBvcnQgeyBJcGNTZW5kLCBJcGNJbnZva2UsIElwY0V2ZW50LCB0eXBlIE1lbnVJdGVtU3BlYywgdHlwZSBXaXJlRGV2dG9vbHNSZXN1bHQgfSBmcm9tICdAc2hhcmVkL3Byb3RvY29sJztcblxuZXhwb3J0IGludGVyZmFjZSBNZW51RW50cnkgZXh0ZW5kcyBNZW51SXRlbVNwZWMge1xuICAgIGFjdGlvbj86ICgpID0+IHZvaWQ7XG4gICAgc3VibWVudUVudHJpZXM/OiBNZW51RW50cnlbXTtcbn1cblxubGV0IG1lbnVBdXRvSWQgPSAwO1xuXG4vKiogU2hvd3MgYSBuYXRpdmUgY29udGV4dCBtZW51IChidWlsdCBpbiB0aGUgbWFpbiBwcm9jZXNzKSBhbmQgcnVucyB0aGUgY2xpY2tlZCBlbnRyeSdzIGFjdGlvbi4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwb3B1cE1lbnUoIGVudHJpZXM6IE1lbnVFbnRyeVtdICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGFjdGlvbnMgPSBuZXcgTWFwPHN0cmluZywgKCkgPT4gdm9pZD4oKTtcbiAgICBjb25zdCB0b1NwZWMgPSAoIGVudHJ5OiBNZW51RW50cnkgKTogTWVudUl0ZW1TcGVjID0+IHtcbiAgICAgICAgY29uc3QgaWQgPSBlbnRyeS5pZCA/PyBgbWVudS0keyBtZW51QXV0b0lkKysgfWA7XG4gICAgICAgIGlmICggZW50cnkuYWN0aW9uICkgYWN0aW9ucy5zZXQoIGlkLCBlbnRyeS5hY3Rpb24gKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgbGFiZWw6IGVudHJ5LmxhYmVsLFxuICAgICAgICAgICAgdHlwZTogZW50cnkudHlwZSxcbiAgICAgICAgICAgIGNoZWNrZWQ6IGVudHJ5LmNoZWNrZWQsXG4gICAgICAgICAgICBlbmFibGVkOiBlbnRyeS5lbmFibGVkLFxuICAgICAgICAgICAgc3VibWVudTogZW50cnkuc3VibWVudUVudHJpZXM/Lm1hcCggdG9TcGVjICksXG4gICAgICAgIH07XG4gICAgfTtcbiAgICBjb25zdCBzcGVjcyA9IGVudHJpZXMubWFwKCB0b1NwZWMgKTtcbiAgICBjb25zdCBjbGlja2VkSWQgPSBhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoIElwY0ludm9rZS5zaG93TWVudSwgc3BlY3MgKTtcbiAgICBpZiAoIGNsaWNrZWRJZCAmJiBhY3Rpb25zLmhhcyggY2xpY2tlZElkICkgKSBhY3Rpb25zLmdldCggY2xpY2tlZElkICkhKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3aXJlRGV2dG9vbHNJcGMoIGdhbWVXY0lkOiBudW1iZXIsIGRldnRvb2xzV2NJZDogbnVtYmVyICk6IFByb21pc2U8V2lyZURldnRvb2xzUmVzdWx0PiB7XG4gICAgcmV0dXJuIGlwY1JlbmRlcmVyLmludm9rZSggSXBjSW52b2tlLndpcmVEZXZ0b29scywgZ2FtZVdjSWQsIGRldnRvb2xzV2NJZCApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0QXVkaW9NdXRlZElwYyggZ2FtZVdjSWQ6IG51bWJlciwgbXV0ZWQ6IGJvb2xlYW4gKTogdm9pZCB7XG4gICAgaXBjUmVuZGVyZXIuaW52b2tlKCBJcGNJbnZva2Uuc2V0QXVkaW9NdXRlZCwgZ2FtZVdjSWQsIG11dGVkICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG93T3BlbkRpYWxvZ0lwYyggZXh0ZW5zaW9uczogc3RyaW5nW10gKTogUHJvbWlzZTxzdHJpbmdbXSB8IG51bGw+IHtcbiAgICByZXR1cm4gaXBjUmVuZGVyZXIuaW52b2tlKCBJcGNJbnZva2Uuc2hvd09wZW5EaWFsb2csIGV4dGVuc2lvbnMgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldExvY2FsZUlwYygpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIHJldHVybiBpcGNSZW5kZXJlci5pbnZva2UoIElwY0ludm9rZS5nZXRMb2NhbGUgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN5bmNXaW5kb3dNb2RlSXBjKCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgc2ltcGxlTW9kZTogYm9vbGVhbiwgbWluSGVpZ2h0RXh0cmE6IG51bWJlciApOiB2b2lkIHtcbiAgICBpcGNSZW5kZXJlci5pbnZva2UoIElwY0ludm9rZS5zeW5jV2luZG93TW9kZSwgd2lkdGgsIGhlaWdodCwgc2ltcGxlTW9kZSwgbWluSGVpZ2h0RXh0cmEgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZvY3VzTm9kZUluRWRpdG9yKCB1dWlkOiBzdHJpbmcgKTogdm9pZCB7XG4gICAgaXBjUmVuZGVyZXIuc2VuZCggSXBjU2VuZC5mb2N1c05vZGUsIHV1aWQgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZvY3VzQXNzZXRJbkVkaXRvciggdXVpZDogc3RyaW5nICk6IHZvaWQge1xuICAgIGlwY1JlbmRlcmVyLnNlbmQoIElwY1NlbmQuZm9jdXNBc3NldCwgdXVpZCApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gb25EZWJ1Z2dlclBhdXNlZCggaGFuZGxlcjogKCkgPT4gdm9pZCApOiB2b2lkIHtcbiAgICBpcGNSZW5kZXJlci5vbiggSXBjRXZlbnQuZGVidWdnZXJQYXVzZWQsIGhhbmRsZXIgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG9wZW5FeHRlcm5hbCggdXJsOiBzdHJpbmcgKTogdm9pZCB7XG4gICAgc2hlbGwub3BlbkV4dGVybmFsKCB1cmwgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvcHlUb0NsaXBib2FyZCggdGV4dDogc3RyaW5nICk6IHZvaWQge1xuICAgIGNsaXBib2FyZC53cml0ZVRleHQoIHRleHQgKTtcbn1cbiIsICIvLyBDb250ZXh0IG1lbnVzIChhcHAgLyB0cmVlIHRhYiAvIG5vZGUgLyBjb21wb25lbnQgLyBjb25zb2xlKS5cbmltcG9ydCB7IGlwY1JlbmRlcmVyIH0gZnJvbSAnZWxlY3Ryb24nO1xuaW1wb3J0IHsgSXBjSW52b2tlIH0gZnJvbSAnQHNoYXJlZC9wcm90b2NvbCc7XG5pbXBvcnQgeyBjb250ZXh0LCBleGVjSW5HYW1lIH0gZnJvbSAnLi9jb250ZXh0JztcbmltcG9ydCB7IHBvcHVwTWVudSwgY29weVRvQ2xpcGJvYXJkLCBmb2N1c05vZGVJbkVkaXRvciwgdHlwZSBNZW51RW50cnkgfSBmcm9tICcuL2lwYyc7XG5cbmNvbnN0IE5PREVfQlJFQUtfRVZFTlRTID0gW1xuICAgICdzaXplLWNoYW5nZWQnLCAnY29sb3ItY2hhbmdlZCcsICdjaGlsZC1yZW1vdmVkJywgJ2NoaWxkLWFkZGVkJyxcbiAgICAnbGF5ZXItY2hhbmdlZCcsICdzaWJsaW5nLW9yZGVyLWNoYW5nZWQnLCAnYWN0aXZlLWluLWhpZXJhcmNoeS1jaGFuZ2VkJyxcbl07XG5jb25zdCBUUkFOU0ZPUk1fQklUUyA9IFsgJ1BPU0lUSU9OJywgJ1JPVEFUSU9OJywgJ1NDQUxFJyBdO1xuXG4vKiogRXh0ZW5zaW9uIGVudHJpZXMgbG9hZGVkIGZyb20gdGhlIHVzZXItcHJvdmlkZWQgcGx1Z2lucyBqc29uIChbbGFiZWwsIGZ1bmN0aW9uTmFtZV0pLiAqL1xuZXhwb3J0IGNvbnN0IGV4dGVuc2lvbk1lbnVzID0ge1xuICAgIG5vZGU6IFtdIGFzIEFycmF5PFsgc3RyaW5nLCBzdHJpbmcgXT4sXG4gICAgY29tcG9uZW50OiBbXSBhcyBBcnJheTxbIHN0cmluZywgc3RyaW5nIF0+LFxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIHNob3dBcHBNZW51KCk6IHZvaWQge1xuICAgIGNvbnN0IHNldHRpbmcgPSBjb250ZXh0LnNldHRpbmdBcHA7XG4gICAgY29uc3QgdiA9IGNvbnRleHQudnVlQXBwO1xuICAgIGNvbnN0IGVudHJpZXM6IE1lbnVFbnRyeVtdID0gW1xuICAgICAgICB7IGxhYmVsOiAnVG9nZ2xlIE1pbmkgTW9kZScsIGFjdGlvbjogKCkgPT4gc2V0dGluZy50b2dnbGVTaW1wbGVNb2RlKCkgfSxcbiAgICAgICAgeyB0eXBlOiAnc2VwYXJhdG9yJyB9LFxuICAgICAgICB7IGxhYmVsOiAnUm90YXRlIFBvcnRyYWl0L0xhbmRzY2FwZScsIGFjdGlvbjogKCkgPT4gc2V0dGluZy50b2dnbGVQb3J0cmFpdCgpIH0sXG4gICAgICAgIHsgbGFiZWw6ICdDdXN0b20gUmVzb2x1dGlvbicsIGFjdGlvbjogKCkgPT4geyB2LnNob3dSZXNvbHV0aW9uU2VsZWN0b3IgPSAhdi5zaG93UmVzb2x1dGlvblNlbGVjdG9yOyB9IH0sXG4gICAgICAgIHtcbiAgICAgICAgICAgIGxhYmVsOiAnT3BlbiBEZXZUb29scycsXG4gICAgICAgICAgICBhY3Rpb246ICgpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoICFzZXR0aW5nLnNob3dEZXZUb29sSW5UYWIgKSB2Lm9wZW5XdkRldlRvb2woKTtcbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCBzZXR0aW5nLnNpbXBsZU1vZGUgKSBzZXR0aW5nLnRvZ2dsZVNpbXBsZU1vZGUoKTtcbiAgICAgICAgICAgICAgICAgICAgdi50YWIgPSAxO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHsgdHlwZTogJ3NlcGFyYXRvcicgfSxcbiAgICAgICAgeyBsYWJlbDogJ0hlbHAnLCBhY3Rpb246ICgpID0+IHYuc2hvd0hlbHAoKSB9LFxuICAgICAgICB7IGxhYmVsOiAnU2V0dGluZycsIGFjdGlvbjogKCkgPT4gdi5zaG93U2V0dGluZygpIH0sXG4gICAgICAgIHsgdHlwZTogJ3NlcGFyYXRvcicgfSxcbiAgICAgICAgeyBsYWJlbDogJ09wZW4gQXBwIERldlRvb2xzJywgYWN0aW9uOiAoKSA9PiBpcGNSZW5kZXJlci5pbnZva2UoIElwY0ludm9rZS5vcGVuQXBwRGV2dG9vbHMgKSB9LFxuICAgIF07XG4gICAgcG9wdXBNZW51KCBlbnRyaWVzICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG93Tm9kZU1lbnUoIG5vZGVJZDogc3RyaW5nICk6IHZvaWQge1xuICAgIGNvbnRleHQubWVudU5vZGVJZCA9IG5vZGVJZDtcbiAgICBjb25zdCB2ID0gY29udGV4dC52dWVBcHA7XG4gICAgY29uc3QgZW50cmllczogTWVudUVudHJ5W10gPSBbXG4gICAgICAgIHsgbGFiZWw6ICdSZW1vdmUnLCBhY3Rpb246ICgpID0+IGV4ZWNJbkdhbWUoIGBfX3JlbW92ZU5vZGUoJyR7IG5vZGVJZCB9JylgICkgfSxcbiAgICAgICAgeyB0eXBlOiAnc2VwYXJhdG9yJyB9LFxuICAgICAgICB7IGxhYmVsOiAnQ29weSB1dWlkJywgYWN0aW9uOiAoKSA9PiBjb3B5VG9DbGlwYm9hcmQoIG5vZGVJZCApIH0sXG4gICAgICAgIHsgbGFiZWw6ICdQcmludCBQYXRoJywgYWN0aW9uOiAoKSA9PiBleGVjSW5HYW1lKCBgX19wcmludFBhdGgoJyR7IG5vZGVJZCB9JylgICkgfSxcbiAgICAgICAgeyBsYWJlbDogJ1N0b3JlIGluIEdsb2JhbCcsIGFjdGlvbjogKCkgPT4gZXhlY0luR2FtZSggYF9fc3RvcmVJbkdsb2JhbCgnJHsgbm9kZUlkIH0nKWAgKSB9LFxuICAgICAgICB7IGxhYmVsOiAnTG9jay9VbmxvY2sgRHJhZycsIGFjdGlvbjogKCkgPT4gdi50b2dnbGVEcmFnKCBub2RlSWQgKSB9LFxuICAgICAgICB7IGxhYmVsOiAnVG9nZ2xlIEF1dG8gVXBkYXRlIE5vZGUnLCBhY3Rpb246ICgpID0+IGV4ZWNJbkdhbWUoIGBfX2Rvbm90QXV0b1VwZGF0ZSgnJHsgbm9kZUlkIH0nKWAgKSB9LFxuICAgICAgICB7IHR5cGU6ICdzZXBhcmF0b3InIH0sXG4gICAgICAgIHtcbiAgICAgICAgICAgIGxhYmVsOiAnQnJlYWsgT24nLFxuICAgICAgICAgICAgc3VibWVudUVudHJpZXM6IFtcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGxhYmVsOiAndHJhbnNmb3JtLWNoYW5nZWQnLFxuICAgICAgICAgICAgICAgICAgICBzdWJtZW51RW50cmllczogVFJBTlNGT1JNX0JJVFMubWFwKCAoIGJpdCApID0+ICgge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGFiZWw6IGJpdCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjdGlvbjogKCkgPT4gZXhlY0luR2FtZSggYF9fc2V0QnJlYWtQb2ludCgnJHsgbm9kZUlkIH0nLCAndHJhbnNmb3JtLWNoYW5nZWQnLCAnJHsgYml0IH0nKWAgKSxcbiAgICAgICAgICAgICAgICAgICAgfSApICksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAuLi5OT0RFX0JSRUFLX0VWRU5UUy5tYXAoICggZXZlbnROYW1lICkgPT4gKCB7XG4gICAgICAgICAgICAgICAgICAgIGxhYmVsOiBldmVudE5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGFjdGlvbjogKCkgPT4gZXhlY0luR2FtZSggYF9fc2V0QnJlYWtQb2ludCgnJHsgbm9kZUlkIH0nLCAnJHsgZXZlbnROYW1lIH0nKWAgKSxcbiAgICAgICAgICAgICAgICB9ICkgKSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICAgIHsgbGFiZWw6ICdSZW1vdmUgQnJlYWsgUG9pbnRzJywgYWN0aW9uOiAoKSA9PiBleGVjSW5HYW1lKCBgX19yZW1vdmVCcmVha1BvaW50KCckeyBub2RlSWQgfScpYCApIH0sXG4gICAgICAgIHsgbGFiZWw6ICdSZW1vdmUgQWxsIEJyZWFrIFBvaW50cycsIGFjdGlvbjogKCkgPT4gZXhlY0luR2FtZSggJ19fcmVtb3ZlQWxsQnJlYWtQb2ludCgpJyApIH0sXG4gICAgICAgIHsgdHlwZTogJ3NlcGFyYXRvcicgfSxcbiAgICAgICAgeyBsYWJlbDogJ1NlbGVjdCBpbiBFZGl0b3InLCBhY3Rpb246ICgpID0+IGZvY3VzTm9kZUluRWRpdG9yKCBub2RlSWQgKSB9LFxuICAgIF07XG4gICAgZm9yICggY29uc3QgWyBsYWJlbCwgZnVuY3Rpb25OYW1lIF0gb2YgZXh0ZW5zaW9uTWVudXMubm9kZSApIHtcbiAgICAgICAgZW50cmllcy5wdXNoKCB7IGxhYmVsLCBhY3Rpb246ICgpID0+IGV4ZWNJbkdhbWUoIGAkeyBmdW5jdGlvbk5hbWUgfShfX25kWyckeyBub2RlSWQgfSddKWAgKSB9ICk7XG4gICAgfVxuICAgIHBvcHVwTWVudSggZW50cmllcyApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2hvd0NvbXBvbmVudE1lbnUoIGNvbXBJZDogc3RyaW5nLCBjb21wTmFtZTogc3RyaW5nLCBtZXRob2ROYW1lczogc3RyaW5nW10sIGV4ZWNNZXRob2Q6ICggbmFtZTogc3RyaW5nICkgPT4gdm9pZCApOiB2b2lkIHtcbiAgICBjb250ZXh0Lm1lbnVDb21wSWQgPSBjb21wSWQ7XG4gICAgY29udGV4dC5tZW51Q29tcE5hbWUgPSBjb21wTmFtZTtcbiAgICBjb25zdCB2ID0gY29udGV4dC52dWVBcHA7XG4gICAgY29uc3Qgc2V0dGluZyA9IGNvbnRleHQuc2V0dGluZ0FwcDtcbiAgICBjb25zdCBlbnRyaWVzOiBNZW51RW50cnlbXSA9IFtcbiAgICAgICAgeyBsYWJlbDogJ1JlbW92ZScsIGFjdGlvbjogKCkgPT4gZXhlY0luR2FtZSggYF9fcmVtb3ZlQ29tcCgnJHsgdi5zZWxlY3RlZE5vZGUgfScsJyR7IGNvbXBJZCB9JylgICkgfSxcbiAgICAgICAgeyBsYWJlbDogJ1N0b3JlIGluIEdsb2JhbCcsIGFjdGlvbjogKCkgPT4gZXhlY0luR2FtZSggYF9fc3RvcmVDb21wSW5HbG9iYWwoJyR7IHYuc2VsZWN0ZWROb2RlIH0nLCckeyBjb21wSWQgfScpYCApIH0sXG4gICAgICAgIHsgbGFiZWw6ICdGaWVsZHMgU29ydCcsIGFjdGlvbjogKCkgPT4gc2V0dGluZy50b2dnbGVTb3J0Q29tcCggY29tcE5hbWUgKSB9LFxuICAgIF07XG4gICAgZm9yICggY29uc3QgWyBsYWJlbCwgZnVuY3Rpb25OYW1lIF0gb2YgZXh0ZW5zaW9uTWVudXMuY29tcG9uZW50ICkge1xuICAgICAgICBlbnRyaWVzLnB1c2goIHsgbGFiZWwsIGFjdGlvbjogKCkgPT4gZXhlY0luR2FtZSggYCR7IGZ1bmN0aW9uTmFtZSB9KF9fZ2V0Q29tcCgnJHsgdi5zZWxlY3RlZE5vZGUgfScsJyR7IGNvbXBJZCB9JykpYCApIH0gKTtcbiAgICB9XG4gICAgaWYgKCBtZXRob2ROYW1lcy5sZW5ndGggPiAwICkge1xuICAgICAgICBlbnRyaWVzLnB1c2goIHsgdHlwZTogJ3NlcGFyYXRvcicgfSApO1xuICAgICAgICBmb3IgKCBjb25zdCBtZXRob2ROYW1lIG9mIG1ldGhvZE5hbWVzICkge1xuICAgICAgICAgICAgZW50cmllcy5wdXNoKCB7IGxhYmVsOiBgJHsgbWV0aG9kTmFtZSB9KClgLCBhY3Rpb246ICgpID0+IGV4ZWNNZXRob2QoIG1ldGhvZE5hbWUgKSB9ICk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcG9wdXBNZW51KCBlbnRyaWVzICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG93VHJlZU1lbnUoKTogdm9pZCB7XG4gICAgY29uc3QgdiA9IGNvbnRleHQudnVlQXBwO1xuICAgIHBvcHVwTWVudSggW1xuICAgICAgICB7IGxhYmVsOiAnVG9nZ2xlIERyYXcgQ2FsbCAoYmV0YSknLCBhY3Rpb246ICgpID0+IGV4ZWNJbkdhbWUoICdfX3RvZ2dsZURDKCknICkgfSxcbiAgICAgICAgeyBsYWJlbDogJ1RvZ2dsZSBSb290IE5vZGUgb2YgM0QgTm9kZScsIGFjdGlvbjogKCkgPT4geyB2LmhpZGUzZFJvb3ROb2RlID0gIXYuaGlkZTNkUm9vdE5vZGU7IH0gfSxcbiAgICAgICAgeyBsYWJlbDogJ1RvZ2dsZSBDaGlsZHJlbiBDb3VudCcsIGFjdGlvbjogKCkgPT4geyB2LnNob3dDaGlsZHJlbkNvdW50ID0gIXYuc2hvd0NoaWxkcmVuQ291bnQ7IH0gfSxcbiAgICBdICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG93Q29uc29sZU1lbnUoKTogdm9pZCB7XG4gICAgY29uc3QgdiA9IGNvbnRleHQudnVlQXBwO1xuICAgIHBvcHVwTWVudSggWyB7IGxhYmVsOiAnQ2xlYXIgTG9ncycsIGFjdGlvbjogKCkgPT4geyB2LmxvZ3MgPSBbXTsgfSB9IF0gKTtcbn1cbiIsICIvLyBTZXR0aW5ncyBWdWUgaW5zdGFuY2UgKHJpZ2h0LWhhbmQgc2xpZGUtaW4gcGFuZWwgYm91bmQgdG8gI3NldHRpbmcgaW4gaW5kZXguaHRtbCkuXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBvcyBmcm9tICdvcyc7XG5pbXBvcnQgeyBjb250ZXh0LCBleGVjSW5HYW1lIH0gZnJvbSAnLi9jb250ZXh0JztcbmltcG9ydCB7IHN5bmNXaW5kb3dNb2RlSXBjLCBvcGVuRXh0ZXJuYWwgfSBmcm9tICcuL2lwYyc7XG5pbXBvcnQgeyBleHRlbnNpb25NZW51cyB9IGZyb20gJy4vbWVudXMnO1xuXG5jb25zdCBpc1dpbmRvd3MgPSBvcy50eXBlKCkuaW5jbHVkZXMoICdXaW5kb3dzJyApO1xuY29uc3QgQ0hST01FX0VYVFJBX1dJRFRIID0gNTQ2O1xuY29uc3QgQ0hST01FX0VYVFJBX0hFSUdIVCA9IDQ1O1xuY29uc3QgV0lORE9XU19TQ1JPTExCQVJfV0lEVEggPSAxODtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVNldHRpbmdBcHAoKTogYW55IHtcbiAgICBjb25zdCBzZXR0aW5nID0gbmV3IFZ1ZSgge1xuICAgICAgICBlbDogJyNzZXR0aW5nJyxcbiAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgbG9nQ291bnQ6IDMsXG4gICAgICAgICAgICByZXRpbmFFbmFibGU6IHRydWUsXG4gICAgICAgICAgICBhdXRvVXBkYXRlVHJlZTogdHJ1ZSxcbiAgICAgICAgICAgIGRpc3BsYXlBc0ZhaXJ5VHJlZTogZmFsc2UsXG4gICAgICAgICAgICBoaWRlRmFpcnlDb21Db250YWluZXI6IGZhbHNlLFxuICAgICAgICAgICAgc3luY05vZGVEZXRhaWw6IHRydWUsXG4gICAgICAgICAgICBkaXNhYmxlV2ViU2VjOiBmYWxzZSxcbiAgICAgICAgICAgIHNob3dEZXZUb29sSW5UYWI6IHRydWUsXG4gICAgICAgICAgICAvLyBkZWZhdWx0IHRvIGEgbGFuZHNjYXBlIC8gZGVza3RvcCB2aWV3IChub3QgcGhvbmUtcG9ydHJhaXQpOyBzaXplIGlzXG4gICAgICAgICAgICAvLyBbc2hvcnRlckVkZ2UsIGxvbmdlckVkZ2VdLCBzbyBsYW5kc2NhcGUgc2hvd3MgbG9uZ2VyRWRnZSB4IHNob3J0ZXJFZGdlID0gNjQweDQ4MC5cbiAgICAgICAgICAgIC8vIDY0MC13aWRlIGtlZXBzIHRoZSB3aG9sZSB3aW5kb3cgKGdhbWUgKyB+NTY0cHggcGFuZWxzKSBmaXR0aW5nIG9uIGEgMTM2NiBsYXB0b3AuXG4gICAgICAgICAgICBzaXplOiBbIDQ4MCwgNjQwIF0sXG4gICAgICAgICAgICBleHRyYVNpemVzOiBbXSxcbiAgICAgICAgICAgIGlzUG9ydHJhaXQ6IGZhbHNlLFxuICAgICAgICAgICAgLy8gZ2FtZSB2aWV3IGZvbGxvd3MgdGhlIHByb2plY3QgZGVzaWduIHJlc29sdXRpb24gdW50aWwgdGhlIHVzZXIgcGlja3MgYW5vdGhlciBzaXplXG4gICAgICAgICAgICBtYXRjaERlc2lnbjogdHJ1ZSxcbiAgICAgICAgICAgIHNob3c6IGZhbHNlLFxuICAgICAgICAgICAgdXJsUGFyYW1zOiAnJyxcbiAgICAgICAgICAgIGN1c3RvbVVybDogJycsXG4gICAgICAgICAgICBjbGVhckxvZ0FmdGVyUmVmcmVzaDogdHJ1ZSxcbiAgICAgICAgICAgIGV4dGVuc2lvbkZpbGU6ICcnLFxuICAgICAgICAgICAgZW5hYmxlRXh0ZW5zaW9uOiB0cnVlLFxuICAgICAgICAgICAgc3RhdGlzdGljaW5nOiBmYWxzZSxcbiAgICAgICAgICAgIHN0YXRpc3RpY3M6IG51bGwsXG4gICAgICAgICAgICBzb3J0Q29tcFByb3BlcnRpZXM6IHt9LFxuICAgICAgICAgICAgc2ltcGxlTW9kZTogZmFsc2UsXG4gICAgICAgIH0sXG4gICAgICAgIGNyZWF0ZWQoKSB7XG4gICAgICAgICAgICBjb25zdCBzdG9yZWQgPSByZWFkQ29uZmlnKCk7XG4gICAgICAgICAgICBpZiAoIHN0b3JlZCApIHtcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKCB0aGlzLCBzdG9yZWQgKTtcbiAgICAgICAgICAgICAgICB0aGlzLnNob3cgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuYXBwbHlEZXNpZ25TaXplKCk7XG4gICAgICAgICAgICBpZiAoIHRoaXMuZW5hYmxlRXh0ZW5zaW9uICYmIHRoaXMuZXh0ZW5zaW9uRmlsZSAmJiB0aGlzLmV4dGVuc2lvbkZpbGUgIT09ICcnICkge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJhdyA9IGZzLnJlYWRGaWxlU3luYyggdGhpcy5leHRlbnNpb25GaWxlLCB7IGVuY29kaW5nOiAndXRmLTgnIH0gKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgeyBtZW51OiB7IG5vZGUsIGNvbXBvbmVudCB9IH0gPSBKU09OLnBhcnNlKCByYXcgKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCBub2RlPy5sZW5ndGggPiAwICkgZXh0ZW5zaW9uTWVudXMubm9kZS5wdXNoKCAuLi5ub2RlICk7XG4gICAgICAgICAgICAgICAgICAgIGlmICggY29tcG9uZW50Py5sZW5ndGggPiAwICkgZXh0ZW5zaW9uTWVudXMuY29tcG9uZW50LnB1c2goIC4uLmNvbXBvbmVudCApO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKCBlcnJvciApIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvciggJ1tpbnNwZWN0b3JdIGZhaWxlZCB0byBsb2FkIGV4dGVuc2lvbiBtZW51IGZpbGUnLCBlcnJvciApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgY29tcHV0ZWQ6IHtcbiAgICAgICAgICAgIHcoKTogbnVtYmVyIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5pc1BvcnRyYWl0ID8gdGhpcy5zaXplWyAwIF0gOiB0aGlzLnNpemVbIDEgXTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBoKCk6IG51bWJlciB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXNQb3J0cmFpdCA/IHRoaXMuc2l6ZVsgMSBdIDogdGhpcy5zaXplWyAwIF07XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgd2Vidmlld1N0eWxlKCk6IHN0cmluZyB7XG4gICAgICAgICAgICAgICAgbGV0IHdpZHRoID0gdGhpcy53ICsgQ0hST01FX0VYVFJBX1dJRFRIO1xuICAgICAgICAgICAgICAgIGNvbnN0IGhlaWdodCA9IHRoaXMuaCArIENIUk9NRV9FWFRSQV9IRUlHSFQ7XG4gICAgICAgICAgICAgICAgaWYgKCB0aGlzLnNpbXBsZU1vZGUgKSB3aWR0aCA9IHRoaXMudztcbiAgICAgICAgICAgICAgICBlbHNlIGlmICggaXNXaW5kb3dzICkgd2lkdGggKz0gV0lORE9XU19TQ1JPTExCQVJfV0lEVEg7XG4gICAgICAgICAgICAgICAgc3luY1dpbmRvd01vZGVJcGMoIHdpZHRoLCBoZWlnaHQsIHRoaXMuc2ltcGxlTW9kZSwgaXNXaW5kb3dzID8gNDUgOiAzNyApO1xuICAgICAgICAgICAgICAgIHJldHVybiBgd2lkdGg6JHsgdGhpcy53IH1weDtoZWlnaHQ6JHsgdGhpcy5oIH1weDttaW4td2lkdGg6JHsgdGhpcy53IH1weDttaW4taGVpZ2h0OiR7IHRoaXMuaCB9cHhgO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGdhbWVQYW5lbFN0eWxlKCk6IHN0cmluZyB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGBtYXgtd2lkdGg6JHsgdGhpcy53IH1weGA7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgY29uZmlnRGF0YUZvck1haW4oKTogb2JqZWN0IHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzaW1wbGVNb2RlOiB0aGlzLnNpbXBsZU1vZGUsIGlzUG9ydHJhaXQ6IHRoaXMuaXNQb3J0cmFpdCwgc2l6ZTogdGhpcy5zaXplIH07XG4gICAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBtZXRob2RzOiB7XG4gICAgICAgICAgICBvcGVuRXh0ZXJuYWwoIHVybDogc3RyaW5nICkge1xuICAgICAgICAgICAgICAgIG9wZW5FeHRlcm5hbCggdXJsICk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgLyoqIFNpemVzIHRoZSBnYW1lIHZpZXcgdG8gdGhlIHByb2plY3QgZGVzaWduIHJlc29sdXRpb24gc28gbm90aGluZyBnZXRzIGNyb3BwZWQgYnkgdGhlIGZpdCBwb2xpY3kuICovXG4gICAgICAgICAgICBhcHBseURlc2lnblNpemUoKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGVzaWduID0gcmVhZERlc2lnblNpemUoKTtcbiAgICAgICAgICAgICAgICBpZiAoIHRoaXMubWF0Y2hEZXNpZ24gPT09IGZhbHNlIHx8ICFkZXNpZ24gKSByZXR1cm47XG4gICAgICAgICAgICAgICAgdGhpcy5pc1BvcnRyYWl0ID0gZGVzaWduWyAxIF0gPiBkZXNpZ25bIDAgXTtcbiAgICAgICAgICAgICAgICB0aGlzLnNpemUgPSBbIE1hdGgubWluKCAuLi5kZXNpZ24gKSwgTWF0aC5tYXgoIC4uLmRlc2lnbiApIF07XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdG9nZ2xlUG9ydHJhaXQoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5pc1BvcnRyYWl0ID0gIXRoaXMuaXNQb3J0cmFpdDtcbiAgICAgICAgICAgICAgICB0aGlzLnN5bmNQb3J0cmFpdCgpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHN5bmNQb3J0cmFpdCgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNhdmVUb1N0b3JhZ2UoKTtcbiAgICAgICAgICAgICAgICB0aGlzLiRuZXh0VGljaygpLnRoZW4oICgpID0+IGV4ZWNJbkdhbWUoICdzZXRUaW1lb3V0KF9fcmVzaXplQ3ZuLDIwMCknICkgKTtcbiAgICAgICAgICAgICAgICBjb250ZXh0LnZ1ZUFwcC5zaG93UmVzb2x1dGlvblNlbGVjdG9yID0gZmFsc2U7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdG9nZ2xlU2ltcGxlTW9kZSgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNpbXBsZU1vZGUgPSAhdGhpcy5zaW1wbGVNb2RlO1xuICAgICAgICAgICAgICAgIHRoaXMuc2F2ZVRvU3RvcmFnZSgpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHRvZ2dsZVNvcnRDb21wKCBjb21OYW1lOiBzdHJpbmcgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zb3J0Q29tcFByb3BlcnRpZXNbIGNvbU5hbWUgXSA9IHRoaXMuc29ydENvbXBQcm9wZXJ0aWVzWyBjb21OYW1lIF0gPyAwIDogMTtcbiAgICAgICAgICAgICAgICB0aGlzLnNhdmVUb1N0b3JhZ2UoICd0b2dnbGVTb3J0Q29tcCcgKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB0b2dnbGVTdGF0aXN0aWMoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zdGF0aXN0aWNpbmcgPSAhdGhpcy5zdGF0aXN0aWNpbmc7XG4gICAgICAgICAgICAgICAgZXhlY0luR2FtZSggYF9fc3RhcnRTdGF0aXN0aWMoJHsgdGhpcy5zdGF0aXN0aWNpbmcgfSlgICk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgLyoqIFB1c2hlcyBob3N0LWNvbnRyb2xsZWQgZmxhZ3MgKyByZXRpbmEgaG9vayBpbnRvIGEgZnJlc2hseSBsb2FkZWQgZ2FtZSBwYWdlLiAqL1xuICAgICAgICAgICAgaW5pdE12KCB2YXJzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9ICkge1xuICAgICAgICAgICAgICAgIGxldCBzY3JpcHQgPSBgX19hdXRvVXBkYXRlVHJlZT0keyB0aGlzLmF1dG9VcGRhdGVUcmVlIH07X19zeW5jTm9kZURldGFpbD0keyB0aGlzLnN5bmNOb2RlRGV0YWlsIH07YDtcbiAgICAgICAgICAgICAgICBmb3IgKCBjb25zdCBuYW1lIGluIHZhcnMgKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gdmFyc1sgbmFtZSBdO1xuICAgICAgICAgICAgICAgICAgICBzY3JpcHQgKz0gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyA/IGAkeyBuYW1lIH09JyR7IHZhbHVlIH0nO2AgOiBgJHsgbmFtZSB9PSR7IHZhbHVlIH07YDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgc2NyaXB0ICs9IGB2YXIgZGVjdGVkQ0MgPSBzZXRJbnRlcnZhbChmdW5jdGlvbigpe1xuICAgICAgICAgICAgICAgIGlmKCF3aW5kb3dbXCJjY1wiXSl7XG4gICAgICAgICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjbGVhckludGVydmFsKGRlY3RlZENDKVxuICAgICAgICAgICAgICAgIGNjLmRpcmVjdG9yLm9uY2UoY2MuRGlyZWN0b3IuRVZFTlRfQkVGT1JFX1NDRU5FX0xBVU5DSCxmdW5jdGlvbigpe2lmKCFfX21vcmVUaGVuM180XzAoKSljYy52aWV3LmVuYWJsZVJldGluYSgkeyB0aGlzLnJldGluYUVuYWJsZSB9KX0pXG4gICAgICAgICAgICB9LCAxMClcbiAgICAgICAgICAgICAgICBgO1xuICAgICAgICAgICAgICAgIGV4ZWNJbkdhbWUoIHNjcmlwdCApO1xuICAgICAgICAgICAgICAgIHJldHVybiBzY3JpcHQ7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgY2hhbmdlU2V0dGluZygpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB2ID0gY29udGV4dC52dWVBcHA7XG4gICAgICAgICAgICAgICAgaWYgKCB0aGlzLmF1dG9VcGRhdGVUcmVlICYmIHYuY2FuVXBkYXRlVHJlZSApIHYuZm9yY2VVcGRhdGVUcmVlKCk7XG4gICAgICAgICAgICAgICAgZXhlY0luR2FtZSggYF9fYXV0b1VwZGF0ZVRyZWU9JHsgdGhpcy5hdXRvVXBkYXRlVHJlZSB9O19fc3luY05vZGVEZXRhaWw9JHsgdGhpcy5zeW5jTm9kZURldGFpbCB9O2AgKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzYXZlVG9TdG9yYWdlKCBldmVudE5hbWU/OiBzdHJpbmcgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jaGFuZ2VTZXR0aW5nKCk7XG4gICAgICAgICAgICAgICAgc2F2ZUNvbmZpZyggdGhpcy4kZGF0YSApO1xuICAgICAgICAgICAgICAgIHRoaXMuJGVtaXQoIGV2ZW50TmFtZSB8fCAnc2V0dGluZ1NpemVfY2hhbmdlJyApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGNsb3NlKCkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2hvdyA9IGZhbHNlO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICB9ICk7XG4gICAgY29udGV4dC5zZXR0aW5nQXBwID0gc2V0dGluZztcbiAgICAoIHdpbmRvdyBhcyBhbnkgKS5zZXR0aW5nID0gc2V0dGluZztcbiAgICByZXR1cm4gc2V0dGluZztcbn1cbiIsICIvLyBSaWdodC1wYW5lbCBjb21wb25lbnRzOiBub2RlIGhlYWRlciAoTm9kZURldGFpbFZpZXcpLCBvbmUgY29tcG9uZW50IGNhcmQgKE5vZGVDb21wb25lbnQpLFxuLy8gb25lIHByb3BlcnR5IHJvdyAoQ29tUHJvcGVydHkpLiBUZW1wbGF0ZXMgYXJlIHRyYW5zY3JpYmVkIHZlcmJhdGltIGZyb20gdGhlIHJlY292ZXJlZCBVSS5cbmltcG9ydCB7IGNvbnRleHQsIGV4ZWNJbkdhbWUgfSBmcm9tICcuLy4uL2NvbnRleHQnO1xuaW1wb3J0IHsgc2hvd0NvbXBvbmVudE1lbnUgfSBmcm9tICcuLy4uL21lbnVzJztcbmltcG9ydCB7IGZvY3VzQXNzZXRJbkVkaXRvciB9IGZyb20gJy4vLi4vaXBjJztcblxuLyoqIHdpZGdldC1zdHlsZSBwcm9wZXJ0eSBzb3J0OiBjb21wYXJlIGJ5IHJldmVyc2VkIHN0cmluZ3Mgc28gTGVmdC9SaWdodC9Ub3AvQm90dG9tIGdyb3VwICovXG5jb25zdCB3aWRnZXRTb3J0ID0gKCBhOiBzdHJpbmcsIGI6IHN0cmluZyApOiBudW1iZXIgPT5cbiAgICBiLnNwbGl0KCAnJyApLnJldmVyc2UoKS5qb2luKCAnJyApLmxvY2FsZUNvbXBhcmUoIGEuc3BsaXQoICcnICkucmV2ZXJzZSgpLmpvaW4oICcnICkgKTtcblxuLyoqIG1ldGEga2V5cyBvZiBhIHNlcmlhbGl6ZWQgY29tcG9uZW50IHRoYXQgYXJlIG5vdCB1c2VyIHByb3BlcnRpZXMgKi9cbmNvbnN0IE5PTl9QUk9QRVJUWV9LRVlTID0gbmV3IFNldCggWyAndXVpZCcsICduYW1lJywgJ2VuYWJsZWQnLCAnaXNDQ19DT00nLCAncGFja2FnZUl0ZW0nLCAnbm9kZScsICdfX21ldGhvZHNfX18nIF0gKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyTm9kZURldGFpbENvbXBvbmVudHMoKTogdm9pZCB7XG4gICAgVnVlLmNvbXBvbmVudCggJ05vZGVDb21wb25lbnQnLCB7XG4gICAgICAgIHByb3BzOiB7IGNvbTogT2JqZWN0IH0sXG4gICAgICAgIGRhdGEoKSB7XG4gICAgICAgICAgICByZXR1cm4geyBmaWx0ZXJTdHI6ICcnLCBzb3J0OiBmYWxzZSB9O1xuICAgICAgICB9LFxuICAgICAgICBjcmVhdGVkKCkge1xuICAgICAgICAgICAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gICAgICAgICAgICB0aGlzLmZ1cGRhdGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2V0dGluZyA9IGNvbnRleHQuc2V0dGluZ0FwcDtcbiAgICAgICAgICAgICAgICBpZiAoIHNldHRpbmcuc29ydENvbXBQcm9wZXJ0aWVzWyBzZWxmLmNvbU5hbWUgXSA9PT0gdW5kZWZpbmVkICkge1xuICAgICAgICAgICAgICAgICAgICBzZXR0aW5nLnNvcnRDb21wUHJvcGVydGllc1sgc2VsZi5jb21OYW1lIF0gPSBzZWxmLnNvcnQgPSBzZWxmLmRlZmF1bHRTb3J0O1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuc29ydCA9IEJvb2xlYW4oIHNldHRpbmcuc29ydENvbXBQcm9wZXJ0aWVzWyBzZWxmLmNvbU5hbWUgXSApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb250ZXh0LnNldHRpbmdBcHAuJG9uKCAndG9nZ2xlU29ydENvbXAnLCB0aGlzLmZ1cGRhdGUgKTtcbiAgICAgICAgICAgIHRoaXMuZnVwZGF0ZSgpO1xuICAgICAgICB9LFxuICAgICAgICBiZWZvcmVEZXN0cm95KCkge1xuICAgICAgICAgICAgY29udGV4dC5zZXR0aW5nQXBwLiRvZmYoICd0b2dnbGVTb3J0Q29tcCcsIHRoaXMuZnVwZGF0ZSApO1xuICAgICAgICB9LFxuICAgICAgICBjb21wdXRlZDoge1xuICAgICAgICAgICAgY29tTmFtZSgpOiBzdHJpbmcge1xuICAgICAgICAgICAgICAgIGNvbnN0IG5hbWUgPSB0aGlzLmNvbS5uYW1lO1xuICAgICAgICAgICAgICAgIGlmICggIXRoaXMuY29tLmlzQ0NfQ09NICkgcmV0dXJuIG5hbWU7XG4gICAgICAgICAgICAgICAgcmV0dXJuICc8JyArIG5hbWUuc3BsaXQoICc8JyApWyAxIF07XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZGVmYXVsdFNvcnQoKTogYm9vbGVhbiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29tTmFtZSA9PT0gJzxXaWRnZXQ+JyB8fCB0aGlzLmNvbU5hbWUgPT09ICc8QnV0dG9uPicgfHwgdGhpcy5jb21OYW1lID09PSAnPExhYmVsPic7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgYWZ0ZXJGaWx0ZXJzKCk6IHN0cmluZ1tdIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzb3J0ZXIgPSB0aGlzLnNvcnQgPyB3aWRnZXRTb3J0IDogdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyggdGhpcy5jb20gKS5zb3J0KCBzb3J0ZXIgKTtcbiAgICAgICAgICAgICAgICBpZiAoIHRoaXMuZmlsdGVyU3RyLnRyaW0oKSA9PT0gJycgKSByZXR1cm4ga2V5cy5maWx0ZXIoICgga2V5OiBzdHJpbmcgKSA9PiAhTk9OX1BST1BFUlRZX0tFWVMuaGFzKCBrZXkgKSApO1xuICAgICAgICAgICAgICAgIHJldHVybiBrZXlzLmZpbHRlciggKCBrZXk6IHN0cmluZyApID0+XG4gICAgICAgICAgICAgICAgICAgICFOT05fUFJPUEVSVFlfS0VZUy5oYXMoIGtleSApICYmIGtleS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCB0aGlzLmZpbHRlclN0ci50b0xvd2VyQ2FzZSgpICkgKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzaG93U2VhcmNoKCk6IGJvb2xlYW4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBPYmplY3Qua2V5cyggdGhpcy5jb20gKS5sZW5ndGggPiA4O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGNoZWNrVmlzaWJsZSgpOiBzdHJpbmcge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbS5pc0NDX0NPTSA/ICd2aXNpYmxlJyA6ICdoaWRkZW4nO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgbWV0aG9kczoge1xuICAgICAgICAgICAgc2hvd01lbnUyKCkge1xuICAgICAgICAgICAgICAgIHNob3dDb21wb25lbnRNZW51KCB0aGlzLmNvbS51dWlkLCB0aGlzLmNvbU5hbWUsIHRoaXMuY29tLl9fbWV0aG9kc19fXyB8fCBbXSwgKCBtZXRob2ROYW1lOiBzdHJpbmcgKSA9PiB0aGlzLmV4ZWNDb21wTWV0aG9kKCBtZXRob2ROYW1lICkgKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBleGVjQ29tcE1ldGhvZCggbWV0aG9kTmFtZTogc3RyaW5nICkge1xuICAgICAgICAgICAgICAgIGV4ZWNJbkdhbWUoIGBfX2V4ZWNDb21wTWV0aG9kKCckeyBjb250ZXh0LnZ1ZUFwcC5zZWxlY3RlZE5vZGUgfScsJyR7IHRoaXMuY29tLnV1aWQgfScsJyR7IG1ldGhvZE5hbWUgfScpYCApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHRvZ2dsZUNvbXAoKSB7XG4gICAgICAgICAgICAgICAgZXhlY0luR2FtZSggYF9fdG9nZ2xlQ29tcCgnJHsgY29udGV4dC52dWVBcHAuc2VsZWN0ZWROb2RlIH0nLCckeyB0aGlzLmNvbS51dWlkIH0nKWAgKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzZXRLVigga2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duICkge1xuICAgICAgICAgICAgICAgIHRoaXMuY29tWyBrZXkgXVsgMCBdID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgY29uc3QgZW5jb2RlZCA9IHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgPyAnYCcgKyB2YWx1ZSArICdgJyA6IHZhbHVlO1xuICAgICAgICAgICAgICAgIGV4ZWNJbkdhbWUoIGBfX3NldENvbUF0dHIoJyR7IGNvbnRleHQudnVlQXBwLnNlbGVjdGVkTm9kZSB9JywnJHsgdGhpcy5jb20udXVpZCB9JywnJHsga2V5IH0nLCR7IGVuY29kZWQgfSlgICk7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB0ZW1wbGF0ZTogYFxuICAgIDxkaXYgY2xhc3M9XCJDb21wb25lbnRcIj5cbiAgICAgICAgPGRpdiBzdHlsZT1cImhlaWdodDoxZW07XCI+PC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJub2RlTmFtZVwiPlxuICAgICAgICAgICAgPGxhYmVsPlxuICAgICAgICAgICAgICAgIDxpbnB1dCA6c3R5bGU9XCJ7dmlzaWJpbGl0eTpjaGVja1Zpc2libGV9XCIgQGNoYW5nZT1cInRvZ2dsZUNvbXBcIiB0eXBlPVwiY2hlY2tib3hcIiAgdi1tb2RlbD1cImNvbS5lbmFibGVkXCIgLz5cbiAgICAgICAgICAgICAgICB7e2NvbU5hbWV9fVxuICAgICAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiZmxleDoxXCI+PC9zcGFuPlxuICAgICAgICAgICAgPHNwYW4gdi1pZj1cImNvbS5pc0NDX0NPTVwiIEBjbGljay5wcmV2ZW50PVwic2hvd01lbnUyXCIgY2xhc3M9XCJpY29uZm9udCBpY29uLW1lbnVcIj48L3NwYW4+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8aW5wdXQgcGxhY2Vob2xkZXI9XCJmaWx0ZXIgcHJvcGVydGllc1wiIHR5cGU9XCJzZWFyY2hcIiB2LW1vZGVsPVwiZmlsdGVyU3RyXCIgdi1pZj1cInNob3dTZWFyY2hcIi8+XG4gICAgICAgIDxjb20tcHJvcGVydHkgdi1mb3I9XCJrIGluIGFmdGVyRmlsdGVyc1wiIDpwYXJhbT1cImNvbVtrXVsyXVwiIDpzZXRLVj1cInNldEtWXCIgOms9XCJrXCIgOnZhbD1cImNvbVtrXVswXVwiIDp0PVwiY29tW2tdWzFdXCIgOmlzYz1cImNvbS5pc0NDX0NPTVwiIDprZXk9XCJjb20ra1wiPjwvY29tLXByb3BlcnR5PlxuICAgIDwvZGl2PlxuICAgIGAsXG4gICAgfSApO1xuXG4gICAgVnVlLmNvbXBvbmVudCggJ0NvbVByb3BlcnR5Jywge1xuICAgICAgICBwcm9wczogWyAnaycsICd2YWwnLCAndCcsICdpc2MnLCAnc2V0S1YnLCAncGFyYW0nIF0sXG4gICAgICAgIGNyZWF0ZWQoKSB7XG4gICAgICAgICAgICB0aGlzLnZsID0gdGhpcy52YWw7XG4gICAgICAgICAgICBpZiAoIHRoaXMuaXNFbnVtICkgdGhpcy52bCA9IHRoaXMucGFyYW0uZmluZCggKCBlbnRyeTogYW55ICkgPT4gZW50cnkudmFsdWUgPT09IHRoaXMudmFsLnZhbHVlICk7XG4gICAgICAgICAgICB0aGlzLmxpbmsgPSB0aGlzLmNhbkxpbmsoKTtcbiAgICAgICAgfSxcbiAgICAgICAgZGF0YSgpIHtcbiAgICAgICAgICAgIHJldHVybiB7IGxpbms6IG51bGwsIHZsOiBudWxsLCBudW1iZXJFZGl0OiBmYWxzZSB9O1xuICAgICAgICB9LFxuICAgICAgICBtZXRob2RzOiB7XG4gICAgICAgICAgICBjYW5MaW5rKCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gdGhpcy52bDtcbiAgICAgICAgICAgICAgICBpZiAoIHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycgKSByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgICBpZiAoICF2YWx1ZS5pbmNsdWRlcyggJzpAJyApIHx8ICF2YWx1ZS5pbmNsdWRlcyggJ3wnICkgKSByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgICBpZiAoIHZhbHVlLmluY2x1ZGVzKCAnfHwnICkgKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IFsgbmFtZSwgdXVpZFBhdGggXSA9IHZhbHVlLnNwbGl0KCAnfHwnICk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IG5hbWUsIHV1aWRQYXRoLCB0eXBlOiAnYXNzZXQnIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IFsgcmF3TmFtZSwgcmF3UGF0aCBdID0gdmFsdWUuc3BsaXQoICd8JyApO1xuICAgICAgICAgICAgICAgIGxldCBuYW1lID0gcmF3TmFtZTtcbiAgICAgICAgICAgICAgICBjb25zdCB1dWlkUGF0aCA9IHJhd1BhdGguc3BsaXQoICcvLycgKTtcbiAgICAgICAgICAgICAgICBpZiAoIHV1aWRQYXRoLnNsaWNlKCAtMSApWyAwIF0gPT09IGNvbnRleHQudnVlQXBwLnNlbGVjdGVkTm9kZSApIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcGFydHMgPSBuYW1lLnNwbGl0KCAnOkAnICk7XG4gICAgICAgICAgICAgICAgICAgIHBhcnRzLnBvcCgpO1xuICAgICAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKCAnW3NlbGZdJyApO1xuICAgICAgICAgICAgICAgICAgICBuYW1lID0gcGFydHMuam9pbiggJzpAJyApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4geyBuYW1lLCB1dWlkUGF0aCwgdHlwZTogJ25vZGUnIH07XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgbG9jYXRlKCkge1xuICAgICAgICAgICAgICAgIGlmICggdGhpcy5saW5rLnR5cGUgPT09ICdub2RlJyApIGNvbnRleHQudnVlQXBwLmxvY2F0ZU5vZGUoIHRoaXMubGluay51dWlkUGF0aCApO1xuICAgICAgICAgICAgICAgIGlmICggdGhpcy5saW5rLnR5cGUgPT09ICdhc3NldCcgKSBmb2N1c0Fzc2V0SW5FZGl0b3IoIHRoaXMubGluay51dWlkUGF0aCApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGNsaWNrQm9vbCgpIHtcbiAgICAgICAgICAgICAgICBpZiAoICF0aGlzLmlzYyApIHJldHVybjtcbiAgICAgICAgICAgICAgICB0aGlzLnZsID0gIXRoaXMudmw7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRLViggdGhpcy5rLCB0aGlzLnZsICk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgY2hhbmdlQ29sb3IoKSB7IHRoaXMuc2V0S1YoIHRoaXMuaywgdGhpcy52bCApOyB9LFxuICAgICAgICAgICAgY2hhbmdlRW51bSgpIHsgdGhpcy5zZXRLViggdGhpcy5rLCB0aGlzLnZsLnZhbHVlICk7IH0sXG4gICAgICAgICAgICBjaGFuZ2VOdW1iZXIoKSB7IHRoaXMuc2V0S1YoIHRoaXMuaywgTnVtYmVyKCB0aGlzLnZsICkgKTsgfSxcbiAgICAgICAgICAgIGNoYW5nZVN0cmluZygpIHsgdGhpcy5zZXRLViggdGhpcy5rLCB0aGlzLnZsICk7IH0sXG4gICAgICAgICAgICBjbG9zZU51bWJlckVkaXQoKSB7IHRoaXMubnVtYmVyRWRpdCA9IGZhbHNlOyB9LFxuICAgICAgICAgICAgb3Blbk51bWJlckVkaXQoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5udW1iZXJFZGl0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB0aGlzLiRuZXh0VGljaygpLnRoZW4oICgpID0+IHsgdGhpcy4kcmVmcy5udW1JbnB1dD8uZm9jdXMoKTsgfSApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgY29tcHV0ZWQ6IHtcbiAgICAgICAgICAgIGlzQ29sb3IoKTogYm9vbGVhbiB7XG4gICAgICAgICAgICAgICAgaWYgKCB0aGlzLnQgPT09ICdjb2xvcicgKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICBpZiAoIHR5cGVvZiB0aGlzLnZsICE9PSAnc3RyaW5nJyApIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy52bC5zdGFydHNXaXRoKCAnQ29sb3I6cmdiYSgnICk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgaXNFbnVtKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy50ID09PSAnZW51bSc7IH0sXG4gICAgICAgICAgICBjb2xvcigpOiBzdHJpbmcgeyByZXR1cm4gJ2JhY2tncm91bmQ6JyArIHRoaXMudmw7IH0sXG4gICAgICAgICAgICBpc0Jvb2woKTogYm9vbGVhbiB7IHJldHVybiB0eXBlb2YgdGhpcy52bCA9PT0gJ2Jvb2xlYW4nOyB9LFxuICAgICAgICAgICAgaXNUcnVlKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy52bCA9PT0gdHJ1ZTsgfSxcbiAgICAgICAgICAgIGlzRmFsc2UoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLnZsID09PSBmYWxzZTsgfSxcbiAgICAgICAgICAgIGlzTnVtYmVyKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy50ID09PSAnbnVtYmVyJzsgfSxcbiAgICAgICAgICAgIGlzU3RyaW5nKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy50ID09PSAnc3RyaW5nJzsgfSxcbiAgICAgICAgICAgIHRyYW5zU3RyKCk6IHN0cmluZyB7IHJldHVybiB0aGlzLnZsLnJlcGxhY2UoIC9cXG4vZywgJ1xcXFxuJyApOyB9LFxuICAgICAgICAgICAgaXNOb3JtYWwoKTogYm9vbGVhbiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICF0aGlzLmlzU3RyaW5nICYmICF0aGlzLmlzTnVtYmVyICYmICF0aGlzLmlzRW51bSAmJiAhdGhpcy5pc0NvbG9yICYmICF0aGlzLmlzQm9vbCAmJiAhdGhpcy5saW5rO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGJvb2xJY29uKCk6IHN0cmluZyB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXNUcnVlID8gJ2ljb25mb250IGljb24tcmlnaHQnIDogJ2ljb25mb250IGljb24td3JvbmcyJztcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHRlbXBsYXRlOiBgXG4gICAgPGRpdiBjbGFzcz1cImNvbVByb3BlcnR5XCI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJub2RlUHJvcGVydHlUaXRsZVwiPnt7a319OjwvZGl2PlxuXG4gICAgICAgIDxkaXYgdi1pZj1cImlzQ29sb3JcIiBjbGFzcz1cIm5vZGVQcm9wZXJ0eVN1YlRpdGxlXCI+XG4gICAgICAgICAgICA8c3BhbiB2LWlmPVwiIWlzY1wiIDpzdHlsZT1cImNvbG9yXCIgY2xhc3M9XCJjb2xvclJlY3RcIj48L3NwYW4+XG4gICAgICAgICAgICA8aW5wdXQgdi1pZj1cImlzY1wiIEBpbnB1dD1cImNoYW5nZUNvbG9yXCIgdHlwZT1cImNvbG9yXCIgdi1tb2RlbD1cInZsXCIgLz5cbiAgICAgICAgICAgIDxzcGFuID57e3ZsfX08L3NwYW4+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8ZGl2IHYtaWY9XCJpc0VudW0gJiYgaXNjXCIgY2xhc3M9XCJub2RlUHJvcGVydHlTdWJUaXRsZVwiPlxuICAgICAgICAgICAgPHNlbGVjdCB2LW1vZGVsPVwidmxcIiBAY2hhbmdlPVwiY2hhbmdlRW51bVwiPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdi1mb3I9XCJwIGluIHBhcmFtXCIgOnZhbHVlPVwicFwiPnt7cC5uYW1lfX08L29wdGlvbj5cbiAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPGRpdiB2LWlmPVwiaXNFbnVtICYmICFpc2NcIiBjbGFzcz1cIm5vZGVQcm9wZXJ0eVN1YlRpdGxlIHByZXdyYXBcIj57e3ZsLnZhbHVlfX08L2Rpdj5cbiAgICAgICAgPGRpdiB2LWlmPVwiaXNOdW1iZXJcIiBjbGFzcz1cIm5vZGVQcm9wZXJ0eVN1YlRpdGxlXCIgPlxuICAgICAgICAgICAgPHNwYW4gdi1pZj1cIiFudW1iZXJFZGl0XCIgQGNsaWNrPVwib3Blbk51bWJlckVkaXRcIj57e3ZsfX08L3NwYW4+XG4gICAgICAgICAgICA8aW5wdXQgcmVmPVwibnVtSW5wdXRcIiBAYmx1cj1cImNsb3NlTnVtYmVyRWRpdFwiIEBrZXl1cC5lc2Muc3RvcD1cImNsb3NlTnVtYmVyRWRpdFwiIEBrZXl1cC5lbnRlci5zdG9wPVwiY2xvc2VOdW1iZXJFZGl0XCIgdi1pZj1cIm51bWJlckVkaXRcIiB0eXBlPVwibnVtYmVyXCIgdi1tb2RlbD1cInZsXCIgQGlucHV0PVwiY2hhbmdlTnVtYmVyXCIgLz5cbiAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgPGRpdiB2LWlmPVwiaXNTdHJpbmdcIiBjbGFzcz1cIm5vZGVQcm9wZXJ0eVN1YlRpdGxlXCIgPlxuICAgICAgICAgICAgPHNwYW4gdi1pZj1cIiFudW1iZXJFZGl0XCIgQGNsaWNrPVwib3Blbk51bWJlckVkaXRcIj57eyB0cmFuc1N0ciB9fTwvc3Bhbj5cbiAgICAgICAgICAgIDx0ZXh0YXJlYSByZWY9XCJudW1JbnB1dFwiIEBibHVyPVwiY2xvc2VOdW1iZXJFZGl0XCIgQGtleXVwLmVzYy5zdG9wPVwiY2xvc2VOdW1iZXJFZGl0XCIgdi1pZj1cIm51bWJlckVkaXRcIiB2LW1vZGVsPVwidmxcIiBAaW5wdXQ9XCJjaGFuZ2VTdHJpbmdcIiA+PC90ZXh0YXJlYT5cbiAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgPGRpdiB2LWlmPVwiaXNCb29sXCIgY2xhc3M9XCJub2RlUHJvcGVydHlTdWJUaXRsZVwiIEBjbGljaz1cImNsaWNrQm9vbFwiPlxuICAgICAgICAgICAgPHNwYW4gOmNsYXNzPVwiYm9vbEljb25cIiA+PC9zcGFuPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPGRpdiB2LWlmPVwiaXNOb3JtYWxcIiBjbGFzcz1cIm5vZGVQcm9wZXJ0eVN1YlRpdGxlIHByZXdyYXBcIj57e1N0cmluZyh2bCl9fTwvZGl2PlxuICAgICAgICA8YSB2LWlmPVwibGlua1wiIGNsYXNzPVwibm9kZVByb3BlcnR5U3ViVGl0bGUgcHJld3JhcFwiIEBjbGljaz1cImxvY2F0ZSgpXCI+e3tsaW5rLm5hbWV9fTwvYT5cbiAgICA8L2Rpdj5cbiAgICBgLFxuICAgIH0gKTtcblxuICAgIFZ1ZS5jb21wb25lbnQoICdOb2RlRGV0YWlsVmlldycsIHtcbiAgICAgICAgcHJvcHM6IHsgZGV0YWlsOiBPYmplY3QgfSxcbiAgICAgICAgZGF0YSgpIHtcbiAgICAgICAgICAgIHJldHVybiB7IGNsb3NlOiBmYWxzZSB9O1xuICAgICAgICB9LFxuICAgICAgICBjb21wdXRlZDoge1xuICAgICAgICAgICAgaWNvblRyYW5zZm9ybSgpOiBzdHJpbmcge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJvdGF0ZSA9IHRoaXMuY2xvc2UgPyAndHJhbnNmb3JtOnJvdGF0ZSg5MGRlZyknIDogJ3RyYW5zZm9ybTpyb3RhdGUoMTgwZGVnKSc7XG4gICAgICAgICAgICAgICAgcmV0dXJuICdkaXNwbGF5OiBpbmxpbmUtYmxvY2s7JyArIHJvdGF0ZTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIG1ldGhvZHM6IHtcbiAgICAgICAgICAgIHRvZ2dsZU5vZGUoKSB7IHRoaXMuY2xvc2UgPSAhdGhpcy5jbG9zZTsgfSxcbiAgICAgICAgICAgIHN5bmNOb2RlKCBwcm9wUGF0aDogc3RyaW5nICkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhcnRzID0gcHJvcFBhdGguc3BsaXQoICcuJyApO1xuICAgICAgICAgICAgICAgIGxldCB2YWx1ZSA9IHBhcnRzLmxlbmd0aCA+IDEgPyB0aGlzLmRldGFpbFsgcGFydHNbIDAgXSBdWyBwYXJ0c1sgMSBdIF0gOiB0aGlzLmRldGFpbFsgcGFydHNbIDAgXSBdO1xuICAgICAgICAgICAgICAgIGlmICggdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyApIHZhbHVlID0gYCckeyB2YWx1ZSB9J2A7XG4gICAgICAgICAgICAgICAgZXhlY0luR2FtZSggYF9fc3luY05vZGUoJyR7IHRoaXMuZGV0YWlsLmlkIH0nLCckeyBwcm9wUGF0aCB9JywkeyB2YWx1ZSB9KWAgKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHRlbXBsYXRlOiBgXG4gICAgPGRpdiBjbGFzcz1cIm5vZGVEZXRhaWxcIj5cbiAgICAgICAgPGRpdiBjbGFzcz1cIm5vZGVOYW1lXCI+XG4gICAgICAgICAgICA8bGFiZWw+XG4gICAgICAgICAgICAgICAgPGlucHV0IEBjaGFuZ2U9XCJzeW5jTm9kZSgnYWN0aXZlJylcIiB0eXBlPVwiY2hlY2tib3hcIiB2YWx1ZT1cImRldGFpbC5uYW1lXCIgdi1tb2RlbD1cImRldGFpbC5hY3RpdmVcIiAvPlxuICAgICAgICAgICAgICAgIE5vZGU6IHt7ZGV0YWlsLm5hbWV9fVxuICAgICAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiZmxleDoxXCI+PC9zcGFuPlxuICAgICAgICAgICAgPHNwYW4gQGNsaWNrLnN0b3A9XCJ0b2dnbGVOb2RlKClcIiA6c3R5bGU9XCJpY29uVHJhbnNmb3JtXCIgIGNsYXNzPVwibm9kZWFycm93IGljb25mb250IGljb24tc2hhbmdzYW5qaWFvXCI+PC9zcGFuPlxuICAgICAgICA8L2Rpdj5cblxuICAgIDxkaXYgdi1zaG93PVwiIWNsb3NlXCIgY2xhc3M9XCJub2RlUHJvcGVydGllc1wiPlxuICAgIDxkaXYgY2xhc3M9XCJub2RlUHJvcGVydHlcIj5cbiAgICAgICAgPGRpdiBjbGFzcz1cIm5vZGVQcm9wZXJ0eVRpdGxlXCI+UG9zaXRpb246PC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJub2RlUHJvcGVydHlTdWJUaXRsZVwiPlg6PC9kaXY+XG4gICAgICAgIDxpbnB1dCBAaW5wdXQ9XCJzeW5jTm9kZSgncG9zaXRpb24ueCcpXCIgc3RlcD1cIjAuMDJcIiB0eXBlPVwibnVtYmVyXCIgdi1tb2RlbD1cImRldGFpbC5wb3NpdGlvbi54XCIgLz5cbiAgICAgICAgPGRpdiBjbGFzcz1cIm5vZGVQcm9wZXJ0eVN1YlRpdGxlXCI+WTo8L2Rpdj5cbiAgICAgICAgPGlucHV0IEBpbnB1dD1cInN5bmNOb2RlKCdwb3NpdGlvbi55JylcIiBzdGVwPVwiMC4wMlwiIHR5cGU9XCJudW1iZXJcIiB2LW1vZGVsPVwiZGV0YWlsLnBvc2l0aW9uLnlcIiAvPlxuICAgICAgICA8ZGl2IGNsYXNzPVwibm9kZVByb3BlcnR5U3ViVGl0bGVcIj5aOjwvZGl2PlxuICAgICAgICA8aW5wdXQgQGlucHV0PVwic3luY05vZGUoJ3Bvc2l0aW9uLnonKVwiIHN0ZXA9XCIwLjAyXCIgdHlwZT1cIm51bWJlclwiIHYtbW9kZWw9XCJkZXRhaWwucG9zaXRpb24uelwiIC8+XG4gICAgPC9kaXY+XG4gICAgPGRpdiBjbGFzcz1cIm5vZGVQcm9wZXJ0eVwiPlxuICAgICAgICA8ZGl2IGNsYXNzPVwibm9kZVByb3BlcnR5VGl0bGVcIj5Sb3RhdGlvbjo8L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzcz1cIm5vZGVQcm9wZXJ0eVN1YlRpdGxlXCI+WDo8L2Rpdj5cbiAgICAgICAgPGlucHV0IEBpbnB1dD1cInN5bmNOb2RlKCdldWxlckFuZ2xlcy54JylcIiBzdGVwPVwiNVwiIHR5cGU9XCJudW1iZXJcIiB2LW1vZGVsPVwiZGV0YWlsLmV1bGVyQW5nbGVzLnhcIiAvPlxuICAgICAgICA8ZGl2IGNsYXNzPVwibm9kZVByb3BlcnR5U3ViVGl0bGVcIj5ZOjwvZGl2PlxuICAgICAgICA8aW5wdXQgQGlucHV0PVwic3luY05vZGUoJ2V1bGVyQW5nbGVzLnknKVwiIHN0ZXA9XCI1XCIgdHlwZT1cIm51bWJlclwiIHYtbW9kZWw9XCJkZXRhaWwuZXVsZXJBbmdsZXMueVwiIC8+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJub2RlUHJvcGVydHlTdWJUaXRsZVwiPlo6PC9kaXY+XG4gICAgICAgIDxpbnB1dCBAaW5wdXQ9XCJzeW5jTm9kZSgnZXVsZXJBbmdsZXMueicpXCIgc3RlcD1cIjVcIiB0eXBlPVwibnVtYmVyXCIgdi1tb2RlbD1cImRldGFpbC5ldWxlckFuZ2xlcy56XCIgLz5cbiAgICA8L2Rpdj5cbiAgICA8ZGl2IGNsYXNzPVwibm9kZVByb3BlcnR5XCI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJub2RlUHJvcGVydHlUaXRsZVwiPlNjYWxlOjwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzPVwibm9kZVByb3BlcnR5U3ViVGl0bGVcIj5YOjwvZGl2PlxuICAgICAgICA8aW5wdXQgQGlucHV0PVwic3luY05vZGUoJ3NjYWxlLngnKVwiIHN0ZXA9XCIwLjAyXCIgdHlwZT1cIm51bWJlclwiIHYtbW9kZWw9XCJkZXRhaWwuc2NhbGUueFwiIC8+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJub2RlUHJvcGVydHlTdWJUaXRsZVwiPlk6PC9kaXY+XG4gICAgICAgIDxpbnB1dCBAaW5wdXQ9XCJzeW5jTm9kZSgnc2NhbGUueScpXCIgc3RlcD1cIjAuMDJcIiB0eXBlPVwibnVtYmVyXCIgdi1tb2RlbD1cImRldGFpbC5zY2FsZS55XCIgLz5cbiAgICAgICAgPGRpdiBjbGFzcz1cIm5vZGVQcm9wZXJ0eVN1YlRpdGxlXCI+Wjo8L2Rpdj5cbiAgICAgICAgPGlucHV0IEBpbnB1dD1cInN5bmNOb2RlKCdzY2FsZS56JylcIiBzdGVwPVwiMC4wMlwiIHR5cGU9XCJudW1iZXJcIiB2LW1vZGVsPVwiZGV0YWlsLnNjYWxlLnpcIiAvPlxuICAgIDwvZGl2PlxuXG4gICAgPGhyPlxuXG4gICAgPGRpdiBjbGFzcz1cIm5vZGVQcm9wZXJ0eVwiPlxuICAgICAgICA8ZGl2IGNsYXNzPVwibm9kZVByb3BlcnR5VGl0bGVcIj5MYXllcjo8L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzcz1cIm5vZGVQcm9wZXJ0eVN1YlRpdGxlXCI+e3tkZXRhaWwubGF5ZXJ9fTwvZGl2PlxuICAgIDwvZGl2PlxuICAgIDwvZGl2PlxuICAgIDwvZGl2PlxuICAgIGAsXG4gICAgfSApO1xufVxuIiwgIi8vIFRyZWUgY29tcG9uZW50czogTm9kZVZpZXcgKHJlY3Vyc2l2ZSkgYW5kIE5vZGVWaWV3VGl0bGUgKG9uZSByb3cpLlxuaW1wb3J0IHsgY29udGV4dCwgZXhlY0luR2FtZSB9IGZyb20gJy4vLi4vY29udGV4dCc7XG5pbXBvcnQgeyBzaG93Tm9kZU1lbnUgfSBmcm9tICcuLy4uL21lbnVzJztcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyTm9kZVRyZWVDb21wb25lbnRzKCk6IHZvaWQge1xuICAgIFZ1ZS5jb21wb25lbnQoICdOb2RlVmlldycsIHtcbiAgICAgICAgcHJvcHM6IHsgbjogT2JqZWN0LCBkZWVwOiBOdW1iZXIgfSxcbiAgICAgICAgZGF0YSgpIHtcbiAgICAgICAgICAgIGNvbnN0IHYgPSBjb250ZXh0LnZ1ZUFwcDtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgYm9sZDogZmFsc2UsXG4gICAgICAgICAgICAgICAgY2xvc2U6ICEoIHRoaXMubi5uYW1lID09PSAnQ2FudmFzJyAmJiB0aGlzLmRlZXAgPT09IDEgKSAmJiAhdi5vcGVuTm9kZXMuaGFzKCB0aGlzLm4uaWQgKSxcbiAgICAgICAgICAgICAgICBzZWxlY3RlZDogdGhpcy5uLmlkID09PSB2LnNlbGVjdGVkTm9kZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0sXG4gICAgICAgIHdhdGNoOiB7XG4gICAgICAgICAgICBjbG9zZSggdmFsdWU6IGJvb2xlYW4gKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2V0dGluZyA9IGNvbnRleHQuc2V0dGluZ0FwcDtcbiAgICAgICAgICAgICAgICBpZiAoICF2YWx1ZSAmJiB0aGlzLm4uaXNGYWlyeUNvbSAmJiBzZXR0aW5nLmRpc3BsYXlBc0ZhaXJ5VHJlZSAmJiBzZXR0aW5nLmhpZGVGYWlyeUNvbUNvbnRhaW5lciApIHtcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dC52dWVBcHAuc3luY09wZW5GY29tKCB0aGlzLm4uaWQgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBjb21wdXRlZDoge1xuICAgICAgICAgICAgbmVlZFVzZUNoaWxkQ2hpbHJlbigpOiBib29sZWFuIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzZXR0aW5nID0gY29udGV4dC5zZXR0aW5nQXBwO1xuICAgICAgICAgICAgICAgIGNvbnN0IHYgPSBjb250ZXh0LnZ1ZUFwcDtcbiAgICAgICAgICAgICAgICByZXR1cm4gKCBzZXR0aW5nLmRpc3BsYXlBc0ZhaXJ5VHJlZSAmJiBzZXR0aW5nLmhpZGVGYWlyeUNvbUNvbnRhaW5lciAmJiB0aGlzLm4uaXNGYWlyeUNvbVxuICAgICAgICAgICAgICAgICAgICAgICAgJiYgdGhpcy5uLmNoaWxkcmVuLmxlbmd0aCA9PT0gMSAmJiB0aGlzLm4uY2hpbGRyZW5bIDAgXS5uYW1lID09PSAnQ29udGFpbmVyJyApXG4gICAgICAgICAgICAgICAgICAgIHx8ICggdi5oaWRlM2RSb290Tm9kZSAmJiB0aGlzLm4uY2hpbGRyZW4ubGVuZ3RoID09PSAxICYmIHRoaXMubi5jaGlsZHJlblsgMCBdLm5hbWUgPT09ICdSb290Tm9kZSdcbiAgICAgICAgICAgICAgICAgICAgICAgICYmIHRoaXMubi5jaGlsZHJlblsgMCBdLmNoaWxkcmVuWyAwIF0/LmlzTWVzaFJlbmRlciApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGNoaWxkcmVuKCk6IHVua25vd25bXSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMubmVlZFVzZUNoaWxkQ2hpbHJlbiA/IHRoaXMubi5jaGlsZHJlblsgMCBdLmNoaWxkcmVuIDogdGhpcy5uLmNoaWxkcmVuO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHJlYWxEZWVwKCk6IG51bWJlciB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuZGVlcDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBpc1Nob3dMaW5lKCk6IGJvb2xlYW4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBjb250ZXh0LnZ1ZUFwcC5kcmFnaW5nRU4/LmlkID09PSB0aGlzLm4uaWQ7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBjcmVhdGVkKCkge1xuICAgICAgICAgICAgY29uc3QgdiA9IGNvbnRleHQudnVlQXBwO1xuICAgICAgICAgICAgdi4kb24oICdzZWxlY3RlZE5vZGVfY2hhbmdlZCcsIHRoaXMudXBkYXRlU2VsZWN0ZWQgKTtcbiAgICAgICAgICAgIHYuJG9uKCAnbG9jYXRlTm9kZScsIHRoaXMub25Mb2NhdGVOb2RlICk7XG4gICAgICAgICAgICB0aGlzLmJvbGQgPSB2Lm9wZW5Ob2Rlcy5oYXMoIHRoaXMubi5pZCApO1xuICAgICAgICAgICAgaWYgKCB0aGlzLm4ubmFtZSA9PT0gJ0NhbnZhcycgKSB2LnN5bmNPcGVuKCB0aGlzLm4uaWQsICF0aGlzLmNsb3NlICk7XG4gICAgICAgIH0sXG4gICAgICAgIGJlZm9yZURlc3Ryb3koKSB7XG4gICAgICAgICAgICBjb25zdCB2ID0gY29udGV4dC52dWVBcHA7XG4gICAgICAgICAgICB2LiRvZmYoICdsb2NhdGVOb2RlJywgdGhpcy5vbkxvY2F0ZU5vZGUgKTtcbiAgICAgICAgICAgIHYuJG9mZiggJ3NlbGVjdGVkTm9kZV9jaGFuZ2VkJywgdGhpcy51cGRhdGVTZWxlY3RlZCApO1xuICAgICAgICB9LFxuICAgICAgICBtZXRob2RzOiB7XG4gICAgICAgICAgICBvbkxvY2F0ZU5vZGUoIG9wZW5TZXQ6IFNldDxzdHJpbmc+ICkge1xuICAgICAgICAgICAgICAgIGlmICggb3BlblNldC5oYXMoIHRoaXMubi5pZCApICkgdGhpcy5jbG9zZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHRoaXMuYm9sZCA9IG9wZW5TZXQuaGFzKCB0aGlzLm4uaWQgKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB1cGRhdGVTZWxlY3RlZCgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGVkID0gdGhpcy5uLmlkID09PSBjb250ZXh0LnZ1ZUFwcC5zZWxlY3RlZE5vZGU7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZHJhZ3N0YXJ0KCBub2RlOiB1bmtub3duICkge1xuICAgICAgICAgICAgICAgIGNvbnRleHQudnVlQXBwLmRyYWdpbmdTTiA9IG5vZGU7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZHJhZ2VudGVyKCBub2RlOiBhbnkgKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdiA9IGNvbnRleHQudnVlQXBwO1xuICAgICAgICAgICAgICAgIHYucHVzaExvZyggbmV3IERhdGUoKS50b0xvY2FsZVRpbWVTdHJpbmcoKSwgJ2NvbnNvbGVMb2cnLCBub2RlLm5hbWUgKTtcbiAgICAgICAgICAgICAgICB2LmRyYWdpbmdFTiA9IG5vZGU7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZHJhZ2VuZCgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB2ID0gY29udGV4dC52dWVBcHA7XG4gICAgICAgICAgICAgICAgZXhlY0luR2FtZSggYF9fc3dhcFBvcygnJHsgdi5kcmFnaW5nU04uaWQgfScsJyR7IHYuZHJhZ2luZ0VOLmlkIH0nKWAgKTtcbiAgICAgICAgICAgICAgICB2LmRyYWdpbmdFTiA9IG51bGw7XG4gICAgICAgICAgICAgICAgdi5kcmFnaW5nU04gPSBudWxsO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgdGVtcGxhdGU6IGBcbiAgICA8ZGl2IGNsYXNzPVwibm9kZVwiIGRyYWdnYWJsZVxuICAgICAgICBAZHJhZ3N0YXJ0LnN0b3A9XCJkcmFnc3RhcnQobilcIiBAZHJhZ2VudGVyLnN0b3A9XCJkcmFnZW50ZXIobilcIiBAZHJhZ2VuZC5zdG9wPVwiZHJhZ2VuZFwiPlxuICAgICAgICA8aHIgdi1pZj1cImlzU2hvd0xpbmVcIj5cbiAgICAgICAgPG5vZGUtdmlldy10aXRsZSA6Ym9sZD1cImJvbGRcIiA6c2VsZWN0ZWQ9XCJzZWxlY3RlZFwiIDpuPVwiblwiIDpjaGlsZENvdW50PVwibi5jaGlsZENvdW50XCIgdi1tb2RlbD1cImNsb3NlXCIgOmRlZXA9XCJkZWVwXCI+PC9ub2RlLXZpZXctdGl0bGU+XG4gICAgICAgIDxub2RlLXZpZXcgdi1pZj1cIiFjbG9zZVwiICB2LWZvcj1cInNuIGluIGNoaWxkcmVuXCIgOm49XCJzblwiIDpkZWVwPVwicmVhbERlZXArMVwiIDprZXk9XCJzbi5pZFwiPlxuICAgICAgICA8L25vZGUtdmlldz5cblxuICAgIDwvZGl2PmAsXG4gICAgfSApO1xuXG4gICAgVnVlLmNvbXBvbmVudCggJ05vZGVWaWV3VGl0bGUnLCB7XG4gICAgICAgIHByb3BzOiBbICduJywgJ2JvbGQnLCAnZGVlcCcsICdjbG9zZScsICdzZWxlY3RlZCcsICdjaGlsZENvdW50JyBdLFxuICAgICAgICBtb2RlbDogeyBwcm9wOiAnY2xvc2UnLCBldmVudDogJ2NoYW5nZScgfSxcbiAgICAgICAgdGVtcGxhdGU6IGBcbiAgICAgICAgPGRpdiA6aWQ9XCJyZWZOYW1lXCIgQG1vdXNlb3Zlcj1cIm92ZXJOb2RlXCIgQG1vdXNlb3V0PVwib3V0Tm9kZVwiIGNsYXNzPVwibm9kZVRpdGxlXCIgQGNsaWNrPVwic2VsZWN0Tm9kZSgpXCIgOnN0eWxlPVwibm9kZVBhZGRpbmcrc2VsZWN0ZWRCZytpc0JvbGRcIiBAY29udGV4dG1lbnUuc3RvcD1cIm9uQ29udGV4dE1lbnVcIj5cbiAgICAgICAgICAgIDxzcGFuIEBjbGljay5zdG9wPVwidG9nZ2xlTm9kZSgpXCIgOnN0eWxlPVwiaWNvblRyYW5zZm9ybVwiIHYtaWY9XCJjaGlsZENvdW50PjBcIiBjbGFzcz1cIm5vZGVhcnJvdyBpY29uZm9udCBpY29uLXNoYW5nc2Fuamlhb1wiPjwvc3Bhbj5cbiAgICAgICAgICAgIDxzcGFuIDpzdHlsZT1cImRpc2FibGVcIiA+e3tub2RlTmFtZX19PC9zcGFuPjxzcGFuIGNsYXNzPVwiZGNEZXNjXCIgOnN0eWxlPVwic2VsZWN0ZWREY1wiPnt7ZGNEZXNjfX08L3NwYW4+XG4gICAgICAgICAgICA8YSB2LWlmPVwiIW4uYXV0b1VwZGF0ZVwiIEBjbGljay5zdG9wPVwiZm9yY2VVcGRhdGVUcmVlXCIgY2xhc3M9XCJpY29uZm9udCBpY29uLXNodWF4aW5cIj48L2E+XG4gICAgICAgICAgICA8c3BhbiB2LWlmPVwiaXNMb2NrZWREcmFnTm9kZVwiIGNsYXNzPVwiaWNvbmZvbnQgaWNvbi1kcmFnXCI+PC9zcGFuPlxuICAgICAgICA8L2Rpdj5cbiAgICBgLFxuICAgICAgICB3YXRjaDoge1xuICAgICAgICAgICAgY2hpbGRDb3VudCgpIHtcbiAgICAgICAgICAgICAgICBpZiAoIHRoaXMuZGVlcCA9PT0gMSApIHRoaXMuJGVsLnN0eWxlID0gdGhpcy5ub2RlUGFkZGluZyArIHRoaXMuc2VsZWN0ZWRCZyArIHRoaXMuaXNCb2xkO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgY29tcHV0ZWQ6IHtcbiAgICAgICAgICAgIGlzTG9ja2VkRHJhZ05vZGUoKTogYm9vbGVhbiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnRleHQudnVlQXBwLmxvY2tOb2RlID09PSB0aGlzLm4uaWQ7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgaXNCb2xkKCk6IHN0cmluZyB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICcnO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG5vZGVOYW1lKCk6IHN0cmluZyB7XG4gICAgICAgICAgICAgICAgaWYgKCBjb250ZXh0LnNldHRpbmdBcHAuZGlzcGxheUFzRmFpcnlUcmVlICkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5wcmUgKyAoIHRoaXMubi5nb2JqTmFtZSB8fCB0aGlzLm4ubmFtZSApICsgdGhpcy5jaGlsZHJlbkNvdW50O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5wcmUgKyB0aGlzLm4ubmFtZSArIHRoaXMuY2hpbGRyZW5Db3VudDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBjaGlsZHJlbkNvdW50KCk6IHN0cmluZyB7XG4gICAgICAgICAgICAgICAgY29uc3QgY291bnQgPSB0aGlzLm4uY2hpbGRDb3VudDtcbiAgICAgICAgICAgICAgICByZXR1cm4gY29udGV4dC52dWVBcHAuc2hvd0NoaWxkcmVuQ291bnQgJiYgY291bnQgPiAwID8gYCBbJHsgY291bnQgfV1gIDogJyc7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcHJlKCk6IHN0cmluZyB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMubi5icmVha3MgPyAnXHUyQjU1XHVGRTBGJyA6ICcnO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGljb25UcmFuc2Zvcm0oKTogc3RyaW5nIHtcbiAgICAgICAgICAgICAgICBjb25zdCByb3RhdGUgPSB0aGlzLmNsb3NlID8gJ3RyYW5zZm9ybTpyb3RhdGUoOTBkZWcpJyA6ICd0cmFuc2Zvcm06cm90YXRlKDE4MGRlZyknO1xuICAgICAgICAgICAgICAgIHJldHVybiAnZGlzcGxheTogaW5saW5lLWJsb2NrOycgKyByb3RhdGU7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcmVmTmFtZSgpOiBzdHJpbmcge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnNlbGVjdGVkID8gJ3NlbGVjdGVkTm9kZScgOiAnJztcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBub2RlUGFkZGluZygpOiBzdHJpbmcge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFycm93V2lkdGggPSB0aGlzLm4uY2hpbGRDb3VudCA+IDAgPyAyMSA6IDA7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGBwYWRkaW5nLWxlZnQ6JHsgdGhpcy5kZWVwICogMjAgLSBhcnJvd1dpZHRoIH1weDtgO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHNlbGVjdGVkQmcoKTogc3RyaW5nIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5zZWxlY3RlZCA/ICdjb2xvcjpibGFjaztiYWNrZ3JvdW5kLWNvbG9yOiNjY2NjY2M7JyA6ICcnO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHNlbGVjdGVkRGMoKTogc3RyaW5nIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5zZWxlY3RlZCA/ICdjb2xvcjpyZ2IoMTQsIDEyNywgMjMzKScgOiAnJztcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBkaXNhYmxlKCk6IHN0cmluZyB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMubi5hY3RpdmVJbkhpZXJhcmNoeSAmJiB0aGlzLm4ub3BhY2l0eUluSGllcmFyY2h5ID8gJycgOiAnb3BhY2l0eTowLjUnO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGRjRGVzYygpOiBzdHJpbmcge1xuICAgICAgICAgICAgICAgIGlmICggdGhpcy5uLmRjID09PSB1bmRlZmluZWQgKSByZXR1cm4gJyc7XG4gICAgICAgICAgICAgICAgaWYgKCB0aGlzLm4ucnR5cGUgKSByZXR1cm4gYCAkeyB0aGlzLm4uZGMgfSArICR7IHRoaXMubi5ydHlwZSB9YDtcbiAgICAgICAgICAgICAgICBpZiAoIHRoaXMubi5kYyA9PT0gMCApIHJldHVybiAnJztcbiAgICAgICAgICAgICAgICByZXR1cm4gYCAkeyB0aGlzLm4uZGMgfWA7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBtZXRob2RzOiB7XG4gICAgICAgICAgICBmb3JjZVVwZGF0ZVRyZWUoKSB7XG4gICAgICAgICAgICAgICAgY29udGV4dC52dWVBcHAuZm9yY2VVcGRhdGVUcmVlKCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdG9nZ2xlTm9kZSgpIHtcbiAgICAgICAgICAgICAgICBjb250ZXh0LnZ1ZUFwcC5zeW5jT3BlbiggdGhpcy5uLmlkLCB0aGlzLmNsb3NlICk7XG4gICAgICAgICAgICAgICAgdGhpcy4kZW1pdCggJ2NoYW5nZScsICF0aGlzLmNsb3NlICk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgc2VsZWN0Tm9kZSgpIHtcbiAgICAgICAgICAgICAgICBjb250ZXh0LnZ1ZUFwcC5zZWxlY3ROb2RlKCB0aGlzLm4uaWQgKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvbkNvbnRleHRNZW51KCkge1xuICAgICAgICAgICAgICAgIHNob3dOb2RlTWVudSggdGhpcy5uLmlkICk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb3Zlck5vZGUoKSB7XG4gICAgICAgICAgICAgICAgZXhlY0luR2FtZSggYGlmKHdpbmRvd1tcIl9fZHJhd1JlY3RcIl0pX19kcmF3UmVjdCgnJHsgdGhpcy5uLmlkIH0nKWAgKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvdXROb2RlKCkge1xuICAgICAgICAgICAgICAgIGV4ZWNJbkdhbWUoICdpZih3aW5kb3dbXCJfX2NsZWFyUmVjdFwiXSlfX2NsZWFyUmVjdCgpJyApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICB9ICk7XG59XG4iLCAiLy8gQ29uc29sZSB0YWI6IGZpbHRlcmVkIGxvZ3MgKyBjb2RlIGlucHV0IHdpdGggYXV0b2NvbXBsZXRlIHRpcHMuXG5pbXBvcnQgeyBjb250ZXh0LCBleGVjSW5HYW1lIH0gZnJvbSAnLi8uLi9jb250ZXh0JztcbmltcG9ydCB7IHNob3dDb25zb2xlTWVudSB9IGZyb20gJy4vLi4vbWVudXMnO1xuaW1wb3J0IHsgb3BlbkV4dGVybmFsIH0gZnJvbSAnLi8uLi9pcGMnO1xuXG5jb25zdCBTVE9SRV9VUkwgPSAnaHR0cHM6Ly9zdG9yZS5jb2Nvcy5jb20vYXBwL2RldGFpbC8yOTQwJztcbmNvbnN0IFNIT1JUQ1VUU19VUkwgPSAnaHR0cHM6Ly9mb3J1bS5jb2Nvcy5vcmcvdC90b3BpYy8xMTYzMTAnO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJDb25zb2xlUGFuZWwoKTogdm9pZCB7XG4gICAgVnVlLmNvbXBvbmVudCggJ0NvbnNvbGVQYW5lbCcsIHtcbiAgICAgICAgZGF0YSgpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgdHlwZTogJ0FsbCcsXG4gICAgICAgICAgICAgICAgdHlwZXM6IFsgJ0FsbCcsICdMb2cnLCAnRXJyb3InLCAnV2FybicgXSxcbiAgICAgICAgICAgICAgICBmaWx0ZXJTdHI6ICcnLFxuICAgICAgICAgICAgICAgIGNvZGU6ICcnLFxuICAgICAgICAgICAgICAgIGNvZGVUaXA6IFtdLFxuICAgICAgICAgICAgICAgIHRpcEluZGV4OiAwLFxuICAgICAgICAgICAgICAgIGF0Qm90dG9tOiB0cnVlLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSxcbiAgICAgICAgY29tcHV0ZWQ6IHtcbiAgICAgICAgICAgIGxvZ3MoKTogdW5rbm93bltdIHtcbiAgICAgICAgICAgICAgICBjb25zdCB2ID0gY29udGV4dC52dWVBcHA7XG4gICAgICAgICAgICAgICAgaWYgKCB0aGlzLnR5cGUgPT09ICdBbGwnICkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdi5iaWdMb2dzLmZpbHRlciggKCBsb2c6IGFueSApID0+IGxvZy5kLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoIHRoaXMuZmlsdGVyU3RyLnRvTG93ZXJDYXNlKCkgKSApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gdi5iaWdMb2dzLmZpbHRlciggKCBsb2c6IGFueSApID0+IGxvZy50LmVuZHNXaXRoKCB0aGlzLnR5cGUgKSAmJiBsb2cuZC5pbmNsdWRlcyggdGhpcy5maWx0ZXJTdHIgKSApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgbW91bnRlZCgpIHtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsTG9nVG9Cb3R0b20oKTtcbiAgICAgICAgfSxcbiAgICAgICAgdXBkYXRlZCgpIHtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsTG9nVG9Cb3R0b20oKTtcbiAgICAgICAgfSxcbiAgICAgICAgbWV0aG9kczoge1xuICAgICAgICAgICAgY2hlY2tCb3R0b20oKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZWwgPSB0aGlzLiRyZWZzLmxvZ3NNYWluO1xuICAgICAgICAgICAgICAgIHRoaXMuYXRCb3R0b20gPSBlbC5zY3JvbGxIZWlnaHQgLSBlbC5jbGllbnRIZWlnaHQgPT09IGVsLnNjcm9sbFRvcDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzaG93TWVudSgpIHtcbiAgICAgICAgICAgICAgICBzaG93Q29uc29sZU1lbnUoKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBjbGVhckxvZ3MoKSB7XG4gICAgICAgICAgICAgICAgY29udGV4dC52dWVBcHAubG9ncyA9IFtdO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHNjcm9sbExvZ1RvQm90dG9tKCkge1xuICAgICAgICAgICAgICAgIGlmICggIXRoaXMuYXRCb3R0b20gKSByZXR1cm47XG4gICAgICAgICAgICAgICAgY29uc3QgZWwgPSB0aGlzLiRyZWZzLmxvZ3NNYWluO1xuICAgICAgICAgICAgICAgIHRoaXMuJG5leHRUaWNrKCAoKSA9PiB7IGVsLnNjcm9sbFRvcCA9IGVsLnNjcm9sbEhlaWdodDsgfSApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGdvdG9TdG9yZSgpIHsgb3BlbkV4dGVybmFsKCBTVE9SRV9VUkwgKTsgfSxcbiAgICAgICAgICAgIGdvdG9TY00oKSB7IG9wZW5FeHRlcm5hbCggU0hPUlRDVVRTX1VSTCApOyB9LFxuICAgICAgICAgICAgZXhlYygpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNvZGVUaXAgPSBbXTtcbiAgICAgICAgICAgICAgICBpZiAoIHRoaXMuY29kZS50cmltKCkgPT09ICcnICkgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGxldCBjb2RlID0gdGhpcy5jb2RlO1xuICAgICAgICAgICAgICAgIGNvbnRleHQudnVlQXBwLnB1c2hMb2coIG5ldyBEYXRlKCkudG9Mb2NhbGVUaW1lU3RyaW5nKCksICdjb25zb2xlTG9nJywgJz4gJyArIGNvZGUgKyAnOicgKTtcbiAgICAgICAgICAgICAgICBpZiAoICFjb2RlLnN0YXJ0c1dpdGgoICdsZXQgJyApICYmICFjb2RlLnN0YXJ0c1dpdGgoICd2YXIgJyApICYmICFjb2RlLnN0YXJ0c1dpdGgoICdjb25zb2xlLicgKSAmJiAhY29kZS5zdGFydHNXaXRoKCAnY2MubG9nJyApICkge1xuICAgICAgICAgICAgICAgICAgICBjb2RlID0gYGNvbnNvbGUubG9nKCR7IGNvZGUgfSlgO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBleGVjSW5HYW1lKCBjb2RlICkudGhlbiggKCByZXN1bHQ6IHVua25vd24gKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmICggcmVzdWx0ICE9PSBudWxsICkgY29udGV4dC52dWVBcHAucHVzaExvZyggbmV3IERhdGUoKS50b0xvY2FsZVRpbWVTdHJpbmcoKSwgJ2NvbnNvbGVMb2cnLCBgJHsgcmVzdWx0IH1gICk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29kZSA9ICcnO1xuICAgICAgICAgICAgICAgIH0gKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB1cCgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRpcEluZGV4ID0gdGhpcy50aXBJbmRleCA9PT0gMCA/IHRoaXMuY29kZVRpcC5sZW5ndGggLSAxIDogdGhpcy50aXBJbmRleCAtIDE7XG4gICAgICAgICAgICAgICAgdGhpcy4kbmV4dFRpY2soKS50aGVuKCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuJHJlZnMuc2VsZWN0ZWQ/LlsgMCBdPy5zY3JvbGxJbnRvVmlld0lmTmVlZGVkKCBmYWxzZSApO1xuICAgICAgICAgICAgICAgIH0gKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBkb3duKCkge1xuICAgICAgICAgICAgICAgIHRoaXMudGlwSW5kZXggPSB0aGlzLnRpcEluZGV4ID09PSB0aGlzLmNvZGVUaXAubGVuZ3RoIC0gMSA/IDAgOiB0aGlzLnRpcEluZGV4ICsgMTtcbiAgICAgICAgICAgICAgICB0aGlzLiRuZXh0VGljaygpLnRoZW4oICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy4kcmVmcy5zZWxlY3RlZD8uWyAwIF0/LnNjcm9sbEludG9WaWV3SWZOZWVkZWQoIGZhbHNlICk7XG4gICAgICAgICAgICAgICAgfSApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGVzYygpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNvZGVUaXAgPSBbXTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB0YWIoKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY2hvc2VuID0gdGhpcy5jb2RlVGlwWyB0aGlzLnRpcEluZGV4IF1bIDAgXTtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJ0cyA9IHRoaXMuY29kZS5zcGxpdCggJy4nICk7XG4gICAgICAgICAgICAgICAgcGFydHMucG9wKCk7XG4gICAgICAgICAgICAgICAgaWYgKCAhaXNOYU4oIGNob3NlbiApICkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmNvZGUgPSBwYXJ0cy5qb2luKCAnLicgKSArICdbJyArIGNob3NlbiArICddJztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKCBjaG9zZW4gKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb2RlID0gcGFydHMuam9pbiggJy4nICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMuY29kZVRpcCA9IFtdO1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBnZXRUaXAoKSB7XG4gICAgICAgICAgICAgICAgaWYgKCB0aGlzLmNvZGUudHJpbSgpID09PSAnJyApIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb2RlVGlwID0gW107XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZXhlY0luR2FtZSggYF9fY29kZVRpcCgnJHsgdGhpcy5jb2RlIH0nKWAgKS50aGVuKCAoIHRpcHM6IHVua25vd25bXSApID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50aXBJbmRleCA9IDA7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29kZVRpcCA9IHRpcHM7XG4gICAgICAgICAgICAgICAgfSApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHNwbGl0TXNnKCBtZXNzYWdlOiBzdHJpbmcgKTogc3RyaW5nW10ge1xuICAgICAgICAgICAgICAgIHJldHVybiBtZXNzYWdlLnNwbGl0KCBSZWdFeHAoIGAoJHsgdGhpcy5maWx0ZXJTdHIgfSlgLCAnaScgKSApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgdGVtcGxhdGU6IGBcbiAgICA8ZGl2IGNsYXNzPVwiY29uc29sZVBhbmVsXCI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJ0b3BNZW51XCI+XG4gICAgICAgICAgICA8aW5wdXQgcGxhY2Vob2xkZXI9XCJ0eXBlIHRvIGZpbHRlciBsb2dzXCIgdHlwZT1cInNlYXJjaFwiIHYtbW9kZWw9XCJmaWx0ZXJTdHJcIiAvPlxuICAgICAgICAgICAgPGxhYmVsIHYtZm9yPVwidCBpbiB0eXBlc1wiPjxpbnB1dCB0eXBlPVwicmFkaW9cIiA6dmFsdWU9XCJ0XCIgdi1tb2RlbD1cInR5cGVcIj57e3R9fTwvbGFiZWw+XG5cbiAgICAgICAgICAgIDxsYWJlbD48aW5wdXQgQGNoYW5nZT1cInNldHRpbmcuc2F2ZVRvU3RvcmFnZSgpXCIgdHlwZT1cImNoZWNrYm94XCIgdi1tb2RlbD1cInNldHRpbmcuY2xlYXJMb2dBZnRlclJlZnJlc2hcIiAvPmNsZWFyTG9nQWZ0ZXJSZWZyZXNoPC9sYWJlbD5cbiAgICAgICAgICAgIDxhIEBjbGljaz1cImdvdG9TdG9yZVwiPlVzZWZ1bD8gNSBzdGFycz88L2E+XG4gICAgICAgICAgICBuZXc6PGEgQGNsaWNrPVwiZ290b1NjTVwiPlNob3J0Y3V0cyBNYW5hZ2VyPC9hPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPGhyPlxuICAgICAgICA8ZGl2IGNsYXNzPVwibG9ncyBmbGV4MVwiIHJlZj1cImxvZ3NNYWluXCIgQGNvbnRleHRtZW51LnN0b3A9XCJzaG93TWVudVwiIEBzY3JvbGw9XCJjaGVja0JvdHRvbVwiPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImxvZ0l0ZW1cIiB2LWZvcj1cImwgaW4gbG9nc1wiIDpzdHlsZT1cIntjb2xvcjp2LmxvZ0NvbG9yKGwudCl9XCI+XG4gICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJsb2dUaW1lXCI+e3tsLnRpbWV9fTo8L3NwYW4+XG4gICAgICAgICAgICAgICAgPHNwYW4gdi1pZj1cImZpbHRlclN0ci50cmltKCk9PScnXCI+e3tsLmR9fTwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8c3BhbiB2LWlmPVwiZmlsdGVyU3RyLnRyaW0oKSE9JydcIiB2LWZvcj1cImQgaW4gc3BsaXRNc2cobC5kKVwiIDpjbGFzcz1cIntmaWx0ZXI6ZC50b0xvd2VyQ2FzZSgpPT1maWx0ZXJTdHIudG9Mb3dlckNhc2UoKX1cIj57e2R9fTwvc3Bhbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPGlucHV0IEBrZXlkb3duLnRhYi5wcmV2ZW50PVwidGFiXCIgQGtleXVwLmVzYy5zdG9wPVwiZXNjXCIgQGtleWRvd24udXAucHJldmVudD1cInVwXCIgQGtleWRvd24uZG93bi5wcmV2ZW50PVwiZG93blwiIEBrZXl1cC5lbnRlcj1cImV4ZWNcIiBAaW5wdXQ9XCJnZXRUaXBcIiBwbGFjZWhvbGRlcj1cInR5cGUgY29kZSBoZXJlXCIgdHlwZT1cInRleHRcIiB2LW1vZGVsPVwiY29kZVwiLz5cbiAgICAgICAgPGRpdiBjbGFzcz1cImNvZGVUaXBzXCIgdi1zaG93PVwiY29kZVRpcC5sZW5ndGg+MFwiPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImhlbHBDb25cIj5cbiAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cImhlbHBcIj48Yj5UQUI8L2I+OiBjaG9vc2UmZmlsbDwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cImhlbHBcIj48Yj5VUC9ET1dOPC9iPjogc3dpdGNoPC9zcGFuPlxuICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiaGVscFwiPjxiPkVOVEVSPC9iPjogZXhlY3V0ZTwvc3Bhbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGhyPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInRpcHNDb25cIj5cbiAgICAgICAgICAgICAgICA8ZGl2IDpyZWY9XCJ0aXBJbmRleD09aT8nc2VsZWN0ZWQnOm51bGxcIiA6Y2xhc3M9XCJ7dGlwSXRlbTp0cnVlLHNlbGVjdGVkOnRpcEluZGV4PT1pfVwiIHYtZm9yPVwiKHQsaSkgaW4gY29kZVRpcFwiIDprZXk9XCJ0XCI+XG4gICAgICAgICAgICAgICAgICAgIDxiPnt7dFswXX19PC9iPjo8c3Bhbj57e3RbMV19fTwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L2Rpdj5cbiAgICA8L2Rpdj5cbiAgICBgLFxuICAgIH0gKTtcbn1cbiIsICIvLyBDb2NvcyB0YWI6IGVuZ2luZS9zeXN0ZW0gZmxhZ3MgKyBnYW1lIGxvY2FsU3RvcmFnZSB2aWV3ZXIgKCsgbGVnYWN5IHN0YXRpc3RpYyBwYW5lbCkuXG5pbXBvcnQgeyBjb250ZXh0LCBleGVjSW5HYW1lIH0gZnJvbSAnLi8uLi9jb250ZXh0JztcblxuLyoqIGZsYWdzIHJlbmRlcmVkIGJ5IGRlZGljYXRlZCAoY3VycmVudGx5IGNvbW1lbnRlZC1vdXQpIGNvbnRyb2xzLCBub3QgdGhlIGdlbmVyaWMgbGlzdCAqL1xuY29uc3QgRklMVEVSRURfVkFSUyA9IG5ldyBTZXQoIFsgJ0NvbGxpc2lvbk1hbmFnZXInLCAnQ29sbGlzaW9uX0RlYnVnRHJhdycsICdpc0R5bmFtaWNBdGxhc0RlYnVnU2hvdycgXSApO1xuXG5jb25zdCBDT0xMRUNUX1ZBUlNfU0NSSVBUID0gYFxuICAgICAgICAgICAgdmFyIG8gPSB7fVxuICAgICAgICAgICAgZm9yKGxldCBrIGluIHdpbmRvdyl7XG4gICAgICAgICAgICAgICAgaWYoay5zdGFydHNXaXRoKFwiQ0NfXCIpKXtcbiAgICAgICAgICAgICAgICAgICAgb1trXSA9IHdpbmRvd1trXVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmKGNjKXtcbiAgICAgICAgICAgICAgICBmb3IobGV0IGsgaW4gY2Muc3lzKXtcbiAgICAgICAgICAgICAgICAgICAgaWYoay5zdGFydHNXaXRoKFwiaXNcIikpe1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYodHlwZW9mIGNjLnN5c1trXSAhPSBcImZ1bmN0aW9uXCIpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9ba10gPSBjYy5zeXNba11cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0cnl7XG4gICAgICAgICAgICAgICAgb1tcImVuYWJsZWREeW5hbWljQXRsYXNcIl0gPSBjYy5keW5hbWljQXRsYXNNYW5hZ2VyLmVuYWJsZWRcbiAgICAgICAgICAgICAgICB9Y2F0Y2goZSl7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRyeXtcbiAgICAgICAgICAgICAgICAgICAgb1tcImlzRHluYW1pY0F0bGFzRGVidWdTaG93XCJdID0gY2MuZmluZChcIkRZTkFNSUNfQVRMQVNfREVCVUdfTk9ERVwiKSAhPSBudWxsXG4gICAgICAgICAgICAgICAgfWNhdGNoKGUpe1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRyeXtcbiAgICAgICAgICAgICAgICAgICAgb1tcImVuYWJsZWRSZXRpbmFcIl0gPSBjYy52aWV3LmlzUmV0aW5hRW5hYmxlZCgpXG4gICAgICAgICAgICAgICAgfWNhdGNoKGUpe1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRyeXtcbiAgICAgICAgICAgICAgICAgICAgb1tcIkVOR0lORV9WRVJTSU9OXCJdID0gY2MuRU5HSU5FX1ZFUlNJT05cbiAgICAgICAgICAgICAgICB9Y2F0Y2goZSl7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdHJ5e1xuICAgICAgICAgICAgICAgICAgICBvW1wiQ29sbGlzaW9uTWFuYWdlclwiXSA9IGNjLmRpcmVjdG9yLmdldENvbGxpc2lvbk1hbmFnZXIoKS5lbmFibGVkXG4gICAgICAgICAgICAgICAgfWNhdGNoKGUpe1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRyeXtcbiAgICAgICAgICAgICAgICAgICAgb1tcIkNvbGxpc2lvbl9EZWJ1Z0RyYXdcIl0gPSBjYy5kaXJlY3Rvci5nZXRDb2xsaXNpb25NYW5hZ2VyKCkuZW5hYmxlZERlYnVnRHJhd1xuICAgICAgICAgICAgICAgIH1jYXRjaChlKXtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgb1xuICAgICAgICAgICAgYDtcblxuY29uc3QgQ09MTEVDVF9MT0NBTF9TVE9SQUdFX1NDUklQVCA9IGBcbiAgICAgICAgdmFyIG8yID0ge31cbiAgICAgICAgT2JqZWN0LmtleXMoY2Muc3lzLmxvY2FsU3RvcmFnZSkuZm9yRWFjaChmdW5jdGlvbihrKXtcbiAgICAgICAgICAgIG8yW2tdID0gY2Muc3lzLmxvY2FsU3RvcmFnZVtrXVxuICAgICAgICB9KVxuICAgICAgICBvMlxuICAgICAgICBgO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJDb2Nvc1BhbmVscygpOiB2b2lkIHtcbiAgICBWdWUuY29tcG9uZW50KCAnTG9jYWxTdG9yYWdlUGFuZWwnLCB7XG4gICAgICAgIGRhdGEoKSB7XG4gICAgICAgICAgICByZXR1cm4geyBsY1N0b3JhZ2U6IHt9IH07XG4gICAgICAgIH0sXG4gICAgICAgIGNvbXB1dGVkOiB7XG4gICAgICAgICAgICBrZXlzKCk6IHN0cmluZ1tdIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gT2JqZWN0LmtleXMoIHRoaXMubGNTdG9yYWdlICk7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBjcmVhdGVkKCkge1xuICAgICAgICAgICAgZXhlY0luR2FtZSggQ09MTEVDVF9MT0NBTF9TVE9SQUdFX1NDUklQVCApLnRoZW4oICggc3RvcmFnZTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5sY1N0b3JhZ2UgPSBzdG9yYWdlO1xuICAgICAgICAgICAgfSApO1xuICAgICAgICB9LFxuICAgICAgICBtZXRob2RzOiB7XG4gICAgICAgICAgICBkZWwoIGtleTogc3RyaW5nICkge1xuICAgICAgICAgICAgICAgIGV4ZWNJbkdhbWUoIGBjYy5zeXMubG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oJyR7IGtleSB9JylgICk7XG4gICAgICAgICAgICAgICAgVnVlLmRlbGV0ZSggdGhpcy5sY1N0b3JhZ2UsIGtleSApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgdGVtcGxhdGU6IGBcbiAgICA8ZGl2PlxuICAgICAgICA8YnI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJ0b3BTdGlja3lcIj5Mb2NhbCBTdG9yYWdlPC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJsb2NhbFN0b3JhZ2VDb25cIj5cbiAgICAgICAgICAgIDxzcGFuIHYtZm9yPVwiayBpbiBrZXlzXCIgOmtleT1cImtcIiBjbGFzcz1cInZhckl0ZW1cIiBzdHlsZT1cImNvbG9yOndoaXRlXCI+XG4gICAgICAgICAgICAgICAge3trfX06XG4gICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJ2YXJJdGVtVmFsdWVcIj57e2xjU3RvcmFnZVtrXX19PC9zcGFuPlxuICAgICAgICAgICAgICAgIDxhIEBjbGljay5zdG9wPVwiZGVsKGspXCI+PHNwYW4gY2xhc3M9XCJpY29uZm9udCBpY29uLXdyb25nMlwiPjwvc3Bhbj48L2E+XG4gICAgICAgICAgICA8L3NwYW4+XG4gICAgICAgIDwvZGl2PlxuICAgIDwvZGl2PmAsXG4gICAgfSApO1xuXG4gICAgVnVlLmNvbXBvbmVudCggJ1N0YXRpc3RpY1BhbmVsJywge1xuICAgICAgICBtZXRob2RzOiB7XG4gICAgICAgICAgICB0b2dnbGUoKSB7XG4gICAgICAgICAgICAgICAgY29udGV4dC52dWVBcHAudG9nZ2xlU3RhdGlzdGljKCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBjb21wdXRlZDoge1xuICAgICAgICAgICAgYnRuTGFiZWwoKTogc3RyaW5nIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gY29udGV4dC52dWVBcHAuc3RhdGlzdGljaW5nID8gJ1N0b3AnIDogJ1N0YXJ0JztcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHRlbXBsYXRlOiBgXG4gICAgPGRpdiBjbGFzcz1cImNvY29zUGFuZWxcIj5cbiAgICAgICAgPGJ1dHRvbiBAY2xpY2s9XCJ0b2dnbGVcIj57e2J0bkxhYmVsfX08L2J1dHRvbj5cbiAgICA8L2Rpdj5cbiAgICBgLFxuICAgIH0gKTtcblxuICAgIFZ1ZS5jb21wb25lbnQoICdDb2Nvc1BhbmVsJywge1xuICAgICAgICBkYXRhKCkge1xuICAgICAgICAgICAgcmV0dXJuIHsgY2NWYXJzOiB7fSwgbGNTdG9yYWdlOiB7fSB9O1xuICAgICAgICB9LFxuICAgICAgICBjb21wdXRlZDoge1xuICAgICAgICAgICAga2V5cygpOiBzdHJpbmdbXSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKCB0aGlzLmNjVmFycyApLnNvcnQoKS5maWx0ZXIoICgga2V5OiBzdHJpbmcgKSA9PiAhRklMVEVSRURfVkFSUy5oYXMoIGtleSApICk7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBjcmVhdGVkKCkge1xuICAgICAgICAgICAgdGhpcy5yZWZyZXNoVmFycygpO1xuICAgICAgICB9LFxuICAgICAgICBtZXRob2RzOiB7XG4gICAgICAgICAgICByZWZyZXNoVmFycygpIHtcbiAgICAgICAgICAgICAgICBleGVjSW5HYW1lKCBDT0xMRUNUX1ZBUlNfU0NSSVBUICkudGhlbiggKCB2YXJzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiApID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jY1ZhcnMgPSB2YXJzO1xuICAgICAgICAgICAgICAgIH0gKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBnZXRTdHlsZSgga2V5OiBzdHJpbmcgKTogc3RyaW5nIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5jY1ZhcnNbIGtleSBdID8gJ2NvbG9yOndoaXRlOycgOiAnY29sb3I6Z3JleTsnO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHN5bmNDb2xFbmFibGUoKSB7XG4gICAgICAgICAgICAgICAgZXhlY0luR2FtZSggYGNjLmRpcmVjdG9yLmdldENvbGxpc2lvbk1hbmFnZXIoKS5lbmFibGVkID0gJHsgdGhpcy5jY1ZhcnMuQ29sbGlzaW9uTWFuYWdlciB9YCApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHN5bmNDb2xEZWJ1Z0RyYXcoKSB7XG4gICAgICAgICAgICAgICAgZXhlY0luR2FtZSggYGNjLmRpcmVjdG9yLmdldENvbGxpc2lvbk1hbmFnZXIoKS5lbmFibGVkRGVidWdEcmF3ID0gJHsgdGhpcy5jY1ZhcnMuQ29sbGlzaW9uX0RlYnVnRHJhdyB9YCApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHRvZ2dsZUR5bmFtaWNBdGxhc1Nob3coKSB7XG4gICAgICAgICAgICAgICAgZXhlY0luR2FtZSggYGNjLmR5bmFtaWNBdGxhc01hbmFnZXIuc2hvd0RlYnVnKCR7IHRoaXMuY2NWYXJzLmlzRHluYW1pY0F0bGFzRGVidWdTaG93IH0pOyR7IHRoaXMuY2NWYXJzLmlzRHluYW1pY0F0bGFzRGVidWdTaG93IH1gICk7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB0ZW1wbGF0ZTogYFxuICAgIDxkaXYgY2xhc3M9XCJjb2Nvc1BhbmVsXCI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJ0b3BTdGlja3lcIj4gRU5HSU5FX1ZFUlNJT046IHt7Y2NWYXJzLkVOR0lORV9WRVJTSU9OfX08L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzcz1cInZhcnNDb25cIj5cbiAgICAgICAgICAgIDxzcGFuIHYtZm9yPVwiayBpbiBrZXlzXCIgOmtleT1cImtcIiBjbGFzcz1cInZhckl0ZW1cIiA6c3R5bGU9XCJnZXRTdHlsZShrKVwiPnt7a319OiB7e2NjVmFyc1trXX19PC9zcGFuPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzcz1cInZhcnNDb25cIj5cbiAgICAgICAgPC9kaXY+XG4gICAgICAgIDxsb2NhbC1zdG9yYWdlLXBhbmVsPjwvbG9jYWwtc3RvcmFnZS1wYW5lbD5cbiAgICA8L2Rpdj5cbiAgICBgLFxuICAgIH0gKTtcbn1cbiIsICIvLyBTZWFyY2ggcGFuZWwsIGV4dGVuc2lvbiBwYW5lbCwgc3BhY2VyLlxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IGNvbnRleHQsIGV4ZWNJbkdhbWUgfSBmcm9tICcuLy4uL2NvbnRleHQnO1xuaW1wb3J0IHsgc2hvd09wZW5EaWFsb2dJcGMgfSBmcm9tICcuLy4uL2lwYyc7XG5cbmNvbnN0IEVTQ19LRVkgPSAyNztcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyUGFuZWxzKCk6IHZvaWQge1xuICAgIFZ1ZS5jb21wb25lbnQoICdTZWFyY2hQYW5lbCcsIHtcbiAgICAgICAgZGF0YSgpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHNlYXJjaFN0cjogJycsIGxpc3Q6IFtdLCBpbmNsdWRlSW52aXNpYmxlOiB0cnVlLCBrZDogbnVsbCB9O1xuICAgICAgICB9LFxuICAgICAgICBjcmVhdGVkKCkge1xuICAgICAgICAgICAgdGhpcy5rZCA9ICggZXZlbnQ6IEtleWJvYXJkRXZlbnQgKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCAoIGV2ZW50LmtleSA9PT0gU3RyaW5nKCBFU0NfS0VZICkgfHwgZXZlbnQua2V5Q29kZSA9PT0gRVNDX0tFWSApICYmIHRoaXMuc2VhcmNoU3RyLnRyaW0oKSAhPT0gJycgKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2xlYXJTZWFyY2goKTtcbiAgICAgICAgICAgICAgICAgICAgZXZlbnQuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICAgICAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCAna2V5ZG93bicsIHRoaXMua2QgKTtcbiAgICAgICAgfSxcbiAgICAgICAgYmVmb3JlRGVzdHJveSgpIHtcbiAgICAgICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoICdrZXlkb3duJywgdGhpcy5rZCApO1xuICAgICAgICB9LFxuICAgICAgICBtZXRob2RzOiB7XG4gICAgICAgICAgICBvbkNoYW5nZSgpIHtcbiAgICAgICAgICAgICAgICBpZiAoIHRoaXMuc2VhcmNoU3RyLnRyaW0oKSA9PT0gJycgKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubGlzdCA9IFtdO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGV4ZWNJbkdhbWUoIGBfX3NlYXJjaENvbXMoJyR7IHRoaXMuc2VhcmNoU3RyIH0nKWAgKS50aGVuKCAoIGxpc3Q6IHVua25vd25bXSApID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5saXN0ID0gbGlzdCB8fCBbXTtcbiAgICAgICAgICAgICAgICB9ICk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgbG9jYXRlKCB1dWlkUGF0aDogc3RyaW5nW10gKSB7XG4gICAgICAgICAgICAgICAgY29udGV4dC52dWVBcHAubG9jYXRlTm9kZSggdXVpZFBhdGggKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBjbGVhclNlYXJjaCgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNlYXJjaFN0ciA9ICcnO1xuICAgICAgICAgICAgICAgIHRoaXMubGlzdC5sZW5ndGggPSAwO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgY29tcHV0ZWQ6IHtcbiAgICAgICAgICAgIGZpbHRlcmVkTGlzdCgpOiB1bmtub3duW10ge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmluY2x1ZGVJbnZpc2libGUgPyB0aGlzLmxpc3QgOiB0aGlzLmxpc3QuZmlsdGVyKCAoIGVudHJ5OiBhbnkgKSA9PiBlbnRyeS52aXNpYmxlICk7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB0ZW1wbGF0ZTogYFxuICAgIDxkaXYgY2xhc3M9XCJzZWFyY2hQYW5lbFwiPlxuICAgICAgICA8ZGl2IGNsYXNzPVwic2VhcmNoVGl0bGVcIiB2LXNob3c9XCJsaXN0Lmxlbmd0aD4wXCIgc3R5bGU9XCJkaXNwbGF5OmZsZXhcIj5cbiAgICAgICAgICAgIDxsYWJlbD5SZXN1bHQ6e3tmaWx0ZXJlZExpc3QubGVuZ3RofX0ve3tsaXN0Lmxlbmd0aH19PC9sYWJlbD5cbiAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJmbGV4OjFcIj48L2Rpdj5cbiAgICAgICAgICAgIDxsYWJlbD48aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgdi1tb2RlbD1cImluY2x1ZGVJbnZpc2libGVcIiAvPkluY2x1ZGVzIEludmlzaWJsZSAgIDwvbGFiZWw+XG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cImljb25mb250IGljb24tc2hhbmNodVwiIEBjbGljaz1cImNsZWFyU2VhcmNoXCI+PC9zcGFuPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzcz1cInNlYXJjaExpc3RcIiB2LXNob3c9XCJsaXN0Lmxlbmd0aD4wXCI+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwic2VhcmNJdGVtXCIgdi1mb3I9XCIoYyxpKSBpbiBmaWx0ZXJlZExpc3RcIiA+XG4gICAgICAgICAgICAgICAgPGhyPlxuICAgICAgICAgICAgICAgIDxzcGFuPnt7Yy5uYW1lfX08L3NwYW4+XG4gICAgICAgICAgICAgICAgPGEgQGNsaWNrPVwibG9jYXRlKGMudXVpZFBhdGgpXCI+XG4gICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJpY29uZm9udCBpY29uLWRpbmd3ZWlcIj48L3NwYW4+XG4gICAgICAgICAgICAgICAgPC9hPlxuICAgICAgICAgICAgICAgIDxzcGFuIHYtaWY9XCIhYy52aXNpYmxlXCIgPmludmlzaWJsZTwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8YnI+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cIml0ZW1QYXRoXCI+e3tjLnBhdGh9fTwvZGl2PlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzPVwic2VhcmNoQm94XCI+XG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cImljb25mb250IGljb24tc291c3VvXCI+PC9zcGFuPjxpbnB1dCBAaW5wdXQ9XCJvbkNoYW5nZVwiIHR5cGU9XCJzZWFyY2hcIiBwbGFjZWhvbGRlcj1cInNlYXJjaCBjb21wb25lbnRcIiB2LW1vZGVsPVwic2VhcmNoU3RyXCIgLz5cbiAgICAgICAgPC9kaXY+XG4gICAgPC9kaXY+XG4gICAgYCxcbiAgICB9ICk7XG5cbiAgICBWdWUuY29tcG9uZW50KCAnRXh0ZW5zaW9uUGFuZWwnLCB7XG4gICAgICAgIGRhdGEoKSB7XG4gICAgICAgICAgICByZXR1cm4geyBleGFtcGxlOiAnJyB9O1xuICAgICAgICB9LFxuICAgICAgICBtZXRob2RzOiB7XG4gICAgICAgICAgICBvblNlbGVjdGVkRmlsZSgpIHsgLyoga2VwdCBmb3IgdGVtcGxhdGUgY29tcGF0aWJpbGl0eSAqLyB9LFxuICAgICAgICAgICAgYXN5bmMgY2hvb3NlRmlsZSgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBmaWxlcyA9IGF3YWl0IHNob3dPcGVuRGlhbG9nSXBjKCBbICdqc29uJyBdICk7XG4gICAgICAgICAgICAgICAgaWYgKCAhZmlsZXMgKSByZXR1cm47XG4gICAgICAgICAgICAgICAgY29uc3QgZmlsZSA9IGZpbGVzWyAwIF07XG4gICAgICAgICAgICAgICAgaWYgKCBmaWxlICYmIGZpbGUudHJpbSgpICE9PSAnJyApIHtcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dC5zZXR0aW5nQXBwLmV4dGVuc2lvbkZpbGUgPSBmaWxlO1xuICAgICAgICAgICAgICAgICAgICBjb250ZXh0LnNldHRpbmdBcHAuc2F2ZVRvU3RvcmFnZSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIGNyZWF0ZWQoKSB7XG4gICAgICAgICAgICBjb25zdCBleGFtcGxlID0gZnMucmVhZEZpbGVTeW5jKCBwYXRoLmpvaW4oIF9fZGlybmFtZSwgJ3BsdWdpbnMuanNvbicgKSwgeyBlbmNvZGluZzogJ3V0Zi04JyB9ICk7XG4gICAgICAgICAgICB0aGlzLmV4YW1wbGUgPSBKU09OLnN0cmluZ2lmeSggSlNPTi5wYXJzZSggZXhhbXBsZSApLCBudWxsLCAnXFx0JyApO1xuICAgICAgICB9LFxuICAgICAgICB0ZW1wbGF0ZTogYFxuICAgIDxkaXYgY2xhc3M9XCJleHRlbnNpb25QYW5lbFwiPlxuICAgICAgICA8bGFiZWw+XG4gICAgICAgICAgICA8aW5wdXQgQGNoYW5nZT1cInNldHRpbmcuc2F2ZVRvU3RvcmFnZVwiIHR5cGU9XCJjaGVja2JveFwiIHYtbW9kZWw9XCJzZXR0aW5nLmVuYWJsZUV4dGVuc2lvblwiPlxuICAgICAgICAgICAgRW5hYmxlIEV4dGVuc2lvblxuICAgICAgICA8L2xhYmVsPlxuICAgICAgICA8aHI+XG4gICAgICAgIDxkaXY+Q3VycmVudCBFeHRlbnNpb24gRmlsZTo8YnI+e3tzZXR0aW5nLmV4dGVuc2lvbkZpbGV9fTwvZGl2PlxuICAgICAgICA8YnV0dG9uIEBjbGljaz1cImNob29zZUZpbGVcIj5DaG9vc2UgRmlsZTwvYnV0dG9uPlxuICAgICAgICA8aHI+XG4gICAgICAgIDxkaXY+RXhhbXBsZTo8L2Rpdj5cbiAgICAgICAgPHRleHRhcmVhIHJlYWRvbmx5Pnt7ZXhhbXBsZX19PC90ZXh0YXJlYT5cbiAgICA8L2Rpdj5cbiAgICBgLFxuICAgIH0gKTtcblxuICAgIFZ1ZS5jb21wb25lbnQoICdTcGFjZXInLCB7IHRlbXBsYXRlOiBgXG4gICAgPGRpdiBjbGFzcz1cImZsZXgxXCI+PC9kaXY+XG4gICAgYCB9ICk7XG59XG4iLCAiLy8gUmVzb2x1dGlvbiBzaW11bGF0aW9uOiBkcmFnLXJlc2l6ZXIgb3ZlcmxheSBhbmQgdGhlIHByZXNldC1zaXplIHNlbGVjdG9yIHBvcHVwLlxuaW1wb3J0IHsgY29udGV4dCwgZXhlY0luR2FtZSB9IGZyb20gJy4vLi4vY29udGV4dCc7XG5cbmludGVyZmFjZSBTaXplUHJlc2V0IHtcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgLyoqIFtzaG9ydGVyRWRnZSwgbG9uZ2VyRWRnZV0gKi9cbiAgICBzOiBudW1iZXJbXTtcbiAgICAvKiogcHJvamVjdCBkZXNpZ24gcmVzb2x1dGlvbiBlbnRyeTogc2VsZWN0aW5nIGl0IHJlLWVuYWJsZXMgbWF0Y2hEZXNpZ24gKi9cbiAgICBkZXNpZ24/OiBib29sZWFuO1xuICAgIHBvcnRyYWl0PzogYm9vbGVhbjtcbn1cblxuY29uc3QgUFJFU0VUX1NJWkVTOiBTaXplUHJlc2V0W10gPSBbXG4gICAgeyBuYW1lOiAnaVBob25lIDQnLCBzOiBbIDMyMCwgNDgwIF0gfSxcbiAgICB7IG5hbWU6ICdpUGhvbmUgNScsIHM6IFsgMzIwLCA1NjggXSB9LFxuICAgIHsgbmFtZTogJ2lQaG9uZSA3JywgczogWyAzNzUsIDY2NyBdIH0sXG4gICAgeyBuYW1lOiAnaVBob25lIDcgUGx1cycsIHM6IFsgNDE0LCA3MzYgXSB9LFxuICAgIHsgbmFtZTogJ2lQaG9uZSBYJywgczogWyAzNzUsIDgxMiBdIH0sXG4gICAgeyBuYW1lOiAnaVBhZCcsIHM6IFsgNzY4LCAxMDI0IF0gfSxcbiAgICB7IG5hbWU6ICdIVyBQOScsIHM6IFsgNTQwLCA5NjAgXSB9LFxuICAgIHsgbmFtZTogJ0hXIE1hdGU5IFBybycsIHM6IFsgNzIwLCAxMjgwIF0gfSxcbl07XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlclJlc29sdXRpb25Db21wb25lbnRzKCk6IHZvaWQge1xuICAgIFZ1ZS5jb21wb25lbnQoICdSZXNvbHV0aW9uUmVzaXplcicsIHtcbiAgICAgICAgLy8gdG9wIG9mZnNldCBvZiB0aGUgZml4ZWQgb3ZlcmxheSAoYmVsb3cgdGhlIHRvb2xiYXIpOyB0aGUgZ2FtZSB2aWV3IHN0YXJ0cyBhdCAoMCwgUkVTSVpFUl9UT1ApXG4gICAgICAgIGRhdGEoKSB7XG4gICAgICAgICAgICByZXR1cm4geyBSRVNJWkVSX1RPUDogMzEgfTtcbiAgICAgICAgfSxcbiAgICAgICAgY29tcHV0ZWQ6IHtcbiAgICAgICAgICAgIC8vIHJlYWQgdGhlIGxpdmUgc2V0dGluZyB2YWx1ZXMgZGlyZWN0bHkgc28gdGhlIG92ZXJsYXkgKyBoYW5kbGUgdHJhY2sgdGhlIGN1cnNvclxuICAgICAgICAgICAgLy8gZHVyaW5nIGEgZHJhZyAoYSBsb2NhbCBjb3B5IG9ubHkgc3luY2VkIG9uIHNhdmUgd291bGQgbGFnIHVudGlsIG1vdXNldXApXG4gICAgICAgICAgICB3KCk6IG51bWJlciB7XG4gICAgICAgICAgICAgICAgY29uc3QgcyA9IGNvbnRleHQuc2V0dGluZ0FwcDtcbiAgICAgICAgICAgICAgICByZXR1cm4gcy5pc1BvcnRyYWl0ID8gcy5zaXplWyAwIF0gOiBzLnNpemVbIDEgXTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBoKCk6IG51bWJlciB7XG4gICAgICAgICAgICAgICAgY29uc3QgcyA9IGNvbnRleHQuc2V0dGluZ0FwcDtcbiAgICAgICAgICAgICAgICByZXR1cm4gcy5pc1BvcnRyYWl0ID8gcy5zaXplWyAxIF0gOiBzLnNpemVbIDAgXTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB3aFN0eWxlKCk6IHN0cmluZyB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGB3aWR0aDokeyB0aGlzLncgfXB4O2hlaWdodDokeyB0aGlzLmggfXB4O2A7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBtZXRob2RzOiB7XG4gICAgICAgICAgICAvKiogQXBwbGllcyBhIG5ldyBnYW1lLXZpZXcgc2l6ZSAocHgpIGxpdmUuIHNpemUgaXMgc3RvcmVkIGFzIFtzaG9ydGVyRWRnZSwgbG9uZ2VyRWRnZV0uICovXG4gICAgICAgICAgICBzZXRTaXplKCBzaXplOiBudW1iZXJbXSApIHtcbiAgICAgICAgICAgICAgICBpZiAoIHNpemVbIDAgXSA9PT0gMCB8fCBzaXplWyAxIF0gPT09IDAgKSByZXR1cm47XG4gICAgICAgICAgICAgICAgc2l6ZS5zb3J0KCAoIGEsIGIgKSA9PiBhIC0gYiApO1xuICAgICAgICAgICAgICAgIGlmICggc2l6ZS5qb2luKCAnLCcgKSA9PT0gY29udGV4dC5zZXR0aW5nQXBwLnNpemUuam9pbiggJywnICkgKSByZXR1cm47XG4gICAgICAgICAgICAgICAgLy8gcmVwbGFjZSB0aGUgYXJyYXkgKG5vdCBtdXRhdGUpIHNvIFZ1ZSByZWFjdGl2aXR5IGZpcmVzIGZvciBldmVyeSBkcmFnIHN0ZXBcbiAgICAgICAgICAgICAgICBjb250ZXh0LnNldHRpbmdBcHAuc2l6ZSA9IHNpemU7XG4gICAgICAgICAgICAgICAgY29udGV4dC5zZXR0aW5nQXBwLm1hdGNoRGVzaWduID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgZXhlY0luR2FtZSggJ19fcmVzaXplQ3ZuICYmIF9fcmVzaXplQ3ZuKCknICk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgLyoqIFN0YXJ0cyBhIGNvcm5lciBkcmFnLXJlc2l6ZSBvZiB0aGUgZ2FtZSB2aWV3LiAqL1xuICAgICAgICAgICAgc3RhcnRSZXNpemUoIGV2ZW50OiBNb3VzZUV2ZW50ICkge1xuICAgICAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgLy8gbGV0IHRoZSBkcmFnIG93biB0aGUgbW91c2U6IHN0b3AgdGhlIGdhbWUvZGV2dG9vbHMgd2Vidmlld3MgZnJvbSBzd2FsbG93aW5nIG1vdmVzXG4gICAgICAgICAgICAgICAgY29udGV4dC53diEuc3R5bGUucG9pbnRlckV2ZW50cyA9ICdub25lJztcbiAgICAgICAgICAgICAgICBpZiAoIGNvbnRleHQuZHd2ICkgY29udGV4dC5kd3Yuc3R5bGUucG9pbnRlckV2ZW50cyA9ICdub25lJztcbiAgICAgICAgICAgICAgICB0aGlzLl9vbk1vdmUgPSAoIGU6IE1vdXNlRXZlbnQgKSA9PiB0aGlzLm9uUmVzaXplTW92ZSggZSApO1xuICAgICAgICAgICAgICAgIHRoaXMuX29uVXAgPSAoKSA9PiB0aGlzLmVuZFJlc2l6ZSgpO1xuICAgICAgICAgICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCAnbW91c2Vtb3ZlJywgdGhpcy5fb25Nb3ZlLCB0cnVlICk7XG4gICAgICAgICAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoICdtb3VzZXVwJywgdGhpcy5fb25VcCwgdHJ1ZSApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9uUmVzaXplTW92ZSggZXZlbnQ6IE1vdXNlRXZlbnQgKSB7XG4gICAgICAgICAgICAgICAgLy8gZ2FtZSB2aWV3IHNpemUgPSBkaXN0YW5jZSBmcm9tIHRoZSBmaXhlZCB0b3AtbGVmdCBjb3JuZXIgKDAsIFJFU0laRVJfVE9QKSB0byB0aGUgY3Vyc29yXG4gICAgICAgICAgICAgICAgY29uc3QgdyA9IE1hdGgubWF4KCA1MCwgTWF0aC5yb3VuZCggZXZlbnQuY2xpZW50WCApICk7XG4gICAgICAgICAgICAgICAgY29uc3QgaCA9IE1hdGgubWF4KCA1MCwgTWF0aC5yb3VuZCggZXZlbnQuY2xpZW50WSAtIHRoaXMuUkVTSVpFUl9UT1AgKSApO1xuICAgICAgICAgICAgICAgIGNvbnRleHQuc2V0dGluZ0FwcC5pc1BvcnRyYWl0ID0gdyA8IGg7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRTaXplKCBbIHcsIGggXSApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGVuZFJlc2l6ZSgpIHtcbiAgICAgICAgICAgICAgICBjb250ZXh0Lnd2IS5zdHlsZS5wb2ludGVyRXZlbnRzID0gJ3Vuc2V0JztcbiAgICAgICAgICAgICAgICBpZiAoIGNvbnRleHQuZHd2ICkgY29udGV4dC5kd3Yuc3R5bGUucG9pbnRlckV2ZW50cyA9ICd1bnNldCc7XG4gICAgICAgICAgICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoICdtb3VzZW1vdmUnLCB0aGlzLl9vbk1vdmUsIHRydWUgKTtcbiAgICAgICAgICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lciggJ21vdXNldXAnLCB0aGlzLl9vblVwLCB0cnVlICk7XG4gICAgICAgICAgICAgICAgY29udGV4dC5zZXR0aW5nQXBwLnNhdmVUb1N0b3JhZ2UoKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHRlbXBsYXRlOiBgXG4gICAgPGRpdiBjbGFzcz1cIlJlc29sdXRpb25SZXNpemVyXCIgOnN0eWxlPVwid2hTdHlsZVwiPlxuICAgICAgICA8ZGl2IGNsYXNzPVwicmVzaXplSGFuZGxlXCIgQG1vdXNlZG93bi5zdG9wLnByZXZlbnQ9XCJzdGFydFJlc2l6ZVwiIHRpdGxlPVwiZHJhZyB0byByZXNpemUgdGhlIGdhbWUgdmlld1wiPjwvZGl2PlxuICAgIDwvZGl2PlxuICAgIGAsXG4gICAgfSApO1xuXG4gICAgVnVlLmNvbXBvbmVudCggJ1Jlc29sdXRpb25TZWxlY3RvcicsIHtcbiAgICAgICAgZGF0YSgpIHtcbiAgICAgICAgICAgIGNvbnN0IGRlc2lnbiA9IHJlYWREZXNpZ25TaXplKCk7XG4gICAgICAgICAgICBjb25zdCBkZXNpZ25QcmVzZXQ6IFNpemVQcmVzZXRbXSA9IGRlc2lnblxuICAgICAgICAgICAgICAgID8gWyB7IG5hbWU6IGBEZXNpZ24gJHsgZGVzaWduWyAwIF0gfXgkeyBkZXNpZ25bIDEgXSB9YCwgczogWyBNYXRoLm1pbiggLi4uZGVzaWduICksIE1hdGgubWF4KCAuLi5kZXNpZ24gKSBdLCBwb3J0cmFpdDogZGVzaWduWyAxIF0gPiBkZXNpZ25bIDAgXSwgZGVzaWduOiB0cnVlIH0gXVxuICAgICAgICAgICAgICAgIDogW107XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHNpemVzOiBkZXNpZ25QcmVzZXQuY29uY2F0KCBQUkVTRVRfU0laRVMgKSxcbiAgICAgICAgICAgICAgICBzaG93Q3VzdG9tOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBjb3N0b21TaXplOiB7IG5hbWU6ICdjdXN0b20nLCBzOiBbIDY0MCwgOTYwIF0gfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0sXG4gICAgICAgIGNyZWF0ZWQoKSB7XG4gICAgICAgICAgICAvLyBsZWdhY3kgY29uZmlncyBzdG9yZWQgcmF3IGFycmF5cyBoZXJlOyBkcm9wIHRoZW1cbiAgICAgICAgICAgIGNvbnRleHQuc2V0dGluZ0FwcC5leHRyYVNpemVzID0gY29udGV4dC5zZXR0aW5nQXBwLmV4dHJhU2l6ZXMuZmlsdGVyKCAoIGVudHJ5OiB1bmtub3duICkgPT4gIUFycmF5LmlzQXJyYXkoIGVudHJ5ICkgKTtcbiAgICAgICAgfSxcbiAgICAgICAgbWV0aG9kczoge1xuICAgICAgICAgICAgaXNDdXJyU2l6ZSggc2l6ZTogbnVtYmVyW10gKTogYm9vbGVhbiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnRleHQuc2V0dGluZ0FwcC5zaXplLmpvaW4oICcsJyApID09PSBzaXplLmpvaW4oICcsJyApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHNldFNpemUoIHNpemU6IG51bWJlcltdLCBwcmVzZXQ/OiB7IGRlc2lnbj86IGJvb2xlYW47IHBvcnRyYWl0PzogYm9vbGVhbiB9ICkge1xuICAgICAgICAgICAgICAgIGNvbnRleHQuc2V0dGluZ0FwcC5zaXplID0gc2l6ZTtcbiAgICAgICAgICAgICAgICBjb250ZXh0LnNldHRpbmdBcHAubWF0Y2hEZXNpZ24gPSBCb29sZWFuKCBwcmVzZXQ/LmRlc2lnbiApO1xuICAgICAgICAgICAgICAgIGlmICggcHJlc2V0Py5kZXNpZ24gKSBjb250ZXh0LnNldHRpbmdBcHAuaXNQb3J0cmFpdCA9IEJvb2xlYW4oIHByZXNldC5wb3J0cmFpdCApO1xuICAgICAgICAgICAgICAgIGNvbnRleHQuc2V0dGluZ0FwcC5zYXZlVG9TdG9yYWdlKCk7XG4gICAgICAgICAgICAgICAgdGhpcy4kbmV4dFRpY2soKS50aGVuKCAoKSA9PiBleGVjSW5HYW1lKCAnc2V0VGltZW91dChfX3Jlc2l6ZUN2biwxMDApJyApICk7XG4gICAgICAgICAgICAgICAgY29udGV4dC52dWVBcHAuc2hvd1Jlc29sdXRpb25TZWxlY3RvciA9IGZhbHNlO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGFkZEN1c3RvbSgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzaXplID0gdGhpcy5jb3N0b21TaXplLnMuY29uY2F0KCk7XG4gICAgICAgICAgICAgICAgc2l6ZS5zb3J0KCAoIGE6IG51bWJlciwgYjogbnVtYmVyICkgPT4gYSAtIGIgKTtcbiAgICAgICAgICAgICAgICBjb250ZXh0LnNldHRpbmdBcHAuZXh0cmFTaXplcy5wdXNoKCB7IG5hbWU6IHRoaXMuY29zdG9tU2l6ZS5uYW1lLCBzOiBzaXplIH0gKTtcbiAgICAgICAgICAgICAgICBjb250ZXh0LnNldHRpbmdBcHAuc2F2ZVRvU3RvcmFnZSgpO1xuICAgICAgICAgICAgICAgIHRoaXMuc2hvd0N1c3RvbSA9IGZhbHNlO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGRlbFNpemUoIGluZGV4OiBudW1iZXIgKSB7XG4gICAgICAgICAgICAgICAgY29udGV4dC5zZXR0aW5nQXBwLmV4dHJhU2l6ZXMuc3BsaWNlKCBpbmRleCwgMSApO1xuICAgICAgICAgICAgICAgIGNvbnRleHQuc2V0dGluZ0FwcC5zYXZlVG9TdG9yYWdlKCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB0ZW1wbGF0ZTogYFxuICAgIDxkaXYgY2xhc3M9XCJSZXNvbHV0aW9uU2VsZWN0b3JcIj5cbiAgICAgICAgPGxhYmVsPlxuICAgICAgICAgICAgPGlucHV0IEBjaGFuZ2U9XCJzZXR0aW5nLnN5bmNQb3J0cmFpdFwiIHR5cGU9XCJjaGVja2JveFwiICB2LW1vZGVsPVwic2V0dGluZy5pc1BvcnRyYWl0XCIgLz5cbiAgICAgICAgICAgIGlzUG9ydHJhaXRcbiAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgPGhyPlxuXG4gICAgICAgIDxkaXYgQGNsaWNrPVwic2V0U2l6ZShzLnMsIHMpXCIgY2xhc3M9XCJyZXNvSXRlbVwiIHYtZm9yPVwicyBpbiBzaXplc1wiIDprZXk9XCJzXCIgPlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJzaXplTmFtZVwiPlxuICAgICAgICAgICAgICAgIHt7cy5uYW1lfX1cbiAgICAgICAgICAgICAgICA8c3BhY2VyIC8+XG4gICAgICAgICAgICAgICAge3tzLnMuam9pbihcIipcIil9fVxuICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJpY29uZm9udCBpY29uLXJpZ2h0XCIgdi1pZj1cImlzQ3VyclNpemUocy5zKVwiPjwvc3Bhbj5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiZmxleDFcIj48L3NwYW4+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8aHIgdi1pZj1cInNldHRpbmcuZXh0cmFTaXplcy5sZW5ndGg+MFwiPlxuICAgICAgICA8ZGl2IEBjbGljaz1cInNldFNpemUocy5zKVwiIGNsYXNzPVwicmVzb0l0ZW1cIiB2LWZvcj1cIihzLGkpIGluIHNldHRpbmcuZXh0cmFTaXplc1wiIDprZXk9XCJzXCIgPlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJzaXplTmFtZVwiPlxuICAgICAgICAgICAgICAgIHt7cy5uYW1lfX1cbiAgICAgICAgICAgICAgICA8c3BhY2VyIC8+XG4gICAgICAgICAgICAgICAge3tzLnMuam9pbihcIipcIil9fVxuICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJpY29uZm9udCBpY29uLXJpZ2h0XCIgdi1pZj1cImlzQ3VyclNpemUocy5zKVwiPjwvc3Bhbj5cbiAgICAgICAgICAgIDxhIEBjbGljay5zdG9wPVwiZGVsU2l6ZShpKVwiPjxzcGFuIGNsYXNzPVwiaWNvbmZvbnQgaWNvbi13cm9uZzJcIj48L3NwYW4+PC9hPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPGhyPlxuICAgICAgICA8YSB2LXNob3c9XCIhc2hvd0N1c3RvbVwiIEBjbGljay5zdG9wPVwic2hvd0N1c3RvbT10cnVlXCI+K0N1c3RvbTwvYT5cbiAgICAgICAgPGRpdiB2LXNob3c9XCJzaG93Q3VzdG9tXCIgc3R5bGU9XCJkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO1wiPlxuICAgICAgICAgICAgbmFtZTo8aW5wdXQgdHlwZT1cInRleHRcIiB2LW1vZGVsPVwiY29zdG9tU2l6ZS5uYW1lXCIgLz5cbiAgICAgICAgICAgIHdpZHRoOiA8aW5wdXQgdHlwZT1cIm51bWJlclwiIHYtbW9kZWwubnVtYmVyPVwiY29zdG9tU2l6ZS5zWzBdXCIgLz5cblxuICAgICAgICAgICAgaGVpZ2h0OjxpbnB1dCB0eXBlPVwibnVtYmVyXCIgdi1tb2RlbC5udW1iZXI9XCJjb3N0b21TaXplLnNbMV1cIiAvPlxuXG4gICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTpmbGV4XCI+XG4gICAgICAgICAgICAgICAgPGEgQGNsaWNrLnN0b3A9XCJhZGRDdXN0b20oKVwiPkNvbmZpcm08L2E+XG4gICAgICAgICAgICAgICAgPHNwYWNlciAvPlxuICAgICAgICAgICAgICAgIDxhIEBjbGljay5zdG9wPVwic2hvd0N1c3RvbT1mYWxzZVwiPkNhbmNlbDwvYT5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L2Rpdj5cbiAgICA8L2Rpdj5gLFxuICAgIH0gKTtcbn1cbiIsICIvLyBIZWxwIHBhbmVsIChiaWxpbmd1YWwpLiBFeHRlcm5hbCBsaW5rcyBub3cgZ28gdGhyb3VnaCBzaGVsbC5vcGVuRXh0ZXJuYWwgdmlhIGEgbWV0aG9kXG4vLyBpbnN0ZWFkIG9mIHRoZSBsZWdhY3kgZ2xvYmFsIGByZW1vdGVgLlxuaW1wb3J0IHsgZ2V0TG9jYWxlSXBjLCBvcGVuRXh0ZXJuYWwgfSBmcm9tICcuLy4uL2lwYyc7XG5cbmNvbnN0IFZJREVPX1BMVUdJTl9VUkwgPSAnaHR0cHM6Ly93d3cuYmlsaWJpbGkuY29tL3ZpZGVvL0JWMU5oNDExaDcyaCc7XG5jb25zdCBWSURFT19NQUNfVVJMID0gJ2h0dHBzOi8vd3d3LmJpbGliaWxpLmNvbS92aWRlby9CVjFLSzR5MVI3TDEnO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJIZWxwQ29tcG9uZW50KCk6IHZvaWQge1xuICAgIFZ1ZS5jb21wb25lbnQoICdNeUhlbHAnLCB7XG4gICAgICAgIGRhdGEoKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzaG93OiBmYWxzZSwgbGFuZzogJ2VuJyB9O1xuICAgICAgICB9LFxuICAgICAgICBjcmVhdGVkKCkge1xuICAgICAgICAgICAgZ2V0TG9jYWxlSXBjKCkudGhlbiggKCBsb2NhbGUgKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5sYW5nID0gbG9jYWxlID09PSAnemgtQ04nID8gJ2NuJyA6ICdlbic7XG4gICAgICAgICAgICB9ICk7XG4gICAgICAgIH0sXG4gICAgICAgIGNvbXB1dGVkOiB7XG4gICAgICAgICAgICBpc0NOKCk6IGJvb2xlYW4ge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmxhbmcgPT09ICdjbic7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBtZXRob2RzOiB7XG4gICAgICAgICAgICBvcGVuRXh0ZXJuYWwoIHVybDogc3RyaW5nICkge1xuICAgICAgICAgICAgICAgIG9wZW5FeHRlcm5hbCggdXJsICk7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB0ZW1wbGF0ZTogYFxuICAgIDxkaXYgY2xhc3M9XCJoZWxwUGFuZWwgc2V0dGluZ1wiIHYtc2hvdz1cInNob3dcIj5cbiAgICA8ZGl2IGNsYXNzPVwic2V0dGluZ0hlYWRlclwiPlxuICAgICAgICA8c3BhbiBjbGFzcz1cImljb25mb250IGljb24tc2hhbmNodVwiIEBjbGljaz1cInNob3c9ZmFsc2VcIiBzdHlsZT1cImZvbnQtc2l6ZTogMS41ZW07XCI+PC9zcGFuPlxuICAgICAgICA8ZGl2IGNsYXNzPVwic2V0dGluZ1RpdGxlXCIgdi1zaG93PVwiIWlzQ05cIj5IZWxwPC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJzZXR0aW5nVGl0bGVcIiB2LXNob3c9XCJpc0NOXCI+XHU1RTJFXHU1MkE5PC9kaXY+XG4gICAgICAgIDxhIEBjbGljaz1cImxhbmc9J2NuJ1wiIHYtc2hvdz1cIiFpc0NOXCI+Q2hpbmVzZTwvYT5cbiAgICAgICAgPGEgQGNsaWNrPVwibGFuZz0nZW4nXCIgdi1zaG93PVwiaXNDTlwiPkVuZ2xpc2g8L2E+XG4gICAgPC9kaXY+XG4gICAgPGRpdiB2LXNob3c9XCJsYW5nPT0nZW4nXCI+XG4gICAgICAgIDxoMT5EcmF3Q2FsbDwvaDE+XG4gICAgICAgIDx1bD5cbiAgICAgICAgICAgIDxsaT5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiaGVscFRpdGxlXCI+SG93IHRvIG9wZW48L2Rpdj5cbiAgICAgICAgICAgICAgICByaWdodCBjbGljayBzY2VuZSBuYW1lIFRhYlxuICAgICAgICAgICAgPC9saT5cbiAgICAgICAgICAgIDxsaT5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiaGVscFRpdGxlXCI+V2h5IG5vdCBhY2N1cmF0ZT88L2Rpdj5cbiAgICAgICAgICAgICAgICBudW1iZXIgKyBtayArIGdoICsgb3QgaXMgdG90YWwgZHJhd2NhbGwsIG5vdCBvbmx5IG51bWJlcjtcbiAgICAgICAgICAgICAgICA8YnI+XG4gICAgICAgICAgICAgICAgYW5kIG5vdyBpcyBiZXRhLCBvbmx5IGNhbGN1bGF0ZSBTcHJpdGUgYW5kIGxhYmVsLCBpbiBBdXRvQXRsYXMsIER5bmFtaWNBdGxhcyxTdGF0aWMgQXRsYXMuXG4gICAgICAgICAgICAgICAgPGJyPlxuICAgICAgICAgICAgICAgIFNoYWRlciBhbmQgTWF0ZXJpYWwgc3RpbGwgbm90IGNhbGN1bGF0ZTtcbiAgICAgICAgICAgIDwvbGk+XG4gICAgICAgICAgICA8bGk+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImhlbHBUaXRsZVwiPldoYXQncyB0aGUgbWVhbnMgb2Y6IG1rLCBnaCwgb3Q/PC9kaXY+XG4gICAgICAgICAgICAgICAgbWsgaXMgTWFzaywgZ2ggaXMgR3JhcGhpY3MsIG90IGlzIG90aGVyIFJlbmRlckNvbXBvbmVudHM7XG4gICAgICAgICAgICAgICAgPGJyPlxuICAgICAgICAgICAgICAgIHRoZXkgaGF2ZSBtYW55IGRpZmZlcmVudCBjYXNlcyBhYm91dCBEcmF3Q2FsbCwgc28gbm93IG9ubHkgbWFyayB0aGVtIGluIG5vZGUgVHJlZVxuICAgICAgICAgICAgPC9saT5cbiAgICAgICAgPC91bD5cbiAgICAgICAgPGhyPlxuICAgICAgICA8aDE+VmlkZW8gVHV0b3JpYWw8L2gxPlxuICAgICAgICA8dWw+XG4gICAgICAgICAgICA8bGk+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImhlbHBUaXRsZVwiPlBsdWdpbiBWZXJzaW9uPC9kaXY+XG4gICAgICAgICAgICAgICAgSW4gUmVjb3JkaW5nXG4gICAgICAgICAgICAgICAgPGEgQGNsaWNrPVwib3BlbkV4dGVybmFsKCckeyBWSURFT19QTFVHSU5fVVJMIH0nKVwiID4keyBWSURFT19QTFVHSU5fVVJMIH08L2E+XG4gICAgICAgICAgICA8L2xpPlxuICAgICAgICAgICAgPGxpPlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJoZWxwVGl0bGVcIj5NYWMgTmF0aXZlIFZlcnNpb248L2Rpdj5cbiAgICAgICAgICAgICAgICBub3Qgc2FtZSBhcyBQbHVnaW4gVmVyc2lvblxuICAgICAgICAgICAgICAgIDxhIEBjbGljaz1cIm9wZW5FeHRlcm5hbCgnJHsgVklERU9fTUFDX1VSTCB9JylcIiA+JHsgVklERU9fUExVR0lOX1VSTCB9PC9hPlxuICAgICAgICAgICAgPC9saT5cbiAgICAgICAgPC91bD5cbiAgICAgICAgPC9kaXY+XG4gICAgICAgIDxkaXYgdi1zaG93PVwibGFuZz09J2NuJ1wiPlxuICAgICAgICA8aDE+RHJhd0NhbGxcdTUyMDZcdTY3OTA8L2gxPlxuICAgICAgICA8dWw+XG4gICAgICAgICAgICA8bGk+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImhlbHBUaXRsZVwiPlx1NjAwRVx1NEU0OFx1NjI1M1x1NUYwMERyYXdDYWxsXHU1MjA2XHU2NzkwPC9kaXY+XG4gICAgICAgICAgICAgICAgXHU1NzI4XHU1NzNBXHU2NjZGXHU1NDBEXHU3OUYwXHU0RTBBXHU1M0YzXHU5NTJFXG4gICAgICAgICAgICA8L2xpPlxuICAgICAgICAgICAgPGxpPlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJoZWxwVGl0bGVcIj5cdTRFM0FcdTRFQzBcdTRFNDhcdTY3MDlcdTY1RjZcdTRFMERcdTU5MkFcdTUxQzZcdTc4NkU/PC9kaXY+XG4gICAgICAgICAgICAgICAgZHJhd2NhbGxcdTUzMDVcdTU0MkIgXHU2NTcwXHU1QjU3ICsgbWsgKyBnaCArIG90XHVGRjBDIFx1NEUwRFx1NEVDNVx1NEVDNVx1NjYyRlx1NjU3MFx1NUI1NztcbiAgICAgICAgICAgICAgICA8YnI+XG4gICAgICAgICAgICAgICAgXHU3NkVFXHU1MjREXHU0RUM1XHU4QkExXHU3Qjk3XHU0RTg2U3ByaXRlXHU1NDhDTGFiZWwoXHU1MzA1XHU1NDJCXHU4MUVBXHU1MkE4XHU1NkZFXHU5NkM2XHVGRjBDXHU1MkE4XHU2MDAxXHU1NkZFXHU5NkM2XHVGRjBDXHU5NzU5XHU2MDAxXHU1NkZFXHU5NkM2XHU3QjQ5XHU1NkUwXHU3RDIwKVxuICAgICAgICAgICAgICAgIDxicj5cbiAgICAgICAgICAgICAgICBTaGFkZXJcdUZGMENNZXRlcmlhbFx1NEVBN1x1NzUxRlx1NzY4NERyYXdDYWxsXHU2NjgyXHU2NUY2XHU1RTc2XHU2NzJBXHU1MzA1XHU1NDJCXG4gICAgICAgICAgICA8L2xpPlxuICAgICAgICAgICAgPGxpPlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJoZWxwVGl0bGVcIj5taywgZ2gsIG90XHU2NjJGXHU0RUMwXHU0RTQ4XHU2MTBGXHU2MDFEPzwvZGl2PlxuICAgICAgICAgICAgICAgIG1rIFx1NjYyRiBNYXNrLCBnaCBcdTY2MkYgR3JhcGhpY3MsIG90IGlzIFx1NTE3Nlx1NEVENlx1NkUzMlx1NjdEM1x1N0VDNFx1NEVGNjtcbiAgICAgICAgICAgICAgICA8YnI+XG4gICAgICAgICAgICAgICAgXHU0RUQ2XHU0RUVDXHU2NzA5XHU1Rjg4XHU1OTFBXHU1NkUwXHU3RDIwXHU2NzY1XHU1RjcxXHU1NENERHJhd0NhbGxcdUZGMENcdTY2ODJcdTY1RjZcdTRFMERcdTY1QjlcdTRGQkZcdThCQTFcdTdCOTdcdUZGMENcdTYyNDBcdTRFRTVcdTczQjBcdTU3MjhcdTRFQzVcdTRFQzVcdTU3MjhcdTgyODJcdTcwQjlcdTY4MTFcdTY4MDdcdThCQjBcdTUxRkFcdTY3NjVcdUZGMENcdTY1QjlcdTRGQkZcdTc3RTVcdTkwNTNcdTVGNzFcdTU0Q0REcmF3Q2FsbFx1NzY4NFx1NTNFRlx1ODBGRFx1NTZFMFx1N0QyMFxuICAgICAgICAgICAgPC9saT5cbiAgICAgICAgPC91bD5cbiAgICAgICAgPGhyPlxuICAgICAgICA8aDE+RkdVSVx1NjUyRlx1NjMwMTwvaDE+XG4gICAgICAgIDx1bD5cbiAgICAgICAgICAgIDxsaT5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiaGVscFRpdGxlXCI+XHU0RTNBXHU0RUMwXHU0RTQ4XHU4MjgyXHU3MEI5XHU2Q0ExXHU2NzA5XHU2NjNFXHU3OTNBXHU2MjEwRkdVSVx1N0VEM1x1Njc4NDwvZGl2PlxuICAgICAgICAgICAgICAgIFx1OTk5Nlx1NTE0OFx1ODk4MVx1NTcyOFx1OEJCRVx1N0Y2RVx1NUYwMFx1NTQyRmZhaXJ5R1VJXHVGRjBDXHU1MTc2XHU2QjIxXHVGRjBDY2NjMy54XHU3MjQ4XHU2NzJDXHU4OTgxXHU0RkREXHU4QkMxd2luZG93W1wiZmd1aVwiXVx1NTNFRlx1NEVFNVx1OEJCRlx1OTVFRVxuICAgICAgICAgICAgPC9saT5cbiAgICAgICAgPC91bD5cbiAgICAgICAgPGhyPlxuICAgICAgICA8aDE+XHU4OUM2XHU5ODkxXHU2NTU5XHU3QTBCPC9oMT5cbiAgICAgICAgPHVsPlxuICAgICAgICAgICAgPGxpPlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJoZWxwVGl0bGVcIj5cdTYzRDJcdTRFRjZcdTcyNDg8L2Rpdj5cbiAgICAgICAgICAgICAgICBcdTVGNTVcdTUyMzZcdTRFMkQuLi5cbiAgICAgICAgICAgICAgICA8YSBAY2xpY2s9XCJvcGVuRXh0ZXJuYWwoJyR7IFZJREVPX1BMVUdJTl9VUkwgfScpXCIgPiR7IFZJREVPX1BMVUdJTl9VUkwgfTwvYT5cbiAgICAgICAgICAgIDwvbGk+XG4gICAgICAgICAgICA8bGk+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImhlbHBUaXRsZVwiPk1hY1x1NTM5Rlx1NzUxRlx1NzI0OFx1NjcyQzwvZGl2PlxuICAgICAgICAgICAgICAgIFx1OERERlx1NjNEMlx1NEVGNlx1NzI0OFx1NEUwRFx1NEUwMFx1NjgzN1x1RkYwQ1x1NEVDNVx1NEY5Qlx1NTNDMlx1ODAwM1xuICAgICAgICAgICAgICAgIDxhIEBjbGljaz1cIm9wZW5FeHRlcm5hbCgnJHsgVklERU9fTUFDX1VSTCB9JylcIiA+JHsgVklERU9fUExVR0lOX1VSTCB9PC9hPlxuICAgICAgICAgICAgPC9saT5cbiAgICAgICAgPC91bD5cbiAgICAgICAgPC9kaXY+XG4gICAgPC9kaXY+XG4gICAgYCxcbiAgICB9ICk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUVBLE1BQUFBLE1BQW9CO0FBQ3BCLE1BQUFDLFFBQXNCOzs7QUNDZixNQUFNLFdBQVc7QUFXakIsTUFBTSxVQUFVO0FBQUEsSUFDbkIsV0FBVyxHQUFJLFFBQVM7QUFBQSxJQUN4QixZQUFZLEdBQUksUUFBUztBQUFBLEVBQzdCO0FBR08sTUFBTSxZQUFZO0FBQUEsSUFDckIsY0FBYyxHQUFJLFFBQVM7QUFBQSxJQUMzQixlQUFlLEdBQUksUUFBUztBQUFBLElBQzVCLFVBQVUsR0FBSSxRQUFTO0FBQUEsSUFDdkIsZ0JBQWdCLEdBQUksUUFBUztBQUFBLElBQzdCLFdBQVcsR0FBSSxRQUFTO0FBQUEsSUFDeEIsZ0JBQWdCLEdBQUksUUFBUztBQUFBLElBQzdCLGlCQUFpQixHQUFJLFFBQVM7QUFBQSxFQUNsQztBQUdPLE1BQU0sV0FBVztBQUFBLElBQ3BCLGdCQUFnQixHQUFJLFFBQVM7QUFBQSxJQUM3QixhQUFhLEdBQUksUUFBUztBQUFBLEVBQzlCO0FBc0JPLE1BQU0sY0FBYztBQUFBLElBQ3ZCLFdBQVc7QUFBQSxJQUNYLFlBQVk7QUFBQSxJQUNaLFlBQVk7QUFBQSxJQUNaLGNBQWM7QUFBQSxJQUNkLGFBQWE7QUFBQSxJQUNiLFlBQVk7QUFBQSxJQUNaLGdCQUFnQjtBQUFBLElBQ2hCLGVBQWU7QUFBQSxJQUNmLGVBQWU7QUFBQSxFQUNuQjs7O0FDOURPLE1BQU0sVUFBVTtBQUFBO0FBQUEsSUFFbkIsSUFBSTtBQUFBO0FBQUEsSUFFSixLQUFLO0FBQUE7QUFBQSxJQUVMLFFBQVE7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QUFBLE1BQ0EsVUFBVTtBQUNOLFlBQUssQ0FBQyxLQUFLLGVBQWUsRUFBSSxTQUFRLEdBQUksb0JBQW9CO0FBQzlELGFBQUssVUFBVTtBQUFBLE1BQ25CO0FBQUEsTUFDQSxZQUFZO0FBQ1IsYUFBSyxXQUFXO0FBQ2hCLGFBQUssZUFBZTtBQUNwQixhQUFLLGFBQWE7QUFDbEIsWUFBSyxRQUFRLHFCQUF1QixNQUFLLE9BQU8sQ0FBQztBQUNqRCxhQUFLLFVBQVUsTUFBTTtBQUNyQixtREFBYTtBQUFBLE1BQ2pCO0FBQUEsTUFDQSxZQUFZO0FBQ1IsbUJBQVksZUFBZ0I7QUFBQSxNQUNoQztBQUFBLE1BQ0EsbUJBQW1CO0FBQ2YsYUFBSyxhQUFhLENBQUMsS0FBSztBQUN4QixtQkFBWSxzQkFBdUIsS0FBSyxVQUFXLEdBQUk7QUFBQSxNQUMzRDtBQUFBLE1BQ0EsY0FBYztBQUNWLGFBQUssUUFBUSxLQUFLLFNBQVMsSUFBSSxJQUFJO0FBQ25DLG1CQUFZLGNBQWUsS0FBSyxLQUFNLEdBQUk7QUFBQSxNQUM5QztBQUFBLE1BQ0EsZ0JBQWdCO0FBQ1osYUFBSyxRQUFRLEtBQUssU0FBUyxJQUFJLElBQUk7QUFDbkMsbUJBQVksY0FBZSxLQUFLLEtBQU0sR0FBSTtBQUFBLE1BQzlDO0FBQUEsTUFDQSxVQUFVO0FBQ04sYUFBSyxTQUFTLG9CQUFJLEtBQUssR0FBRSxtQkFBbUIsR0FBRyxZQUFZLFlBQVksZ0JBQWlCO0FBQ3hGLG1CQUFZLGVBQWdCO0FBQUEsTUFDaEM7QUFBQSxNQUNBLGdCQUFnQjtBQUNaLGdCQUFRLEdBQUksYUFBYTtBQUFBLE1BQzdCO0FBQUEsTUFDQSxjQUFjO0FBQ1YsZ0JBQVEsT0FBTztBQUFBLE1BQ25CO0FBQUEsTUFDQSxXQUFXO0FBQ1AsVUFBRSxNQUFNLEtBQUssT0FBTztBQUFBLE1BQ3hCO0FBQUEsTUFDQSxrQkFBa0I7QUFDZCxhQUFLLGVBQWUsQ0FBQyxLQUFLO0FBQzFCLG1CQUFZLG9CQUFxQixLQUFLLFlBQWEsR0FBSTtBQUFBLE1BQzNEO0FBQUEsSUFDSjtBQUFBLEVBQ0osQ0FBRTsiLAogICJuYW1lcyI6IFsiZnMiLCAicGF0aCIsICJpbXBvcnRfZWxlY3Ryb24iLCAic2V0dGluZyIsICJ2IiwgInNldHRpbmciLCAidiIsICJzZXR0aW5nIiwgIm5hbWUiLCAidXVpZFBhdGgiLCAidiIsICJzZXR0aW5nIiwgInYiLCAiZnMiLCAidiIsICJ0eXBlIl0KfQo=
