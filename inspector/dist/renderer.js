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
          page = this.mode == 1 ? "build/web-mobile/index.html" : "build/web-desktop/index.html";
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL3JlbmRlcmVyL2FwcC50cyIsICIuLi9zcmMvc2hhcmVkL3Byb3RvY29sLnRzIiwgIi4uL3NyYy9yZW5kZXJlci9jb250ZXh0LnRzIiwgIi4uL3NyYy9yZW5kZXJlci9pcGMudHMiLCAiLi4vc3JjL3JlbmRlcmVyL21lbnVzLnRzIiwgIi4uL3NyYy9yZW5kZXJlci9zZXR0aW5nLnRzIiwgIi4uL3NyYy9yZW5kZXJlci9jb21wb25lbnRzL25vZGUtZGV0YWlsLnRzIiwgIi4uL3NyYy9yZW5kZXJlci9jb21wb25lbnRzL25vZGUtdHJlZS50cyIsICIuLi9zcmMvcmVuZGVyZXIvY29tcG9uZW50cy9jb25zb2xlLXBhbmVsLnRzIiwgIi4uL3NyYy9yZW5kZXJlci9jb21wb25lbnRzL2NvY29zLXBhbmVsLnRzIiwgIi4uL3NyYy9yZW5kZXJlci9jb21wb25lbnRzL3BhbmVscy50cyIsICIuLi9zcmMvcmVuZGVyZXIvY29tcG9uZW50cy9yZXNvbHV0aW9uLnRzIiwgIi4uL3NyYy9yZW5kZXJlci9jb21wb25lbnRzL2hlbHAudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIEluc3BlY3RvciByZW5kZXJlciBlbnRyeSBwb2ludDogcmVnaXN0ZXJzIGNvbXBvbmVudHMsIGNyZWF0ZXMgdGhlIHNldHRpbmcgKyBtYWluIFZ1ZVxuLy8gaW5zdGFuY2VzLCB3aXJlcyB0aGUgZ2FtZSB3ZWJ2aWV3IGFuZCB0aGUgaW4tdGFiIERldlRvb2xzLlxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IEhvc3RDaGFubmVsIH0gZnJvbSAnQHNoYXJlZC9wcm90b2NvbCc7XG5pbXBvcnQgeyBjb250ZXh0LCBleGVjSW5HYW1lIH0gZnJvbSAnLi9jb250ZXh0JztcbmltcG9ydCB7IHdpcmVEZXZ0b29sc0lwYywgc2V0QXVkaW9NdXRlZElwYywgb25EZWJ1Z2dlclBhdXNlZCB9IGZyb20gJy4vaXBjJztcbmltcG9ydCB7IHNob3dBcHBNZW51LCBzaG93VHJlZU1lbnUgfSBmcm9tICcuL21lbnVzJztcbmltcG9ydCB7IGNyZWF0ZVNldHRpbmdBcHAgfSBmcm9tICcuL3NldHRpbmcnO1xuaW1wb3J0IHsgcmVnaXN0ZXJOb2RlRGV0YWlsQ29tcG9uZW50cyB9IGZyb20gJy4vY29tcG9uZW50cy9ub2RlLWRldGFpbCc7XG5pbXBvcnQgeyByZWdpc3Rlck5vZGVUcmVlQ29tcG9uZW50cyB9IGZyb20gJy4vY29tcG9uZW50cy9ub2RlLXRyZWUnO1xuaW1wb3J0IHsgcmVnaXN0ZXJDb25zb2xlUGFuZWwgfSBmcm9tICcuL2NvbXBvbmVudHMvY29uc29sZS1wYW5lbCc7XG5pbXBvcnQgeyByZWdpc3RlckNvY29zUGFuZWxzIH0gZnJvbSAnLi9jb21wb25lbnRzL2NvY29zLXBhbmVsJztcbmltcG9ydCB7IHJlZ2lzdGVyUGFuZWxzIH0gZnJvbSAnLi9jb21wb25lbnRzL3BhbmVscyc7XG5pbXBvcnQgeyByZWdpc3RlclJlc29sdXRpb25Db21wb25lbnRzIH0gZnJvbSAnLi9jb21wb25lbnRzL3Jlc29sdXRpb24nO1xuaW1wb3J0IHsgcmVnaXN0ZXJIZWxwQ29tcG9uZW50IH0gZnJvbSAnLi9jb21wb25lbnRzL2hlbHAnO1xuXG5jb25zdCBpbmplY3RlZFNvdXJjZSA9IGZzLnJlYWRGaWxlU3luYyggcGF0aC5qb2luKCBfX2Rpcm5hbWUsICdkaXN0L2luamVjdGVkLmpzJyApLCB7IGVuY29kaW5nOiAndXRmLTgnIH0gKTtcblxucmVnaXN0ZXJOb2RlRGV0YWlsQ29tcG9uZW50cygpO1xucmVnaXN0ZXJOb2RlVHJlZUNvbXBvbmVudHMoKTtcbnJlZ2lzdGVyQ29uc29sZVBhbmVsKCk7XG5yZWdpc3RlckNvY29zUGFuZWxzKCk7XG5yZWdpc3RlclBhbmVscygpO1xucmVnaXN0ZXJSZXNvbHV0aW9uQ29tcG9uZW50cygpO1xucmVnaXN0ZXJIZWxwQ29tcG9uZW50KCk7XG5cbmNvbnN0IHNldHRpbmcgPSBjcmVhdGVTZXR0aW5nQXBwKCk7XG5cbi8vIHN0YWdpbmcgYnVmZmVycyBmbHVzaGVkIG9uY2UgcGVyIGFuaW1hdGlvbiBmcmFtZSAoaGlnaC1mcmVxdWVuY3kgdXBkYXRlcyBmcm9tIHRoZSBnYW1lKVxubGV0IHRlbXBOb2RlVHJlZTogdW5rbm93biA9IG51bGw7XG5sZXQgbGFzdE5vZGVTZXQ6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpO1xuY29uc3QgdGVtcExvZ3M6IEFycmF5PHsgdGltZTogc3RyaW5nOyB0OiBzdHJpbmc7IGQ6IHN0cmluZyB9PiA9IFtdO1xuXG5vbkRlYnVnZ2VyUGF1c2VkKCAoKSA9PiB7XG4gICAgaWYgKCBjb250ZXh0LnZ1ZUFwcCApIGNvbnRleHQudnVlQXBwLnRhYiA9IDE7XG59ICk7XG5cbi8qKlxuICogSWRlbXBvdGVudCBEZXZUb29scy1pbi10YWIgd2lyaW5nIChydW5zIGluIHRoZSBleHRlbnNpb24gbWFpbiBwcm9jZXNzIHZpYSBJUEMpLlxuICogVHJpZ2dlcmVkIG9uIGdhbWUtd2VidmlldyBsb2FkIEFORCB3aGVuIHRoZSBEZXZUb29sIHRhYiBpcyBvcGVuZWQsIHNvIGVuYWJsaW5nXG4gKiBcIlNob3cgRGV2VG9vbCBJbiBUYWJcIiBkb2VzIG5vdCByZXF1aXJlIGFuIGluc3BlY3RvciByZXN0YXJ0LlxuICovXG5mdW5jdGlvbiB3aXJlRGV2dG9vbHNJblRhYigpOiB2b2lkIHtcbiAgICBjb25zdCB2ID0gY29udGV4dC52dWVBcHA7XG4gICAgaWYgKCAhY29udGV4dC53diB8fCAhdiB8fCAhc2V0dGluZy5zaG93RGV2VG9vbEluVGFiICkgcmV0dXJuO1xuICAgIGNvbnN0IGRldnRvb2xzVmlldyA9IHYuJHJlZnMuZGV2dG9vbHMgYXMgSFRNTFdlYlZpZXdFbGVtZW50IHwgdW5kZWZpbmVkO1xuICAgIGlmICggIWRldnRvb2xzVmlldyApIHJldHVybjtcbiAgICBjb250ZXh0LmR3diA9IGRldnRvb2xzVmlldztcbiAgICBsZXQgZ2FtZUlkOiBudW1iZXI7XG4gICAgbGV0IGRldnRvb2xzSWQ6IG51bWJlcjtcbiAgICB0cnkge1xuICAgICAgICBnYW1lSWQgPSBjb250ZXh0Lnd2LmdldFdlYkNvbnRlbnRzSWQoKTtcbiAgICAgICAgZGV2dG9vbHNJZCA9IGRldnRvb2xzVmlldy5nZXRXZWJDb250ZW50c0lkKCk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybjsgLy8gd2VidmlldyBub3QgYXR0YWNoZWQgeWV0XG4gICAgfVxuICAgIHdpcmVEZXZ0b29sc0lwYyggZ2FtZUlkLCBkZXZ0b29sc0lkICkudGhlbiggKCByZXN1bHQgKSA9PiB7XG4gICAgICAgIGlmICggcmVzdWx0Py5lcnJvciA9PT0gJ2dhbWUgcGFnZSBub3QgbG9hZGVkIHlldCcgKSByZXR1cm47XG4gICAgICAgIGlmICggIXJlc3VsdD8ub2sgKSB7XG4gICAgICAgICAgICBjb25zdCBtZXNzYWdlID0gYFtpbnNwZWN0b3JdIGRldnRvb2xzIHdpcmluZyBmYWlsZWQ6ICR7IHJlc3VsdD8uZXJyb3IgfWA7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCBtZXNzYWdlICk7XG4gICAgICAgICAgICB2LnB1c2hMb2coIG5ldyBEYXRlKCkudG9Mb2NhbGVUaW1lU3RyaW5nKCksIEhvc3RDaGFubmVsLmNvbnNvbGVFcnJvciwgbWVzc2FnZSApO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmICggdHlwZW9mIHJlc3VsdC5tdXRlZCA9PT0gJ2Jvb2xlYW4nICkgdi5pc011dGVkID0gcmVzdWx0Lm11dGVkO1xuICAgIH0gKS5jYXRjaCggKCBlcnJvcjogRXJyb3IgKSA9PiB7XG4gICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBgW2luc3BlY3Rvcl0gZGV2dG9vbHMgd2lyaW5nIGZhaWxlZCAoaXMgbWFpbi5qcyB1cGRhdGVkPyByZXN0YXJ0IENvY29zQ3JlYXRvcik6ICR7IGVycm9yLm1lc3NhZ2UgfWA7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoIG1lc3NhZ2UgKTtcbiAgICAgICAgdi5wdXNoTG9nKCBuZXcgRGF0ZSgpLnRvTG9jYWxlVGltZVN0cmluZygpLCBIb3N0Q2hhbm5lbC5jb25zb2xlRXJyb3IsIG1lc3NhZ2UgKTtcbiAgICB9ICk7XG59XG5cbmNvbnN0IHYgPSBuZXcgVnVlKCB7XG4gICAgZWw6ICcjYXBwJyxcbiAgICBtb3VudGVkKCkge1xuICAgICAgICB0aGlzLiR3YXRjaCggJ3RhYicsICggdGFiOiBudW1iZXIgKSA9PiB7XG4gICAgICAgICAgICBpZiAoIHRhYiA9PT0gMSApIHdpcmVEZXZ0b29sc0luVGFiKCk7XG4gICAgICAgIH0gKTtcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lciggJ2tleWRvd24nLCAoIGV2ZW50OiBLZXlib2FyZEV2ZW50ICkgPT4ge1xuICAgICAgICAgICAgaWYgKCAoIGV2ZW50LmtleSA9PT0gJ0VzY2FwZScgfHwgZXZlbnQua2V5Q29kZSA9PT0gMjcgKSAmJiB0aGlzLnNob3dSZXNvbHV0aW9uU2VsZWN0b3IgKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zaG93UmVzb2x1dGlvblNlbGVjdG9yID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gKTtcbiAgICAgICAgY29uc3Qgd3YgPSB0aGlzLiRyZWZzLnd2IGFzIEhUTUxXZWJWaWV3RWxlbWVudDtcbiAgICAgICAgY29udGV4dC53diA9IHd2O1xuICAgICAgICAvLyB3aXJlIGFzIGVhcmx5IGFzIHBvc3NpYmxlIHNvIERldlRvb2xzIGNhdGNoZXMgdGhlIGdhbWUncyBib290LXRpbWUgY29uc29sZSBvdXRwdXRcbiAgICAgICAgd3YuYWRkRXZlbnRMaXN0ZW5lciggJ2RpZC1zdGFydC1sb2FkaW5nJywgKCkgPT4gc2V0VGltZW91dCggd2lyZURldnRvb2xzSW5UYWIsIDIwMCApICk7XG4gICAgICAgIHd2LmFkZEV2ZW50TGlzdGVuZXIoICdkb20tcmVhZHknLCAoKSA9PiB7XG4gICAgICAgICAgICBleGVjSW5HYW1lKCBgdmFyIF9fbG9nQ291bnQ9JHsgc2V0dGluZy5sb2dDb3VudCB9O3ZhciBfX3Nob3dEZXZUb29sSW5UYWI9JHsgc2V0dGluZy5zaG93RGV2VG9vbEluVGFiIH1gICk7XG4gICAgICAgICAgICBleGVjSW5HYW1lKCBpbmplY3RlZFNvdXJjZSApO1xuICAgICAgICAgICAgc2V0dGluZy5pbml0TXYoIHtcbiAgICAgICAgICAgICAgICBfX2xvY2tEcmFnTm9kZTogdGhpcy5sb2NrTm9kZSxcbiAgICAgICAgICAgICAgICBfX2hvdmVyOiB0aGlzLmhvdmVyLFxuICAgICAgICAgICAgICAgIF9fZGVzaWduTW9kZTogdGhpcy5kZXNpZ25Nb2RlLFxuICAgICAgICAgICAgfSApO1xuICAgICAgICAgICAgd2lyZURldnRvb2xzSW5UYWIoKTtcbiAgICAgICAgfSApO1xuICAgICAgICB3di5hZGRFdmVudExpc3RlbmVyKCAnZGlkLWZpbmlzaC1sb2FkJywgKCkgPT4gdi5jbGVhclRyZWUoKSApO1xuICAgICAgICB3di5hZGRFdmVudExpc3RlbmVyKCAnaXBjLW1lc3NhZ2UnLCAoIGV2ZW50OiB7IGNoYW5uZWw6IHN0cmluZzsgYXJnczogdW5rbm93bltdIH0gKSA9PiB7XG4gICAgICAgICAgICBjb25zdCB7IGFyZ3MsIGNoYW5uZWwgfSA9IGV2ZW50O1xuICAgICAgICAgICAgc3dpdGNoICggY2hhbm5lbCApIHtcbiAgICAgICAgICAgICAgICBjYXNlIEhvc3RDaGFubmVsLmdhbWVTdGF0ZTpcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5nYW1lUGF1c2VkID0gYXJnc1sgMCBdO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIEhvc3RDaGFubmVsLmxvY2F0ZU5vZGU6XG4gICAgICAgICAgICAgICAgICAgIGlmICggc2V0dGluZy5zaW1wbGVNb2RlICkgc2V0dGluZy50b2dnbGVTaW1wbGVNb2RlKCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubG9jYXRlTm9kZSggYXJnc1sgMCBdICk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgSG9zdENoYW5uZWwuY29uc29sZUxvZzpcbiAgICAgICAgICAgICAgICBjYXNlIEhvc3RDaGFubmVsLmNvbnNvbGVFcnJvcjpcbiAgICAgICAgICAgICAgICBjYXNlIEhvc3RDaGFubmVsLmNvbnNvbGVXYXJuOlxuICAgICAgICAgICAgICAgICAgICB0aGlzLnB1c2hMb2coIG5ldyBEYXRlKCkudG9Mb2NhbGVUaW1lU3RyaW5nKCksIGNoYW5uZWwsIGFyZ3NbIDAgXSApO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIEhvc3RDaGFubmVsLmNhblVwZGF0ZVRyZWU6XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2FuVXBkYXRlVHJlZSA9IGFyZ3NbIDAgXTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSBIb3N0Q2hhbm5lbC51cGRhdGVUcmVlOlxuICAgICAgICAgICAgICAgICAgICB0ZW1wTm9kZVRyZWUgPSBhcmdzWyAwIF07XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudHJlZVVwZGF0ZSA9IDA7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgSG9zdENoYW5uZWwuc2VuZFN0YXRpc3RpYzpcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zdGF0aXN0aWNzID0gYXJnc1sgMCBdO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIEhvc3RDaGFubmVsLnNob3dOb2RlRGV0YWlsOlxuICAgICAgICAgICAgICAgICAgICBpZiAoIHRoaXMubm9kZURldGFpbCApIE9iamVjdC5hc3NpZ24oIHRoaXMubm9kZURldGFpbCwgYXJnc1sgMCBdICk7XG4gICAgICAgICAgICAgICAgICAgIGVsc2UgdGhpcy5ub2RlRGV0YWlsID0gYXJnc1sgMCBdO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSApO1xuICAgIH0sXG4gICAgZGF0YToge1xuICAgICAgICB0cmVlVXBkYXRlOiAwLFxuICAgICAgICBsb2dVcGRhdGU6IDAsXG4gICAgICAgIGdhbWVQYXVzZWQ6IGZhbHNlLFxuICAgICAgICBjYW5VcGRhdGVUcmVlOiBmYWxzZSxcbiAgICAgICAgbG9nczogW10sXG4gICAgICAgIG5vZGVUcmVlOiBudWxsLFxuICAgICAgICBvcGVuTm9kZXM6IG5ldyBTZXQoKSxcbiAgICAgICAgc2VsZWN0ZWROb2RlOiAnJyxcbiAgICAgICAgbmVlZFNjcm9sbE9uZVRpbWU6IGZhbHNlLFxuICAgICAgICBub2RlRGV0YWlsOiBudWxsLFxuICAgICAgICBwb3J0OiBudWxsLFxuICAgICAgICBzaG93UmVzb2x1dGlvblNlbGVjdG9yOiBmYWxzZSxcbiAgICAgICAgZGVzaWduTW9kZTogZmFsc2UsXG4gICAgICAgIHRhYjogMCxcbiAgICAgICAgbW9kZTogMCxcbiAgICAgICAgdXJsUGFyYW1zOiAnJyxcbiAgICAgICAgaG92ZXI6IDAsXG4gICAgICAgIGhpZGUzZFJvb3ROb2RlOiBmYWxzZSxcbiAgICAgICAgZHJhZ2luZ1NOOiBudWxsLFxuICAgICAgICBkcmFnaW5nRU46IG51bGwsXG4gICAgICAgIGxvY2tOb2RlOiBudWxsLFxuICAgICAgICBpc011dGVkOiBmYWxzZSxcbiAgICAgICAgc2hvd0NoaWxkcmVuQ291bnQ6IGZhbHNlLFxuICAgICAgICAvLyBzdGF0aXN0aWMgZmVhdHVyZSBzdGF0ZSBsaXZlZCBoYWxmIG9uIGBzZXR0aW5nYCB1cHN0cmVhbTsgY29uc29saWRhdGVkIG9uIGB2YFxuICAgICAgICBzdGF0aXN0aWNzOiBudWxsLFxuICAgICAgICBzdGF0aXN0aWNpbmc6IGZhbHNlLFxuICAgIH0sXG4gICAgY29tcHV0ZWQ6IHtcbiAgICAgICAgc2hvd0RldlRvb2xJblRhYigpOiBib29sZWFuIHtcbiAgICAgICAgICAgIHJldHVybiBzZXR0aW5nLnNob3dEZXZUb29sSW5UYWI7XG4gICAgICAgIH0sXG4gICAgICAgIGRlc2lnbkJ0blN0eWxlKCk6IHN0cmluZyB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5kZXNpZ25Nb2RlID8gJ3Bvc2l0aW9uOnJlbGF0aXZlO2NvbG9yOnJnYig1MiwgMTQ2LCAyMzUpOycgOiAncG9zaXRpb246cmVsYXRpdmU7JztcbiAgICAgICAgfSxcbiAgICAgICAgaG92ZXJCdG5TdHlsZSgpOiBzdHJpbmcge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaG92ZXIgPyAncG9zaXRpb246cmVsYXRpdmU7Y29sb3I6cmdiKDUyLCAxNDYsIDIzNSk7JyA6ICdwb3NpdGlvbjpyZWxhdGl2ZTsnO1xuICAgICAgICB9LFxuICAgICAgICByZXNvbHV0aW9uQnRuU3R5bGUoKTogc3RyaW5nIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNob3dSZXNvbHV0aW9uU2VsZWN0b3IgPyAnY29sb3I6cmdiKDUyLCAxNDYsIDIzNSk7JyA6ICcnO1xuICAgICAgICB9LFxuICAgICAgICBob3Zlck1hcmsoKTogc3RyaW5nIHtcbiAgICAgICAgICAgIHN3aXRjaCAoIHRoaXMuaG92ZXIgKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAxOiByZXR1cm4gJzJEJztcbiAgICAgICAgICAgICAgICBjYXNlIDI6IHJldHVybiAnM0QnO1xuICAgICAgICAgICAgICAgIGRlZmF1bHQ6IHJldHVybiAnJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgZGlzYWJsZVdlYlNlYygpOiBib29sZWFuIHtcbiAgICAgICAgICAgIHJldHVybiBzZXR0aW5nLmRpc2FibGVXZWJTZWM7XG4gICAgICAgIH0sXG4gICAgICAgIGdhbWVVcmwoKTogc3RyaW5nIHtcbiAgICAgICAgICAgIGlmICggdGhpcy5tb2RlID09IDIgJiYgc2V0dGluZy5jdXN0b21VcmwgKSByZXR1cm4gc2V0dGluZy5jdXN0b21Vcmw7XG4gICAgICAgICAgICBsZXQgcGFnZSA9ICcnO1xuICAgICAgICAgICAgaWYgKCB0aGlzLm1vZGUgPiAwICkge1xuICAgICAgICAgICAgICAgIHBhZ2UgPSB0aGlzLm1vZGUgPT0gMSA/ICdidWlsZC93ZWItbW9iaWxlL2luZGV4Lmh0bWwnIDogJ2J1aWxkL3dlYi1kZXNrdG9wL2luZGV4Lmh0bWwnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcGFyYW1zID0gdGhpcy51cmxQYXJhbXMudHJpbSgpO1xuICAgICAgICAgICAgaWYgKCBwYXJhbXMgIT09ICcnICkgcGFnZSArPSBwYXJhbXMuc3RhcnRzV2l0aCggJz8nICkgPyBwYXJhbXMgOiAnPycgKyBwYXJhbXM7XG4gICAgICAgICAgICByZXR1cm4gYGh0dHA6Ly9sb2NhbGhvc3Q6JHsgdGhpcy5wb3J0IH0vJHsgcGFnZSB9YDtcbiAgICAgICAgfSxcbiAgICAgICAgcGF1c2VJY29uKCk6IHN0cmluZyB7XG4gICAgICAgICAgICByZXR1cm4gJ2ljb25mb250ICcgKyAoIHRoaXMuZ2FtZVBhdXNlZCA/ICdpY29uLWJvZmFuZ3NhbmppYW94aW5nJyA6ICdpY29uLWljb25mcm9udC0nICk7XG4gICAgICAgIH0sXG4gICAgICAgIHNob3dSZWZyZXNoVHJlZUJ0bigpOiBib29sZWFuIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNhblVwZGF0ZVRyZWUgJiYgIXNldHRpbmcuYXV0b1VwZGF0ZVRyZWU7XG4gICAgICAgIH0sXG4gICAgICAgIHNjZW5lTmFtZSgpOiBzdHJpbmcge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMubm9kZVRyZWUgPyB0aGlzLm5vZGVUcmVlLm5hbWUgOiAnJztcbiAgICAgICAgfSxcbiAgICAgICAgc21hbGxMb2dzKCk6IHVua25vd25bXSB7XG4gICAgICAgICAgICBpZiAoIHNldHRpbmcubG9nQ291bnQgPT0gMCApIHJldHVybiBbXTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmxvZ3Muc2xpY2UoIC1zZXR0aW5nLmxvZ0NvdW50ICk7XG4gICAgICAgIH0sXG4gICAgICAgIGJpZ0xvZ3MoKTogdW5rbm93bltdIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmxvZ3Muc2xpY2UoIC0xMDAgKTtcbiAgICAgICAgfSxcbiAgICAgICAgc2ltcGxlTW9kZSgpOiBib29sZWFuIHtcbiAgICAgICAgICAgIHJldHVybiBzZXR0aW5nLnNpbXBsZU1vZGU7XG4gICAgICAgIH0sXG4gICAgfSxcbiAgICBjcmVhdGVkKCkge1xuICAgICAgICBjb250ZXh0LnZ1ZUFwcCA9IHRoaXM7XG4gICAgICAgICggd2luZG93IGFzIGFueSApLnYgPSB0aGlzO1xuICAgICAgICB0aGlzLmNoZWNrVXJsUGFyYW1zKCk7XG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gbG9jYXRpb24uc2VhcmNoLnNsaWNlKCAxICkuc3BsaXQoICcmJyApO1xuICAgICAgICB0aGlzLnBvcnQgPSBxdWVyeVsgMCBdLnNwbGl0KCAnPScgKVsgMSBdO1xuICAgICAgICB0aGlzLm1vZGUgPSBxdWVyeVsgMSBdLnNwbGl0KCAnPScgKVsgMSBdO1xuICAgICAgICB0aGlzLiRuZXh0VGljaygpLnRoZW4oICgpID0+IHtcbiAgICAgICAgICAgIHRoaXMuJGVsLnN0eWxlLnZpc2liaWxpdHkgPSAndmlzaWJsZSc7XG4gICAgICAgIH0gKTtcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCB0aGlzLmV2ZXJ5RnJhbWUgKTtcbiAgICB9LFxuICAgIG1ldGhvZHM6IHtcbiAgICAgICAgdG9nZ2xlRHJhZyggbm9kZUlkOiBzdHJpbmcgKSB7XG4gICAgICAgICAgICB0aGlzLmxvY2tOb2RlID0gdGhpcy5sb2NrTm9kZSAhPT0gbm9kZUlkID8gbm9kZUlkIDogbnVsbDtcbiAgICAgICAgICAgIGlmICggdGhpcy5sb2NrTm9kZSAmJiAhdGhpcy5kZXNpZ25Nb2RlICkgdGhpcy50b2dnbGVEZXNpZ25Nb2RlKCk7XG4gICAgICAgICAgICBleGVjSW5HYW1lKCBgX190b2dnbGVEcmFnKCckeyB0aGlzLmxvY2tOb2RlIH0nKWAgKTtcbiAgICAgICAgfSxcbiAgICAgICAgc3luY09wZW5GY29tKCBub2RlSWQ6IHN0cmluZyApIHtcbiAgICAgICAgICAgIGV4ZWNJbkdhbWUoIGBfX3N5bmNPcGVuRmNvbSgnJHsgbm9kZUlkIH0nKWAgKTtcbiAgICAgICAgfSxcbiAgICAgICAgc3luY09wZW4oIG5vZGVJZDogc3RyaW5nLCBvcGVuOiBib29sZWFuLCB1cGRhdGUgPSB0cnVlICkge1xuICAgICAgICAgICAgaWYgKCBvcGVuICkgdGhpcy5vcGVuTm9kZXMuYWRkKCBub2RlSWQgKTtcbiAgICAgICAgICAgIGVsc2UgdGhpcy5vcGVuTm9kZXMuZGVsZXRlKCBub2RlSWQgKTtcbiAgICAgICAgICAgIGV4ZWNJbkdhbWUoIGBfX3N5bmNPcGVuKCckeyBub2RlSWQgfScsICR7IG9wZW4gfSwgJHsgdXBkYXRlIH0pYCApO1xuICAgICAgICB9LFxuICAgICAgICB0b2dnbGVTbmQoKSB7XG4gICAgICAgICAgICB0aGlzLmlzTXV0ZWQgPSAhdGhpcy5pc011dGVkO1xuICAgICAgICAgICAgc2V0QXVkaW9NdXRlZElwYyggY29udGV4dC53diEuZ2V0V2ViQ29udGVudHNJZCgpLCB0aGlzLmlzTXV0ZWQgKTtcbiAgICAgICAgfSxcbiAgICAgICAgZXZlcnlGcmFtZSgpIHtcbiAgICAgICAgICAgIGlmICggdGhpcy50cmVlVXBkYXRlID09IDEgJiYgdGVtcE5vZGVUcmVlICkge1xuICAgICAgICAgICAgICAgIHRoaXMubm9kZVRyZWUgPSB0ZW1wTm9kZVRyZWU7XG4gICAgICAgICAgICAgICAgaWYgKCB0aGlzLm5lZWRTY3JvbGxPbmVUaW1lICkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLiRuZXh0VGljaygpLnRoZW4oICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICggZG9jdW1lbnQucXVlcnlTZWxlY3RvciggJyNzZWxlY3RlZE5vZGUnICk/LmZpcnN0RWxlbWVudENoaWxkIGFzIGFueSApPy5zY3JvbGxJbnRvVmlld0lmTmVlZGVkKCk7XG4gICAgICAgICAgICAgICAgICAgIH0gKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5uZWVkU2Nyb2xsT25lVGltZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0ZW1wTm9kZVRyZWUgPSBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCB0ZW1wTG9ncy5sZW5ndGggPiAwICkge1xuICAgICAgICAgICAgICAgIHRoaXMubG9ncy5wdXNoKCAuLi50ZW1wTG9ncyApO1xuICAgICAgICAgICAgICAgIHRoaXMuc2Nyb2xsTG9nVG9Cb3R0b20oKTtcbiAgICAgICAgICAgICAgICB0ZW1wTG9ncy5sZW5ndGggPSAwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCB0aGlzLmV2ZXJ5RnJhbWUgKTtcbiAgICAgICAgICAgIGlmICggdGhpcy50cmVlVXBkYXRlIDwgMSApIHRoaXMudHJlZVVwZGF0ZSsrO1xuICAgICAgICAgICAgaWYgKCB0aGlzLmxvZ1VwZGF0ZSA8IDEgKSB0aGlzLmxvZ1VwZGF0ZSsrO1xuICAgICAgICB9LFxuICAgICAgICBjaGVja1VybFBhcmFtcygpOiBib29sZWFuIHtcbiAgICAgICAgICAgIGlmICggc2V0dGluZy51cmxQYXJhbXMgIT09IHRoaXMudXJsUGFyYW1zICkge1xuICAgICAgICAgICAgICAgIHRoaXMudXJsUGFyYW1zID0gc2V0dGluZy51cmxQYXJhbXM7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0sXG4gICAgICAgIHNob3dBcHBNZW51KCBldmVudDogTW91c2VFdmVudCApIHtcbiAgICAgICAgICAgIGlmICggZXZlbnQudGFyZ2V0IGluc3RhbmNlb2YgSFRNTElucHV0RWxlbWVudCApIHJldHVybjtcbiAgICAgICAgICAgIGlmICggZXZlbnQudGFyZ2V0IGluc3RhbmNlb2YgSFRNTEJ1dHRvbkVsZW1lbnQgKSByZXR1cm47XG4gICAgICAgICAgICBzaG93QXBwTWVudSgpO1xuICAgICAgICB9LFxuICAgICAgICBzaG93TWVudSgpIHtcbiAgICAgICAgICAgIHNob3dUcmVlTWVudSgpO1xuICAgICAgICB9LFxuICAgICAgICBzd2l0Y2hNb2RlKCBtb2RlOiBudW1iZXIgKSB7XG4gICAgICAgICAgICB0aGlzLm1vZGUgPSBtb2RlO1xuICAgICAgICB9LFxuICAgICAgICBwdXNoTG9nKCB0aW1lOiBzdHJpbmcsIHR5cGU6IHN0cmluZywgZGF0YTogc3RyaW5nICkge1xuICAgICAgICAgICAgdGVtcExvZ3MucHVzaCggeyB0aW1lLCB0OiB0eXBlLCBkOiBkYXRhIH0gKTtcbiAgICAgICAgICAgIHRoaXMubG9nVXBkYXRlID0gMDtcbiAgICAgICAgfSxcbiAgICAgICAgc2Nyb2xsTG9nVG9Cb3R0b20oKSB7XG4gICAgICAgICAgICBjb25zdCBlbCA9IHRoaXMuJHJlZnMubG9ncztcbiAgICAgICAgICAgIHRoaXMuJG5leHRUaWNrKCAoKSA9PiB7IGVsLnNjcm9sbFRvcCA9IGVsLnNjcm9sbEhlaWdodDsgfSApO1xuICAgICAgICB9LFxuICAgICAgICBmb3JjZVVwZGF0ZVRyZWUoKSB7XG4gICAgICAgICAgICB0aGlzLmNhblVwZGF0ZVRyZWUgPSBmYWxzZTtcbiAgICAgICAgICAgIGV4ZWNJbkdhbWUoICdfX3VwZGF0ZVRyZWUoKScgKTtcbiAgICAgICAgfSxcbiAgICAgICAgc2VsZWN0Tm9kZSggbm9kZUlkOiBzdHJpbmcsIHdpdGhEZXRhaWwgPSB0cnVlICkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3RlZE5vZGUgPSBub2RlSWQ7XG4gICAgICAgICAgICB0aGlzLiRlbWl0KCAnc2VsZWN0ZWROb2RlX2NoYW5nZWQnICk7XG4gICAgICAgICAgICBpZiAoICF3aXRoRGV0YWlsICkgcmV0dXJuO1xuICAgICAgICAgICAgZXhlY0luR2FtZSggYF9fZ2V0Tm9kZURldGFpbCgnJHsgbm9kZUlkIH0nKWAgKTtcbiAgICAgICAgfSxcbiAgICAgICAgbG9jYXRlTm9kZSggdXVpZFBhdGg6IHN0cmluZ1tdICkge1xuICAgICAgICAgICAgdGhpcy50YWIgPSAwO1xuICAgICAgICAgICAgY29uc3QgbGFzdElkID0gdXVpZFBhdGguc2xpY2UoIC0xIClbIDAgXTtcbiAgICAgICAgICAgIGNvbnN0IG9wZW5TZXQgPSBuZXcgU2V0KCB1dWlkUGF0aCApO1xuICAgICAgICAgICAgb3BlblNldC5kZWxldGUoIGxhc3RJZCApO1xuICAgICAgICAgICAgb3BlblNldC5mb3JFYWNoKCAoIHV1aWQgKSA9PiB0aGlzLm9wZW5Ob2Rlcy5hZGQoIHV1aWQgKSApO1xuICAgICAgICAgICAgdGhpcy5uZWVkU2Nyb2xsT25lVGltZSA9IHRydWU7XG4gICAgICAgICAgICBleGVjSW5HYW1lKCBgX19sb2NhdGVOb2RlKFskeyB1dWlkUGF0aC5tYXAoICggdXVpZCApID0+IGBcIiR7IHV1aWQgfVwiYCApIH1dKWAgKTtcbiAgICAgICAgICAgIGxhc3ROb2RlU2V0ID0gb3BlblNldDtcbiAgICAgICAgICAgIHRoaXMuJGVtaXQoICdsb2NhdGVOb2RlJywgb3BlblNldCApO1xuICAgICAgICAgICAgdGhpcy5zZWxlY3ROb2RlKCBsYXN0SWQsIGZhbHNlICk7XG4gICAgICAgIH0sXG4gICAgICAgIHRvZ2dsZU5vZGUoIG5vZGVJZDogc3RyaW5nICkge1xuICAgICAgICAgICAgaWYgKCB0aGlzLm9wZW5Ob2Rlcy5oYXMoIG5vZGVJZCApICkgdGhpcy5vcGVuTm9kZXMuZGVsZXRlKCBub2RlSWQgKTtcbiAgICAgICAgICAgIGVsc2UgdGhpcy5vcGVuTm9kZXMuYWRkKCBub2RlSWQgKTtcbiAgICAgICAgfSxcbiAgICAgICAgbG9nQ29sb3IoIHR5cGU6IHN0cmluZyApOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICAgICAgICAgICAgc3dpdGNoICggdHlwZSApIHtcbiAgICAgICAgICAgICAgICBjYXNlIEhvc3RDaGFubmVsLmNvbnNvbGVMb2c6IHJldHVybiAndW5zZXQnO1xuICAgICAgICAgICAgICAgIGNhc2UgSG9zdENoYW5uZWwuY29uc29sZUVycm9yOiByZXR1cm4gJ3JlZCc7XG4gICAgICAgICAgICAgICAgY2FzZSBIb3N0Q2hhbm5lbC5jb25zb2xlV2FybjogcmV0dXJuICcjY2M5MTM4JztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH0sXG4gICAgICAgIHBsYXlPclBhdXNlKCkge1xuICAgICAgICAgICAgZXhlY0luR2FtZSggdGhpcy5nYW1lUGF1c2VkID8gJ2NjLmdhbWUucmVzdW1lKCknIDogJ2NjLmdhbWUucGF1c2UoKScgKTtcbiAgICAgICAgfSxcbiAgICAgICAgcmVmcmVzaCgpIHtcbiAgICAgICAgICAgIGlmICggIXRoaXMuY2hlY2tVcmxQYXJhbXMoKSApIGNvbnRleHQud3YhLnJlbG9hZElnbm9yaW5nQ2FjaGUoKTtcbiAgICAgICAgICAgIHRoaXMuY2xlYXJUcmVlKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGNsZWFyVHJlZSgpIHtcbiAgICAgICAgICAgIHRoaXMubm9kZVRyZWUgPSBudWxsO1xuICAgICAgICAgICAgdGhpcy5zZWxlY3RlZE5vZGUgPSBudWxsO1xuICAgICAgICAgICAgdGhpcy5ub2RlRGV0YWlsID0gbnVsbDtcbiAgICAgICAgICAgIGlmICggc2V0dGluZy5jbGVhckxvZ0FmdGVyUmVmcmVzaCApIHRoaXMubG9ncyA9IFtdO1xuICAgICAgICAgICAgdGhpcy5vcGVuTm9kZXMuY2xlYXIoKTtcbiAgICAgICAgICAgIGxhc3ROb2RlU2V0Py5jbGVhcigpO1xuICAgICAgICB9LFxuICAgICAgICB0b2dnbGVGcHMoKSB7XG4gICAgICAgICAgICBleGVjSW5HYW1lKCAnX190b2dnbGVGcHMoKScgKTtcbiAgICAgICAgfSxcbiAgICAgICAgdG9nZ2xlRGVzaWduTW9kZSgpIHtcbiAgICAgICAgICAgIHRoaXMuZGVzaWduTW9kZSA9ICF0aGlzLmRlc2lnbk1vZGU7XG4gICAgICAgICAgICBleGVjSW5HYW1lKCBgX190b2dnbGVEZXNpZ25Nb2RlKCR7IHRoaXMuZGVzaWduTW9kZSB9KWAgKTtcbiAgICAgICAgfSxcbiAgICAgICAgdG9nZ2xlSG92ZXIoKSB7XG4gICAgICAgICAgICB0aGlzLmhvdmVyID0gdGhpcy5ob3ZlciA9PSAwID8gMSA6IDA7XG4gICAgICAgICAgICBleGVjSW5HYW1lKCBgX19zZXRIb3ZlcigkeyB0aGlzLmhvdmVyIH0pYCApO1xuICAgICAgICB9LFxuICAgICAgICB0b2dnbGUzZEhvdmVyKCkge1xuICAgICAgICAgICAgdGhpcy5ob3ZlciA9IHRoaXMuaG92ZXIgPT0gMCA/IDIgOiAwO1xuICAgICAgICAgICAgZXhlY0luR2FtZSggYF9fc2V0SG92ZXIoJHsgdGhpcy5ob3ZlciB9KWAgKTtcbiAgICAgICAgfSxcbiAgICAgICAgY29tcGlsZSgpIHtcbiAgICAgICAgICAgIHRoaXMucHVzaExvZyggbmV3IERhdGUoKS50b0xvY2FsZVRpbWVTdHJpbmcoKSwgSG9zdENoYW5uZWwuY29uc29sZUxvZywgJ3JlQ29tcGlsaW5nLi4uJyApO1xuICAgICAgICAgICAgZXhlY0luR2FtZSggJ19fcmVDb21waWxlKCknICk7XG4gICAgICAgIH0sXG4gICAgICAgIG9wZW5XdkRldlRvb2woKSB7XG4gICAgICAgICAgICBjb250ZXh0Lnd2IS5vcGVuRGV2VG9vbHMoKTtcbiAgICAgICAgfSxcbiAgICAgICAgc2hvd1NldHRpbmcoKSB7XG4gICAgICAgICAgICBzZXR0aW5nLnNob3cgPSB0cnVlO1xuICAgICAgICB9LFxuICAgICAgICBzaG93SGVscCgpIHtcbiAgICAgICAgICAgIHYuJHJlZnMuaGVscC5zaG93ID0gdHJ1ZTtcbiAgICAgICAgfSxcbiAgICAgICAgdG9nZ2xlU3RhdGlzdGljKCkge1xuICAgICAgICAgICAgdGhpcy5zdGF0aXN0aWNpbmcgPSAhdGhpcy5zdGF0aXN0aWNpbmc7XG4gICAgICAgICAgICBleGVjSW5HYW1lKCBgX19zdGFydFN0YXRpc3RpYygkeyB0aGlzLnN0YXRpc3RpY2luZyB9KWAgKTtcbiAgICAgICAgfSxcbiAgICB9LFxufSApO1xuIiwgIi8vIE1lc3NhZ2UgcHJvdG9jb2wgc2hhcmVkIGJldHdlZW4gdGhlIGV4dGVuc2lvbiBtYWluIHByb2Nlc3MsIHRoZSBpbnNwZWN0b3IgcmVuZGVyZXIsXG4vLyB0aGUgZ2FtZS13ZWJ2aWV3IHByZWxvYWQsIGFuZCB0aGUgaW5qZWN0ZWQgcHJvYmUgc2NyaXB0LlxuXG4vKiogSG9zdCBleHRlbnNpb24gcGFja2FnZSBuYW1lICh0aGUgaW5zcGVjdG9yIHNoaXBzIGluc2lkZSBjb2Nvcy1tY3Atc2VydmVyKTsgZXZlcnkgSVBDIGNoYW5uZWwgaXMgcHJlZml4ZWQgd2l0aCBpdC4gKi9cbmV4cG9ydCBjb25zdCBQS0dfTkFNRSA9ICdjb2Nvcy1tY3Atc2VydmVyJztcblxuLyoqIFdpbmRvdyBvcGVuIG1vZGVzIHRyaWdnZXJlZCBmcm9tIHRoZSBDcmVhdG9yIGV4dGVuc2lvbiBtZW51LiAqL1xuZXhwb3J0IGVudW0gSW5zcGVjdG9yTW9kZSB7XG4gICAgUHJldmlldyA9IDAsXG4gICAgQnVpbGRNb2JpbGUgPSAxLFxuICAgIEN1c3RvbVBhZ2UgPSAyLFxuICAgIEJ1aWxkRGVza3RvcCA9IDMsXG59XG5cbi8qKiByZW5kZXJlciAtPiBtYWluIChpcGNSZW5kZXJlci5zZW5kKS4gKi9cbmV4cG9ydCBjb25zdCBJcGNTZW5kID0ge1xuICAgIGZvY3VzTm9kZTogYCR7IFBLR19OQU1FIH06Zm9jdXNOb2RlYCxcbiAgICBmb2N1c0Fzc2V0OiBgJHsgUEtHX05BTUUgfTpmb2N1c0Fzc2V0YCxcbn0gYXMgY29uc3Q7XG5cbi8qKiByZW5kZXJlciAtPiBtYWluIChpcGNSZW5kZXJlci5pbnZva2UpLiAqL1xuZXhwb3J0IGNvbnN0IElwY0ludm9rZSA9IHtcbiAgICB3aXJlRGV2dG9vbHM6IGAkeyBQS0dfTkFNRSB9OndpcmUtZGV2dG9vbHNgLFxuICAgIHNldEF1ZGlvTXV0ZWQ6IGAkeyBQS0dfTkFNRSB9OnNldC1hdWRpby1tdXRlZGAsXG4gICAgc2hvd01lbnU6IGAkeyBQS0dfTkFNRSB9OnNob3ctbWVudWAsXG4gICAgc2hvd09wZW5EaWFsb2c6IGAkeyBQS0dfTkFNRSB9OnNob3ctb3Blbi1kaWFsb2dgLFxuICAgIGdldExvY2FsZTogYCR7IFBLR19OQU1FIH06Z2V0LWxvY2FsZWAsXG4gICAgc3luY1dpbmRvd01vZGU6IGAkeyBQS0dfTkFNRSB9OnN5bmMtd2luZG93LW1vZGVgLFxuICAgIG9wZW5BcHBEZXZ0b29sczogYCR7IFBLR19OQU1FIH06b3Blbi1hcHAtZGV2dG9vbHNgLFxufSBhcyBjb25zdDtcblxuLyoqIG1haW4gLT4gcmVuZGVyZXIgKHdlYkNvbnRlbnRzLnNlbmQpLiAqL1xuZXhwb3J0IGNvbnN0IElwY0V2ZW50ID0ge1xuICAgIGRlYnVnZ2VyUGF1c2VkOiBgJHsgUEtHX05BTUUgfTpkZWJ1Z2dlci1wYXVzZWRgLFxuICAgIG1lbnVDbGlja2VkOiBgJHsgUEtHX05BTUUgfTptZW51LWNsaWNrZWRgLFxufSBhcyBjb25zdDtcblxuZXhwb3J0IGludGVyZmFjZSBXaXJlRGV2dG9vbHNSZXN1bHQge1xuICAgIG9rOiBib29sZWFuO1xuICAgIGVycm9yPzogc3RyaW5nO1xuICAgIG11dGVkPzogYm9vbGVhbjtcbn1cblxuLyoqIE9uZSBlbnRyeSBvZiBhIGNvbnRleHQgbWVudSByZXF1ZXN0ZWQgYnkgdGhlIHJlbmRlcmVyLiAqL1xuZXhwb3J0IGludGVyZmFjZSBNZW51SXRlbVNwZWMge1xuICAgIGlkPzogc3RyaW5nO1xuICAgIGxhYmVsPzogc3RyaW5nO1xuICAgIHR5cGU/OiAnbm9ybWFsJyB8ICdzZXBhcmF0b3InIHwgJ2NoZWNrYm94JztcbiAgICBjaGVja2VkPzogYm9vbGVhbjtcbiAgICBlbmFibGVkPzogYm9vbGVhbjtcbiAgICBzdWJtZW51PzogTWVudUl0ZW1TcGVjW107XG59XG5cbi8qKlxuICogQ2hhbm5lbHMgdXNlZCBieSB0aGUgZ2FtZS13ZWJ2aWV3IHByZWxvYWQ6IHRoZSBpbmplY3RlZCBwcm9iZSBjYWxscyB0aGUgbWF0Y2hpbmcgZ2xvYmFsXG4gKiBmdW5jdGlvbiwgdGhlIHByZWxvYWQgZm9yd2FyZHMgaXQgdG8gdGhlIGluc3BlY3RvciByZW5kZXJlciB2aWEgaXBjUmVuZGVyZXIuc2VuZFRvSG9zdC5cbiAqL1xuZXhwb3J0IGNvbnN0IEhvc3RDaGFubmVsID0ge1xuICAgIGdhbWVTdGF0ZTogJ2dhbWVTdGF0ZScsXG4gICAgbG9jYXRlTm9kZTogJ2xvY2F0ZU5vZGUnLFxuICAgIGNvbnNvbGVMb2c6ICdjb25zb2xlTG9nJyxcbiAgICBjb25zb2xlRXJyb3I6ICdjb25zb2xlRXJyb3InLFxuICAgIGNvbnNvbGVXYXJuOiAnY29uc29sZVdhcm4nLFxuICAgIHVwZGF0ZVRyZWU6ICd1cGRhdGVUcmVlJyxcbiAgICBzaG93Tm9kZURldGFpbDogJ3Nob3dOb2RlRGV0YWlsJyxcbiAgICBzZW5kU3RhdGlzdGljOiAnc2VuZFN0YXRpc3RpYycsXG4gICAgY2FuVXBkYXRlVHJlZTogJ2NhblVwZGF0ZVRyZWUnLFxufSBhcyBjb25zdDtcblxuLyoqIFBlcnNpc3RlZCBpbnNwZWN0b3Igc2V0dGluZ3MgKGV4dGVuc2lvbnMvY29jb3MtaW5zcGVjdG9yLWNvbmZpZy5qc29uKS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSW5zcGVjdG9yQ29uZmlnIHtcbiAgICBsb2dDb3VudDogbnVtYmVyIHwgc3RyaW5nO1xuICAgIHJldGluYUVuYWJsZTogYm9vbGVhbjtcbiAgICBhdXRvVXBkYXRlVHJlZTogYm9vbGVhbjtcbiAgICBkaXNwbGF5QXNGYWlyeVRyZWU/OiBib29sZWFuO1xuICAgIGhpZGVGYWlyeUNvbUNvbnRhaW5lcj86IGJvb2xlYW47XG4gICAgc3luY05vZGVEZXRhaWw/OiBib29sZWFuO1xuICAgIGRpc2FibGVXZWJTZWM/OiBib29sZWFuO1xuICAgIHNob3dEZXZUb29sSW5UYWI/OiBib29sZWFuO1xuICAgIHNpemU6IFsgbnVtYmVyLCBudW1iZXIgXTtcbiAgICBleHRyYVNpemVzPzogdW5rbm93bltdO1xuICAgIGlzUG9ydHJhaXQ6IGJvb2xlYW47XG4gICAgc2hvdzogYm9vbGVhbjtcbiAgICB1cmxQYXJhbXM/OiBzdHJpbmc7XG4gICAgY3VzdG9tVXJsPzogc3RyaW5nO1xuICAgIGNsZWFyTG9nQWZ0ZXJSZWZyZXNoPzogYm9vbGVhbjtcbiAgICBleHRlbnNpb25GaWxlPzogc3RyaW5nO1xuICAgIGVuYWJsZUV4dGVuc2lvbj86IGJvb2xlYW47XG4gICAgc3RhdGlzdGljaW5nPzogYm9vbGVhbjtcbiAgICBzdGF0aXN0aWNzPzogdW5rbm93bjtcbiAgICBzb3J0Q29tcFByb3BlcnRpZXM/OiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPjtcbiAgICBzaW1wbGVNb2RlPzogYm9vbGVhbjtcbiAgICAvKiogdHJ1ZSAoZGVmYXVsdCk6IGdhbWUgdmlldyBmb2xsb3dzIHRoZSBwcm9qZWN0IGRlc2lnbiByZXNvbHV0aW9uOyBmYWxzZTogdXNlci1waWNrZWQgc2l6ZSAqL1xuICAgIG1hdGNoRGVzaWduPzogYm9vbGVhbjtcbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBSdW50aW1lIEFQSSBleHBvc2VkIHRvIG90aGVyIGV4dGVuc2lvbnMgdGhyb3VnaCBFZGl0b3IuTWVzc2FnZSAocGFja2FnZS5qc29uIFwicnVudGltZS0qXCIpLlxuLy8gUGF5bG9hZHMgbXVzdCBzdGF5IEpTT04tc2VyaWFsaXphYmxlOiB0aGV5IGNyb3NzIHRoZSBDcmVhdG9yIElQQyBib3VuZGFyeS5cblxuZXhwb3J0IHR5cGUgUnVudGltZUNvbnNvbGVMZXZlbCA9ICd2ZXJib3NlJyB8ICdpbmZvJyB8ICd3YXJuaW5nJyB8ICdlcnJvcic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUnVudGltZVN0YXR1cyB7XG4gICAgd2luZG93T3BlbjogYm9vbGVhbjtcbiAgICBnYW1lUmVhZHk6IGJvb2xlYW47XG4gICAgZ2FtZVVybDogc3RyaW5nIHwgbnVsbDtcbiAgICBwcmV2aWV3UG9ydDogbnVtYmVyIHwgbnVsbDtcbiAgICBjb25zb2xlU2VxOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUnVudGltZUV2YWxSZXN1bHQge1xuICAgIG9rOiBib29sZWFuO1xuICAgIHZhbHVlPzogdW5rbm93bjtcbiAgICBlcnJvcj86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSdW50aW1lQ29uc29sZUVudHJ5IHtcbiAgICBzZXE6IG51bWJlcjtcbiAgICB0OiBudW1iZXI7XG4gICAgbGV2ZWw6IFJ1bnRpbWVDb25zb2xlTGV2ZWw7XG4gICAgbWVzc2FnZTogc3RyaW5nO1xuICAgIGxpbmU6IG51bWJlcjtcbiAgICBzb3VyY2VJZDogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJ1bnRpbWVDb25zb2xlUmVzdWx0IHtcbiAgICBvazogYm9vbGVhbjtcbiAgICBlbnRyaWVzOiBSdW50aW1lQ29uc29sZUVudHJ5W107XG4gICAgbGF0ZXN0U2VxOiBudW1iZXI7XG4gICAgZXJyb3I/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUnVudGltZUNhcHR1cmVSZXN1bHQge1xuICAgIG9rOiBib29sZWFuO1xuICAgIHBhdGg/OiBzdHJpbmc7XG4gICAgd2lkdGg/OiBudW1iZXI7XG4gICAgaGVpZ2h0PzogbnVtYmVyO1xuICAgIGJ5dGVzPzogbnVtYmVyO1xuICAgIGVycm9yPzogc3RyaW5nO1xufVxuIiwgIi8vIFNoYXJlZCByZW5kZXJlciBjb250ZXh0OiBsYXRlLWJvdW5kIHJlZmVyZW5jZXMgdXNlZCBhY3Jvc3MgY29tcG9uZW50cyBhbmQgbWVudXMuXG4vLyBgdnVlQXBwYCAvIGBzZXR0aW5nQXBwYCBhcmUgYWxzbyBleHBvc2VkIG9uIHdpbmRvdyBiZWNhdXNlIChhKSB0aGUgZXh0ZW5zaW9uIG1haW4gcHJvY2Vzc1xuLy8gZHJpdmVzIHRoZW0gdGhyb3VnaCBleGVjdXRlSmF2YVNjcmlwdCAoXCJ2LnN3aXRjaE1vZGUoMClcIiwgXCJzZXR0aW5nLmNvbmZpZ0RhdGFGb3JNYWluXCIpIGFuZFxuLy8gKGIpIFZ1ZSB0ZW1wbGF0ZXMgY29tcGlsZWQgZnJvbSBzdHJpbmdzIHJlc29sdmUgYmFyZSBpZGVudGlmaWVycyB2aWEgdGhlIGdsb2JhbCBzY29wZS5cblxuZXhwb3J0IGNvbnN0IGNvbnRleHQgPSB7XG4gICAgLyoqIHRoZSBnYW1lIHdlYnZpZXcgZWxlbWVudCAqL1xuICAgIHd2OiBudWxsIGFzIEhUTUxXZWJWaWV3RWxlbWVudCB8IG51bGwsXG4gICAgLyoqIHRoZSBkZXZ0b29scyB3ZWJ2aWV3IGVsZW1lbnQgKi9cbiAgICBkd3Y6IG51bGwgYXMgSFRNTFdlYlZpZXdFbGVtZW50IHwgbnVsbCxcbiAgICAvKiogbWFpbiBWdWUgaW5zdGFuY2UgKHdpbmRvdy52KSAqL1xuICAgIHZ1ZUFwcDogbnVsbCBhcyBhbnksXG4gICAgLyoqIHNldHRpbmdzIFZ1ZSBpbnN0YW5jZSAod2luZG93LnNldHRpbmcpICovXG4gICAgc2V0dGluZ0FwcDogbnVsbCBhcyBhbnksXG4gICAgLyoqIG5vZGUgdXVpZCB0aGUgbGFzdCB0cmVlIGNvbnRleHQgbWVudSB3YXMgb3BlbmVkIG9uICovXG4gICAgbWVudU5vZGVJZDogJycsXG4gICAgLyoqIGNvbXBvbmVudCB1dWlkIC8gZGlzcGxheSBuYW1lIHRoZSBsYXN0IGNvbXBvbmVudCBtZW51IHdhcyBvcGVuZWQgb24gKi9cbiAgICBtZW51Q29tcElkOiAnJyxcbiAgICBtZW51Q29tcE5hbWU6ICcnLFxufTtcblxuLyoqIFJ1bnMgYSBzY3JpcHQgaW5zaWRlIHRoZSBnYW1lIHBhZ2UgKHRoZSBpbmplY3RlZCBwcm9iZSBleHBvc2VzIHRoZSBfXyBnbG9iYWxzKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBleGVjSW5HYW1lKCBjb2RlOiBzdHJpbmcgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBpZiAoICFjb250ZXh0Lnd2ICkgcmV0dXJuIFByb21pc2UucmVzb2x2ZSggdW5kZWZpbmVkICk7XG4gICAgcmV0dXJuIGNvbnRleHQud3YuZXhlY3V0ZUphdmFTY3JpcHQoIGNvZGUgKTtcbn1cbiIsICIvLyBSZW5kZXJlci1zaWRlIElQQyBoZWxwZXJzIChhbGwgbWFpbi1wcm9jZXNzIGFjY2VzcyBnb2VzIHRocm91Z2ggaGVyZSAtIG5vIGByZW1vdGVgKS5cbmltcG9ydCB7IGlwY1JlbmRlcmVyLCBzaGVsbCwgY2xpcGJvYXJkIH0gZnJvbSAnZWxlY3Ryb24nO1xuaW1wb3J0IHsgSXBjU2VuZCwgSXBjSW52b2tlLCBJcGNFdmVudCwgdHlwZSBNZW51SXRlbVNwZWMsIHR5cGUgV2lyZURldnRvb2xzUmVzdWx0IH0gZnJvbSAnQHNoYXJlZC9wcm90b2NvbCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWVudUVudHJ5IGV4dGVuZHMgTWVudUl0ZW1TcGVjIHtcbiAgICBhY3Rpb24/OiAoKSA9PiB2b2lkO1xuICAgIHN1Ym1lbnVFbnRyaWVzPzogTWVudUVudHJ5W107XG59XG5cbmxldCBtZW51QXV0b0lkID0gMDtcblxuLyoqIFNob3dzIGEgbmF0aXZlIGNvbnRleHQgbWVudSAoYnVpbHQgaW4gdGhlIG1haW4gcHJvY2VzcykgYW5kIHJ1bnMgdGhlIGNsaWNrZWQgZW50cnkncyBhY3Rpb24uICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcG9wdXBNZW51KCBlbnRyaWVzOiBNZW51RW50cnlbXSApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBhY3Rpb25zID0gbmV3IE1hcDxzdHJpbmcsICgpID0+IHZvaWQ+KCk7XG4gICAgY29uc3QgdG9TcGVjID0gKCBlbnRyeTogTWVudUVudHJ5ICk6IE1lbnVJdGVtU3BlYyA9PiB7XG4gICAgICAgIGNvbnN0IGlkID0gZW50cnkuaWQgPz8gYG1lbnUtJHsgbWVudUF1dG9JZCsrIH1gO1xuICAgICAgICBpZiAoIGVudHJ5LmFjdGlvbiApIGFjdGlvbnMuc2V0KCBpZCwgZW50cnkuYWN0aW9uICk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBpZCxcbiAgICAgICAgICAgIGxhYmVsOiBlbnRyeS5sYWJlbCxcbiAgICAgICAgICAgIHR5cGU6IGVudHJ5LnR5cGUsXG4gICAgICAgICAgICBjaGVja2VkOiBlbnRyeS5jaGVja2VkLFxuICAgICAgICAgICAgZW5hYmxlZDogZW50cnkuZW5hYmxlZCxcbiAgICAgICAgICAgIHN1Ym1lbnU6IGVudHJ5LnN1Ym1lbnVFbnRyaWVzPy5tYXAoIHRvU3BlYyApLFxuICAgICAgICB9O1xuICAgIH07XG4gICAgY29uc3Qgc3BlY3MgPSBlbnRyaWVzLm1hcCggdG9TcGVjICk7XG4gICAgY29uc3QgY2xpY2tlZElkID0gYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKCBJcGNJbnZva2Uuc2hvd01lbnUsIHNwZWNzICk7XG4gICAgaWYgKCBjbGlja2VkSWQgJiYgYWN0aW9ucy5oYXMoIGNsaWNrZWRJZCApICkgYWN0aW9ucy5nZXQoIGNsaWNrZWRJZCApISgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd2lyZURldnRvb2xzSXBjKCBnYW1lV2NJZDogbnVtYmVyLCBkZXZ0b29sc1djSWQ6IG51bWJlciApOiBQcm9taXNlPFdpcmVEZXZ0b29sc1Jlc3VsdD4ge1xuICAgIHJldHVybiBpcGNSZW5kZXJlci5pbnZva2UoIElwY0ludm9rZS53aXJlRGV2dG9vbHMsIGdhbWVXY0lkLCBkZXZ0b29sc1djSWQgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNldEF1ZGlvTXV0ZWRJcGMoIGdhbWVXY0lkOiBudW1iZXIsIG11dGVkOiBib29sZWFuICk6IHZvaWQge1xuICAgIGlwY1JlbmRlcmVyLmludm9rZSggSXBjSW52b2tlLnNldEF1ZGlvTXV0ZWQsIGdhbWVXY0lkLCBtdXRlZCApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2hvd09wZW5EaWFsb2dJcGMoIGV4dGVuc2lvbnM6IHN0cmluZ1tdICk6IFByb21pc2U8c3RyaW5nW10gfCBudWxsPiB7XG4gICAgcmV0dXJuIGlwY1JlbmRlcmVyLmludm9rZSggSXBjSW52b2tlLnNob3dPcGVuRGlhbG9nLCBleHRlbnNpb25zICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRMb2NhbGVJcGMoKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICByZXR1cm4gaXBjUmVuZGVyZXIuaW52b2tlKCBJcGNJbnZva2UuZ2V0TG9jYWxlICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzeW5jV2luZG93TW9kZUlwYyggd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIHNpbXBsZU1vZGU6IGJvb2xlYW4sIG1pbkhlaWdodEV4dHJhOiBudW1iZXIgKTogdm9pZCB7XG4gICAgaXBjUmVuZGVyZXIuaW52b2tlKCBJcGNJbnZva2Uuc3luY1dpbmRvd01vZGUsIHdpZHRoLCBoZWlnaHQsIHNpbXBsZU1vZGUsIG1pbkhlaWdodEV4dHJhICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmb2N1c05vZGVJbkVkaXRvciggdXVpZDogc3RyaW5nICk6IHZvaWQge1xuICAgIGlwY1JlbmRlcmVyLnNlbmQoIElwY1NlbmQuZm9jdXNOb2RlLCB1dWlkICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmb2N1c0Fzc2V0SW5FZGl0b3IoIHV1aWQ6IHN0cmluZyApOiB2b2lkIHtcbiAgICBpcGNSZW5kZXJlci5zZW5kKCBJcGNTZW5kLmZvY3VzQXNzZXQsIHV1aWQgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG9uRGVidWdnZXJQYXVzZWQoIGhhbmRsZXI6ICgpID0+IHZvaWQgKTogdm9pZCB7XG4gICAgaXBjUmVuZGVyZXIub24oIElwY0V2ZW50LmRlYnVnZ2VyUGF1c2VkLCBoYW5kbGVyICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBvcGVuRXh0ZXJuYWwoIHVybDogc3RyaW5nICk6IHZvaWQge1xuICAgIHNoZWxsLm9wZW5FeHRlcm5hbCggdXJsICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb3B5VG9DbGlwYm9hcmQoIHRleHQ6IHN0cmluZyApOiB2b2lkIHtcbiAgICBjbGlwYm9hcmQud3JpdGVUZXh0KCB0ZXh0ICk7XG59XG4iLCAiLy8gQ29udGV4dCBtZW51cyAoYXBwIC8gdHJlZSB0YWIgLyBub2RlIC8gY29tcG9uZW50IC8gY29uc29sZSkuXG5pbXBvcnQgeyBpcGNSZW5kZXJlciB9IGZyb20gJ2VsZWN0cm9uJztcbmltcG9ydCB7IElwY0ludm9rZSB9IGZyb20gJ0BzaGFyZWQvcHJvdG9jb2wnO1xuaW1wb3J0IHsgY29udGV4dCwgZXhlY0luR2FtZSB9IGZyb20gJy4vY29udGV4dCc7XG5pbXBvcnQgeyBwb3B1cE1lbnUsIGNvcHlUb0NsaXBib2FyZCwgZm9jdXNOb2RlSW5FZGl0b3IsIHR5cGUgTWVudUVudHJ5IH0gZnJvbSAnLi9pcGMnO1xuXG5jb25zdCBOT0RFX0JSRUFLX0VWRU5UUyA9IFtcbiAgICAnc2l6ZS1jaGFuZ2VkJywgJ2NvbG9yLWNoYW5nZWQnLCAnY2hpbGQtcmVtb3ZlZCcsICdjaGlsZC1hZGRlZCcsXG4gICAgJ2xheWVyLWNoYW5nZWQnLCAnc2libGluZy1vcmRlci1jaGFuZ2VkJywgJ2FjdGl2ZS1pbi1oaWVyYXJjaHktY2hhbmdlZCcsXG5dO1xuY29uc3QgVFJBTlNGT1JNX0JJVFMgPSBbICdQT1NJVElPTicsICdST1RBVElPTicsICdTQ0FMRScgXTtcblxuLyoqIEV4dGVuc2lvbiBlbnRyaWVzIGxvYWRlZCBmcm9tIHRoZSB1c2VyLXByb3ZpZGVkIHBsdWdpbnMganNvbiAoW2xhYmVsLCBmdW5jdGlvbk5hbWVdKS4gKi9cbmV4cG9ydCBjb25zdCBleHRlbnNpb25NZW51cyA9IHtcbiAgICBub2RlOiBbXSBhcyBBcnJheTxbIHN0cmluZywgc3RyaW5nIF0+LFxuICAgIGNvbXBvbmVudDogW10gYXMgQXJyYXk8WyBzdHJpbmcsIHN0cmluZyBdPixcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG93QXBwTWVudSgpOiB2b2lkIHtcbiAgICBjb25zdCBzZXR0aW5nID0gY29udGV4dC5zZXR0aW5nQXBwO1xuICAgIGNvbnN0IHYgPSBjb250ZXh0LnZ1ZUFwcDtcbiAgICBjb25zdCBlbnRyaWVzOiBNZW51RW50cnlbXSA9IFtcbiAgICAgICAgeyBsYWJlbDogJ1RvZ2dsZSBNaW5pIE1vZGUnLCBhY3Rpb246ICgpID0+IHNldHRpbmcudG9nZ2xlU2ltcGxlTW9kZSgpIH0sXG4gICAgICAgIHsgdHlwZTogJ3NlcGFyYXRvcicgfSxcbiAgICAgICAgeyBsYWJlbDogJ1JvdGF0ZSBQb3J0cmFpdC9MYW5kc2NhcGUnLCBhY3Rpb246ICgpID0+IHNldHRpbmcudG9nZ2xlUG9ydHJhaXQoKSB9LFxuICAgICAgICB7IGxhYmVsOiAnQ3VzdG9tIFJlc29sdXRpb24nLCBhY3Rpb246ICgpID0+IHsgdi5zaG93UmVzb2x1dGlvblNlbGVjdG9yID0gIXYuc2hvd1Jlc29sdXRpb25TZWxlY3RvcjsgfSB9LFxuICAgICAgICB7XG4gICAgICAgICAgICBsYWJlbDogJ09wZW4gRGV2VG9vbHMnLFxuICAgICAgICAgICAgYWN0aW9uOiAoKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCAhc2V0dGluZy5zaG93RGV2VG9vbEluVGFiICkgdi5vcGVuV3ZEZXZUb29sKCk7XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICggc2V0dGluZy5zaW1wbGVNb2RlICkgc2V0dGluZy50b2dnbGVTaW1wbGVNb2RlKCk7XG4gICAgICAgICAgICAgICAgICAgIHYudGFiID0gMTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB7IHR5cGU6ICdzZXBhcmF0b3InIH0sXG4gICAgICAgIHsgbGFiZWw6ICdIZWxwJywgYWN0aW9uOiAoKSA9PiB2LnNob3dIZWxwKCkgfSxcbiAgICAgICAgeyBsYWJlbDogJ1NldHRpbmcnLCBhY3Rpb246ICgpID0+IHYuc2hvd1NldHRpbmcoKSB9LFxuICAgICAgICB7IHR5cGU6ICdzZXBhcmF0b3InIH0sXG4gICAgICAgIHsgbGFiZWw6ICdPcGVuIEFwcCBEZXZUb29scycsIGFjdGlvbjogKCkgPT4gaXBjUmVuZGVyZXIuaW52b2tlKCBJcGNJbnZva2Uub3BlbkFwcERldnRvb2xzICkgfSxcbiAgICBdO1xuICAgIHBvcHVwTWVudSggZW50cmllcyApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2hvd05vZGVNZW51KCBub2RlSWQ6IHN0cmluZyApOiB2b2lkIHtcbiAgICBjb250ZXh0Lm1lbnVOb2RlSWQgPSBub2RlSWQ7XG4gICAgY29uc3QgdiA9IGNvbnRleHQudnVlQXBwO1xuICAgIGNvbnN0IGVudHJpZXM6IE1lbnVFbnRyeVtdID0gW1xuICAgICAgICB7IGxhYmVsOiAnUmVtb3ZlJywgYWN0aW9uOiAoKSA9PiBleGVjSW5HYW1lKCBgX19yZW1vdmVOb2RlKCckeyBub2RlSWQgfScpYCApIH0sXG4gICAgICAgIHsgdHlwZTogJ3NlcGFyYXRvcicgfSxcbiAgICAgICAgeyBsYWJlbDogJ0NvcHkgdXVpZCcsIGFjdGlvbjogKCkgPT4gY29weVRvQ2xpcGJvYXJkKCBub2RlSWQgKSB9LFxuICAgICAgICB7IGxhYmVsOiAnUHJpbnQgUGF0aCcsIGFjdGlvbjogKCkgPT4gZXhlY0luR2FtZSggYF9fcHJpbnRQYXRoKCckeyBub2RlSWQgfScpYCApIH0sXG4gICAgICAgIHsgbGFiZWw6ICdTdG9yZSBpbiBHbG9iYWwnLCBhY3Rpb246ICgpID0+IGV4ZWNJbkdhbWUoIGBfX3N0b3JlSW5HbG9iYWwoJyR7IG5vZGVJZCB9JylgICkgfSxcbiAgICAgICAgeyBsYWJlbDogJ0xvY2svVW5sb2NrIERyYWcnLCBhY3Rpb246ICgpID0+IHYudG9nZ2xlRHJhZyggbm9kZUlkICkgfSxcbiAgICAgICAgeyBsYWJlbDogJ1RvZ2dsZSBBdXRvIFVwZGF0ZSBOb2RlJywgYWN0aW9uOiAoKSA9PiBleGVjSW5HYW1lKCBgX19kb25vdEF1dG9VcGRhdGUoJyR7IG5vZGVJZCB9JylgICkgfSxcbiAgICAgICAgeyB0eXBlOiAnc2VwYXJhdG9yJyB9LFxuICAgICAgICB7XG4gICAgICAgICAgICBsYWJlbDogJ0JyZWFrIE9uJyxcbiAgICAgICAgICAgIHN1Ym1lbnVFbnRyaWVzOiBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBsYWJlbDogJ3RyYW5zZm9ybS1jaGFuZ2VkJyxcbiAgICAgICAgICAgICAgICAgICAgc3VibWVudUVudHJpZXM6IFRSQU5TRk9STV9CSVRTLm1hcCggKCBiaXQgKSA9PiAoIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxhYmVsOiBiaXQsXG4gICAgICAgICAgICAgICAgICAgICAgICBhY3Rpb246ICgpID0+IGV4ZWNJbkdhbWUoIGBfX3NldEJyZWFrUG9pbnQoJyR7IG5vZGVJZCB9JywgJ3RyYW5zZm9ybS1jaGFuZ2VkJywgJyR7IGJpdCB9JylgICksXG4gICAgICAgICAgICAgICAgICAgIH0gKSApLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgLi4uTk9ERV9CUkVBS19FVkVOVFMubWFwKCAoIGV2ZW50TmFtZSApID0+ICgge1xuICAgICAgICAgICAgICAgICAgICBsYWJlbDogZXZlbnROYW1lLFxuICAgICAgICAgICAgICAgICAgICBhY3Rpb246ICgpID0+IGV4ZWNJbkdhbWUoIGBfX3NldEJyZWFrUG9pbnQoJyR7IG5vZGVJZCB9JywgJyR7IGV2ZW50TmFtZSB9JylgICksXG4gICAgICAgICAgICAgICAgfSApICksXG4gICAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgICB7IGxhYmVsOiAnUmVtb3ZlIEJyZWFrIFBvaW50cycsIGFjdGlvbjogKCkgPT4gZXhlY0luR2FtZSggYF9fcmVtb3ZlQnJlYWtQb2ludCgnJHsgbm9kZUlkIH0nKWAgKSB9LFxuICAgICAgICB7IGxhYmVsOiAnUmVtb3ZlIEFsbCBCcmVhayBQb2ludHMnLCBhY3Rpb246ICgpID0+IGV4ZWNJbkdhbWUoICdfX3JlbW92ZUFsbEJyZWFrUG9pbnQoKScgKSB9LFxuICAgICAgICB7IHR5cGU6ICdzZXBhcmF0b3InIH0sXG4gICAgICAgIHsgbGFiZWw6ICdTZWxlY3QgaW4gRWRpdG9yJywgYWN0aW9uOiAoKSA9PiBmb2N1c05vZGVJbkVkaXRvciggbm9kZUlkICkgfSxcbiAgICBdO1xuICAgIGZvciAoIGNvbnN0IFsgbGFiZWwsIGZ1bmN0aW9uTmFtZSBdIG9mIGV4dGVuc2lvbk1lbnVzLm5vZGUgKSB7XG4gICAgICAgIGVudHJpZXMucHVzaCggeyBsYWJlbCwgYWN0aW9uOiAoKSA9PiBleGVjSW5HYW1lKCBgJHsgZnVuY3Rpb25OYW1lIH0oX19uZFsnJHsgbm9kZUlkIH0nXSlgICkgfSApO1xuICAgIH1cbiAgICBwb3B1cE1lbnUoIGVudHJpZXMgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNob3dDb21wb25lbnRNZW51KCBjb21wSWQ6IHN0cmluZywgY29tcE5hbWU6IHN0cmluZywgbWV0aG9kTmFtZXM6IHN0cmluZ1tdLCBleGVjTWV0aG9kOiAoIG5hbWU6IHN0cmluZyApID0+IHZvaWQgKTogdm9pZCB7XG4gICAgY29udGV4dC5tZW51Q29tcElkID0gY29tcElkO1xuICAgIGNvbnRleHQubWVudUNvbXBOYW1lID0gY29tcE5hbWU7XG4gICAgY29uc3QgdiA9IGNvbnRleHQudnVlQXBwO1xuICAgIGNvbnN0IHNldHRpbmcgPSBjb250ZXh0LnNldHRpbmdBcHA7XG4gICAgY29uc3QgZW50cmllczogTWVudUVudHJ5W10gPSBbXG4gICAgICAgIHsgbGFiZWw6ICdSZW1vdmUnLCBhY3Rpb246ICgpID0+IGV4ZWNJbkdhbWUoIGBfX3JlbW92ZUNvbXAoJyR7IHYuc2VsZWN0ZWROb2RlIH0nLCckeyBjb21wSWQgfScpYCApIH0sXG4gICAgICAgIHsgbGFiZWw6ICdTdG9yZSBpbiBHbG9iYWwnLCBhY3Rpb246ICgpID0+IGV4ZWNJbkdhbWUoIGBfX3N0b3JlQ29tcEluR2xvYmFsKCckeyB2LnNlbGVjdGVkTm9kZSB9JywnJHsgY29tcElkIH0nKWAgKSB9LFxuICAgICAgICB7IGxhYmVsOiAnRmllbGRzIFNvcnQnLCBhY3Rpb246ICgpID0+IHNldHRpbmcudG9nZ2xlU29ydENvbXAoIGNvbXBOYW1lICkgfSxcbiAgICBdO1xuICAgIGZvciAoIGNvbnN0IFsgbGFiZWwsIGZ1bmN0aW9uTmFtZSBdIG9mIGV4dGVuc2lvbk1lbnVzLmNvbXBvbmVudCApIHtcbiAgICAgICAgZW50cmllcy5wdXNoKCB7IGxhYmVsLCBhY3Rpb246ICgpID0+IGV4ZWNJbkdhbWUoIGAkeyBmdW5jdGlvbk5hbWUgfShfX2dldENvbXAoJyR7IHYuc2VsZWN0ZWROb2RlIH0nLCckeyBjb21wSWQgfScpKWAgKSB9ICk7XG4gICAgfVxuICAgIGlmICggbWV0aG9kTmFtZXMubGVuZ3RoID4gMCApIHtcbiAgICAgICAgZW50cmllcy5wdXNoKCB7IHR5cGU6ICdzZXBhcmF0b3InIH0gKTtcbiAgICAgICAgZm9yICggY29uc3QgbWV0aG9kTmFtZSBvZiBtZXRob2ROYW1lcyApIHtcbiAgICAgICAgICAgIGVudHJpZXMucHVzaCggeyBsYWJlbDogYCR7IG1ldGhvZE5hbWUgfSgpYCwgYWN0aW9uOiAoKSA9PiBleGVjTWV0aG9kKCBtZXRob2ROYW1lICkgfSApO1xuICAgICAgICB9XG4gICAgfVxuICAgIHBvcHVwTWVudSggZW50cmllcyApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2hvd1RyZWVNZW51KCk6IHZvaWQge1xuICAgIGNvbnN0IHYgPSBjb250ZXh0LnZ1ZUFwcDtcbiAgICBwb3B1cE1lbnUoIFtcbiAgICAgICAgeyBsYWJlbDogJ1RvZ2dsZSBEcmF3IENhbGwgKGJldGEpJywgYWN0aW9uOiAoKSA9PiBleGVjSW5HYW1lKCAnX190b2dnbGVEQygpJyApIH0sXG4gICAgICAgIHsgbGFiZWw6ICdUb2dnbGUgUm9vdCBOb2RlIG9mIDNEIE5vZGUnLCBhY3Rpb246ICgpID0+IHsgdi5oaWRlM2RSb290Tm9kZSA9ICF2LmhpZGUzZFJvb3ROb2RlOyB9IH0sXG4gICAgICAgIHsgbGFiZWw6ICdUb2dnbGUgQ2hpbGRyZW4gQ291bnQnLCBhY3Rpb246ICgpID0+IHsgdi5zaG93Q2hpbGRyZW5Db3VudCA9ICF2LnNob3dDaGlsZHJlbkNvdW50OyB9IH0sXG4gICAgXSApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2hvd0NvbnNvbGVNZW51KCk6IHZvaWQge1xuICAgIGNvbnN0IHYgPSBjb250ZXh0LnZ1ZUFwcDtcbiAgICBwb3B1cE1lbnUoIFsgeyBsYWJlbDogJ0NsZWFyIExvZ3MnLCBhY3Rpb246ICgpID0+IHsgdi5sb2dzID0gW107IH0gfSBdICk7XG59XG4iLCAiLy8gU2V0dGluZ3MgVnVlIGluc3RhbmNlIChyaWdodC1oYW5kIHNsaWRlLWluIHBhbmVsIGJvdW5kIHRvICNzZXR0aW5nIGluIGluZGV4Lmh0bWwpLlxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgb3MgZnJvbSAnb3MnO1xuaW1wb3J0IHsgY29udGV4dCwgZXhlY0luR2FtZSB9IGZyb20gJy4vY29udGV4dCc7XG5pbXBvcnQgeyBzeW5jV2luZG93TW9kZUlwYywgb3BlbkV4dGVybmFsIH0gZnJvbSAnLi9pcGMnO1xuaW1wb3J0IHsgZXh0ZW5zaW9uTWVudXMgfSBmcm9tICcuL21lbnVzJztcblxuY29uc3QgaXNXaW5kb3dzID0gb3MudHlwZSgpLmluY2x1ZGVzKCAnV2luZG93cycgKTtcbmNvbnN0IENIUk9NRV9FWFRSQV9XSURUSCA9IDU0NjtcbmNvbnN0IENIUk9NRV9FWFRSQV9IRUlHSFQgPSA0NTtcbmNvbnN0IFdJTkRPV1NfU0NST0xMQkFSX1dJRFRIID0gMTg7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTZXR0aW5nQXBwKCk6IGFueSB7XG4gICAgY29uc3Qgc2V0dGluZyA9IG5ldyBWdWUoIHtcbiAgICAgICAgZWw6ICcjc2V0dGluZycsXG4gICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgIGxvZ0NvdW50OiAzLFxuICAgICAgICAgICAgcmV0aW5hRW5hYmxlOiB0cnVlLFxuICAgICAgICAgICAgYXV0b1VwZGF0ZVRyZWU6IHRydWUsXG4gICAgICAgICAgICBkaXNwbGF5QXNGYWlyeVRyZWU6IGZhbHNlLFxuICAgICAgICAgICAgaGlkZUZhaXJ5Q29tQ29udGFpbmVyOiBmYWxzZSxcbiAgICAgICAgICAgIHN5bmNOb2RlRGV0YWlsOiB0cnVlLFxuICAgICAgICAgICAgZGlzYWJsZVdlYlNlYzogZmFsc2UsXG4gICAgICAgICAgICBzaG93RGV2VG9vbEluVGFiOiB0cnVlLFxuICAgICAgICAgICAgLy8gZGVmYXVsdCB0byBhIGxhbmRzY2FwZSAvIGRlc2t0b3AgdmlldyAobm90IHBob25lLXBvcnRyYWl0KTsgc2l6ZSBpc1xuICAgICAgICAgICAgLy8gW3Nob3J0ZXJFZGdlLCBsb25nZXJFZGdlXSwgc28gbGFuZHNjYXBlIHNob3dzIGxvbmdlckVkZ2UgeCBzaG9ydGVyRWRnZSA9IDY0MHg0ODAuXG4gICAgICAgICAgICAvLyA2NDAtd2lkZSBrZWVwcyB0aGUgd2hvbGUgd2luZG93IChnYW1lICsgfjU2NHB4IHBhbmVscykgZml0dGluZyBvbiBhIDEzNjYgbGFwdG9wLlxuICAgICAgICAgICAgc2l6ZTogWyA0ODAsIDY0MCBdLFxuICAgICAgICAgICAgZXh0cmFTaXplczogW10sXG4gICAgICAgICAgICBpc1BvcnRyYWl0OiBmYWxzZSxcbiAgICAgICAgICAgIC8vIGdhbWUgdmlldyBmb2xsb3dzIHRoZSBwcm9qZWN0IGRlc2lnbiByZXNvbHV0aW9uIHVudGlsIHRoZSB1c2VyIHBpY2tzIGFub3RoZXIgc2l6ZVxuICAgICAgICAgICAgbWF0Y2hEZXNpZ246IHRydWUsXG4gICAgICAgICAgICBzaG93OiBmYWxzZSxcbiAgICAgICAgICAgIHVybFBhcmFtczogJycsXG4gICAgICAgICAgICBjdXN0b21Vcmw6ICcnLFxuICAgICAgICAgICAgY2xlYXJMb2dBZnRlclJlZnJlc2g6IHRydWUsXG4gICAgICAgICAgICBleHRlbnNpb25GaWxlOiAnJyxcbiAgICAgICAgICAgIGVuYWJsZUV4dGVuc2lvbjogdHJ1ZSxcbiAgICAgICAgICAgIHN0YXRpc3RpY2luZzogZmFsc2UsXG4gICAgICAgICAgICBzdGF0aXN0aWNzOiBudWxsLFxuICAgICAgICAgICAgc29ydENvbXBQcm9wZXJ0aWVzOiB7fSxcbiAgICAgICAgICAgIHNpbXBsZU1vZGU6IGZhbHNlLFxuICAgICAgICB9LFxuICAgICAgICBjcmVhdGVkKCkge1xuICAgICAgICAgICAgY29uc3Qgc3RvcmVkID0gcmVhZENvbmZpZygpO1xuICAgICAgICAgICAgaWYgKCBzdG9yZWQgKSB7XG4gICAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbiggdGhpcywgc3RvcmVkICk7XG4gICAgICAgICAgICAgICAgdGhpcy5zaG93ID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmFwcGx5RGVzaWduU2l6ZSgpO1xuICAgICAgICAgICAgaWYgKCB0aGlzLmVuYWJsZUV4dGVuc2lvbiAmJiB0aGlzLmV4dGVuc2lvbkZpbGUgJiYgdGhpcy5leHRlbnNpb25GaWxlICE9PSAnJyApIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByYXcgPSBmcy5yZWFkRmlsZVN5bmMoIHRoaXMuZXh0ZW5zaW9uRmlsZSwgeyBlbmNvZGluZzogJ3V0Zi04JyB9ICk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHsgbWVudTogeyBub2RlLCBjb21wb25lbnQgfSB9ID0gSlNPTi5wYXJzZSggcmF3ICk7XG4gICAgICAgICAgICAgICAgICAgIGlmICggbm9kZT8ubGVuZ3RoID4gMCApIGV4dGVuc2lvbk1lbnVzLm5vZGUucHVzaCggLi4ubm9kZSApO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIGNvbXBvbmVudD8ubGVuZ3RoID4gMCApIGV4dGVuc2lvbk1lbnVzLmNvbXBvbmVudC5wdXNoKCAuLi5jb21wb25lbnQgKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoICggZXJyb3IgKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoICdbaW5zcGVjdG9yXSBmYWlsZWQgdG8gbG9hZCBleHRlbnNpb24gbWVudSBmaWxlJywgZXJyb3IgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGNvbXB1dGVkOiB7XG4gICAgICAgICAgICB3KCk6IG51bWJlciB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXNQb3J0cmFpdCA/IHRoaXMuc2l6ZVsgMCBdIDogdGhpcy5zaXplWyAxIF07XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgaCgpOiBudW1iZXIge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmlzUG9ydHJhaXQgPyB0aGlzLnNpemVbIDEgXSA6IHRoaXMuc2l6ZVsgMCBdO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHdlYnZpZXdTdHlsZSgpOiBzdHJpbmcge1xuICAgICAgICAgICAgICAgIGxldCB3aWR0aCA9IHRoaXMudyArIENIUk9NRV9FWFRSQV9XSURUSDtcbiAgICAgICAgICAgICAgICBjb25zdCBoZWlnaHQgPSB0aGlzLmggKyBDSFJPTUVfRVhUUkFfSEVJR0hUO1xuICAgICAgICAgICAgICAgIGlmICggdGhpcy5zaW1wbGVNb2RlICkgd2lkdGggPSB0aGlzLnc7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoIGlzV2luZG93cyApIHdpZHRoICs9IFdJTkRPV1NfU0NST0xMQkFSX1dJRFRIO1xuICAgICAgICAgICAgICAgIHN5bmNXaW5kb3dNb2RlSXBjKCB3aWR0aCwgaGVpZ2h0LCB0aGlzLnNpbXBsZU1vZGUsIGlzV2luZG93cyA/IDQ1IDogMzcgKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gYHdpZHRoOiR7IHRoaXMudyB9cHg7aGVpZ2h0OiR7IHRoaXMuaCB9cHg7bWluLXdpZHRoOiR7IHRoaXMudyB9cHg7bWluLWhlaWdodDokeyB0aGlzLmggfXB4YDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBnYW1lUGFuZWxTdHlsZSgpOiBzdHJpbmcge1xuICAgICAgICAgICAgICAgIHJldHVybiBgbWF4LXdpZHRoOiR7IHRoaXMudyB9cHhgO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGNvbmZpZ0RhdGFGb3JNYWluKCk6IG9iamVjdCB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc2ltcGxlTW9kZTogdGhpcy5zaW1wbGVNb2RlLCBpc1BvcnRyYWl0OiB0aGlzLmlzUG9ydHJhaXQsIHNpemU6IHRoaXMuc2l6ZSB9O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgbWV0aG9kczoge1xuICAgICAgICAgICAgb3BlbkV4dGVybmFsKCB1cmw6IHN0cmluZyApIHtcbiAgICAgICAgICAgICAgICBvcGVuRXh0ZXJuYWwoIHVybCApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIC8qKiBTaXplcyB0aGUgZ2FtZSB2aWV3IHRvIHRoZSBwcm9qZWN0IGRlc2lnbiByZXNvbHV0aW9uIHNvIG5vdGhpbmcgZ2V0cyBjcm9wcGVkIGJ5IHRoZSBmaXQgcG9saWN5LiAqL1xuICAgICAgICAgICAgYXBwbHlEZXNpZ25TaXplKCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRlc2lnbiA9IHJlYWREZXNpZ25TaXplKCk7XG4gICAgICAgICAgICAgICAgaWYgKCB0aGlzLm1hdGNoRGVzaWduID09PSBmYWxzZSB8fCAhZGVzaWduICkgcmV0dXJuO1xuICAgICAgICAgICAgICAgIHRoaXMuaXNQb3J0cmFpdCA9IGRlc2lnblsgMSBdID4gZGVzaWduWyAwIF07XG4gICAgICAgICAgICAgICAgdGhpcy5zaXplID0gWyBNYXRoLm1pbiggLi4uZGVzaWduICksIE1hdGgubWF4KCAuLi5kZXNpZ24gKSBdO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHRvZ2dsZVBvcnRyYWl0KCkge1xuICAgICAgICAgICAgICAgIHRoaXMuaXNQb3J0cmFpdCA9ICF0aGlzLmlzUG9ydHJhaXQ7XG4gICAgICAgICAgICAgICAgdGhpcy5zeW5jUG9ydHJhaXQoKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzeW5jUG9ydHJhaXQoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zYXZlVG9TdG9yYWdlKCk7XG4gICAgICAgICAgICAgICAgdGhpcy4kbmV4dFRpY2soKS50aGVuKCAoKSA9PiBleGVjSW5HYW1lKCAnc2V0VGltZW91dChfX3Jlc2l6ZUN2biwyMDApJyApICk7XG4gICAgICAgICAgICAgICAgY29udGV4dC52dWVBcHAuc2hvd1Jlc29sdXRpb25TZWxlY3RvciA9IGZhbHNlO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHRvZ2dsZVNpbXBsZU1vZGUoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zaW1wbGVNb2RlID0gIXRoaXMuc2ltcGxlTW9kZTtcbiAgICAgICAgICAgICAgICB0aGlzLnNhdmVUb1N0b3JhZ2UoKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB0b2dnbGVTb3J0Q29tcCggY29tTmFtZTogc3RyaW5nICkge1xuICAgICAgICAgICAgICAgIHRoaXMuc29ydENvbXBQcm9wZXJ0aWVzWyBjb21OYW1lIF0gPSB0aGlzLnNvcnRDb21wUHJvcGVydGllc1sgY29tTmFtZSBdID8gMCA6IDE7XG4gICAgICAgICAgICAgICAgdGhpcy5zYXZlVG9TdG9yYWdlKCAndG9nZ2xlU29ydENvbXAnICk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdG9nZ2xlU3RhdGlzdGljKCkge1xuICAgICAgICAgICAgICAgIHRoaXMuc3RhdGlzdGljaW5nID0gIXRoaXMuc3RhdGlzdGljaW5nO1xuICAgICAgICAgICAgICAgIGV4ZWNJbkdhbWUoIGBfX3N0YXJ0U3RhdGlzdGljKCR7IHRoaXMuc3RhdGlzdGljaW5nIH0pYCApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIC8qKiBQdXNoZXMgaG9zdC1jb250cm9sbGVkIGZsYWdzICsgcmV0aW5hIGhvb2sgaW50byBhIGZyZXNobHkgbG9hZGVkIGdhbWUgcGFnZS4gKi9cbiAgICAgICAgICAgIGluaXRNdiggdmFyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fSApIHtcbiAgICAgICAgICAgICAgICBsZXQgc2NyaXB0ID0gYF9fYXV0b1VwZGF0ZVRyZWU9JHsgdGhpcy5hdXRvVXBkYXRlVHJlZSB9O19fc3luY05vZGVEZXRhaWw9JHsgdGhpcy5zeW5jTm9kZURldGFpbCB9O2A7XG4gICAgICAgICAgICAgICAgZm9yICggY29uc3QgbmFtZSBpbiB2YXJzICkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB2YWx1ZSA9IHZhcnNbIG5hbWUgXTtcbiAgICAgICAgICAgICAgICAgICAgc2NyaXB0ICs9IHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgPyBgJHsgbmFtZSB9PSckeyB2YWx1ZSB9JztgIDogYCR7IG5hbWUgfT0keyB2YWx1ZSB9O2A7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHNjcmlwdCArPSBgdmFyIGRlY3RlZENDID0gc2V0SW50ZXJ2YWwoZnVuY3Rpb24oKXtcbiAgICAgICAgICAgICAgICBpZighd2luZG93W1wiY2NcIl0pe1xuICAgICAgICAgICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2xlYXJJbnRlcnZhbChkZWN0ZWRDQylcbiAgICAgICAgICAgICAgICBjYy5kaXJlY3Rvci5vbmNlKGNjLkRpcmVjdG9yLkVWRU5UX0JFRk9SRV9TQ0VORV9MQVVOQ0gsZnVuY3Rpb24oKXtpZighX19tb3JlVGhlbjNfNF8wKCkpY2Mudmlldy5lbmFibGVSZXRpbmEoJHsgdGhpcy5yZXRpbmFFbmFibGUgfSl9KVxuICAgICAgICAgICAgfSwgMTApXG4gICAgICAgICAgICAgICAgYDtcbiAgICAgICAgICAgICAgICBleGVjSW5HYW1lKCBzY3JpcHQgKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NyaXB0O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGNoYW5nZVNldHRpbmcoKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdiA9IGNvbnRleHQudnVlQXBwO1xuICAgICAgICAgICAgICAgIGlmICggdGhpcy5hdXRvVXBkYXRlVHJlZSAmJiB2LmNhblVwZGF0ZVRyZWUgKSB2LmZvcmNlVXBkYXRlVHJlZSgpO1xuICAgICAgICAgICAgICAgIGV4ZWNJbkdhbWUoIGBfX2F1dG9VcGRhdGVUcmVlPSR7IHRoaXMuYXV0b1VwZGF0ZVRyZWUgfTtfX3N5bmNOb2RlRGV0YWlsPSR7IHRoaXMuc3luY05vZGVEZXRhaWwgfTtgICk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgc2F2ZVRvU3RvcmFnZSggZXZlbnROYW1lPzogc3RyaW5nICkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2hhbmdlU2V0dGluZygpO1xuICAgICAgICAgICAgICAgIHNhdmVDb25maWcoIHRoaXMuJGRhdGEgKTtcbiAgICAgICAgICAgICAgICB0aGlzLiRlbWl0KCBldmVudE5hbWUgfHwgJ3NldHRpbmdTaXplX2NoYW5nZScgKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBjbG9zZSgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNob3cgPSBmYWxzZTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgfSApO1xuICAgIGNvbnRleHQuc2V0dGluZ0FwcCA9IHNldHRpbmc7XG4gICAgKCB3aW5kb3cgYXMgYW55ICkuc2V0dGluZyA9IHNldHRpbmc7XG4gICAgcmV0dXJuIHNldHRpbmc7XG59XG4iLCAiLy8gUmlnaHQtcGFuZWwgY29tcG9uZW50czogbm9kZSBoZWFkZXIgKE5vZGVEZXRhaWxWaWV3KSwgb25lIGNvbXBvbmVudCBjYXJkIChOb2RlQ29tcG9uZW50KSxcbi8vIG9uZSBwcm9wZXJ0eSByb3cgKENvbVByb3BlcnR5KS4gVGVtcGxhdGVzIGFyZSB0cmFuc2NyaWJlZCB2ZXJiYXRpbSBmcm9tIHRoZSByZWNvdmVyZWQgVUkuXG5pbXBvcnQgeyBjb250ZXh0LCBleGVjSW5HYW1lIH0gZnJvbSAnLi8uLi9jb250ZXh0JztcbmltcG9ydCB7IHNob3dDb21wb25lbnRNZW51IH0gZnJvbSAnLi8uLi9tZW51cyc7XG5pbXBvcnQgeyBmb2N1c0Fzc2V0SW5FZGl0b3IgfSBmcm9tICcuLy4uL2lwYyc7XG5cbi8qKiB3aWRnZXQtc3R5bGUgcHJvcGVydHkgc29ydDogY29tcGFyZSBieSByZXZlcnNlZCBzdHJpbmdzIHNvIExlZnQvUmlnaHQvVG9wL0JvdHRvbSBncm91cCAqL1xuY29uc3Qgd2lkZ2V0U29ydCA9ICggYTogc3RyaW5nLCBiOiBzdHJpbmcgKTogbnVtYmVyID0+XG4gICAgYi5zcGxpdCggJycgKS5yZXZlcnNlKCkuam9pbiggJycgKS5sb2NhbGVDb21wYXJlKCBhLnNwbGl0KCAnJyApLnJldmVyc2UoKS5qb2luKCAnJyApICk7XG5cbi8qKiBtZXRhIGtleXMgb2YgYSBzZXJpYWxpemVkIGNvbXBvbmVudCB0aGF0IGFyZSBub3QgdXNlciBwcm9wZXJ0aWVzICovXG5jb25zdCBOT05fUFJPUEVSVFlfS0VZUyA9IG5ldyBTZXQoIFsgJ3V1aWQnLCAnbmFtZScsICdlbmFibGVkJywgJ2lzQ0NfQ09NJywgJ3BhY2thZ2VJdGVtJywgJ25vZGUnLCAnX19tZXRob2RzX19fJyBdICk7XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3Rlck5vZGVEZXRhaWxDb21wb25lbnRzKCk6IHZvaWQge1xuICAgIFZ1ZS5jb21wb25lbnQoICdOb2RlQ29tcG9uZW50Jywge1xuICAgICAgICBwcm9wczogeyBjb206IE9iamVjdCB9LFxuICAgICAgICBkYXRhKCkge1xuICAgICAgICAgICAgcmV0dXJuIHsgZmlsdGVyU3RyOiAnJywgc29ydDogZmFsc2UgfTtcbiAgICAgICAgfSxcbiAgICAgICAgY3JlYXRlZCgpIHtcbiAgICAgICAgICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgICAgICAgICAgdGhpcy5mdXBkYXRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHNldHRpbmcgPSBjb250ZXh0LnNldHRpbmdBcHA7XG4gICAgICAgICAgICAgICAgaWYgKCBzZXR0aW5nLnNvcnRDb21wUHJvcGVydGllc1sgc2VsZi5jb21OYW1lIF0gPT09IHVuZGVmaW5lZCApIHtcbiAgICAgICAgICAgICAgICAgICAgc2V0dGluZy5zb3J0Q29tcFByb3BlcnRpZXNbIHNlbGYuY29tTmFtZSBdID0gc2VsZi5zb3J0ID0gc2VsZi5kZWZhdWx0U29ydDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLnNvcnQgPSBCb29sZWFuKCBzZXR0aW5nLnNvcnRDb21wUHJvcGVydGllc1sgc2VsZi5jb21OYW1lIF0gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29udGV4dC5zZXR0aW5nQXBwLiRvbiggJ3RvZ2dsZVNvcnRDb21wJywgdGhpcy5mdXBkYXRlICk7XG4gICAgICAgICAgICB0aGlzLmZ1cGRhdGUoKTtcbiAgICAgICAgfSxcbiAgICAgICAgYmVmb3JlRGVzdHJveSgpIHtcbiAgICAgICAgICAgIGNvbnRleHQuc2V0dGluZ0FwcC4kb2ZmKCAndG9nZ2xlU29ydENvbXAnLCB0aGlzLmZ1cGRhdGUgKTtcbiAgICAgICAgfSxcbiAgICAgICAgY29tcHV0ZWQ6IHtcbiAgICAgICAgICAgIGNvbU5hbWUoKTogc3RyaW5nIHtcbiAgICAgICAgICAgICAgICBjb25zdCBuYW1lID0gdGhpcy5jb20ubmFtZTtcbiAgICAgICAgICAgICAgICBpZiAoICF0aGlzLmNvbS5pc0NDX0NPTSApIHJldHVybiBuYW1lO1xuICAgICAgICAgICAgICAgIHJldHVybiAnPCcgKyBuYW1lLnNwbGl0KCAnPCcgKVsgMSBdO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGRlZmF1bHRTb3J0KCk6IGJvb2xlYW4ge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbU5hbWUgPT09ICc8V2lkZ2V0PicgfHwgdGhpcy5jb21OYW1lID09PSAnPEJ1dHRvbj4nIHx8IHRoaXMuY29tTmFtZSA9PT0gJzxMYWJlbD4nO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGFmdGVyRmlsdGVycygpOiBzdHJpbmdbXSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc29ydGVyID0gdGhpcy5zb3J0ID8gd2lkZ2V0U29ydCA6IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXMoIHRoaXMuY29tICkuc29ydCggc29ydGVyICk7XG4gICAgICAgICAgICAgICAgaWYgKCB0aGlzLmZpbHRlclN0ci50cmltKCkgPT09ICcnICkgcmV0dXJuIGtleXMuZmlsdGVyKCAoIGtleTogc3RyaW5nICkgPT4gIU5PTl9QUk9QRVJUWV9LRVlTLmhhcygga2V5ICkgKTtcbiAgICAgICAgICAgICAgICByZXR1cm4ga2V5cy5maWx0ZXIoICgga2V5OiBzdHJpbmcgKSA9PlxuICAgICAgICAgICAgICAgICAgICAhTk9OX1BST1BFUlRZX0tFWVMuaGFzKCBrZXkgKSAmJiBrZXkudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyggdGhpcy5maWx0ZXJTdHIudG9Mb3dlckNhc2UoKSApICk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgc2hvd1NlYXJjaCgpOiBib29sZWFuIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gT2JqZWN0LmtleXMoIHRoaXMuY29tICkubGVuZ3RoID4gODtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBjaGVja1Zpc2libGUoKTogc3RyaW5nIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5jb20uaXNDQ19DT00gPyAndmlzaWJsZScgOiAnaGlkZGVuJztcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIG1ldGhvZHM6IHtcbiAgICAgICAgICAgIHNob3dNZW51MigpIHtcbiAgICAgICAgICAgICAgICBzaG93Q29tcG9uZW50TWVudSggdGhpcy5jb20udXVpZCwgdGhpcy5jb21OYW1lLCB0aGlzLmNvbS5fX21ldGhvZHNfX18gfHwgW10sICggbWV0aG9kTmFtZTogc3RyaW5nICkgPT4gdGhpcy5leGVjQ29tcE1ldGhvZCggbWV0aG9kTmFtZSApICk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZXhlY0NvbXBNZXRob2QoIG1ldGhvZE5hbWU6IHN0cmluZyApIHtcbiAgICAgICAgICAgICAgICBleGVjSW5HYW1lKCBgX19leGVjQ29tcE1ldGhvZCgnJHsgY29udGV4dC52dWVBcHAuc2VsZWN0ZWROb2RlIH0nLCckeyB0aGlzLmNvbS51dWlkIH0nLCckeyBtZXRob2ROYW1lIH0nKWAgKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB0b2dnbGVDb21wKCkge1xuICAgICAgICAgICAgICAgIGV4ZWNJbkdhbWUoIGBfX3RvZ2dsZUNvbXAoJyR7IGNvbnRleHQudnVlQXBwLnNlbGVjdGVkTm9kZSB9JywnJHsgdGhpcy5jb20udXVpZCB9JylgICk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgc2V0S1YoIGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93biApIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNvbVsga2V5IF1bIDAgXSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgIGNvbnN0IGVuY29kZWQgPSB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnID8gJ2AnICsgdmFsdWUgKyAnYCcgOiB2YWx1ZTtcbiAgICAgICAgICAgICAgICBleGVjSW5HYW1lKCBgX19zZXRDb21BdHRyKCckeyBjb250ZXh0LnZ1ZUFwcC5zZWxlY3RlZE5vZGUgfScsJyR7IHRoaXMuY29tLnV1aWQgfScsJyR7IGtleSB9JywkeyBlbmNvZGVkIH0pYCApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgdGVtcGxhdGU6IGBcbiAgICA8ZGl2IGNsYXNzPVwiQ29tcG9uZW50XCI+XG4gICAgICAgIDxkaXYgc3R5bGU9XCJoZWlnaHQ6MWVtO1wiPjwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzPVwibm9kZU5hbWVcIj5cbiAgICAgICAgICAgIDxsYWJlbD5cbiAgICAgICAgICAgICAgICA8aW5wdXQgOnN0eWxlPVwie3Zpc2liaWxpdHk6Y2hlY2tWaXNpYmxlfVwiIEBjaGFuZ2U9XCJ0b2dnbGVDb21wXCIgdHlwZT1cImNoZWNrYm94XCIgIHYtbW9kZWw9XCJjb20uZW5hYmxlZFwiIC8+XG4gICAgICAgICAgICAgICAge3tjb21OYW1lfX1cbiAgICAgICAgICAgIDwvbGFiZWw+XG4gICAgICAgICAgICA8c3BhbiBzdHlsZT1cImZsZXg6MVwiPjwvc3Bhbj5cbiAgICAgICAgICAgIDxzcGFuIHYtaWY9XCJjb20uaXNDQ19DT01cIiBAY2xpY2sucHJldmVudD1cInNob3dNZW51MlwiIGNsYXNzPVwiaWNvbmZvbnQgaWNvbi1tZW51XCI+PC9zcGFuPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPGlucHV0IHBsYWNlaG9sZGVyPVwiZmlsdGVyIHByb3BlcnRpZXNcIiB0eXBlPVwic2VhcmNoXCIgdi1tb2RlbD1cImZpbHRlclN0clwiIHYtaWY9XCJzaG93U2VhcmNoXCIvPlxuICAgICAgICA8Y29tLXByb3BlcnR5IHYtZm9yPVwiayBpbiBhZnRlckZpbHRlcnNcIiA6cGFyYW09XCJjb21ba11bMl1cIiA6c2V0S1Y9XCJzZXRLVlwiIDprPVwia1wiIDp2YWw9XCJjb21ba11bMF1cIiA6dD1cImNvbVtrXVsxXVwiIDppc2M9XCJjb20uaXNDQ19DT01cIiA6a2V5PVwiY29tK2tcIj48L2NvbS1wcm9wZXJ0eT5cbiAgICA8L2Rpdj5cbiAgICBgLFxuICAgIH0gKTtcblxuICAgIFZ1ZS5jb21wb25lbnQoICdDb21Qcm9wZXJ0eScsIHtcbiAgICAgICAgcHJvcHM6IFsgJ2snLCAndmFsJywgJ3QnLCAnaXNjJywgJ3NldEtWJywgJ3BhcmFtJyBdLFxuICAgICAgICBjcmVhdGVkKCkge1xuICAgICAgICAgICAgdGhpcy52bCA9IHRoaXMudmFsO1xuICAgICAgICAgICAgaWYgKCB0aGlzLmlzRW51bSApIHRoaXMudmwgPSB0aGlzLnBhcmFtLmZpbmQoICggZW50cnk6IGFueSApID0+IGVudHJ5LnZhbHVlID09PSB0aGlzLnZhbC52YWx1ZSApO1xuICAgICAgICAgICAgdGhpcy5saW5rID0gdGhpcy5jYW5MaW5rKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGRhdGEoKSB7XG4gICAgICAgICAgICByZXR1cm4geyBsaW5rOiBudWxsLCB2bDogbnVsbCwgbnVtYmVyRWRpdDogZmFsc2UgfTtcbiAgICAgICAgfSxcbiAgICAgICAgbWV0aG9kczoge1xuICAgICAgICAgICAgY2FuTGluaygpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB2YWx1ZSA9IHRoaXMudmw7XG4gICAgICAgICAgICAgICAgaWYgKCB0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnICkgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgICAgaWYgKCAhdmFsdWUuaW5jbHVkZXMoICc6QCcgKSB8fCAhdmFsdWUuaW5jbHVkZXMoICd8JyApICkgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgICAgaWYgKCB2YWx1ZS5pbmNsdWRlcyggJ3x8JyApICkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBbIG5hbWUsIHV1aWRQYXRoIF0gPSB2YWx1ZS5zcGxpdCggJ3x8JyApO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBuYW1lLCB1dWlkUGF0aCwgdHlwZTogJ2Fzc2V0JyB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBbIHJhd05hbWUsIHJhd1BhdGggXSA9IHZhbHVlLnNwbGl0KCAnfCcgKTtcbiAgICAgICAgICAgICAgICBsZXQgbmFtZSA9IHJhd05hbWU7XG4gICAgICAgICAgICAgICAgY29uc3QgdXVpZFBhdGggPSByYXdQYXRoLnNwbGl0KCAnLy8nICk7XG4gICAgICAgICAgICAgICAgaWYgKCB1dWlkUGF0aC5zbGljZSggLTEgKVsgMCBdID09PSBjb250ZXh0LnZ1ZUFwcC5zZWxlY3RlZE5vZGUgKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHBhcnRzID0gbmFtZS5zcGxpdCggJzpAJyApO1xuICAgICAgICAgICAgICAgICAgICBwYXJ0cy5wb3AoKTtcbiAgICAgICAgICAgICAgICAgICAgcGFydHMucHVzaCggJ1tzZWxmXScgKTtcbiAgICAgICAgICAgICAgICAgICAgbmFtZSA9IHBhcnRzLmpvaW4oICc6QCcgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgbmFtZSwgdXVpZFBhdGgsIHR5cGU6ICdub2RlJyB9O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGxvY2F0ZSgpIHtcbiAgICAgICAgICAgICAgICBpZiAoIHRoaXMubGluay50eXBlID09PSAnbm9kZScgKSBjb250ZXh0LnZ1ZUFwcC5sb2NhdGVOb2RlKCB0aGlzLmxpbmsudXVpZFBhdGggKTtcbiAgICAgICAgICAgICAgICBpZiAoIHRoaXMubGluay50eXBlID09PSAnYXNzZXQnICkgZm9jdXNBc3NldEluRWRpdG9yKCB0aGlzLmxpbmsudXVpZFBhdGggKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBjbGlja0Jvb2woKSB7XG4gICAgICAgICAgICAgICAgaWYgKCAhdGhpcy5pc2MgKSByZXR1cm47XG4gICAgICAgICAgICAgICAgdGhpcy52bCA9ICF0aGlzLnZsO1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0S1YoIHRoaXMuaywgdGhpcy52bCApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGNoYW5nZUNvbG9yKCkgeyB0aGlzLnNldEtWKCB0aGlzLmssIHRoaXMudmwgKTsgfSxcbiAgICAgICAgICAgIGNoYW5nZUVudW0oKSB7IHRoaXMuc2V0S1YoIHRoaXMuaywgdGhpcy52bC52YWx1ZSApOyB9LFxuICAgICAgICAgICAgY2hhbmdlTnVtYmVyKCkgeyB0aGlzLnNldEtWKCB0aGlzLmssIE51bWJlciggdGhpcy52bCApICk7IH0sXG4gICAgICAgICAgICBjaGFuZ2VTdHJpbmcoKSB7IHRoaXMuc2V0S1YoIHRoaXMuaywgdGhpcy52bCApOyB9LFxuICAgICAgICAgICAgY2xvc2VOdW1iZXJFZGl0KCkgeyB0aGlzLm51bWJlckVkaXQgPSBmYWxzZTsgfSxcbiAgICAgICAgICAgIG9wZW5OdW1iZXJFZGl0KCkge1xuICAgICAgICAgICAgICAgIHRoaXMubnVtYmVyRWRpdCA9IHRydWU7XG4gICAgICAgICAgICAgICAgdGhpcy4kbmV4dFRpY2soKS50aGVuKCAoKSA9PiB7IHRoaXMuJHJlZnMubnVtSW5wdXQ/LmZvY3VzKCk7IH0gKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIGNvbXB1dGVkOiB7XG4gICAgICAgICAgICBpc0NvbG9yKCk6IGJvb2xlYW4ge1xuICAgICAgICAgICAgICAgIGlmICggdGhpcy50ID09PSAnY29sb3InICkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgaWYgKCB0eXBlb2YgdGhpcy52bCAhPT0gJ3N0cmluZycgKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMudmwuc3RhcnRzV2l0aCggJ0NvbG9yOnJnYmEoJyApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGlzRW51bSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMudCA9PT0gJ2VudW0nOyB9LFxuICAgICAgICAgICAgY29sb3IoKTogc3RyaW5nIHsgcmV0dXJuICdiYWNrZ3JvdW5kOicgKyB0aGlzLnZsOyB9LFxuICAgICAgICAgICAgaXNCb29sKCk6IGJvb2xlYW4geyByZXR1cm4gdHlwZW9mIHRoaXMudmwgPT09ICdib29sZWFuJzsgfSxcbiAgICAgICAgICAgIGlzVHJ1ZSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMudmwgPT09IHRydWU7IH0sXG4gICAgICAgICAgICBpc0ZhbHNlKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy52bCA9PT0gZmFsc2U7IH0sXG4gICAgICAgICAgICBpc051bWJlcigpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMudCA9PT0gJ251bWJlcic7IH0sXG4gICAgICAgICAgICBpc1N0cmluZygpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMudCA9PT0gJ3N0cmluZyc7IH0sXG4gICAgICAgICAgICB0cmFuc1N0cigpOiBzdHJpbmcgeyByZXR1cm4gdGhpcy52bC5yZXBsYWNlKCAvXFxuL2csICdcXFxcbicgKTsgfSxcbiAgICAgICAgICAgIGlzTm9ybWFsKCk6IGJvb2xlYW4ge1xuICAgICAgICAgICAgICAgIHJldHVybiAhdGhpcy5pc1N0cmluZyAmJiAhdGhpcy5pc051bWJlciAmJiAhdGhpcy5pc0VudW0gJiYgIXRoaXMuaXNDb2xvciAmJiAhdGhpcy5pc0Jvb2wgJiYgIXRoaXMubGluaztcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBib29sSWNvbigpOiBzdHJpbmcge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmlzVHJ1ZSA/ICdpY29uZm9udCBpY29uLXJpZ2h0JyA6ICdpY29uZm9udCBpY29uLXdyb25nMic7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB0ZW1wbGF0ZTogYFxuICAgIDxkaXYgY2xhc3M9XCJjb21Qcm9wZXJ0eVwiPlxuICAgICAgICA8ZGl2IGNsYXNzPVwibm9kZVByb3BlcnR5VGl0bGVcIj57e2t9fTo8L2Rpdj5cblxuICAgICAgICA8ZGl2IHYtaWY9XCJpc0NvbG9yXCIgY2xhc3M9XCJub2RlUHJvcGVydHlTdWJUaXRsZVwiPlxuICAgICAgICAgICAgPHNwYW4gdi1pZj1cIiFpc2NcIiA6c3R5bGU9XCJjb2xvclwiIGNsYXNzPVwiY29sb3JSZWN0XCI+PC9zcGFuPlxuICAgICAgICAgICAgPGlucHV0IHYtaWY9XCJpc2NcIiBAaW5wdXQ9XCJjaGFuZ2VDb2xvclwiIHR5cGU9XCJjb2xvclwiIHYtbW9kZWw9XCJ2bFwiIC8+XG4gICAgICAgICAgICA8c3BhbiA+e3t2bH19PC9zcGFuPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPGRpdiB2LWlmPVwiaXNFbnVtICYmIGlzY1wiIGNsYXNzPVwibm9kZVByb3BlcnR5U3ViVGl0bGVcIj5cbiAgICAgICAgICAgIDxzZWxlY3Qgdi1tb2RlbD1cInZsXCIgQGNoYW5nZT1cImNoYW5nZUVudW1cIj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHYtZm9yPVwicCBpbiBwYXJhbVwiIDp2YWx1ZT1cInBcIj57e3AubmFtZX19PC9vcHRpb24+XG4gICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgPC9kaXY+XG4gICAgICAgIDxkaXYgdi1pZj1cImlzRW51bSAmJiAhaXNjXCIgY2xhc3M9XCJub2RlUHJvcGVydHlTdWJUaXRsZSBwcmV3cmFwXCI+e3t2bC52YWx1ZX19PC9kaXY+XG4gICAgICAgIDxkaXYgdi1pZj1cImlzTnVtYmVyXCIgY2xhc3M9XCJub2RlUHJvcGVydHlTdWJUaXRsZVwiID5cbiAgICAgICAgICAgIDxzcGFuIHYtaWY9XCIhbnVtYmVyRWRpdFwiIEBjbGljaz1cIm9wZW5OdW1iZXJFZGl0XCI+e3t2bH19PC9zcGFuPlxuICAgICAgICAgICAgPGlucHV0IHJlZj1cIm51bUlucHV0XCIgQGJsdXI9XCJjbG9zZU51bWJlckVkaXRcIiBAa2V5dXAuZXNjLnN0b3A9XCJjbG9zZU51bWJlckVkaXRcIiBAa2V5dXAuZW50ZXIuc3RvcD1cImNsb3NlTnVtYmVyRWRpdFwiIHYtaWY9XCJudW1iZXJFZGl0XCIgdHlwZT1cIm51bWJlclwiIHYtbW9kZWw9XCJ2bFwiIEBpbnB1dD1cImNoYW5nZU51bWJlclwiIC8+XG4gICAgICAgIDwvZGl2PlxuXG4gICAgICAgIDxkaXYgdi1pZj1cImlzU3RyaW5nXCIgY2xhc3M9XCJub2RlUHJvcGVydHlTdWJUaXRsZVwiID5cbiAgICAgICAgICAgIDxzcGFuIHYtaWY9XCIhbnVtYmVyRWRpdFwiIEBjbGljaz1cIm9wZW5OdW1iZXJFZGl0XCI+e3sgdHJhbnNTdHIgfX08L3NwYW4+XG4gICAgICAgICAgICA8dGV4dGFyZWEgcmVmPVwibnVtSW5wdXRcIiBAYmx1cj1cImNsb3NlTnVtYmVyRWRpdFwiIEBrZXl1cC5lc2Muc3RvcD1cImNsb3NlTnVtYmVyRWRpdFwiIHYtaWY9XCJudW1iZXJFZGl0XCIgdi1tb2RlbD1cInZsXCIgQGlucHV0PVwiY2hhbmdlU3RyaW5nXCIgPjwvdGV4dGFyZWE+XG4gICAgICAgIDwvZGl2PlxuXG4gICAgICAgIDxkaXYgdi1pZj1cImlzQm9vbFwiIGNsYXNzPVwibm9kZVByb3BlcnR5U3ViVGl0bGVcIiBAY2xpY2s9XCJjbGlja0Jvb2xcIj5cbiAgICAgICAgICAgIDxzcGFuIDpjbGFzcz1cImJvb2xJY29uXCIgPjwvc3Bhbj5cbiAgICAgICAgPC9kaXY+XG4gICAgICAgIDxkaXYgdi1pZj1cImlzTm9ybWFsXCIgY2xhc3M9XCJub2RlUHJvcGVydHlTdWJUaXRsZSBwcmV3cmFwXCI+e3tTdHJpbmcodmwpfX08L2Rpdj5cbiAgICAgICAgPGEgdi1pZj1cImxpbmtcIiBjbGFzcz1cIm5vZGVQcm9wZXJ0eVN1YlRpdGxlIHByZXdyYXBcIiBAY2xpY2s9XCJsb2NhdGUoKVwiPnt7bGluay5uYW1lfX08L2E+XG4gICAgPC9kaXY+XG4gICAgYCxcbiAgICB9ICk7XG5cbiAgICBWdWUuY29tcG9uZW50KCAnTm9kZURldGFpbFZpZXcnLCB7XG4gICAgICAgIHByb3BzOiB7IGRldGFpbDogT2JqZWN0IH0sXG4gICAgICAgIGRhdGEoKSB7XG4gICAgICAgICAgICByZXR1cm4geyBjbG9zZTogZmFsc2UgfTtcbiAgICAgICAgfSxcbiAgICAgICAgY29tcHV0ZWQ6IHtcbiAgICAgICAgICAgIGljb25UcmFuc2Zvcm0oKTogc3RyaW5nIHtcbiAgICAgICAgICAgICAgICBjb25zdCByb3RhdGUgPSB0aGlzLmNsb3NlID8gJ3RyYW5zZm9ybTpyb3RhdGUoOTBkZWcpJyA6ICd0cmFuc2Zvcm06cm90YXRlKDE4MGRlZyknO1xuICAgICAgICAgICAgICAgIHJldHVybiAnZGlzcGxheTogaW5saW5lLWJsb2NrOycgKyByb3RhdGU7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBtZXRob2RzOiB7XG4gICAgICAgICAgICB0b2dnbGVOb2RlKCkgeyB0aGlzLmNsb3NlID0gIXRoaXMuY2xvc2U7IH0sXG4gICAgICAgICAgICBzeW5jTm9kZSggcHJvcFBhdGg6IHN0cmluZyApIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJ0cyA9IHByb3BQYXRoLnNwbGl0KCAnLicgKTtcbiAgICAgICAgICAgICAgICBsZXQgdmFsdWUgPSBwYXJ0cy5sZW5ndGggPiAxID8gdGhpcy5kZXRhaWxbIHBhcnRzWyAwIF0gXVsgcGFydHNbIDEgXSBdIDogdGhpcy5kZXRhaWxbIHBhcnRzWyAwIF0gXTtcbiAgICAgICAgICAgICAgICBpZiAoIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgKSB2YWx1ZSA9IGAnJHsgdmFsdWUgfSdgO1xuICAgICAgICAgICAgICAgIGV4ZWNJbkdhbWUoIGBfX3N5bmNOb2RlKCckeyB0aGlzLmRldGFpbC5pZCB9JywnJHsgcHJvcFBhdGggfScsJHsgdmFsdWUgfSlgICk7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB0ZW1wbGF0ZTogYFxuICAgIDxkaXYgY2xhc3M9XCJub2RlRGV0YWlsXCI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJub2RlTmFtZVwiPlxuICAgICAgICAgICAgPGxhYmVsPlxuICAgICAgICAgICAgICAgIDxpbnB1dCBAY2hhbmdlPVwic3luY05vZGUoJ2FjdGl2ZScpXCIgdHlwZT1cImNoZWNrYm94XCIgdmFsdWU9XCJkZXRhaWwubmFtZVwiIHYtbW9kZWw9XCJkZXRhaWwuYWN0aXZlXCIgLz5cbiAgICAgICAgICAgICAgICBOb2RlOiB7e2RldGFpbC5uYW1lfX1cbiAgICAgICAgICAgIDwvbGFiZWw+XG4gICAgICAgICAgICA8c3BhbiBzdHlsZT1cImZsZXg6MVwiPjwvc3Bhbj5cbiAgICAgICAgICAgIDxzcGFuIEBjbGljay5zdG9wPVwidG9nZ2xlTm9kZSgpXCIgOnN0eWxlPVwiaWNvblRyYW5zZm9ybVwiICBjbGFzcz1cIm5vZGVhcnJvdyBpY29uZm9udCBpY29uLXNoYW5nc2Fuamlhb1wiPjwvc3Bhbj5cbiAgICAgICAgPC9kaXY+XG5cbiAgICA8ZGl2IHYtc2hvdz1cIiFjbG9zZVwiIGNsYXNzPVwibm9kZVByb3BlcnRpZXNcIj5cbiAgICA8ZGl2IGNsYXNzPVwibm9kZVByb3BlcnR5XCI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJub2RlUHJvcGVydHlUaXRsZVwiPlBvc2l0aW9uOjwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzPVwibm9kZVByb3BlcnR5U3ViVGl0bGVcIj5YOjwvZGl2PlxuICAgICAgICA8aW5wdXQgQGlucHV0PVwic3luY05vZGUoJ3Bvc2l0aW9uLngnKVwiIHN0ZXA9XCIwLjAyXCIgdHlwZT1cIm51bWJlclwiIHYtbW9kZWw9XCJkZXRhaWwucG9zaXRpb24ueFwiIC8+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJub2RlUHJvcGVydHlTdWJUaXRsZVwiPlk6PC9kaXY+XG4gICAgICAgIDxpbnB1dCBAaW5wdXQ9XCJzeW5jTm9kZSgncG9zaXRpb24ueScpXCIgc3RlcD1cIjAuMDJcIiB0eXBlPVwibnVtYmVyXCIgdi1tb2RlbD1cImRldGFpbC5wb3NpdGlvbi55XCIgLz5cbiAgICAgICAgPGRpdiBjbGFzcz1cIm5vZGVQcm9wZXJ0eVN1YlRpdGxlXCI+Wjo8L2Rpdj5cbiAgICAgICAgPGlucHV0IEBpbnB1dD1cInN5bmNOb2RlKCdwb3NpdGlvbi56JylcIiBzdGVwPVwiMC4wMlwiIHR5cGU9XCJudW1iZXJcIiB2LW1vZGVsPVwiZGV0YWlsLnBvc2l0aW9uLnpcIiAvPlxuICAgIDwvZGl2PlxuICAgIDxkaXYgY2xhc3M9XCJub2RlUHJvcGVydHlcIj5cbiAgICAgICAgPGRpdiBjbGFzcz1cIm5vZGVQcm9wZXJ0eVRpdGxlXCI+Um90YXRpb246PC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJub2RlUHJvcGVydHlTdWJUaXRsZVwiPlg6PC9kaXY+XG4gICAgICAgIDxpbnB1dCBAaW5wdXQ9XCJzeW5jTm9kZSgnZXVsZXJBbmdsZXMueCcpXCIgc3RlcD1cIjVcIiB0eXBlPVwibnVtYmVyXCIgdi1tb2RlbD1cImRldGFpbC5ldWxlckFuZ2xlcy54XCIgLz5cbiAgICAgICAgPGRpdiBjbGFzcz1cIm5vZGVQcm9wZXJ0eVN1YlRpdGxlXCI+WTo8L2Rpdj5cbiAgICAgICAgPGlucHV0IEBpbnB1dD1cInN5bmNOb2RlKCdldWxlckFuZ2xlcy55JylcIiBzdGVwPVwiNVwiIHR5cGU9XCJudW1iZXJcIiB2LW1vZGVsPVwiZGV0YWlsLmV1bGVyQW5nbGVzLnlcIiAvPlxuICAgICAgICA8ZGl2IGNsYXNzPVwibm9kZVByb3BlcnR5U3ViVGl0bGVcIj5aOjwvZGl2PlxuICAgICAgICA8aW5wdXQgQGlucHV0PVwic3luY05vZGUoJ2V1bGVyQW5nbGVzLnonKVwiIHN0ZXA9XCI1XCIgdHlwZT1cIm51bWJlclwiIHYtbW9kZWw9XCJkZXRhaWwuZXVsZXJBbmdsZXMuelwiIC8+XG4gICAgPC9kaXY+XG4gICAgPGRpdiBjbGFzcz1cIm5vZGVQcm9wZXJ0eVwiPlxuICAgICAgICA8ZGl2IGNsYXNzPVwibm9kZVByb3BlcnR5VGl0bGVcIj5TY2FsZTo8L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzcz1cIm5vZGVQcm9wZXJ0eVN1YlRpdGxlXCI+WDo8L2Rpdj5cbiAgICAgICAgPGlucHV0IEBpbnB1dD1cInN5bmNOb2RlKCdzY2FsZS54JylcIiBzdGVwPVwiMC4wMlwiIHR5cGU9XCJudW1iZXJcIiB2LW1vZGVsPVwiZGV0YWlsLnNjYWxlLnhcIiAvPlxuICAgICAgICA8ZGl2IGNsYXNzPVwibm9kZVByb3BlcnR5U3ViVGl0bGVcIj5ZOjwvZGl2PlxuICAgICAgICA8aW5wdXQgQGlucHV0PVwic3luY05vZGUoJ3NjYWxlLnknKVwiIHN0ZXA9XCIwLjAyXCIgdHlwZT1cIm51bWJlclwiIHYtbW9kZWw9XCJkZXRhaWwuc2NhbGUueVwiIC8+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJub2RlUHJvcGVydHlTdWJUaXRsZVwiPlo6PC9kaXY+XG4gICAgICAgIDxpbnB1dCBAaW5wdXQ9XCJzeW5jTm9kZSgnc2NhbGUueicpXCIgc3RlcD1cIjAuMDJcIiB0eXBlPVwibnVtYmVyXCIgdi1tb2RlbD1cImRldGFpbC5zY2FsZS56XCIgLz5cbiAgICA8L2Rpdj5cblxuICAgIDxocj5cblxuICAgIDxkaXYgY2xhc3M9XCJub2RlUHJvcGVydHlcIj5cbiAgICAgICAgPGRpdiBjbGFzcz1cIm5vZGVQcm9wZXJ0eVRpdGxlXCI+TGF5ZXI6PC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJub2RlUHJvcGVydHlTdWJUaXRsZVwiPnt7ZGV0YWlsLmxheWVyfX08L2Rpdj5cbiAgICA8L2Rpdj5cbiAgICA8L2Rpdj5cbiAgICA8L2Rpdj5cbiAgICBgLFxuICAgIH0gKTtcbn1cbiIsICIvLyBUcmVlIGNvbXBvbmVudHM6IE5vZGVWaWV3IChyZWN1cnNpdmUpIGFuZCBOb2RlVmlld1RpdGxlIChvbmUgcm93KS5cbmltcG9ydCB7IGNvbnRleHQsIGV4ZWNJbkdhbWUgfSBmcm9tICcuLy4uL2NvbnRleHQnO1xuaW1wb3J0IHsgc2hvd05vZGVNZW51IH0gZnJvbSAnLi8uLi9tZW51cyc7XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3Rlck5vZGVUcmVlQ29tcG9uZW50cygpOiB2b2lkIHtcbiAgICBWdWUuY29tcG9uZW50KCAnTm9kZVZpZXcnLCB7XG4gICAgICAgIHByb3BzOiB7IG46IE9iamVjdCwgZGVlcDogTnVtYmVyIH0sXG4gICAgICAgIGRhdGEoKSB7XG4gICAgICAgICAgICBjb25zdCB2ID0gY29udGV4dC52dWVBcHA7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIGJvbGQ6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGNsb3NlOiAhKCB0aGlzLm4ubmFtZSA9PT0gJ0NhbnZhcycgJiYgdGhpcy5kZWVwID09PSAxICkgJiYgIXYub3Blbk5vZGVzLmhhcyggdGhpcy5uLmlkICksXG4gICAgICAgICAgICAgICAgc2VsZWN0ZWQ6IHRoaXMubi5pZCA9PT0gdi5zZWxlY3RlZE5vZGUsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9LFxuICAgICAgICB3YXRjaDoge1xuICAgICAgICAgICAgY2xvc2UoIHZhbHVlOiBib29sZWFuICkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHNldHRpbmcgPSBjb250ZXh0LnNldHRpbmdBcHA7XG4gICAgICAgICAgICAgICAgaWYgKCAhdmFsdWUgJiYgdGhpcy5uLmlzRmFpcnlDb20gJiYgc2V0dGluZy5kaXNwbGF5QXNGYWlyeVRyZWUgJiYgc2V0dGluZy5oaWRlRmFpcnlDb21Db250YWluZXIgKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHQudnVlQXBwLnN5bmNPcGVuRmNvbSggdGhpcy5uLmlkICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgY29tcHV0ZWQ6IHtcbiAgICAgICAgICAgIG5lZWRVc2VDaGlsZENoaWxyZW4oKTogYm9vbGVhbiB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2V0dGluZyA9IGNvbnRleHQuc2V0dGluZ0FwcDtcbiAgICAgICAgICAgICAgICBjb25zdCB2ID0gY29udGV4dC52dWVBcHA7XG4gICAgICAgICAgICAgICAgcmV0dXJuICggc2V0dGluZy5kaXNwbGF5QXNGYWlyeVRyZWUgJiYgc2V0dGluZy5oaWRlRmFpcnlDb21Db250YWluZXIgJiYgdGhpcy5uLmlzRmFpcnlDb21cbiAgICAgICAgICAgICAgICAgICAgICAgICYmIHRoaXMubi5jaGlsZHJlbi5sZW5ndGggPT09IDEgJiYgdGhpcy5uLmNoaWxkcmVuWyAwIF0ubmFtZSA9PT0gJ0NvbnRhaW5lcicgKVxuICAgICAgICAgICAgICAgICAgICB8fCAoIHYuaGlkZTNkUm9vdE5vZGUgJiYgdGhpcy5uLmNoaWxkcmVuLmxlbmd0aCA9PT0gMSAmJiB0aGlzLm4uY2hpbGRyZW5bIDAgXS5uYW1lID09PSAnUm9vdE5vZGUnXG4gICAgICAgICAgICAgICAgICAgICAgICAmJiB0aGlzLm4uY2hpbGRyZW5bIDAgXS5jaGlsZHJlblsgMCBdPy5pc01lc2hSZW5kZXIgKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBjaGlsZHJlbigpOiB1bmtub3duW10ge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLm5lZWRVc2VDaGlsZENoaWxyZW4gPyB0aGlzLm4uY2hpbGRyZW5bIDAgXS5jaGlsZHJlbiA6IHRoaXMubi5jaGlsZHJlbjtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICByZWFsRGVlcCgpOiBudW1iZXIge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmRlZXA7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgaXNTaG93TGluZSgpOiBib29sZWFuIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gY29udGV4dC52dWVBcHAuZHJhZ2luZ0VOPy5pZCA9PT0gdGhpcy5uLmlkO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgY3JlYXRlZCgpIHtcbiAgICAgICAgICAgIGNvbnN0IHYgPSBjb250ZXh0LnZ1ZUFwcDtcbiAgICAgICAgICAgIHYuJG9uKCAnc2VsZWN0ZWROb2RlX2NoYW5nZWQnLCB0aGlzLnVwZGF0ZVNlbGVjdGVkICk7XG4gICAgICAgICAgICB2LiRvbiggJ2xvY2F0ZU5vZGUnLCB0aGlzLm9uTG9jYXRlTm9kZSApO1xuICAgICAgICAgICAgdGhpcy5ib2xkID0gdi5vcGVuTm9kZXMuaGFzKCB0aGlzLm4uaWQgKTtcbiAgICAgICAgICAgIGlmICggdGhpcy5uLm5hbWUgPT09ICdDYW52YXMnICkgdi5zeW5jT3BlbiggdGhpcy5uLmlkLCAhdGhpcy5jbG9zZSApO1xuICAgICAgICB9LFxuICAgICAgICBiZWZvcmVEZXN0cm95KCkge1xuICAgICAgICAgICAgY29uc3QgdiA9IGNvbnRleHQudnVlQXBwO1xuICAgICAgICAgICAgdi4kb2ZmKCAnbG9jYXRlTm9kZScsIHRoaXMub25Mb2NhdGVOb2RlICk7XG4gICAgICAgICAgICB2LiRvZmYoICdzZWxlY3RlZE5vZGVfY2hhbmdlZCcsIHRoaXMudXBkYXRlU2VsZWN0ZWQgKTtcbiAgICAgICAgfSxcbiAgICAgICAgbWV0aG9kczoge1xuICAgICAgICAgICAgb25Mb2NhdGVOb2RlKCBvcGVuU2V0OiBTZXQ8c3RyaW5nPiApIHtcbiAgICAgICAgICAgICAgICBpZiAoIG9wZW5TZXQuaGFzKCB0aGlzLm4uaWQgKSApIHRoaXMuY2xvc2UgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB0aGlzLmJvbGQgPSBvcGVuU2V0LmhhcyggdGhpcy5uLmlkICk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdXBkYXRlU2VsZWN0ZWQoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZWxlY3RlZCA9IHRoaXMubi5pZCA9PT0gY29udGV4dC52dWVBcHAuc2VsZWN0ZWROb2RlO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGRyYWdzdGFydCggbm9kZTogdW5rbm93biApIHtcbiAgICAgICAgICAgICAgICBjb250ZXh0LnZ1ZUFwcC5kcmFnaW5nU04gPSBub2RlO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGRyYWdlbnRlciggbm9kZTogYW55ICkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHYgPSBjb250ZXh0LnZ1ZUFwcDtcbiAgICAgICAgICAgICAgICB2LnB1c2hMb2coIG5ldyBEYXRlKCkudG9Mb2NhbGVUaW1lU3RyaW5nKCksICdjb25zb2xlTG9nJywgbm9kZS5uYW1lICk7XG4gICAgICAgICAgICAgICAgdi5kcmFnaW5nRU4gPSBub2RlO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGRyYWdlbmQoKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdiA9IGNvbnRleHQudnVlQXBwO1xuICAgICAgICAgICAgICAgIGV4ZWNJbkdhbWUoIGBfX3N3YXBQb3MoJyR7IHYuZHJhZ2luZ1NOLmlkIH0nLCckeyB2LmRyYWdpbmdFTi5pZCB9JylgICk7XG4gICAgICAgICAgICAgICAgdi5kcmFnaW5nRU4gPSBudWxsO1xuICAgICAgICAgICAgICAgIHYuZHJhZ2luZ1NOID0gbnVsbDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHRlbXBsYXRlOiBgXG4gICAgPGRpdiBjbGFzcz1cIm5vZGVcIiBkcmFnZ2FibGVcbiAgICAgICAgQGRyYWdzdGFydC5zdG9wPVwiZHJhZ3N0YXJ0KG4pXCIgQGRyYWdlbnRlci5zdG9wPVwiZHJhZ2VudGVyKG4pXCIgQGRyYWdlbmQuc3RvcD1cImRyYWdlbmRcIj5cbiAgICAgICAgPGhyIHYtaWY9XCJpc1Nob3dMaW5lXCI+XG4gICAgICAgIDxub2RlLXZpZXctdGl0bGUgOmJvbGQ9XCJib2xkXCIgOnNlbGVjdGVkPVwic2VsZWN0ZWRcIiA6bj1cIm5cIiA6Y2hpbGRDb3VudD1cIm4uY2hpbGRDb3VudFwiIHYtbW9kZWw9XCJjbG9zZVwiIDpkZWVwPVwiZGVlcFwiPjwvbm9kZS12aWV3LXRpdGxlPlxuICAgICAgICA8bm9kZS12aWV3IHYtaWY9XCIhY2xvc2VcIiAgdi1mb3I9XCJzbiBpbiBjaGlsZHJlblwiIDpuPVwic25cIiA6ZGVlcD1cInJlYWxEZWVwKzFcIiA6a2V5PVwic24uaWRcIj5cbiAgICAgICAgPC9ub2RlLXZpZXc+XG5cbiAgICA8L2Rpdj5gLFxuICAgIH0gKTtcblxuICAgIFZ1ZS5jb21wb25lbnQoICdOb2RlVmlld1RpdGxlJywge1xuICAgICAgICBwcm9wczogWyAnbicsICdib2xkJywgJ2RlZXAnLCAnY2xvc2UnLCAnc2VsZWN0ZWQnLCAnY2hpbGRDb3VudCcgXSxcbiAgICAgICAgbW9kZWw6IHsgcHJvcDogJ2Nsb3NlJywgZXZlbnQ6ICdjaGFuZ2UnIH0sXG4gICAgICAgIHRlbXBsYXRlOiBgXG4gICAgICAgIDxkaXYgOmlkPVwicmVmTmFtZVwiIEBtb3VzZW92ZXI9XCJvdmVyTm9kZVwiIEBtb3VzZW91dD1cIm91dE5vZGVcIiBjbGFzcz1cIm5vZGVUaXRsZVwiIEBjbGljaz1cInNlbGVjdE5vZGUoKVwiIDpzdHlsZT1cIm5vZGVQYWRkaW5nK3NlbGVjdGVkQmcraXNCb2xkXCIgQGNvbnRleHRtZW51LnN0b3A9XCJvbkNvbnRleHRNZW51XCI+XG4gICAgICAgICAgICA8c3BhbiBAY2xpY2suc3RvcD1cInRvZ2dsZU5vZGUoKVwiIDpzdHlsZT1cImljb25UcmFuc2Zvcm1cIiB2LWlmPVwiY2hpbGRDb3VudD4wXCIgY2xhc3M9XCJub2RlYXJyb3cgaWNvbmZvbnQgaWNvbi1zaGFuZ3NhbmppYW9cIj48L3NwYW4+XG4gICAgICAgICAgICA8c3BhbiA6c3R5bGU9XCJkaXNhYmxlXCIgPnt7bm9kZU5hbWV9fTwvc3Bhbj48c3BhbiBjbGFzcz1cImRjRGVzY1wiIDpzdHlsZT1cInNlbGVjdGVkRGNcIj57e2RjRGVzY319PC9zcGFuPlxuICAgICAgICAgICAgPGEgdi1pZj1cIiFuLmF1dG9VcGRhdGVcIiBAY2xpY2suc3RvcD1cImZvcmNlVXBkYXRlVHJlZVwiIGNsYXNzPVwiaWNvbmZvbnQgaWNvbi1zaHVheGluXCI+PC9hPlxuICAgICAgICAgICAgPHNwYW4gdi1pZj1cImlzTG9ja2VkRHJhZ05vZGVcIiBjbGFzcz1cImljb25mb250IGljb24tZHJhZ1wiPjwvc3Bhbj5cbiAgICAgICAgPC9kaXY+XG4gICAgYCxcbiAgICAgICAgd2F0Y2g6IHtcbiAgICAgICAgICAgIGNoaWxkQ291bnQoKSB7XG4gICAgICAgICAgICAgICAgaWYgKCB0aGlzLmRlZXAgPT09IDEgKSB0aGlzLiRlbC5zdHlsZSA9IHRoaXMubm9kZVBhZGRpbmcgKyB0aGlzLnNlbGVjdGVkQmcgKyB0aGlzLmlzQm9sZDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIGNvbXB1dGVkOiB7XG4gICAgICAgICAgICBpc0xvY2tlZERyYWdOb2RlKCk6IGJvb2xlYW4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBjb250ZXh0LnZ1ZUFwcC5sb2NrTm9kZSA9PT0gdGhpcy5uLmlkO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGlzQm9sZCgpOiBzdHJpbmcge1xuICAgICAgICAgICAgICAgIHJldHVybiAnJztcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBub2RlTmFtZSgpOiBzdHJpbmcge1xuICAgICAgICAgICAgICAgIGlmICggY29udGV4dC5zZXR0aW5nQXBwLmRpc3BsYXlBc0ZhaXJ5VHJlZSApIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMucHJlICsgKCB0aGlzLm4uZ29iak5hbWUgfHwgdGhpcy5uLm5hbWUgKSArIHRoaXMuY2hpbGRyZW5Db3VudDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMucHJlICsgdGhpcy5uLm5hbWUgKyB0aGlzLmNoaWxkcmVuQ291bnQ7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgY2hpbGRyZW5Db3VudCgpOiBzdHJpbmcge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvdW50ID0gdGhpcy5uLmNoaWxkQ291bnQ7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnRleHQudnVlQXBwLnNob3dDaGlsZHJlbkNvdW50ICYmIGNvdW50ID4gMCA/IGAgWyR7IGNvdW50IH1dYCA6ICcnO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHByZSgpOiBzdHJpbmcge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLm4uYnJlYWtzID8gJ1x1MkI1NVx1RkUwRicgOiAnJztcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBpY29uVHJhbnNmb3JtKCk6IHN0cmluZyB7XG4gICAgICAgICAgICAgICAgY29uc3Qgcm90YXRlID0gdGhpcy5jbG9zZSA/ICd0cmFuc2Zvcm06cm90YXRlKDkwZGVnKScgOiAndHJhbnNmb3JtOnJvdGF0ZSgxODBkZWcpJztcbiAgICAgICAgICAgICAgICByZXR1cm4gJ2Rpc3BsYXk6IGlubGluZS1ibG9jazsnICsgcm90YXRlO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHJlZk5hbWUoKTogc3RyaW5nIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5zZWxlY3RlZCA/ICdzZWxlY3RlZE5vZGUnIDogJyc7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgbm9kZVBhZGRpbmcoKTogc3RyaW5nIHtcbiAgICAgICAgICAgICAgICBjb25zdCBhcnJvd1dpZHRoID0gdGhpcy5uLmNoaWxkQ291bnQgPiAwID8gMjEgOiAwO1xuICAgICAgICAgICAgICAgIHJldHVybiBgcGFkZGluZy1sZWZ0OiR7IHRoaXMuZGVlcCAqIDIwIC0gYXJyb3dXaWR0aCB9cHg7YDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzZWxlY3RlZEJnKCk6IHN0cmluZyB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2VsZWN0ZWQgPyAnY29sb3I6YmxhY2s7YmFja2dyb3VuZC1jb2xvcjojY2NjY2NjOycgOiAnJztcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzZWxlY3RlZERjKCk6IHN0cmluZyB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2VsZWN0ZWQgPyAnY29sb3I6cmdiKDE0LCAxMjcsIDIzMyknIDogJyc7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZGlzYWJsZSgpOiBzdHJpbmcge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLm4uYWN0aXZlSW5IaWVyYXJjaHkgJiYgdGhpcy5uLm9wYWNpdHlJbkhpZXJhcmNoeSA/ICcnIDogJ29wYWNpdHk6MC41JztcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBkY0Rlc2MoKTogc3RyaW5nIHtcbiAgICAgICAgICAgICAgICBpZiAoIHRoaXMubi5kYyA9PT0gdW5kZWZpbmVkICkgcmV0dXJuICcnO1xuICAgICAgICAgICAgICAgIGlmICggdGhpcy5uLnJ0eXBlICkgcmV0dXJuIGAgJHsgdGhpcy5uLmRjIH0gKyAkeyB0aGlzLm4ucnR5cGUgfWA7XG4gICAgICAgICAgICAgICAgaWYgKCB0aGlzLm4uZGMgPT09IDAgKSByZXR1cm4gJyc7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGAgJHsgdGhpcy5uLmRjIH1gO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgbWV0aG9kczoge1xuICAgICAgICAgICAgZm9yY2VVcGRhdGVUcmVlKCkge1xuICAgICAgICAgICAgICAgIGNvbnRleHQudnVlQXBwLmZvcmNlVXBkYXRlVHJlZSgpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHRvZ2dsZU5vZGUoKSB7XG4gICAgICAgICAgICAgICAgY29udGV4dC52dWVBcHAuc3luY09wZW4oIHRoaXMubi5pZCwgdGhpcy5jbG9zZSApO1xuICAgICAgICAgICAgICAgIHRoaXMuJGVtaXQoICdjaGFuZ2UnLCAhdGhpcy5jbG9zZSApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHNlbGVjdE5vZGUoKSB7XG4gICAgICAgICAgICAgICAgY29udGV4dC52dWVBcHAuc2VsZWN0Tm9kZSggdGhpcy5uLmlkICk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb25Db250ZXh0TWVudSgpIHtcbiAgICAgICAgICAgICAgICBzaG93Tm9kZU1lbnUoIHRoaXMubi5pZCApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG92ZXJOb2RlKCkge1xuICAgICAgICAgICAgICAgIGV4ZWNJbkdhbWUoIGBpZih3aW5kb3dbXCJfX2RyYXdSZWN0XCJdKV9fZHJhd1JlY3QoJyR7IHRoaXMubi5pZCB9JylgICk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb3V0Tm9kZSgpIHtcbiAgICAgICAgICAgICAgICBleGVjSW5HYW1lKCAnaWYod2luZG93W1wiX19jbGVhclJlY3RcIl0pX19jbGVhclJlY3QoKScgKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgfSApO1xufVxuIiwgIi8vIENvbnNvbGUgdGFiOiBmaWx0ZXJlZCBsb2dzICsgY29kZSBpbnB1dCB3aXRoIGF1dG9jb21wbGV0ZSB0aXBzLlxuaW1wb3J0IHsgY29udGV4dCwgZXhlY0luR2FtZSB9IGZyb20gJy4vLi4vY29udGV4dCc7XG5pbXBvcnQgeyBzaG93Q29uc29sZU1lbnUgfSBmcm9tICcuLy4uL21lbnVzJztcbmltcG9ydCB7IG9wZW5FeHRlcm5hbCB9IGZyb20gJy4vLi4vaXBjJztcblxuY29uc3QgU1RPUkVfVVJMID0gJ2h0dHBzOi8vc3RvcmUuY29jb3MuY29tL2FwcC9kZXRhaWwvMjk0MCc7XG5jb25zdCBTSE9SVENVVFNfVVJMID0gJ2h0dHBzOi8vZm9ydW0uY29jb3Mub3JnL3QvdG9waWMvMTE2MzEwJztcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQ29uc29sZVBhbmVsKCk6IHZvaWQge1xuICAgIFZ1ZS5jb21wb25lbnQoICdDb25zb2xlUGFuZWwnLCB7XG4gICAgICAgIGRhdGEoKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHR5cGU6ICdBbGwnLFxuICAgICAgICAgICAgICAgIHR5cGVzOiBbICdBbGwnLCAnTG9nJywgJ0Vycm9yJywgJ1dhcm4nIF0sXG4gICAgICAgICAgICAgICAgZmlsdGVyU3RyOiAnJyxcbiAgICAgICAgICAgICAgICBjb2RlOiAnJyxcbiAgICAgICAgICAgICAgICBjb2RlVGlwOiBbXSxcbiAgICAgICAgICAgICAgICB0aXBJbmRleDogMCxcbiAgICAgICAgICAgICAgICBhdEJvdHRvbTogdHJ1ZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0sXG4gICAgICAgIGNvbXB1dGVkOiB7XG4gICAgICAgICAgICBsb2dzKCk6IHVua25vd25bXSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdiA9IGNvbnRleHQudnVlQXBwO1xuICAgICAgICAgICAgICAgIGlmICggdGhpcy50eXBlID09PSAnQWxsJyApIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHYuYmlnTG9ncy5maWx0ZXIoICggbG9nOiBhbnkgKSA9PiBsb2cuZC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCB0aGlzLmZpbHRlclN0ci50b0xvd2VyQ2FzZSgpICkgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHYuYmlnTG9ncy5maWx0ZXIoICggbG9nOiBhbnkgKSA9PiBsb2cudC5lbmRzV2l0aCggdGhpcy50eXBlICkgJiYgbG9nLmQuaW5jbHVkZXMoIHRoaXMuZmlsdGVyU3RyICkgKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIG1vdW50ZWQoKSB7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbExvZ1RvQm90dG9tKCk7XG4gICAgICAgIH0sXG4gICAgICAgIHVwZGF0ZWQoKSB7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbExvZ1RvQm90dG9tKCk7XG4gICAgICAgIH0sXG4gICAgICAgIG1ldGhvZHM6IHtcbiAgICAgICAgICAgIGNoZWNrQm90dG9tKCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGVsID0gdGhpcy4kcmVmcy5sb2dzTWFpbjtcbiAgICAgICAgICAgICAgICB0aGlzLmF0Qm90dG9tID0gZWwuc2Nyb2xsSGVpZ2h0IC0gZWwuY2xpZW50SGVpZ2h0ID09PSBlbC5zY3JvbGxUb3A7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgc2hvd01lbnUoKSB7XG4gICAgICAgICAgICAgICAgc2hvd0NvbnNvbGVNZW51KCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgY2xlYXJMb2dzKCkge1xuICAgICAgICAgICAgICAgIGNvbnRleHQudnVlQXBwLmxvZ3MgPSBbXTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzY3JvbGxMb2dUb0JvdHRvbSgpIHtcbiAgICAgICAgICAgICAgICBpZiAoICF0aGlzLmF0Qm90dG9tICkgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGNvbnN0IGVsID0gdGhpcy4kcmVmcy5sb2dzTWFpbjtcbiAgICAgICAgICAgICAgICB0aGlzLiRuZXh0VGljayggKCkgPT4geyBlbC5zY3JvbGxUb3AgPSBlbC5zY3JvbGxIZWlnaHQ7IH0gKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBnb3RvU3RvcmUoKSB7IG9wZW5FeHRlcm5hbCggU1RPUkVfVVJMICk7IH0sXG4gICAgICAgICAgICBnb3RvU2NNKCkgeyBvcGVuRXh0ZXJuYWwoIFNIT1JUQ1VUU19VUkwgKTsgfSxcbiAgICAgICAgICAgIGV4ZWMoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jb2RlVGlwID0gW107XG4gICAgICAgICAgICAgICAgaWYgKCB0aGlzLmNvZGUudHJpbSgpID09PSAnJyApIHJldHVybjtcbiAgICAgICAgICAgICAgICBsZXQgY29kZSA9IHRoaXMuY29kZTtcbiAgICAgICAgICAgICAgICBjb250ZXh0LnZ1ZUFwcC5wdXNoTG9nKCBuZXcgRGF0ZSgpLnRvTG9jYWxlVGltZVN0cmluZygpLCAnY29uc29sZUxvZycsICc+ICcgKyBjb2RlICsgJzonICk7XG4gICAgICAgICAgICAgICAgaWYgKCAhY29kZS5zdGFydHNXaXRoKCAnbGV0ICcgKSAmJiAhY29kZS5zdGFydHNXaXRoKCAndmFyICcgKSAmJiAhY29kZS5zdGFydHNXaXRoKCAnY29uc29sZS4nICkgJiYgIWNvZGUuc3RhcnRzV2l0aCggJ2NjLmxvZycgKSApIHtcbiAgICAgICAgICAgICAgICAgICAgY29kZSA9IGBjb25zb2xlLmxvZygkeyBjb2RlIH0pYDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZXhlY0luR2FtZSggY29kZSApLnRoZW4oICggcmVzdWx0OiB1bmtub3duICkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIHJlc3VsdCAhPT0gbnVsbCApIGNvbnRleHQudnVlQXBwLnB1c2hMb2coIG5ldyBEYXRlKCkudG9Mb2NhbGVUaW1lU3RyaW5nKCksICdjb25zb2xlTG9nJywgYCR7IHJlc3VsdCB9YCApO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmNvZGUgPSAnJztcbiAgICAgICAgICAgICAgICB9ICk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdXAoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy50aXBJbmRleCA9IHRoaXMudGlwSW5kZXggPT09IDAgPyB0aGlzLmNvZGVUaXAubGVuZ3RoIC0gMSA6IHRoaXMudGlwSW5kZXggLSAxO1xuICAgICAgICAgICAgICAgIHRoaXMuJG5leHRUaWNrKCkudGhlbiggKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLiRyZWZzLnNlbGVjdGVkPy5bIDAgXT8uc2Nyb2xsSW50b1ZpZXdJZk5lZWRlZCggZmFsc2UgKTtcbiAgICAgICAgICAgICAgICB9ICk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZG93bigpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRpcEluZGV4ID0gdGhpcy50aXBJbmRleCA9PT0gdGhpcy5jb2RlVGlwLmxlbmd0aCAtIDEgPyAwIDogdGhpcy50aXBJbmRleCArIDE7XG4gICAgICAgICAgICAgICAgdGhpcy4kbmV4dFRpY2soKS50aGVuKCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuJHJlZnMuc2VsZWN0ZWQ/LlsgMCBdPy5zY3JvbGxJbnRvVmlld0lmTmVlZGVkKCBmYWxzZSApO1xuICAgICAgICAgICAgICAgIH0gKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBlc2MoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jb2RlVGlwID0gW107XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdGFiKCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNob3NlbiA9IHRoaXMuY29kZVRpcFsgdGhpcy50aXBJbmRleCBdWyAwIF07XG4gICAgICAgICAgICAgICAgY29uc3QgcGFydHMgPSB0aGlzLmNvZGUuc3BsaXQoICcuJyApO1xuICAgICAgICAgICAgICAgIHBhcnRzLnBvcCgpO1xuICAgICAgICAgICAgICAgIGlmICggIWlzTmFOKCBjaG9zZW4gKSApIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb2RlID0gcGFydHMuam9pbiggJy4nICkgKyAnWycgKyBjaG9zZW4gKyAnXSc7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcGFydHMucHVzaCggY2hvc2VuICk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29kZSA9IHBhcnRzLmpvaW4oICcuJyApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLmNvZGVUaXAgPSBbXTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZ2V0VGlwKCkge1xuICAgICAgICAgICAgICAgIGlmICggdGhpcy5jb2RlLnRyaW0oKSA9PT0gJycgKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29kZVRpcCA9IFtdO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGV4ZWNJbkdhbWUoIGBfX2NvZGVUaXAoJyR7IHRoaXMuY29kZSB9JylgICkudGhlbiggKCB0aXBzOiB1bmtub3duW10gKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudGlwSW5kZXggPSAwO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmNvZGVUaXAgPSB0aXBzO1xuICAgICAgICAgICAgICAgIH0gKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzcGxpdE1zZyggbWVzc2FnZTogc3RyaW5nICk6IHN0cmluZ1tdIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbWVzc2FnZS5zcGxpdCggUmVnRXhwKCBgKCR7IHRoaXMuZmlsdGVyU3RyIH0pYCwgJ2knICkgKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHRlbXBsYXRlOiBgXG4gICAgPGRpdiBjbGFzcz1cImNvbnNvbGVQYW5lbFwiPlxuICAgICAgICA8ZGl2IGNsYXNzPVwidG9wTWVudVwiPlxuICAgICAgICAgICAgPGlucHV0IHBsYWNlaG9sZGVyPVwidHlwZSB0byBmaWx0ZXIgbG9nc1wiIHR5cGU9XCJzZWFyY2hcIiB2LW1vZGVsPVwiZmlsdGVyU3RyXCIgLz5cbiAgICAgICAgICAgIDxsYWJlbCB2LWZvcj1cInQgaW4gdHlwZXNcIj48aW5wdXQgdHlwZT1cInJhZGlvXCIgOnZhbHVlPVwidFwiIHYtbW9kZWw9XCJ0eXBlXCI+e3t0fX08L2xhYmVsPlxuXG4gICAgICAgICAgICA8bGFiZWw+PGlucHV0IEBjaGFuZ2U9XCJzZXR0aW5nLnNhdmVUb1N0b3JhZ2UoKVwiIHR5cGU9XCJjaGVja2JveFwiIHYtbW9kZWw9XCJzZXR0aW5nLmNsZWFyTG9nQWZ0ZXJSZWZyZXNoXCIgLz5jbGVhckxvZ0FmdGVyUmVmcmVzaDwvbGFiZWw+XG4gICAgICAgICAgICA8YSBAY2xpY2s9XCJnb3RvU3RvcmVcIj5Vc2VmdWw/IDUgc3RhcnM/PC9hPlxuICAgICAgICAgICAgbmV3OjxhIEBjbGljaz1cImdvdG9TY01cIj5TaG9ydGN1dHMgTWFuYWdlcjwvYT5cbiAgICAgICAgPC9kaXY+XG4gICAgICAgIDxocj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImxvZ3MgZmxleDFcIiByZWY9XCJsb2dzTWFpblwiIEBjb250ZXh0bWVudS5zdG9wPVwic2hvd01lbnVcIiBAc2Nyb2xsPVwiY2hlY2tCb3R0b21cIj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJsb2dJdGVtXCIgdi1mb3I9XCJsIGluIGxvZ3NcIiA6c3R5bGU9XCJ7Y29sb3I6di5sb2dDb2xvcihsLnQpfVwiPlxuICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwibG9nVGltZVwiPnt7bC50aW1lfX06PC9zcGFuPlxuICAgICAgICAgICAgICAgIDxzcGFuIHYtaWY9XCJmaWx0ZXJTdHIudHJpbSgpPT0nJ1wiPnt7bC5kfX08L3NwYW4+XG4gICAgICAgICAgICAgICAgPHNwYW4gdi1pZj1cImZpbHRlclN0ci50cmltKCkhPScnXCIgdi1mb3I9XCJkIGluIHNwbGl0TXNnKGwuZClcIiA6Y2xhc3M9XCJ7ZmlsdGVyOmQudG9Mb3dlckNhc2UoKT09ZmlsdGVyU3RyLnRvTG93ZXJDYXNlKCl9XCI+e3tkfX08L3NwYW4+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgICAgIDxpbnB1dCBAa2V5ZG93bi50YWIucHJldmVudD1cInRhYlwiIEBrZXl1cC5lc2Muc3RvcD1cImVzY1wiIEBrZXlkb3duLnVwLnByZXZlbnQ9XCJ1cFwiIEBrZXlkb3duLmRvd24ucHJldmVudD1cImRvd25cIiBAa2V5dXAuZW50ZXI9XCJleGVjXCIgQGlucHV0PVwiZ2V0VGlwXCIgcGxhY2Vob2xkZXI9XCJ0eXBlIGNvZGUgaGVyZVwiIHR5cGU9XCJ0ZXh0XCIgdi1tb2RlbD1cImNvZGVcIi8+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJjb2RlVGlwc1wiIHYtc2hvdz1cImNvZGVUaXAubGVuZ3RoPjBcIj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJoZWxwQ29uXCI+XG4gICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJoZWxwXCI+PGI+VEFCPC9iPjogY2hvb3NlJmZpbGw8L3NwYW4+XG4gICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJoZWxwXCI+PGI+VVAvRE9XTjwvYj46IHN3aXRjaDwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cImhlbHBcIj48Yj5FTlRFUjwvYj46IGV4ZWN1dGU8L3NwYW4+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxocj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJ0aXBzQ29uXCI+XG4gICAgICAgICAgICAgICAgPGRpdiA6cmVmPVwidGlwSW5kZXg9PWk/J3NlbGVjdGVkJzpudWxsXCIgOmNsYXNzPVwie3RpcEl0ZW06dHJ1ZSxzZWxlY3RlZDp0aXBJbmRleD09aX1cIiB2LWZvcj1cIih0LGkpIGluIGNvZGVUaXBcIiA6a2V5PVwidFwiPlxuICAgICAgICAgICAgICAgICAgICA8Yj57e3RbMF19fTwvYj46PHNwYW4+e3t0WzFdfX08L3NwYW4+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgPC9kaXY+XG4gICAgYCxcbiAgICB9ICk7XG59XG4iLCAiLy8gQ29jb3MgdGFiOiBlbmdpbmUvc3lzdGVtIGZsYWdzICsgZ2FtZSBsb2NhbFN0b3JhZ2Ugdmlld2VyICgrIGxlZ2FjeSBzdGF0aXN0aWMgcGFuZWwpLlxuaW1wb3J0IHsgY29udGV4dCwgZXhlY0luR2FtZSB9IGZyb20gJy4vLi4vY29udGV4dCc7XG5cbi8qKiBmbGFncyByZW5kZXJlZCBieSBkZWRpY2F0ZWQgKGN1cnJlbnRseSBjb21tZW50ZWQtb3V0KSBjb250cm9scywgbm90IHRoZSBnZW5lcmljIGxpc3QgKi9cbmNvbnN0IEZJTFRFUkVEX1ZBUlMgPSBuZXcgU2V0KCBbICdDb2xsaXNpb25NYW5hZ2VyJywgJ0NvbGxpc2lvbl9EZWJ1Z0RyYXcnLCAnaXNEeW5hbWljQXRsYXNEZWJ1Z1Nob3cnIF0gKTtcblxuY29uc3QgQ09MTEVDVF9WQVJTX1NDUklQVCA9IGBcbiAgICAgICAgICAgIHZhciBvID0ge31cbiAgICAgICAgICAgIGZvcihsZXQgayBpbiB3aW5kb3cpe1xuICAgICAgICAgICAgICAgIGlmKGsuc3RhcnRzV2l0aChcIkNDX1wiKSl7XG4gICAgICAgICAgICAgICAgICAgIG9ba10gPSB3aW5kb3dba11cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZihjYyl7XG4gICAgICAgICAgICAgICAgZm9yKGxldCBrIGluIGNjLnN5cyl7XG4gICAgICAgICAgICAgICAgICAgIGlmKGsuc3RhcnRzV2l0aChcImlzXCIpKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmKHR5cGVvZiBjYy5zeXNba10gIT0gXCJmdW5jdGlvblwiKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvW2tdID0gY2Muc3lzW2tdXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdHJ5e1xuICAgICAgICAgICAgICAgIG9bXCJlbmFibGVkRHluYW1pY0F0bGFzXCJdID0gY2MuZHluYW1pY0F0bGFzTWFuYWdlci5lbmFibGVkXG4gICAgICAgICAgICAgICAgfWNhdGNoKGUpe1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0cnl7XG4gICAgICAgICAgICAgICAgICAgIG9bXCJpc0R5bmFtaWNBdGxhc0RlYnVnU2hvd1wiXSA9IGNjLmZpbmQoXCJEWU5BTUlDX0FUTEFTX0RFQlVHX05PREVcIikgIT0gbnVsbFxuICAgICAgICAgICAgICAgIH1jYXRjaChlKXtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0cnl7XG4gICAgICAgICAgICAgICAgICAgIG9bXCJlbmFibGVkUmV0aW5hXCJdID0gY2Mudmlldy5pc1JldGluYUVuYWJsZWQoKVxuICAgICAgICAgICAgICAgIH1jYXRjaChlKXtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0cnl7XG4gICAgICAgICAgICAgICAgICAgIG9bXCJFTkdJTkVfVkVSU0lPTlwiXSA9IGNjLkVOR0lORV9WRVJTSU9OXG4gICAgICAgICAgICAgICAgfWNhdGNoKGUpe1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRyeXtcbiAgICAgICAgICAgICAgICAgICAgb1tcIkNvbGxpc2lvbk1hbmFnZXJcIl0gPSBjYy5kaXJlY3Rvci5nZXRDb2xsaXNpb25NYW5hZ2VyKCkuZW5hYmxlZFxuICAgICAgICAgICAgICAgIH1jYXRjaChlKXtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0cnl7XG4gICAgICAgICAgICAgICAgICAgIG9bXCJDb2xsaXNpb25fRGVidWdEcmF3XCJdID0gY2MuZGlyZWN0b3IuZ2V0Q29sbGlzaW9uTWFuYWdlcigpLmVuYWJsZWREZWJ1Z0RyYXdcbiAgICAgICAgICAgICAgICB9Y2F0Y2goZSl7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIG9cbiAgICAgICAgICAgIGA7XG5cbmNvbnN0IENPTExFQ1RfTE9DQUxfU1RPUkFHRV9TQ1JJUFQgPSBgXG4gICAgICAgIHZhciBvMiA9IHt9XG4gICAgICAgIE9iamVjdC5rZXlzKGNjLnN5cy5sb2NhbFN0b3JhZ2UpLmZvckVhY2goZnVuY3Rpb24oayl7XG4gICAgICAgICAgICBvMltrXSA9IGNjLnN5cy5sb2NhbFN0b3JhZ2Vba11cbiAgICAgICAgfSlcbiAgICAgICAgbzJcbiAgICAgICAgYDtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQ29jb3NQYW5lbHMoKTogdm9pZCB7XG4gICAgVnVlLmNvbXBvbmVudCggJ0xvY2FsU3RvcmFnZVBhbmVsJywge1xuICAgICAgICBkYXRhKCkge1xuICAgICAgICAgICAgcmV0dXJuIHsgbGNTdG9yYWdlOiB7fSB9O1xuICAgICAgICB9LFxuICAgICAgICBjb21wdXRlZDoge1xuICAgICAgICAgICAga2V5cygpOiBzdHJpbmdbXSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKCB0aGlzLmxjU3RvcmFnZSApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgY3JlYXRlZCgpIHtcbiAgICAgICAgICAgIGV4ZWNJbkdhbWUoIENPTExFQ1RfTE9DQUxfU1RPUkFHRV9TQ1JJUFQgKS50aGVuKCAoIHN0b3JhZ2U6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ICkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMubGNTdG9yYWdlID0gc3RvcmFnZTtcbiAgICAgICAgICAgIH0gKTtcbiAgICAgICAgfSxcbiAgICAgICAgbWV0aG9kczoge1xuICAgICAgICAgICAgZGVsKCBrZXk6IHN0cmluZyApIHtcbiAgICAgICAgICAgICAgICBleGVjSW5HYW1lKCBgY2Muc3lzLmxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKCckeyBrZXkgfScpYCApO1xuICAgICAgICAgICAgICAgIFZ1ZS5kZWxldGUoIHRoaXMubGNTdG9yYWdlLCBrZXkgKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHRlbXBsYXRlOiBgXG4gICAgPGRpdj5cbiAgICAgICAgPGJyPlxuICAgICAgICA8ZGl2IGNsYXNzPVwidG9wU3RpY2t5XCI+TG9jYWwgU3RvcmFnZTwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzPVwibG9jYWxTdG9yYWdlQ29uXCI+XG4gICAgICAgICAgICA8c3BhbiB2LWZvcj1cImsgaW4ga2V5c1wiIDprZXk9XCJrXCIgY2xhc3M9XCJ2YXJJdGVtXCIgc3R5bGU9XCJjb2xvcjp3aGl0ZVwiPlxuICAgICAgICAgICAgICAgIHt7a319OlxuICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwidmFySXRlbVZhbHVlXCI+e3tsY1N0b3JhZ2Vba119fTwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8YSBAY2xpY2suc3RvcD1cImRlbChrKVwiPjxzcGFuIGNsYXNzPVwiaWNvbmZvbnQgaWNvbi13cm9uZzJcIj48L3NwYW4+PC9hPlxuICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICA8L2Rpdj5cbiAgICA8L2Rpdj5gLFxuICAgIH0gKTtcblxuICAgIFZ1ZS5jb21wb25lbnQoICdTdGF0aXN0aWNQYW5lbCcsIHtcbiAgICAgICAgbWV0aG9kczoge1xuICAgICAgICAgICAgdG9nZ2xlKCkge1xuICAgICAgICAgICAgICAgIGNvbnRleHQudnVlQXBwLnRvZ2dsZVN0YXRpc3RpYygpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgY29tcHV0ZWQ6IHtcbiAgICAgICAgICAgIGJ0bkxhYmVsKCk6IHN0cmluZyB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnRleHQudnVlQXBwLnN0YXRpc3RpY2luZyA/ICdTdG9wJyA6ICdTdGFydCc7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB0ZW1wbGF0ZTogYFxuICAgIDxkaXYgY2xhc3M9XCJjb2Nvc1BhbmVsXCI+XG4gICAgICAgIDxidXR0b24gQGNsaWNrPVwidG9nZ2xlXCI+e3tidG5MYWJlbH19PC9idXR0b24+XG4gICAgPC9kaXY+XG4gICAgYCxcbiAgICB9ICk7XG5cbiAgICBWdWUuY29tcG9uZW50KCAnQ29jb3NQYW5lbCcsIHtcbiAgICAgICAgZGF0YSgpIHtcbiAgICAgICAgICAgIHJldHVybiB7IGNjVmFyczoge30sIGxjU3RvcmFnZToge30gfTtcbiAgICAgICAgfSxcbiAgICAgICAgY29tcHV0ZWQ6IHtcbiAgICAgICAgICAgIGtleXMoKTogc3RyaW5nW10ge1xuICAgICAgICAgICAgICAgIHJldHVybiBPYmplY3Qua2V5cyggdGhpcy5jY1ZhcnMgKS5zb3J0KCkuZmlsdGVyKCAoIGtleTogc3RyaW5nICkgPT4gIUZJTFRFUkVEX1ZBUlMuaGFzKCBrZXkgKSApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgY3JlYXRlZCgpIHtcbiAgICAgICAgICAgIHRoaXMucmVmcmVzaFZhcnMoKTtcbiAgICAgICAgfSxcbiAgICAgICAgbWV0aG9kczoge1xuICAgICAgICAgICAgcmVmcmVzaFZhcnMoKSB7XG4gICAgICAgICAgICAgICAgZXhlY0luR2FtZSggQ09MTEVDVF9WQVJTX1NDUklQVCApLnRoZW4oICggdmFyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2NWYXJzID0gdmFycztcbiAgICAgICAgICAgICAgICB9ICk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZ2V0U3R5bGUoIGtleTogc3RyaW5nICk6IHN0cmluZyB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY2NWYXJzWyBrZXkgXSA/ICdjb2xvcjp3aGl0ZTsnIDogJ2NvbG9yOmdyZXk7JztcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzeW5jQ29sRW5hYmxlKCkge1xuICAgICAgICAgICAgICAgIGV4ZWNJbkdhbWUoIGBjYy5kaXJlY3Rvci5nZXRDb2xsaXNpb25NYW5hZ2VyKCkuZW5hYmxlZCA9ICR7IHRoaXMuY2NWYXJzLkNvbGxpc2lvbk1hbmFnZXIgfWAgKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzeW5jQ29sRGVidWdEcmF3KCkge1xuICAgICAgICAgICAgICAgIGV4ZWNJbkdhbWUoIGBjYy5kaXJlY3Rvci5nZXRDb2xsaXNpb25NYW5hZ2VyKCkuZW5hYmxlZERlYnVnRHJhdyA9ICR7IHRoaXMuY2NWYXJzLkNvbGxpc2lvbl9EZWJ1Z0RyYXcgfWAgKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB0b2dnbGVEeW5hbWljQXRsYXNTaG93KCkge1xuICAgICAgICAgICAgICAgIGV4ZWNJbkdhbWUoIGBjYy5keW5hbWljQXRsYXNNYW5hZ2VyLnNob3dEZWJ1ZygkeyB0aGlzLmNjVmFycy5pc0R5bmFtaWNBdGxhc0RlYnVnU2hvdyB9KTskeyB0aGlzLmNjVmFycy5pc0R5bmFtaWNBdGxhc0RlYnVnU2hvdyB9YCApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgdGVtcGxhdGU6IGBcbiAgICA8ZGl2IGNsYXNzPVwiY29jb3NQYW5lbFwiPlxuICAgICAgICA8ZGl2IGNsYXNzPVwidG9wU3RpY2t5XCI+IEVOR0lORV9WRVJTSU9OOiB7e2NjVmFycy5FTkdJTkVfVkVSU0lPTn19PC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJ2YXJzQ29uXCI+XG4gICAgICAgICAgICA8c3BhbiB2LWZvcj1cImsgaW4ga2V5c1wiIDprZXk9XCJrXCIgY2xhc3M9XCJ2YXJJdGVtXCIgOnN0eWxlPVwiZ2V0U3R5bGUoaylcIj57e2t9fToge3tjY1ZhcnNba119fTwvc3Bhbj5cbiAgICAgICAgPC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJ2YXJzQ29uXCI+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8bG9jYWwtc3RvcmFnZS1wYW5lbD48L2xvY2FsLXN0b3JhZ2UtcGFuZWw+XG4gICAgPC9kaXY+XG4gICAgYCxcbiAgICB9ICk7XG59XG4iLCAiLy8gU2VhcmNoIHBhbmVsLCBleHRlbnNpb24gcGFuZWwsIHNwYWNlci5cbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBjb250ZXh0LCBleGVjSW5HYW1lIH0gZnJvbSAnLi8uLi9jb250ZXh0JztcbmltcG9ydCB7IHNob3dPcGVuRGlhbG9nSXBjIH0gZnJvbSAnLi8uLi9pcGMnO1xuXG5jb25zdCBFU0NfS0VZID0gMjc7XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlclBhbmVscygpOiB2b2lkIHtcbiAgICBWdWUuY29tcG9uZW50KCAnU2VhcmNoUGFuZWwnLCB7XG4gICAgICAgIGRhdGEoKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzZWFyY2hTdHI6ICcnLCBsaXN0OiBbXSwgaW5jbHVkZUludmlzaWJsZTogdHJ1ZSwga2Q6IG51bGwgfTtcbiAgICAgICAgfSxcbiAgICAgICAgY3JlYXRlZCgpIHtcbiAgICAgICAgICAgIHRoaXMua2QgPSAoIGV2ZW50OiBLZXlib2FyZEV2ZW50ICkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICggKCBldmVudC5rZXkgPT09IFN0cmluZyggRVNDX0tFWSApIHx8IGV2ZW50LmtleUNvZGUgPT09IEVTQ19LRVkgKSAmJiB0aGlzLnNlYXJjaFN0ci50cmltKCkgIT09ICcnICkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmNsZWFyU2VhcmNoKCk7XG4gICAgICAgICAgICAgICAgICAgIGV2ZW50LnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lciggJ2tleWRvd24nLCB0aGlzLmtkICk7XG4gICAgICAgIH0sXG4gICAgICAgIGJlZm9yZURlc3Ryb3koKSB7XG4gICAgICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCAna2V5ZG93bicsIHRoaXMua2QgKTtcbiAgICAgICAgfSxcbiAgICAgICAgbWV0aG9kczoge1xuICAgICAgICAgICAgb25DaGFuZ2UoKSB7XG4gICAgICAgICAgICAgICAgaWYgKCB0aGlzLnNlYXJjaFN0ci50cmltKCkgPT09ICcnICkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxpc3QgPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBleGVjSW5HYW1lKCBgX19zZWFyY2hDb21zKCckeyB0aGlzLnNlYXJjaFN0ciB9JylgICkudGhlbiggKCBsaXN0OiB1bmtub3duW10gKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubGlzdCA9IGxpc3QgfHwgW107XG4gICAgICAgICAgICAgICAgfSApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGxvY2F0ZSggdXVpZFBhdGg6IHN0cmluZ1tdICkge1xuICAgICAgICAgICAgICAgIGNvbnRleHQudnVlQXBwLmxvY2F0ZU5vZGUoIHV1aWRQYXRoICk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgY2xlYXJTZWFyY2goKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZWFyY2hTdHIgPSAnJztcbiAgICAgICAgICAgICAgICB0aGlzLmxpc3QubGVuZ3RoID0gMDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIGNvbXB1dGVkOiB7XG4gICAgICAgICAgICBmaWx0ZXJlZExpc3QoKTogdW5rbm93bltdIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5pbmNsdWRlSW52aXNpYmxlID8gdGhpcy5saXN0IDogdGhpcy5saXN0LmZpbHRlciggKCBlbnRyeTogYW55ICkgPT4gZW50cnkudmlzaWJsZSApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgdGVtcGxhdGU6IGBcbiAgICA8ZGl2IGNsYXNzPVwic2VhcmNoUGFuZWxcIj5cbiAgICAgICAgPGRpdiBjbGFzcz1cInNlYXJjaFRpdGxlXCIgdi1zaG93PVwibGlzdC5sZW5ndGg+MFwiIHN0eWxlPVwiZGlzcGxheTpmbGV4XCI+XG4gICAgICAgICAgICA8bGFiZWw+UmVzdWx0Ont7ZmlsdGVyZWRMaXN0Lmxlbmd0aH19L3t7bGlzdC5sZW5ndGh9fTwvbGFiZWw+XG4gICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZmxleDoxXCI+PC9kaXY+XG4gICAgICAgICAgICA8bGFiZWw+PGlucHV0IHR5cGU9XCJjaGVja2JveFwiIHYtbW9kZWw9XCJpbmNsdWRlSW52aXNpYmxlXCIgLz5JbmNsdWRlcyBJbnZpc2libGUgICA8L2xhYmVsPlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJpY29uZm9udCBpY29uLXNoYW5jaHVcIiBAY2xpY2s9XCJjbGVhclNlYXJjaFwiPjwvc3Bhbj5cbiAgICAgICAgPC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJzZWFyY2hMaXN0XCIgdi1zaG93PVwibGlzdC5sZW5ndGg+MFwiPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInNlYXJjSXRlbVwiIHYtZm9yPVwiKGMsaSkgaW4gZmlsdGVyZWRMaXN0XCIgPlxuICAgICAgICAgICAgICAgIDxocj5cbiAgICAgICAgICAgICAgICA8c3Bhbj57e2MubmFtZX19PC9zcGFuPlxuICAgICAgICAgICAgICAgIDxhIEBjbGljaz1cImxvY2F0ZShjLnV1aWRQYXRoKVwiPlxuICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiaWNvbmZvbnQgaWNvbi1kaW5nd2VpXCI+PC9zcGFuPlxuICAgICAgICAgICAgICAgIDwvYT5cbiAgICAgICAgICAgICAgICA8c3BhbiB2LWlmPVwiIWMudmlzaWJsZVwiID5pbnZpc2libGU8L3NwYW4+XG4gICAgICAgICAgICAgICAgPGJyPlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJpdGVtUGF0aFwiPnt7Yy5wYXRofX08L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzcz1cInNlYXJjaEJveFwiPlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJpY29uZm9udCBpY29uLXNvdXN1b1wiPjwvc3Bhbj48aW5wdXQgQGlucHV0PVwib25DaGFuZ2VcIiB0eXBlPVwic2VhcmNoXCIgcGxhY2Vob2xkZXI9XCJzZWFyY2ggY29tcG9uZW50XCIgdi1tb2RlbD1cInNlYXJjaFN0clwiIC8+XG4gICAgICAgIDwvZGl2PlxuICAgIDwvZGl2PlxuICAgIGAsXG4gICAgfSApO1xuXG4gICAgVnVlLmNvbXBvbmVudCggJ0V4dGVuc2lvblBhbmVsJywge1xuICAgICAgICBkYXRhKCkge1xuICAgICAgICAgICAgcmV0dXJuIHsgZXhhbXBsZTogJycgfTtcbiAgICAgICAgfSxcbiAgICAgICAgbWV0aG9kczoge1xuICAgICAgICAgICAgb25TZWxlY3RlZEZpbGUoKSB7IC8qIGtlcHQgZm9yIHRlbXBsYXRlIGNvbXBhdGliaWxpdHkgKi8gfSxcbiAgICAgICAgICAgIGFzeW5jIGNob29zZUZpbGUoKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZmlsZXMgPSBhd2FpdCBzaG93T3BlbkRpYWxvZ0lwYyggWyAnanNvbicgXSApO1xuICAgICAgICAgICAgICAgIGlmICggIWZpbGVzICkgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGNvbnN0IGZpbGUgPSBmaWxlc1sgMCBdO1xuICAgICAgICAgICAgICAgIGlmICggZmlsZSAmJiBmaWxlLnRyaW0oKSAhPT0gJycgKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHQuc2V0dGluZ0FwcC5leHRlbnNpb25GaWxlID0gZmlsZTtcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dC5zZXR0aW5nQXBwLnNhdmVUb1N0b3JhZ2UoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBjcmVhdGVkKCkge1xuICAgICAgICAgICAgY29uc3QgZXhhbXBsZSA9IGZzLnJlYWRGaWxlU3luYyggcGF0aC5qb2luKCBfX2Rpcm5hbWUsICdwbHVnaW5zLmpzb24nICksIHsgZW5jb2Rpbmc6ICd1dGYtOCcgfSApO1xuICAgICAgICAgICAgdGhpcy5leGFtcGxlID0gSlNPTi5zdHJpbmdpZnkoIEpTT04ucGFyc2UoIGV4YW1wbGUgKSwgbnVsbCwgJ1xcdCcgKTtcbiAgICAgICAgfSxcbiAgICAgICAgdGVtcGxhdGU6IGBcbiAgICA8ZGl2IGNsYXNzPVwiZXh0ZW5zaW9uUGFuZWxcIj5cbiAgICAgICAgPGxhYmVsPlxuICAgICAgICAgICAgPGlucHV0IEBjaGFuZ2U9XCJzZXR0aW5nLnNhdmVUb1N0b3JhZ2VcIiB0eXBlPVwiY2hlY2tib3hcIiB2LW1vZGVsPVwic2V0dGluZy5lbmFibGVFeHRlbnNpb25cIj5cbiAgICAgICAgICAgIEVuYWJsZSBFeHRlbnNpb25cbiAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgPGhyPlxuICAgICAgICA8ZGl2PkN1cnJlbnQgRXh0ZW5zaW9uIEZpbGU6PGJyPnt7c2V0dGluZy5leHRlbnNpb25GaWxlfX08L2Rpdj5cbiAgICAgICAgPGJ1dHRvbiBAY2xpY2s9XCJjaG9vc2VGaWxlXCI+Q2hvb3NlIEZpbGU8L2J1dHRvbj5cbiAgICAgICAgPGhyPlxuICAgICAgICA8ZGl2PkV4YW1wbGU6PC9kaXY+XG4gICAgICAgIDx0ZXh0YXJlYSByZWFkb25seT57e2V4YW1wbGV9fTwvdGV4dGFyZWE+XG4gICAgPC9kaXY+XG4gICAgYCxcbiAgICB9ICk7XG5cbiAgICBWdWUuY29tcG9uZW50KCAnU3BhY2VyJywgeyB0ZW1wbGF0ZTogYFxuICAgIDxkaXYgY2xhc3M9XCJmbGV4MVwiPjwvZGl2PlxuICAgIGAgfSApO1xufVxuIiwgIi8vIFJlc29sdXRpb24gc2ltdWxhdGlvbjogZHJhZy1yZXNpemVyIG92ZXJsYXkgYW5kIHRoZSBwcmVzZXQtc2l6ZSBzZWxlY3RvciBwb3B1cC5cbmltcG9ydCB7IGNvbnRleHQsIGV4ZWNJbkdhbWUgfSBmcm9tICcuLy4uL2NvbnRleHQnO1xuXG5pbnRlcmZhY2UgU2l6ZVByZXNldCB7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIC8qKiBbc2hvcnRlckVkZ2UsIGxvbmdlckVkZ2VdICovXG4gICAgczogbnVtYmVyW107XG4gICAgLyoqIHByb2plY3QgZGVzaWduIHJlc29sdXRpb24gZW50cnk6IHNlbGVjdGluZyBpdCByZS1lbmFibGVzIG1hdGNoRGVzaWduICovXG4gICAgZGVzaWduPzogYm9vbGVhbjtcbiAgICBwb3J0cmFpdD86IGJvb2xlYW47XG59XG5cbmNvbnN0IFBSRVNFVF9TSVpFUzogU2l6ZVByZXNldFtdID0gW1xuICAgIHsgbmFtZTogJ2lQaG9uZSA0JywgczogWyAzMjAsIDQ4MCBdIH0sXG4gICAgeyBuYW1lOiAnaVBob25lIDUnLCBzOiBbIDMyMCwgNTY4IF0gfSxcbiAgICB7IG5hbWU6ICdpUGhvbmUgNycsIHM6IFsgMzc1LCA2NjcgXSB9LFxuICAgIHsgbmFtZTogJ2lQaG9uZSA3IFBsdXMnLCBzOiBbIDQxNCwgNzM2IF0gfSxcbiAgICB7IG5hbWU6ICdpUGhvbmUgWCcsIHM6IFsgMzc1LCA4MTIgXSB9LFxuICAgIHsgbmFtZTogJ2lQYWQnLCBzOiBbIDc2OCwgMTAyNCBdIH0sXG4gICAgeyBuYW1lOiAnSFcgUDknLCBzOiBbIDU0MCwgOTYwIF0gfSxcbiAgICB7IG5hbWU6ICdIVyBNYXRlOSBQcm8nLCBzOiBbIDcyMCwgMTI4MCBdIH0sXG5dO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJSZXNvbHV0aW9uQ29tcG9uZW50cygpOiB2b2lkIHtcbiAgICBWdWUuY29tcG9uZW50KCAnUmVzb2x1dGlvblJlc2l6ZXInLCB7XG4gICAgICAgIC8vIHRvcCBvZmZzZXQgb2YgdGhlIGZpeGVkIG92ZXJsYXkgKGJlbG93IHRoZSB0b29sYmFyKTsgdGhlIGdhbWUgdmlldyBzdGFydHMgYXQgKDAsIFJFU0laRVJfVE9QKVxuICAgICAgICBkYXRhKCkge1xuICAgICAgICAgICAgcmV0dXJuIHsgUkVTSVpFUl9UT1A6IDMxIH07XG4gICAgICAgIH0sXG4gICAgICAgIGNvbXB1dGVkOiB7XG4gICAgICAgICAgICAvLyByZWFkIHRoZSBsaXZlIHNldHRpbmcgdmFsdWVzIGRpcmVjdGx5IHNvIHRoZSBvdmVybGF5ICsgaGFuZGxlIHRyYWNrIHRoZSBjdXJzb3JcbiAgICAgICAgICAgIC8vIGR1cmluZyBhIGRyYWcgKGEgbG9jYWwgY29weSBvbmx5IHN5bmNlZCBvbiBzYXZlIHdvdWxkIGxhZyB1bnRpbCBtb3VzZXVwKVxuICAgICAgICAgICAgdygpOiBudW1iZXIge1xuICAgICAgICAgICAgICAgIGNvbnN0IHMgPSBjb250ZXh0LnNldHRpbmdBcHA7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHMuaXNQb3J0cmFpdCA/IHMuc2l6ZVsgMCBdIDogcy5zaXplWyAxIF07XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgaCgpOiBudW1iZXIge1xuICAgICAgICAgICAgICAgIGNvbnN0IHMgPSBjb250ZXh0LnNldHRpbmdBcHA7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHMuaXNQb3J0cmFpdCA/IHMuc2l6ZVsgMSBdIDogcy5zaXplWyAwIF07XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgd2hTdHlsZSgpOiBzdHJpbmcge1xuICAgICAgICAgICAgICAgIHJldHVybiBgd2lkdGg6JHsgdGhpcy53IH1weDtoZWlnaHQ6JHsgdGhpcy5oIH1weDtgO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgbWV0aG9kczoge1xuICAgICAgICAgICAgLyoqIEFwcGxpZXMgYSBuZXcgZ2FtZS12aWV3IHNpemUgKHB4KSBsaXZlLiBzaXplIGlzIHN0b3JlZCBhcyBbc2hvcnRlckVkZ2UsIGxvbmdlckVkZ2VdLiAqL1xuICAgICAgICAgICAgc2V0U2l6ZSggc2l6ZTogbnVtYmVyW10gKSB7XG4gICAgICAgICAgICAgICAgaWYgKCBzaXplWyAwIF0gPT09IDAgfHwgc2l6ZVsgMSBdID09PSAwICkgcmV0dXJuO1xuICAgICAgICAgICAgICAgIHNpemUuc29ydCggKCBhLCBiICkgPT4gYSAtIGIgKTtcbiAgICAgICAgICAgICAgICBpZiAoIHNpemUuam9pbiggJywnICkgPT09IGNvbnRleHQuc2V0dGluZ0FwcC5zaXplLmpvaW4oICcsJyApICkgcmV0dXJuO1xuICAgICAgICAgICAgICAgIC8vIHJlcGxhY2UgdGhlIGFycmF5IChub3QgbXV0YXRlKSBzbyBWdWUgcmVhY3Rpdml0eSBmaXJlcyBmb3IgZXZlcnkgZHJhZyBzdGVwXG4gICAgICAgICAgICAgICAgY29udGV4dC5zZXR0aW5nQXBwLnNpemUgPSBzaXplO1xuICAgICAgICAgICAgICAgIGNvbnRleHQuc2V0dGluZ0FwcC5tYXRjaERlc2lnbiA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGV4ZWNJbkdhbWUoICdfX3Jlc2l6ZUN2biAmJiBfX3Jlc2l6ZUN2bigpJyApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIC8qKiBTdGFydHMgYSBjb3JuZXIgZHJhZy1yZXNpemUgb2YgdGhlIGdhbWUgdmlldy4gKi9cbiAgICAgICAgICAgIHN0YXJ0UmVzaXplKCBldmVudDogTW91c2VFdmVudCApIHtcbiAgICAgICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgICAgIC8vIGxldCB0aGUgZHJhZyBvd24gdGhlIG1vdXNlOiBzdG9wIHRoZSBnYW1lL2RldnRvb2xzIHdlYnZpZXdzIGZyb20gc3dhbGxvd2luZyBtb3Zlc1xuICAgICAgICAgICAgICAgIGNvbnRleHQud3YhLnN0eWxlLnBvaW50ZXJFdmVudHMgPSAnbm9uZSc7XG4gICAgICAgICAgICAgICAgaWYgKCBjb250ZXh0LmR3diApIGNvbnRleHQuZHd2LnN0eWxlLnBvaW50ZXJFdmVudHMgPSAnbm9uZSc7XG4gICAgICAgICAgICAgICAgdGhpcy5fb25Nb3ZlID0gKCBlOiBNb3VzZUV2ZW50ICkgPT4gdGhpcy5vblJlc2l6ZU1vdmUoIGUgKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9vblVwID0gKCkgPT4gdGhpcy5lbmRSZXNpemUoKTtcbiAgICAgICAgICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lciggJ21vdXNlbW92ZScsIHRoaXMuX29uTW92ZSwgdHJ1ZSApO1xuICAgICAgICAgICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCAnbW91c2V1cCcsIHRoaXMuX29uVXAsIHRydWUgKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvblJlc2l6ZU1vdmUoIGV2ZW50OiBNb3VzZUV2ZW50ICkge1xuICAgICAgICAgICAgICAgIC8vIGdhbWUgdmlldyBzaXplID0gZGlzdGFuY2UgZnJvbSB0aGUgZml4ZWQgdG9wLWxlZnQgY29ybmVyICgwLCBSRVNJWkVSX1RPUCkgdG8gdGhlIGN1cnNvclxuICAgICAgICAgICAgICAgIGNvbnN0IHcgPSBNYXRoLm1heCggNTAsIE1hdGgucm91bmQoIGV2ZW50LmNsaWVudFggKSApO1xuICAgICAgICAgICAgICAgIGNvbnN0IGggPSBNYXRoLm1heCggNTAsIE1hdGgucm91bmQoIGV2ZW50LmNsaWVudFkgLSB0aGlzLlJFU0laRVJfVE9QICkgKTtcbiAgICAgICAgICAgICAgICBjb250ZXh0LnNldHRpbmdBcHAuaXNQb3J0cmFpdCA9IHcgPCBoO1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0U2l6ZSggWyB3LCBoIF0gKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBlbmRSZXNpemUoKSB7XG4gICAgICAgICAgICAgICAgY29udGV4dC53diEuc3R5bGUucG9pbnRlckV2ZW50cyA9ICd1bnNldCc7XG4gICAgICAgICAgICAgICAgaWYgKCBjb250ZXh0LmR3diApIGNvbnRleHQuZHd2LnN0eWxlLnBvaW50ZXJFdmVudHMgPSAndW5zZXQnO1xuICAgICAgICAgICAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCAnbW91c2Vtb3ZlJywgdGhpcy5fb25Nb3ZlLCB0cnVlICk7XG4gICAgICAgICAgICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoICdtb3VzZXVwJywgdGhpcy5fb25VcCwgdHJ1ZSApO1xuICAgICAgICAgICAgICAgIGNvbnRleHQuc2V0dGluZ0FwcC5zYXZlVG9TdG9yYWdlKCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB0ZW1wbGF0ZTogYFxuICAgIDxkaXYgY2xhc3M9XCJSZXNvbHV0aW9uUmVzaXplclwiIDpzdHlsZT1cIndoU3R5bGVcIj5cbiAgICAgICAgPGRpdiBjbGFzcz1cInJlc2l6ZUhhbmRsZVwiIEBtb3VzZWRvd24uc3RvcC5wcmV2ZW50PVwic3RhcnRSZXNpemVcIiB0aXRsZT1cImRyYWcgdG8gcmVzaXplIHRoZSBnYW1lIHZpZXdcIj48L2Rpdj5cbiAgICA8L2Rpdj5cbiAgICBgLFxuICAgIH0gKTtcblxuICAgIFZ1ZS5jb21wb25lbnQoICdSZXNvbHV0aW9uU2VsZWN0b3InLCB7XG4gICAgICAgIGRhdGEoKSB7XG4gICAgICAgICAgICBjb25zdCBkZXNpZ24gPSByZWFkRGVzaWduU2l6ZSgpO1xuICAgICAgICAgICAgY29uc3QgZGVzaWduUHJlc2V0OiBTaXplUHJlc2V0W10gPSBkZXNpZ25cbiAgICAgICAgICAgICAgICA/IFsgeyBuYW1lOiBgRGVzaWduICR7IGRlc2lnblsgMCBdIH14JHsgZGVzaWduWyAxIF0gfWAsIHM6IFsgTWF0aC5taW4oIC4uLmRlc2lnbiApLCBNYXRoLm1heCggLi4uZGVzaWduICkgXSwgcG9ydHJhaXQ6IGRlc2lnblsgMSBdID4gZGVzaWduWyAwIF0sIGRlc2lnbjogdHJ1ZSB9IF1cbiAgICAgICAgICAgICAgICA6IFtdO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzaXplczogZGVzaWduUHJlc2V0LmNvbmNhdCggUFJFU0VUX1NJWkVTICksXG4gICAgICAgICAgICAgICAgc2hvd0N1c3RvbTogZmFsc2UsXG4gICAgICAgICAgICAgICAgY29zdG9tU2l6ZTogeyBuYW1lOiAnY3VzdG9tJywgczogWyA2NDAsIDk2MCBdIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICB9LFxuICAgICAgICBjcmVhdGVkKCkge1xuICAgICAgICAgICAgLy8gbGVnYWN5IGNvbmZpZ3Mgc3RvcmVkIHJhdyBhcnJheXMgaGVyZTsgZHJvcCB0aGVtXG4gICAgICAgICAgICBjb250ZXh0LnNldHRpbmdBcHAuZXh0cmFTaXplcyA9IGNvbnRleHQuc2V0dGluZ0FwcC5leHRyYVNpemVzLmZpbHRlciggKCBlbnRyeTogdW5rbm93biApID0+ICFBcnJheS5pc0FycmF5KCBlbnRyeSApICk7XG4gICAgICAgIH0sXG4gICAgICAgIG1ldGhvZHM6IHtcbiAgICAgICAgICAgIGlzQ3VyclNpemUoIHNpemU6IG51bWJlcltdICk6IGJvb2xlYW4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBjb250ZXh0LnNldHRpbmdBcHAuc2l6ZS5qb2luKCAnLCcgKSA9PT0gc2l6ZS5qb2luKCAnLCcgKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzZXRTaXplKCBzaXplOiBudW1iZXJbXSwgcHJlc2V0PzogeyBkZXNpZ24/OiBib29sZWFuOyBwb3J0cmFpdD86IGJvb2xlYW4gfSApIHtcbiAgICAgICAgICAgICAgICBjb250ZXh0LnNldHRpbmdBcHAuc2l6ZSA9IHNpemU7XG4gICAgICAgICAgICAgICAgY29udGV4dC5zZXR0aW5nQXBwLm1hdGNoRGVzaWduID0gQm9vbGVhbiggcHJlc2V0Py5kZXNpZ24gKTtcbiAgICAgICAgICAgICAgICBpZiAoIHByZXNldD8uZGVzaWduICkgY29udGV4dC5zZXR0aW5nQXBwLmlzUG9ydHJhaXQgPSBCb29sZWFuKCBwcmVzZXQucG9ydHJhaXQgKTtcbiAgICAgICAgICAgICAgICBjb250ZXh0LnNldHRpbmdBcHAuc2F2ZVRvU3RvcmFnZSgpO1xuICAgICAgICAgICAgICAgIHRoaXMuJG5leHRUaWNrKCkudGhlbiggKCkgPT4gZXhlY0luR2FtZSggJ3NldFRpbWVvdXQoX19yZXNpemVDdm4sMTAwKScgKSApO1xuICAgICAgICAgICAgICAgIGNvbnRleHQudnVlQXBwLnNob3dSZXNvbHV0aW9uU2VsZWN0b3IgPSBmYWxzZTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBhZGRDdXN0b20oKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2l6ZSA9IHRoaXMuY29zdG9tU2l6ZS5zLmNvbmNhdCgpO1xuICAgICAgICAgICAgICAgIHNpemUuc29ydCggKCBhOiBudW1iZXIsIGI6IG51bWJlciApID0+IGEgLSBiICk7XG4gICAgICAgICAgICAgICAgY29udGV4dC5zZXR0aW5nQXBwLmV4dHJhU2l6ZXMucHVzaCggeyBuYW1lOiB0aGlzLmNvc3RvbVNpemUubmFtZSwgczogc2l6ZSB9ICk7XG4gICAgICAgICAgICAgICAgY29udGV4dC5zZXR0aW5nQXBwLnNhdmVUb1N0b3JhZ2UoKTtcbiAgICAgICAgICAgICAgICB0aGlzLnNob3dDdXN0b20gPSBmYWxzZTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBkZWxTaXplKCBpbmRleDogbnVtYmVyICkge1xuICAgICAgICAgICAgICAgIGNvbnRleHQuc2V0dGluZ0FwcC5leHRyYVNpemVzLnNwbGljZSggaW5kZXgsIDEgKTtcbiAgICAgICAgICAgICAgICBjb250ZXh0LnNldHRpbmdBcHAuc2F2ZVRvU3RvcmFnZSgpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgdGVtcGxhdGU6IGBcbiAgICA8ZGl2IGNsYXNzPVwiUmVzb2x1dGlvblNlbGVjdG9yXCI+XG4gICAgICAgIDxsYWJlbD5cbiAgICAgICAgICAgIDxpbnB1dCBAY2hhbmdlPVwic2V0dGluZy5zeW5jUG9ydHJhaXRcIiB0eXBlPVwiY2hlY2tib3hcIiAgdi1tb2RlbD1cInNldHRpbmcuaXNQb3J0cmFpdFwiIC8+XG4gICAgICAgICAgICBpc1BvcnRyYWl0XG4gICAgICAgIDwvbGFiZWw+XG4gICAgICAgIDxocj5cblxuICAgICAgICA8ZGl2IEBjbGljaz1cInNldFNpemUocy5zLCBzKVwiIGNsYXNzPVwicmVzb0l0ZW1cIiB2LWZvcj1cInMgaW4gc2l6ZXNcIiA6a2V5PVwic1wiID5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwic2l6ZU5hbWVcIj5cbiAgICAgICAgICAgICAgICB7e3MubmFtZX19XG4gICAgICAgICAgICAgICAgPHNwYWNlciAvPlxuICAgICAgICAgICAgICAgIHt7cy5zLmpvaW4oXCIqXCIpfX1cbiAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiaWNvbmZvbnQgaWNvbi1yaWdodFwiIHYtaWY9XCJpc0N1cnJTaXplKHMucylcIj48L3NwYW4+XG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cImZsZXgxXCI+PC9zcGFuPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPGhyIHYtaWY9XCJzZXR0aW5nLmV4dHJhU2l6ZXMubGVuZ3RoPjBcIj5cbiAgICAgICAgPGRpdiBAY2xpY2s9XCJzZXRTaXplKHMucylcIiBjbGFzcz1cInJlc29JdGVtXCIgdi1mb3I9XCIocyxpKSBpbiBzZXR0aW5nLmV4dHJhU2l6ZXNcIiA6a2V5PVwic1wiID5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwic2l6ZU5hbWVcIj5cbiAgICAgICAgICAgICAgICB7e3MubmFtZX19XG4gICAgICAgICAgICAgICAgPHNwYWNlciAvPlxuICAgICAgICAgICAgICAgIHt7cy5zLmpvaW4oXCIqXCIpfX1cbiAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiaWNvbmZvbnQgaWNvbi1yaWdodFwiIHYtaWY9XCJpc0N1cnJTaXplKHMucylcIj48L3NwYW4+XG4gICAgICAgICAgICA8YSBAY2xpY2suc3RvcD1cImRlbFNpemUoaSlcIj48c3BhbiBjbGFzcz1cImljb25mb250IGljb24td3JvbmcyXCI+PC9zcGFuPjwvYT5cbiAgICAgICAgPC9kaXY+XG4gICAgICAgIDxocj5cbiAgICAgICAgPGEgdi1zaG93PVwiIXNob3dDdXN0b21cIiBAY2xpY2suc3RvcD1cInNob3dDdXN0b209dHJ1ZVwiPitDdXN0b208L2E+XG4gICAgICAgIDxkaXYgdi1zaG93PVwic2hvd0N1c3RvbVwiIHN0eWxlPVwiZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtcIj5cbiAgICAgICAgICAgIG5hbWU6PGlucHV0IHR5cGU9XCJ0ZXh0XCIgdi1tb2RlbD1cImNvc3RvbVNpemUubmFtZVwiIC8+XG4gICAgICAgICAgICB3aWR0aDogPGlucHV0IHR5cGU9XCJudW1iZXJcIiB2LW1vZGVsLm51bWJlcj1cImNvc3RvbVNpemUuc1swXVwiIC8+XG5cbiAgICAgICAgICAgIGhlaWdodDo8aW5wdXQgdHlwZT1cIm51bWJlclwiIHYtbW9kZWwubnVtYmVyPVwiY29zdG9tU2l6ZS5zWzFdXCIgLz5cblxuICAgICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6ZmxleFwiPlxuICAgICAgICAgICAgICAgIDxhIEBjbGljay5zdG9wPVwiYWRkQ3VzdG9tKClcIj5Db25maXJtPC9hPlxuICAgICAgICAgICAgICAgIDxzcGFjZXIgLz5cbiAgICAgICAgICAgICAgICA8YSBAY2xpY2suc3RvcD1cInNob3dDdXN0b209ZmFsc2VcIj5DYW5jZWw8L2E+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgPC9kaXY+YCxcbiAgICB9ICk7XG59XG4iLCAiLy8gSGVscCBwYW5lbCAoYmlsaW5ndWFsKS4gRXh0ZXJuYWwgbGlua3Mgbm93IGdvIHRocm91Z2ggc2hlbGwub3BlbkV4dGVybmFsIHZpYSBhIG1ldGhvZFxuLy8gaW5zdGVhZCBvZiB0aGUgbGVnYWN5IGdsb2JhbCBgcmVtb3RlYC5cbmltcG9ydCB7IGdldExvY2FsZUlwYywgb3BlbkV4dGVybmFsIH0gZnJvbSAnLi8uLi9pcGMnO1xuXG5jb25zdCBWSURFT19QTFVHSU5fVVJMID0gJ2h0dHBzOi8vd3d3LmJpbGliaWxpLmNvbS92aWRlby9CVjFOaDQxMWg3MmgnO1xuY29uc3QgVklERU9fTUFDX1VSTCA9ICdodHRwczovL3d3dy5iaWxpYmlsaS5jb20vdmlkZW8vQlYxS0s0eTFSN0wxJztcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVySGVscENvbXBvbmVudCgpOiB2b2lkIHtcbiAgICBWdWUuY29tcG9uZW50KCAnTXlIZWxwJywge1xuICAgICAgICBkYXRhKCkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc2hvdzogZmFsc2UsIGxhbmc6ICdlbicgfTtcbiAgICAgICAgfSxcbiAgICAgICAgY3JlYXRlZCgpIHtcbiAgICAgICAgICAgIGdldExvY2FsZUlwYygpLnRoZW4oICggbG9jYWxlICkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMubGFuZyA9IGxvY2FsZSA9PT0gJ3poLUNOJyA/ICdjbicgOiAnZW4nO1xuICAgICAgICAgICAgfSApO1xuICAgICAgICB9LFxuICAgICAgICBjb21wdXRlZDoge1xuICAgICAgICAgICAgaXNDTigpOiBib29sZWFuIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5sYW5nID09PSAnY24nO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgbWV0aG9kczoge1xuICAgICAgICAgICAgb3BlbkV4dGVybmFsKCB1cmw6IHN0cmluZyApIHtcbiAgICAgICAgICAgICAgICBvcGVuRXh0ZXJuYWwoIHVybCApO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgdGVtcGxhdGU6IGBcbiAgICA8ZGl2IGNsYXNzPVwiaGVscFBhbmVsIHNldHRpbmdcIiB2LXNob3c9XCJzaG93XCI+XG4gICAgPGRpdiBjbGFzcz1cInNldHRpbmdIZWFkZXJcIj5cbiAgICAgICAgPHNwYW4gY2xhc3M9XCJpY29uZm9udCBpY29uLXNoYW5jaHVcIiBAY2xpY2s9XCJzaG93PWZhbHNlXCIgc3R5bGU9XCJmb250LXNpemU6IDEuNWVtO1wiPjwvc3Bhbj5cbiAgICAgICAgPGRpdiBjbGFzcz1cInNldHRpbmdUaXRsZVwiIHYtc2hvdz1cIiFpc0NOXCI+SGVscDwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzPVwic2V0dGluZ1RpdGxlXCIgdi1zaG93PVwiaXNDTlwiPlx1NUUyRVx1NTJBOTwvZGl2PlxuICAgICAgICA8YSBAY2xpY2s9XCJsYW5nPSdjbidcIiB2LXNob3c9XCIhaXNDTlwiPkNoaW5lc2U8L2E+XG4gICAgICAgIDxhIEBjbGljaz1cImxhbmc9J2VuJ1wiIHYtc2hvdz1cImlzQ05cIj5FbmdsaXNoPC9hPlxuICAgIDwvZGl2PlxuICAgIDxkaXYgdi1zaG93PVwibGFuZz09J2VuJ1wiPlxuICAgICAgICA8aDE+RHJhd0NhbGw8L2gxPlxuICAgICAgICA8dWw+XG4gICAgICAgICAgICA8bGk+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImhlbHBUaXRsZVwiPkhvdyB0byBvcGVuPC9kaXY+XG4gICAgICAgICAgICAgICAgcmlnaHQgY2xpY2sgc2NlbmUgbmFtZSBUYWJcbiAgICAgICAgICAgIDwvbGk+XG4gICAgICAgICAgICA8bGk+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImhlbHBUaXRsZVwiPldoeSBub3QgYWNjdXJhdGU/PC9kaXY+XG4gICAgICAgICAgICAgICAgbnVtYmVyICsgbWsgKyBnaCArIG90IGlzIHRvdGFsIGRyYXdjYWxsLCBub3Qgb25seSBudW1iZXI7XG4gICAgICAgICAgICAgICAgPGJyPlxuICAgICAgICAgICAgICAgIGFuZCBub3cgaXMgYmV0YSwgb25seSBjYWxjdWxhdGUgU3ByaXRlIGFuZCBsYWJlbCwgaW4gQXV0b0F0bGFzLCBEeW5hbWljQXRsYXMsU3RhdGljIEF0bGFzLlxuICAgICAgICAgICAgICAgIDxicj5cbiAgICAgICAgICAgICAgICBTaGFkZXIgYW5kIE1hdGVyaWFsIHN0aWxsIG5vdCBjYWxjdWxhdGU7XG4gICAgICAgICAgICA8L2xpPlxuICAgICAgICAgICAgPGxpPlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJoZWxwVGl0bGVcIj5XaGF0J3MgdGhlIG1lYW5zIG9mOiBtaywgZ2gsIG90PzwvZGl2PlxuICAgICAgICAgICAgICAgIG1rIGlzIE1hc2ssIGdoIGlzIEdyYXBoaWNzLCBvdCBpcyBvdGhlciBSZW5kZXJDb21wb25lbnRzO1xuICAgICAgICAgICAgICAgIDxicj5cbiAgICAgICAgICAgICAgICB0aGV5IGhhdmUgbWFueSBkaWZmZXJlbnQgY2FzZXMgYWJvdXQgRHJhd0NhbGwsIHNvIG5vdyBvbmx5IG1hcmsgdGhlbSBpbiBub2RlIFRyZWVcbiAgICAgICAgICAgIDwvbGk+XG4gICAgICAgIDwvdWw+XG4gICAgICAgIDxocj5cbiAgICAgICAgPGgxPlZpZGVvIFR1dG9yaWFsPC9oMT5cbiAgICAgICAgPHVsPlxuICAgICAgICAgICAgPGxpPlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJoZWxwVGl0bGVcIj5QbHVnaW4gVmVyc2lvbjwvZGl2PlxuICAgICAgICAgICAgICAgIEluIFJlY29yZGluZ1xuICAgICAgICAgICAgICAgIDxhIEBjbGljaz1cIm9wZW5FeHRlcm5hbCgnJHsgVklERU9fUExVR0lOX1VSTCB9JylcIiA+JHsgVklERU9fUExVR0lOX1VSTCB9PC9hPlxuICAgICAgICAgICAgPC9saT5cbiAgICAgICAgICAgIDxsaT5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiaGVscFRpdGxlXCI+TWFjIE5hdGl2ZSBWZXJzaW9uPC9kaXY+XG4gICAgICAgICAgICAgICAgbm90IHNhbWUgYXMgUGx1Z2luIFZlcnNpb25cbiAgICAgICAgICAgICAgICA8YSBAY2xpY2s9XCJvcGVuRXh0ZXJuYWwoJyR7IFZJREVPX01BQ19VUkwgfScpXCIgPiR7IFZJREVPX1BMVUdJTl9VUkwgfTwvYT5cbiAgICAgICAgICAgIDwvbGk+XG4gICAgICAgIDwvdWw+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8ZGl2IHYtc2hvdz1cImxhbmc9PSdjbidcIj5cbiAgICAgICAgPGgxPkRyYXdDYWxsXHU1MjA2XHU2NzkwPC9oMT5cbiAgICAgICAgPHVsPlxuICAgICAgICAgICAgPGxpPlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJoZWxwVGl0bGVcIj5cdTYwMEVcdTRFNDhcdTYyNTNcdTVGMDBEcmF3Q2FsbFx1NTIwNlx1Njc5MDwvZGl2PlxuICAgICAgICAgICAgICAgIFx1NTcyOFx1NTczQVx1NjY2Rlx1NTQwRFx1NzlGMFx1NEUwQVx1NTNGM1x1OTUyRVxuICAgICAgICAgICAgPC9saT5cbiAgICAgICAgICAgIDxsaT5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiaGVscFRpdGxlXCI+XHU0RTNBXHU0RUMwXHU0RTQ4XHU2NzA5XHU2NUY2XHU0RTBEXHU1OTJBXHU1MUM2XHU3ODZFPzwvZGl2PlxuICAgICAgICAgICAgICAgIGRyYXdjYWxsXHU1MzA1XHU1NDJCIFx1NjU3MFx1NUI1NyArIG1rICsgZ2ggKyBvdFx1RkYwQyBcdTRFMERcdTRFQzVcdTRFQzVcdTY2MkZcdTY1NzBcdTVCNTc7XG4gICAgICAgICAgICAgICAgPGJyPlxuICAgICAgICAgICAgICAgIFx1NzZFRVx1NTI0RFx1NEVDNVx1OEJBMVx1N0I5N1x1NEU4NlNwcml0ZVx1NTQ4Q0xhYmVsKFx1NTMwNVx1NTQyQlx1ODFFQVx1NTJBOFx1NTZGRVx1OTZDNlx1RkYwQ1x1NTJBOFx1NjAwMVx1NTZGRVx1OTZDNlx1RkYwQ1x1OTc1OVx1NjAwMVx1NTZGRVx1OTZDNlx1N0I0OVx1NTZFMFx1N0QyMClcbiAgICAgICAgICAgICAgICA8YnI+XG4gICAgICAgICAgICAgICAgU2hhZGVyXHVGRjBDTWV0ZXJpYWxcdTRFQTdcdTc1MUZcdTc2ODREcmF3Q2FsbFx1NjY4Mlx1NjVGNlx1NUU3Nlx1NjcyQVx1NTMwNVx1NTQyQlxuICAgICAgICAgICAgPC9saT5cbiAgICAgICAgICAgIDxsaT5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiaGVscFRpdGxlXCI+bWssIGdoLCBvdFx1NjYyRlx1NEVDMFx1NEU0OFx1NjEwRlx1NjAxRD88L2Rpdj5cbiAgICAgICAgICAgICAgICBtayBcdTY2MkYgTWFzaywgZ2ggXHU2NjJGIEdyYXBoaWNzLCBvdCBpcyBcdTUxNzZcdTRFRDZcdTZFMzJcdTY3RDNcdTdFQzRcdTRFRjY7XG4gICAgICAgICAgICAgICAgPGJyPlxuICAgICAgICAgICAgICAgIFx1NEVENlx1NEVFQ1x1NjcwOVx1NUY4OFx1NTkxQVx1NTZFMFx1N0QyMFx1Njc2NVx1NUY3MVx1NTRDRERyYXdDYWxsXHVGRjBDXHU2NjgyXHU2NUY2XHU0RTBEXHU2NUI5XHU0RkJGXHU4QkExXHU3Qjk3XHVGRjBDXHU2MjQwXHU0RUU1XHU3M0IwXHU1NzI4XHU0RUM1XHU0RUM1XHU1NzI4XHU4MjgyXHU3MEI5XHU2ODExXHU2ODA3XHU4QkIwXHU1MUZBXHU2NzY1XHVGRjBDXHU2NUI5XHU0RkJGXHU3N0U1XHU5MDUzXHU1RjcxXHU1NENERHJhd0NhbGxcdTc2ODRcdTUzRUZcdTgwRkRcdTU2RTBcdTdEMjBcbiAgICAgICAgICAgIDwvbGk+XG4gICAgICAgIDwvdWw+XG4gICAgICAgIDxocj5cbiAgICAgICAgPGgxPkZHVUlcdTY1MkZcdTYzMDE8L2gxPlxuICAgICAgICA8dWw+XG4gICAgICAgICAgICA8bGk+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImhlbHBUaXRsZVwiPlx1NEUzQVx1NEVDMFx1NEU0OFx1ODI4Mlx1NzBCOVx1NkNBMVx1NjcwOVx1NjYzRVx1NzkzQVx1NjIxMEZHVUlcdTdFRDNcdTY3ODQ8L2Rpdj5cbiAgICAgICAgICAgICAgICBcdTk5OTZcdTUxNDhcdTg5ODFcdTU3MjhcdThCQkVcdTdGNkVcdTVGMDBcdTU0MkZmYWlyeUdVSVx1RkYwQ1x1NTE3Nlx1NkIyMVx1RkYwQ2NjYzMueFx1NzI0OFx1NjcyQ1x1ODk4MVx1NEZERFx1OEJDMXdpbmRvd1tcImZndWlcIl1cdTUzRUZcdTRFRTVcdThCQkZcdTk1RUVcbiAgICAgICAgICAgIDwvbGk+XG4gICAgICAgIDwvdWw+XG4gICAgICAgIDxocj5cbiAgICAgICAgPGgxPlx1ODlDNlx1OTg5MVx1NjU1OVx1N0EwQjwvaDE+XG4gICAgICAgIDx1bD5cbiAgICAgICAgICAgIDxsaT5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiaGVscFRpdGxlXCI+XHU2M0QyXHU0RUY2XHU3MjQ4PC9kaXY+XG4gICAgICAgICAgICAgICAgXHU1RjU1XHU1MjM2XHU0RTJELi4uXG4gICAgICAgICAgICAgICAgPGEgQGNsaWNrPVwib3BlbkV4dGVybmFsKCckeyBWSURFT19QTFVHSU5fVVJMIH0nKVwiID4keyBWSURFT19QTFVHSU5fVVJMIH08L2E+XG4gICAgICAgICAgICA8L2xpPlxuICAgICAgICAgICAgPGxpPlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJoZWxwVGl0bGVcIj5NYWNcdTUzOUZcdTc1MUZcdTcyNDhcdTY3MkM8L2Rpdj5cbiAgICAgICAgICAgICAgICBcdThEREZcdTYzRDJcdTRFRjZcdTcyNDhcdTRFMERcdTRFMDBcdTY4MzdcdUZGMENcdTRFQzVcdTRGOUJcdTUzQzJcdTgwMDNcbiAgICAgICAgICAgICAgICA8YSBAY2xpY2s9XCJvcGVuRXh0ZXJuYWwoJyR7IFZJREVPX01BQ19VUkwgfScpXCIgPiR7IFZJREVPX1BMVUdJTl9VUkwgfTwvYT5cbiAgICAgICAgICAgIDwvbGk+XG4gICAgICAgIDwvdWw+XG4gICAgICAgIDwvZGl2PlxuICAgIDwvZGl2PlxuICAgIGAsXG4gICAgfSApO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFQSxNQUFBQSxNQUFvQjtBQUNwQixNQUFBQyxRQUFzQjs7O0FDQ2YsTUFBTSxXQUFXO0FBV2pCLE1BQU0sVUFBVTtBQUFBLElBQ25CLFdBQVcsR0FBSSxRQUFTO0FBQUEsSUFDeEIsWUFBWSxHQUFJLFFBQVM7QUFBQSxFQUM3QjtBQUdPLE1BQU0sWUFBWTtBQUFBLElBQ3JCLGNBQWMsR0FBSSxRQUFTO0FBQUEsSUFDM0IsZUFBZSxHQUFJLFFBQVM7QUFBQSxJQUM1QixVQUFVLEdBQUksUUFBUztBQUFBLElBQ3ZCLGdCQUFnQixHQUFJLFFBQVM7QUFBQSxJQUM3QixXQUFXLEdBQUksUUFBUztBQUFBLElBQ3hCLGdCQUFnQixHQUFJLFFBQVM7QUFBQSxJQUM3QixpQkFBaUIsR0FBSSxRQUFTO0FBQUEsRUFDbEM7QUFHTyxNQUFNLFdBQVc7QUFBQSxJQUNwQixnQkFBZ0IsR0FBSSxRQUFTO0FBQUEsSUFDN0IsYUFBYSxHQUFJLFFBQVM7QUFBQSxFQUM5QjtBQXNCTyxNQUFNLGNBQWM7QUFBQSxJQUN2QixXQUFXO0FBQUEsSUFDWCxZQUFZO0FBQUEsSUFDWixZQUFZO0FBQUEsSUFDWixjQUFjO0FBQUEsSUFDZCxhQUFhO0FBQUEsSUFDYixZQUFZO0FBQUEsSUFDWixnQkFBZ0I7QUFBQSxJQUNoQixlQUFlO0FBQUEsSUFDZixlQUFlO0FBQUEsRUFDbkI7OztBQzlETyxNQUFNLFVBQVU7QUFBQTtBQUFBLElBRW5CLElBQUk7QUFBQTtBQUFBLElBRUosS0FBSztBQUFBO0FBQUEsSUFFTCxRQUFRO0FBQUE7QUFBQSxJ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
