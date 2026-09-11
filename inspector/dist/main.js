"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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

// src/main/main.ts
var import_electron4 = require("electron");

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

// src/main/devtools-wiring.ts
var import_electron = require("electron");

// src/main/devtools-bridge.ts
var http = __toESM(require("http"));
var crypto = __toESM(require("crypto"));
var WS_ACCEPT_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
var OPCODE_CONTINUATION = 0;
var OPCODE_TEXT = 1;
var OPCODE_CLOSE = 8;
var OPCODE_PING = 9;
var PONG_HEADER = 138;
var bridges = /* @__PURE__ */ new Map();
function encodeTextFrame(payload) {
  const data = Buffer.from(payload, "utf8");
  let header;
  if (data.length < 126) {
    header = Buffer.from([128 | OPCODE_TEXT, data.length]);
  } else if (data.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 128 | OPCODE_TEXT;
    header[1] = 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 128 | OPCODE_TEXT;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  return Buffer.concat([header, data]);
}
function attachFrameReceiver(socket, onMessage, onClose) {
  let buffer = Buffer.alloc(0);
  let fragments = [];
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      if (buffer.length < 2) return;
      const fin = (buffer[0] & 128) !== 0;
      const opcode = buffer[0] & 15;
      const masked = (buffer[1] & 128) !== 0;
      let length = buffer[1] & 127;
      let offset = 2;
      if (length === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffer.length < 10) return;
        length = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }
      const maskLength = masked ? 4 : 0;
      if (buffer.length < offset + maskLength + length) return;
      let payload = buffer.slice(offset + maskLength, offset + maskLength + length);
      if (masked) {
        const mask = buffer.slice(offset, offset + 4);
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      }
      buffer = buffer.slice(offset + maskLength + length);
      if (opcode === OPCODE_CLOSE) {
        onClose();
        socket.end();
        return;
      }
      if (opcode === OPCODE_PING) {
        socket.write(Buffer.concat([Buffer.from([PONG_HEADER, payload.length]), payload]));
        continue;
      }
      if (opcode === OPCODE_TEXT || opcode === OPCODE_CONTINUATION) {
        fragments.push(payload);
        if (fin) {
          const message = Buffer.concat(fragments).toString("utf8");
          fragments = [];
          onMessage(message);
        }
      }
    }
  });
  socket.on("error", onClose);
  socket.on("close", onClose);
}
function handleConnection(bridge, game, socket, log2) {
  socket.setNoDelay(true);
  if (bridge.activeSocket) {
    try {
      bridge.activeSocket.destroy();
    } catch {
    }
  }
  bridge.activeSocket = socket;
  log2("bridge: devtools frontend connected", { gameWcId: game.id });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (bridge.activeSocket === socket) bridge.activeSocket = null;
  };
  const send = (message) => {
    if (closed || bridge.activeSocket !== socket) return;
    try {
      socket.write(encodeTextFrame(JSON.stringify(message)));
    } catch {
      close();
    }
  };
  const onDebuggerMessage = (_event, method, params) => send({ method, params });
  const onDebuggerDetach = () => {
    close();
    try {
      socket.end();
    } catch {
    }
  };
  try {
    if (!game.debugger.isAttached()) game.debugger.attach();
  } catch (error) {
    log2("bridge: debugger attach failed", String(error));
  }
  game.debugger.on("message", onDebuggerMessage);
  game.debugger.once("detach", onDebuggerDetach);
  socket.once("close", () => {
    game.debugger.removeListener("message", onDebuggerMessage);
    game.debugger.removeListener("detach", onDebuggerDetach);
    close();
  });
  attachFrameReceiver(socket, (text) => {
    let request;
    try {
      request = JSON.parse(text);
    } catch {
      return;
    }
    game.debugger.sendCommand(request.method, request.params ?? {}).then(
      (result) => send({ id: request.id, result: result ?? {} }),
      (error) => send({
        id: request.id,
        error: { code: -32e3, message: String((error == null ? void 0 : error.message) ?? error) }
      })
    );
  }, close);
}
function startDevtoolsBridge(game, log2) {
  const existing = bridges.get(game.id);
  if (existing) return Promise.resolve(existing.port);
  return new Promise((resolve, reject) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    const bridge = { server, port: 0, activeSocket: null };
    server.on("upgrade", (request, socket) => {
      const key = request.headers["sec-websocket-key"];
      if (!key) {
        socket.destroy();
        return;
      }
      const accept = crypto.createHash("sha1").update(key + WS_ACCEPT_GUID).digest("base64");
      socket.write(
        `HTTP/1.1 101 Switching Protocols\r
Upgrade: websocket\r
Connection: Upgrade\r
Sec-WebSocket-Accept: ${accept}\r
\r
`
      );
      handleConnection(bridge, game, socket, log2);
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      bridge.port = server.address().port;
      bridges.set(game.id, bridge);
      game.once("destroyed", () => {
        try {
          server.close();
        } catch {
        }
        bridges.delete(game.id);
      });
      log2("bridge: listening", { gameWcId: game.id, port: bridge.port });
      resolve(bridge.port);
    });
  });
}
function bridgeFrontendUrl(port) {
  return `devtools://devtools/bundled/inspector.html?ws=127.0.0.1:${port}/game`;
}

// src/main/log.ts
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var FILE_LOG_ENABLED = process.env.COCOS_INSPECTOR_DEBUG_LOG === "1";
var LOG_FILE_NAME = "inspector-debug.log";
function resolveLogPath() {
  var _a;
  const base = typeof Editor !== "undefined" && ((_a = Editor == null ? void 0 : Editor.Project) == null ? void 0 : _a.tmpDir) ? Editor.Project.tmpDir : path.join(__dirname, "..");
  return path.join(base, LOG_FILE_NAME);
}
var LOG_PATH = resolveLogPath();
function resetLogFile() {
  if (!FILE_LOG_ENABLED) return;
  try {
    fs.writeFileSync(LOG_PATH, "");
  } catch {
  }
}
function log(...parts) {
  console.log("[cocos-inspector]", ...parts);
  if (!FILE_LOG_ENABLED) return;
  const line = (/* @__PURE__ */ new Date()).toISOString() + " " + parts.map(
    (part) => typeof part === "string" ? part : JSON.stringify(part)
  ).join(" ");
  try {
    fs.appendFileSync(LOG_PATH, line + "\n");
  } catch {
  }
}

// src/main/devtools-wiring.ts
function ensurePausedWatcher(game, devtoolsView, notifyPaused) {
  if (game.__inspectorWatcher) return;
  game.__inspectorWatcher = true;
  if (!game.debugger.isAttached()) game.debugger.attach();
  game.debugger.on("message", (_event, method) => {
    if (method !== "Debugger.paused") return;
    notifyPaused();
    void disablePausedOverlay(devtoolsView);
  });
}
async function disablePausedOverlay(devtoolsView) {
  try {
    const overlayDisabled = await devtoolsView.executeJavaScript(
      "Common.settings.moduleSetting('disablePausedStateOverlay').get()"
    );
    if (!overlayDisabled) {
      await devtoolsView.executeJavaScript(
        "Common.settings.moduleSetting('disablePausedStateOverlay').set(true)"
      );
    }
  } catch {
  }
}
async function wireDevtools(gameWcId, devtoolsWcId, notifyPaused) {
  try {
    const game = import_electron.webContents.fromId(gameWcId);
    const devtoolsView = import_electron.webContents.fromId(devtoolsWcId);
    if (!game || !devtoolsView) {
      log("wire-devtools: webContents not found", { gameWcId, devtoolsWcId });
      return { ok: false, error: `webContents not found (game=${gameWcId}, devtools=${devtoolsWcId})` };
    }
    const gameUrl = String(game.getURL());
    if (!/^(https?|file):/.test(gameUrl)) {
      return { ok: false, error: "game page not loaded yet" };
    }
    const alreadyWired = Boolean(game.__inspectorWired) && String(devtoolsView.getURL()).startsWith("devtools://");
    if (!alreadyWired) {
      const port = await startDevtoolsBridge(game, log);
      const frontendUrl = bridgeFrontendUrl(port);
      try {
        await devtoolsView.loadURL(frontendUrl);
        log("wire-devtools: frontend loaded via ws bridge", { gameWcId, port });
      } catch (error) {
        log("wire-devtools: direct devtools:// load failed, using embedder bootstrap", String((error == null ? void 0 : error.message) ?? error));
        game.setDevToolsWebContents(devtoolsView);
        game.openDevTools();
        setTimeout(() => {
          devtoolsView.loadURL(frontendUrl).catch(
            (redirectError) => log("wire-devtools: ws redirect failed", String((redirectError == null ? void 0 : redirectError.message) ?? redirectError))
          );
        }, 800);
      }
      game.__inspectorWired = true;
    }
    ensurePausedWatcher(game, devtoolsView, notifyPaused);
    return { ok: true, muted: game.isAudioMuted() };
  } catch (error) {
    log("wire-devtools: FAILED", String((error == null ? void 0 : error.stack) ?? error));
    return { ok: false, error: String((error == null ? void 0 : error.message) ?? error) };
  }
}
function setGameAudioMuted(gameWcId, muted) {
  try {
    const game = import_electron.webContents.fromId(gameWcId);
    if (game) game.setAudioMuted(Boolean(muted));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String((error == null ? void 0 : error.message) ?? error) };
  }
}

// src/main/window.ts
var import_electron3 = require("electron");
var path4 = __toESM(require("path"));

// src/main/config.ts
var fs2 = __toESM(require("fs"));
var path2 = __toESM(require("path"));
var CONFIG_PATH_ARG = "--inspector-config=";
var DESIGN_SIZE_ARG = "--design-size=";
var CONFIG_FILE_NAME = "cocos-inspector.json";
var PROJECT_SETTINGS_RELATIVE = ["settings", "v2", "packages", "project.json"];
var INSPECTOR_ROOT = path2.join(__dirname, "..");
var LOCAL_CONFIG_PATH = path2.join(INSPECTOR_ROOT, "config.json");
var LEGACY_CONFIG_PATH = path2.join(INSPECTOR_ROOT, "../../cocos-inspector-config.json");
function getProjectConfigPath() {
  var _a;
  const fromArgv = process.argv.find((arg) => arg.startsWith(CONFIG_PATH_ARG));
  if (fromArgv) return fromArgv.slice(CONFIG_PATH_ARG.length);
  if (typeof Editor !== "undefined" && ((_a = Editor == null ? void 0 : Editor.Project) == null ? void 0 : _a.path)) {
    return path2.join(Editor.Project.path, "settings", CONFIG_FILE_NAME);
  }
  return null;
}
function readProjectDesignSize() {
  var _a, _b, _c;
  if (typeof Editor === "undefined" || !((_a = Editor == null ? void 0 : Editor.Project) == null ? void 0 : _a.path)) return null;
  try {
    const raw = fs2.readFileSync(path2.join(Editor.Project.path, ...PROJECT_SETTINGS_RELATIVE), { encoding: "utf-8" });
    const resolution = (_c = (_b = JSON.parse(raw)) == null ? void 0 : _b.general) == null ? void 0 : _c.designResolution;
    if (typeof (resolution == null ? void 0 : resolution.width) === "number" && typeof (resolution == null ? void 0 : resolution.height) === "number") {
      return [resolution.width, resolution.height];
    }
  } catch {
  }
  return null;
}
function readConfig() {
  const projectPath = getProjectConfigPath();
  const candidates = [projectPath, LEGACY_CONFIG_PATH, LOCAL_CONFIG_PATH].filter((p) => Boolean(p));
  const configPath = candidates.find((p) => fs2.existsSync(p)) ?? LOCAL_CONFIG_PATH;
  return JSON.parse(fs2.readFileSync(configPath, { encoding: "utf-8" }));
}

// src/main/runtime-api.ts
var import_electron2 = require("electron");
var fs3 = __toESM(require("fs"));
var path3 = __toESM(require("path"));
var CONSOLE_RING_CAPACITY = 500;
var GAME_READY_POLL_MS = 100;
var GAME_URL_PATTERN = /^https?:/;
var LEVEL_NAMES = ["verbose", "info", "warning", "error"];
var ERROR_WINDOW_NOT_OPEN = "inspector window not open";
var ERROR_GAME_NOT_READY = "game page not loaded yet";
var hostWindow = null;
var gameGuest = null;
var previewPort = null;
var consoleSeq = 0;
var consoleRing = [];
function isGameGuest(guest) {
  return GAME_URL_PATTERN.test(String(guest.getURL()));
}
function pushConsoleEntry(level, message, line, sourceId) {
  consoleSeq += 1;
  consoleRing.push({
    seq: consoleSeq,
    t: Date.now(),
    level: LEVEL_NAMES[level] ?? "info",
    message,
    line,
    sourceId
  });
  if (consoleRing.length > CONSOLE_RING_CAPACITY) consoleRing.shift();
}
function attachGuest(guest) {
  if (gameGuest === guest) return;
  gameGuest = guest;
  log("runtime-api: game guest attached", { id: guest.id });
  guest.on("console-message", (_event, level, message, line, sourceId) => {
    pushConsoleEntry(level, message, line, sourceId);
  });
  guest.on("destroyed", () => {
    if (gameGuest === guest) gameGuest = null;
  });
}
function findGameGuest() {
  if (!hostWindow || hostWindow.isDestroyed()) return null;
  const hostId = hostWindow.webContents.id;
  const guest = import_electron2.webContents.getAllWebContents().find(
    (candidate) => {
      var _a;
      return candidate.getType() === "webview" && ((_a = candidate.hostWebContents) == null ? void 0 : _a.id) === hostId && isGameGuest(candidate);
    }
  );
  return guest ?? null;
}
function resolveGameGuest() {
  if (gameGuest && !gameGuest.isDestroyed()) return gameGuest;
  const found = findGameGuest();
  if (found) attachGuest(found);
  return found;
}
function isWindowOpen() {
  return Boolean(hostWindow && !hostWindow.isDestroyed());
}
function trackHostWindow(win2) {
  hostWindow = win2;
  win2.webContents.on("did-attach-webview", (_event, guest) => {
    if (isGameGuest(guest)) {
      attachGuest(guest);
      return;
    }
    guest.once("did-finish-load", () => {
      if (isGameGuest(guest)) attachGuest(guest);
    });
  });
  win2.on("closed", () => {
    if (hostWindow === win2) hostWindow = null;
    gameGuest = null;
  });
}
function setPreviewPort(port) {
  previewPort = port;
}
function waitForGameReady(timeoutMs) {
  const guest = resolveGameGuest();
  if (guest && !guest.isLoading()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const current = resolveGameGuest();
      if (current && !current.isLoading()) {
        clearInterval(timer);
        resolve(true);
      } else if (Date.now() - startedAt >= timeoutMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, GAME_READY_POLL_MS);
  });
}
function getStatus() {
  const windowOpen = isWindowOpen();
  const guest = windowOpen ? resolveGameGuest() : null;
  return {
    windowOpen,
    gameReady: Boolean(guest && !guest.isLoading()),
    gameUrl: guest ? String(guest.getURL()) : null,
    previewPort,
    consoleSeq
  };
}
async function evalInGame(code) {
  if (!isWindowOpen()) return { ok: false, error: ERROR_WINDOW_NOT_OPEN };
  const guest = resolveGameGuest();
  if (!guest) return { ok: false, error: ERROR_GAME_NOT_READY };
  try {
    const value = await guest.executeJavaScript(String(code), true);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: String((error == null ? void 0 : error.stack) ?? (error == null ? void 0 : error.message) ?? error) };
  }
}
async function capture(outPath) {
  if (!isWindowOpen()) return { ok: false, error: ERROR_WINDOW_NOT_OPEN };
  const guest = resolveGameGuest();
  if (!guest) return { ok: false, error: ERROR_GAME_NOT_READY };
  try {
    if (hostWindow.isMinimized()) hostWindow.restore();
    if (!hostWindow.isVisible()) hostWindow.show();
    const image = await guest.capturePage();
    const size = image.getSize();
    const png = image.toPNG();
    fs3.mkdirSync(path3.dirname(outPath), { recursive: true });
    fs3.writeFileSync(outPath, png);
    return { ok: true, path: outPath, width: size.width, height: size.height, bytes: png.length };
  } catch (error) {
    return { ok: false, error: String((error == null ? void 0 : error.message) ?? error) };
  }
}
function readConsole(sinceSeq, level) {
  const wantLevel = level && level !== "all" ? level : null;
  const entries = consoleRing.filter(
    (entry) => entry.seq > sinceSeq && (!wantLevel || entry.level === wantLevel)
  );
  return { ok: true, entries, latestSeq: consoleSeq };
}
function clearConsole() {
  consoleRing.length = 0;
  return { ok: true, entries: [], latestSeq: consoleSeq };
}

// src/main/window.ts
var EXTENSION_ROOT = path4.join(__dirname, "..");
var PKG_VERSION = "2.0.0";
var DEFAULT_WIDTH = 878;
var DEFAULT_HEIGHT = 600;
var SIMPLE_MODE_TOOLBAR_HEIGHT = 51;
var TRAY_ICON_SIZE = 16;
var OPEN_TIMEOUT_MS = 15e3;
var win = null;
var tray = null;
var mode = 0 /* Preview */;
var config = readConfig();
function getInspectorWindow() {
  return win;
}
function notifyRenderer(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}
function desiredContentSize() {
  if (config.simpleMode) {
    const width = config.isPortrait ? config.size[0] : config.size[1];
    const height = (config.isPortrait ? config.size[1] : config.size[0]) + SIMPLE_MODE_TOOLBAR_HEIGHT;
    return [width, height];
  }
  return [DEFAULT_WIDTH, DEFAULT_HEIGHT];
}
function enforceSimpleModeSize() {
  if (!win) return;
  win.webContents.executeJavaScript("setting.configDataForMain").then((latestConfig) => {
    if (latestConfig) config = latestConfig;
    if (!config.simpleMode || !win) return;
    const [width, height] = desiredContentSize();
    const current = win.getContentSize();
    if (width !== current[0] || height !== current[1]) win.setContentSize(width, height);
  }).catch((error) => log("resize sync failed", String((error == null ? void 0 : error.message) ?? error)));
}
function rendererArguments() {
  const args = [];
  const configPath = getProjectConfigPath();
  if (configPath) args.push(CONFIG_PATH_ARG + configPath);
  const designSize = readProjectDesignSize();
  if (designSize) args.push(DESIGN_SIZE_ARG + designSize.join("x"));
  return args;
}
async function showWindow() {
  if (win) {
    win.show();
    win.webContents.executeJavaScript(`v.switchMode(${mode})`);
    return;
  }
  const [width, height] = desiredContentSize();
  win = new import_electron3.BrowserWindow({
    width,
    height,
    title: `Cocos Inspector v${PKG_VERSION}`,
    backgroundColor: "#2e2c29",
    autoHideMenuBar: true,
    webPreferences: {
      // matches the historical runtime environment of the plugin (Electron 13)
      webviewTag: true,
      nodeIntegration: true,
      nodeIntegrationInSubFrames: true,
      enableRemoteModule: true,
      sandbox: false,
      devTools: true,
      contextIsolation: false,
      webSecurity: !config.disableWebSec,
      preload: path4.join(__dirname, "mainPreload.js"),
      // the renderer has no Editor global; hand it the project-level config path and design resolution
      additionalArguments: rendererArguments()
    },
    resizable: !config.simpleMode,
    minimizable: !config.simpleMode,
    maximizable: !config.simpleMode,
    useContentSize: true
  });
  try {
    win.setMenu(null);
    win.setMenuBarVisibility(false);
    win.setMenuBarVisibility = () => void 0;
    win.setMenu = () => void 0;
  } catch {
  }
  trackHostWindow(win);
  win.on("resize", enforceSimpleModeSize);
  win.on("ready-to-show", () => win == null ? void 0 : win.show());
  win.on("closed", () => {
    win = null;
    if (tray) tray.destroy();
    tray = null;
  });
  const port = await Editor.Message.request("server", "query-port");
  setPreviewPort(port);
  const pageUrl = path4.join(EXTENSION_ROOT, `index.html?port=${port}&mode=${mode}`);
  log("inspector window created", { mode, simpleMode: Boolean(config.simpleMode) });
  win.loadURL(`file://${pageUrl}`);
}
function ensureTray() {
  try {
    let icon = import_electron3.nativeImage.createFromPath(path4.join(EXTENSION_ROOT, "icon.png"));
    icon = icon.resize({ width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE });
    if (tray) {
      tray.setImage(icon);
      return;
    }
    tray = new import_electron3.Tray(icon);
    tray.on("click", () => win == null ? void 0 : win.show());
    const trayMenu = new import_electron3.Menu();
    trayMenu.append(new import_electron3.MenuItem({
      label: "Toggle Mini Mode",
      click: () => win == null ? void 0 : win.webContents.executeJavaScript("setting.toggleSimpleMode()")
    }));
    trayMenu.append(new import_electron3.MenuItem({
      label: "OpenDevTools",
      click: () => win == null ? void 0 : win.webContents.openDevTools()
    }));
    tray.setContextMenu(trayMenu);
  } catch (error) {
    log("tray setup failed", String(error));
  }
}
function tryShowWindow(nextMode) {
  openInspector(nextMode).catch((error) => log("showWindow failed", String((error == null ? void 0 : error.stack) ?? error)));
}
async function openInspector(nextMode) {
  ensureTray();
  mode = nextMode;
  await showWindow();
  return waitForGameReady(OPEN_TIMEOUT_MS);
}

// src/main/main.ts
var PKG_VERSION2 = "2.0.0";
var unloaded = false;
function focusNode(_event, uuid) {
  const selected = Editor.Selection.getSelected("node");
  Editor.Selection.unselect("node", selected);
  Editor.Selection.select("node", uuid);
}
function focusAsset(_event, uuid) {
  Editor.Message.broadcast("ui-kit:touch-asset", uuid);
  const selected = Editor.Selection.getSelected("asset");
  Editor.Selection.unselect("asset", selected);
  Editor.Selection.select("asset", uuid);
}
function buildMenu(items, onClick) {
  const menu = new import_electron4.Menu();
  for (const item of items) {
    menu.append(new import_electron4.MenuItem({
      label: item.label ?? "",
      type: item.submenu ? "submenu" : item.type ?? "normal",
      checked: item.checked,
      enabled: item.enabled !== false,
      submenu: item.submenu ? buildMenu(item.submenu, onClick) : void 0,
      click: item.submenu ? void 0 : () => onClick(item.id ?? item.label ?? null)
    }));
  }
  return menu;
}
function showContextMenu(_event, items) {
  return new Promise((resolve) => {
    const win2 = getInspectorWindow();
    if (!win2) return resolve(null);
    let clickedId = null;
    const menu = buildMenu(items, (id) => {
      clickedId = id;
    });
    menu.popup({ window: win2, callback: () => resolve(clickedId) });
  });
}
function syncWindowMode(_event, width, height, simpleMode, minHeightExtra) {
  const win2 = getInspectorWindow();
  if (!win2) return;
  if (simpleMode) {
    if (win2.isMaximized()) win2.unmaximize();
    if (win2.isFullScreen()) win2.setFullScreen(false);
    win2.setMinimumSize(width, height);
    win2.setMinimizable(false);
    win2.setResizable(false);
    win2.setMaximizable(false);
    win2.setContentSize(width, height);
  } else {
    win2.setMinimizable(true);
    win2.setResizable(true);
    win2.setMaximizable(true);
    win2.setMinimumSize(width, height + minHeightExtra);
    const current = win2.getContentSize();
    win2.setContentSize(Math.max(width, current[0]), Math.max(height, current[1]));
  }
}
async function showOpenDialog(_event, extensions) {
  const win2 = getInspectorWindow();
  if (!win2) return null;
  const result = await import_electron4.dialog.showOpenDialog(win2, {
    properties: ["openFile"],
    filters: [{ name: "files", extensions }]
  });
  return result.canceled ? null : result.filePaths;
}
var runtime = {
  status() {
    return getStatus();
  },
  async open(mode2 = 0 /* Preview */) {
    if (!unloaded) await openInspector(mode2);
    return getStatus();
  },
  eval(code) {
    return evalInGame(code);
  },
  capture(outPath) {
    return capture(outPath);
  },
  console(sinceSeq = 0, level) {
    return readConsole(Number(sinceSeq) || 0, level);
  },
  clearConsole() {
    return clearConsole();
  }
};
module.exports = {
  runtime,
  async load() {
    resetLogFile();
    log(`main loaded (v${PKG_VERSION2})`, { electron: process.versions.electron });
    import_electron4.ipcMain.on(IpcSend.focusNode, focusNode);
    import_electron4.ipcMain.on(IpcSend.focusAsset, focusAsset);
    import_electron4.ipcMain.handle(IpcInvoke.wireDevtools, (_event, gameWcId, devtoolsWcId) => wireDevtools(gameWcId, devtoolsWcId, () => notifyRenderer(IpcEvent.debuggerPaused)));
    import_electron4.ipcMain.handle(IpcInvoke.setAudioMuted, (_event, gameWcId, muted) => setGameAudioMuted(gameWcId, muted));
    import_electron4.ipcMain.handle(IpcInvoke.showMenu, showContextMenu);
    import_electron4.ipcMain.handle(IpcInvoke.showOpenDialog, showOpenDialog);
    import_electron4.ipcMain.handle(IpcInvoke.getLocale, () => import_electron4.app.getLocale());
    import_electron4.ipcMain.handle(IpcInvoke.syncWindowMode, syncWindowMode);
    import_electron4.ipcMain.handle(IpcInvoke.openAppDevtools, () => {
      var _a;
      return (_a = getInspectorWindow()) == null ? void 0 : _a.webContents.openDevTools();
    });
  },
  unload() {
    unloaded = true;
    import_electron4.ipcMain.removeAllListeners(IpcSend.focusNode);
    import_electron4.ipcMain.removeAllListeners(IpcSend.focusAsset);
    for (const channel of [IpcInvoke.wireDevtools, IpcInvoke.setAudioMuted, IpcInvoke.showMenu, IpcInvoke.showOpenDialog, IpcInvoke.getLocale, IpcInvoke.syncWindowMode, IpcInvoke.openAppDevtools]) {
      import_electron4.ipcMain.removeHandler(channel);
    }
  },
  methods: {
    previewMode() {
      if (!unloaded) tryShowWindow(0 /* Preview */);
    },
    buildMobileMode() {
      if (!unloaded) tryShowWindow(1 /* BuildMobile */);
    },
    buildDesktopMode() {
      if (!unloaded) tryShowWindow(3 /* BuildDesktop */);
    },
    openCustomPage() {
      if (!unloaded) tryShowWindow(2 /* CustomPage */);
    }
  }
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL21haW4vbWFpbi50cyIsICIuLi9zcmMvc2hhcmVkL3Byb3RvY29sLnRzIiwgIi4uL3NyYy9tYWluL2RldnRvb2xzLXdpcmluZy50cyIsICIuLi9zcmMvbWFpbi9kZXZ0b29scy1icmlkZ2UudHMiLCAiLi4vc3JjL21haW4vbG9nLnRzIiwgIi4uL3NyYy9tYWluL3dpbmRvdy50cyIsICIuLi9zcmMvbWFpbi9jb25maWcudHMiLCAiLi4vc3JjL21haW4vcnVudGltZS1hcGkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIENvY29zIEluc3BlY3RvciAtIHJ1bnRpbWUgaW5zcGVjdG9yIG1vZHVsZSwgaG9zdGVkIGJ5IHRoZSBjb2Nvcy1tY3Atc2VydmVyIGV4dGVuc2lvbiAobWFpbiBwcm9jZXNzKS5cbi8vIFRoZSBob3N0J3Mgc291cmNlL21haW4udHMgY2FsbHMgbG9hZCgpL3VubG9hZCgpIGFuZCByZS1leHBvcnRzIGBtZXRob2RzYDsgUnVudGltZVRvb2xzIHVzZXMgYHJ1bnRpbWVgLlxuaW1wb3J0IHsgaXBjTWFpbiwgZGlhbG9nLCBhcHAsIE1lbnUsIE1lbnVJdGVtIH0gZnJvbSAnZWxlY3Ryb24nO1xuaW1wb3J0IHR5cGUgeyBJcGNNYWluRXZlbnQsIElwY01haW5JbnZva2VFdmVudCB9IGZyb20gJ2VsZWN0cm9uJztcbmltcG9ydCB7XG4gICAgSXBjU2VuZCwgSXBjSW52b2tlLCBJcGNFdmVudCwgSW5zcGVjdG9yTW9kZSxcbiAgICB0eXBlIE1lbnVJdGVtU3BlYywgdHlwZSBSdW50aW1lU3RhdHVzLCB0eXBlIFJ1bnRpbWVFdmFsUmVzdWx0LCB0eXBlIFJ1bnRpbWVDYXB0dXJlUmVzdWx0LFxuICAgIHR5cGUgUnVudGltZUNvbnNvbGVSZXN1bHQsIHR5cGUgUnVudGltZUNvbnNvbGVMZXZlbCxcbn0gZnJvbSAnQHNoYXJlZC9wcm90b2NvbCc7XG5pbXBvcnQgeyB3aXJlRGV2dG9vbHMsIHNldEdhbWVBdWRpb011dGVkIH0gZnJvbSAnLi9kZXZ0b29scy13aXJpbmcnO1xuaW1wb3J0IHsgdHJ5U2hvd1dpbmRvdywgb3Blbkluc3BlY3RvciwgZ2V0SW5zcGVjdG9yV2luZG93LCBub3RpZnlSZW5kZXJlciB9IGZyb20gJy4vd2luZG93JztcbmltcG9ydCAqIGFzIHJ1bnRpbWVfYXBpIGZyb20gJy4vcnVudGltZS1hcGknO1xuaW1wb3J0IHsgbG9nLCByZXNldExvZ0ZpbGUgfSBmcm9tICcuL2xvZyc7XG5cbi8vIEVkaXRvciBpcyBDb2NvcyBDcmVhdG9yJ3MgZ2xvYmFsIGluIHRoZSBleHRlbnNpb24gaG9zdCBwcm9jZXNzLlxuZGVjbGFyZSBjb25zdCBFZGl0b3I6IHtcbiAgICBTZWxlY3Rpb246IHtcbiAgICAgICAgZ2V0U2VsZWN0ZWQ6ICggdHlwZTogc3RyaW5nICkgPT4gc3RyaW5nW107XG4gICAgICAgIHVuc2VsZWN0OiAoIHR5cGU6IHN0cmluZywgdXVpZHM6IHN0cmluZ1tdICkgPT4gdm9pZDtcbiAgICAgICAgc2VsZWN0OiAoIHR5cGU6IHN0cmluZywgdXVpZDogc3RyaW5nICkgPT4gdm9pZDtcbiAgICB9O1xuICAgIE1lc3NhZ2U6IHsgYnJvYWRjYXN0OiAoIG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdICkgPT4gdm9pZCB9O1xufTtcblxuY29uc3QgUEtHX1ZFUlNJT046IHN0cmluZyA9IF9fUEtHX1ZFUlNJT05fXztcblxubGV0IHVubG9hZGVkID0gZmFsc2U7XG5cbmZ1bmN0aW9uIGZvY3VzTm9kZSggX2V2ZW50OiBJcGNNYWluRXZlbnQsIHV1aWQ6IHN0cmluZyApOiB2b2lkIHtcbiAgICBjb25zdCBzZWxlY3RlZCA9IEVkaXRvci5TZWxlY3Rpb24uZ2V0U2VsZWN0ZWQoICdub2RlJyApO1xuICAgIEVkaXRvci5TZWxlY3Rpb24udW5zZWxlY3QoICdub2RlJywgc2VsZWN0ZWQgKTtcbiAgICBFZGl0b3IuU2VsZWN0aW9uLnNlbGVjdCggJ25vZGUnLCB1dWlkICk7XG59XG5cbmZ1bmN0aW9uIGZvY3VzQXNzZXQoIF9ldmVudDogSXBjTWFpbkV2ZW50LCB1dWlkOiBzdHJpbmcgKTogdm9pZCB7XG4gICAgRWRpdG9yLk1lc3NhZ2UuYnJvYWRjYXN0KCAndWkta2l0OnRvdWNoLWFzc2V0JywgdXVpZCApO1xuICAgIGNvbnN0IHNlbGVjdGVkID0gRWRpdG9yLlNlbGVjdGlvbi5nZXRTZWxlY3RlZCggJ2Fzc2V0JyApO1xuICAgIEVkaXRvci5TZWxlY3Rpb24udW5zZWxlY3QoICdhc3NldCcsIHNlbGVjdGVkICk7XG4gICAgRWRpdG9yLlNlbGVjdGlvbi5zZWxlY3QoICdhc3NldCcsIHV1aWQgKTtcbn1cblxuZnVuY3Rpb24gYnVpbGRNZW51KCBpdGVtczogTWVudUl0ZW1TcGVjW10sIG9uQ2xpY2s6ICggaWQ6IHN0cmluZyB8IG51bGwgKSA9PiB2b2lkICk6IEVsZWN0cm9uLk1lbnUge1xuICAgIGNvbnN0IG1lbnUgPSBuZXcgTWVudSgpO1xuICAgIGZvciAoIGNvbnN0IGl0ZW0gb2YgaXRlbXMgKSB7XG4gICAgICAgIG1lbnUuYXBwZW5kKCBuZXcgTWVudUl0ZW0oIHtcbiAgICAgICAgICAgIGxhYmVsOiBpdGVtLmxhYmVsID8/ICcnLFxuICAgICAgICAgICAgdHlwZTogaXRlbS5zdWJtZW51ID8gJ3N1Ym1lbnUnIDogKCBpdGVtLnR5cGUgPz8gJ25vcm1hbCcgKSxcbiAgICAgICAgICAgIGNoZWNrZWQ6IGl0ZW0uY2hlY2tlZCxcbiAgICAgICAgICAgIGVuYWJsZWQ6IGl0ZW0uZW5hYmxlZCAhPT0gZmFsc2UsXG4gICAgICAgICAgICBzdWJtZW51OiBpdGVtLnN1Ym1lbnUgPyBidWlsZE1lbnUoIGl0ZW0uc3VibWVudSwgb25DbGljayApIDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgY2xpY2s6IGl0ZW0uc3VibWVudSA/IHVuZGVmaW5lZCA6ICgpID0+IG9uQ2xpY2soIGl0ZW0uaWQgPz8gaXRlbS5sYWJlbCA/PyBudWxsICksXG4gICAgICAgIH0gKSApO1xuICAgIH1cbiAgICByZXR1cm4gbWVudTtcbn1cblxuLyoqIFNob3dzIGEgbmF0aXZlIGNvbnRleHQgbWVudSBvbiB0aGUgaW5zcGVjdG9yIHdpbmRvdzsgcmVzb2x2ZXMgd2l0aCB0aGUgY2xpY2tlZCBpdGVtIGlkLiAqL1xuZnVuY3Rpb24gc2hvd0NvbnRleHRNZW51KCBfZXZlbnQ6IElwY01haW5JbnZva2VFdmVudCwgaXRlbXM6IE1lbnVJdGVtU3BlY1tdICk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSggKCByZXNvbHZlICkgPT4ge1xuICAgICAgICBjb25zdCB3aW4gPSBnZXRJbnNwZWN0b3JXaW5kb3coKTtcbiAgICAgICAgaWYgKCAhd2luICkgcmV0dXJuIHJlc29sdmUoIG51bGwgKTtcbiAgICAgICAgbGV0IGNsaWNrZWRJZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgIGNvbnN0IG1lbnUgPSBidWlsZE1lbnUoIGl0ZW1zLCAoIGlkICkgPT4geyBjbGlja2VkSWQgPSBpZDsgfSApO1xuICAgICAgICBtZW51LnBvcHVwKCB7IHdpbmRvdzogd2luLCBjYWxsYmFjazogKCkgPT4gcmVzb2x2ZSggY2xpY2tlZElkICkgfSApO1xuICAgIH0gKTtcbn1cblxuLyoqIEFwcGxpZXMgd2luZG93IHNpemluZy9kZWNvcmF0aW9uIHJ1bGVzIHdoZW4gdGhlIGluc3BlY3RvciBlbnRlcnMgb3IgbGVhdmVzIG1pbmkgbW9kZS4gKi9cbmZ1bmN0aW9uIHN5bmNXaW5kb3dNb2RlKCBfZXZlbnQ6IElwY01haW5JbnZva2VFdmVudCwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIHNpbXBsZU1vZGU6IGJvb2xlYW4sIG1pbkhlaWdodEV4dHJhOiBudW1iZXIgKTogdm9pZCB7XG4gICAgY29uc3Qgd2luID0gZ2V0SW5zcGVjdG9yV2luZG93KCk7XG4gICAgaWYgKCAhd2luICkgcmV0dXJuO1xuICAgIGlmICggc2ltcGxlTW9kZSApIHtcbiAgICAgICAgaWYgKCB3aW4uaXNNYXhpbWl6ZWQoKSApIHdpbi51bm1heGltaXplKCk7XG4gICAgICAgIGlmICggd2luLmlzRnVsbFNjcmVlbigpICkgd2luLnNldEZ1bGxTY3JlZW4oIGZhbHNlICk7XG4gICAgICAgIHdpbi5zZXRNaW5pbXVtU2l6ZSggd2lkdGgsIGhlaWdodCApO1xuICAgICAgICB3aW4uc2V0TWluaW1pemFibGUoIGZhbHNlICk7XG4gICAgICAgIHdpbi5zZXRSZXNpemFibGUoIGZhbHNlICk7XG4gICAgICAgIHdpbi5zZXRNYXhpbWl6YWJsZSggZmFsc2UgKTtcbiAgICAgICAgd2luLnNldENvbnRlbnRTaXplKCB3aWR0aCwgaGVpZ2h0ICk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgd2luLnNldE1pbmltaXphYmxlKCB0cnVlICk7XG4gICAgICAgIHdpbi5zZXRSZXNpemFibGUoIHRydWUgKTtcbiAgICAgICAgd2luLnNldE1heGltaXphYmxlKCB0cnVlICk7XG4gICAgICAgIHdpbi5zZXRNaW5pbXVtU2l6ZSggd2lkdGgsIGhlaWdodCArIG1pbkhlaWdodEV4dHJhICk7XG4gICAgICAgIGNvbnN0IGN1cnJlbnQgPSB3aW4uZ2V0Q29udGVudFNpemUoKTtcbiAgICAgICAgd2luLnNldENvbnRlbnRTaXplKCBNYXRoLm1heCggd2lkdGgsIGN1cnJlbnRbIDAgXSApLCBNYXRoLm1heCggaGVpZ2h0LCBjdXJyZW50WyAxIF0gKSApO1xuICAgIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gc2hvd09wZW5EaWFsb2coIF9ldmVudDogSXBjTWFpbkludm9rZUV2ZW50LCBleHRlbnNpb25zOiBzdHJpbmdbXSApOiBQcm9taXNlPHN0cmluZ1tdIHwgbnVsbD4ge1xuICAgIGNvbnN0IHdpbiA9IGdldEluc3BlY3RvcldpbmRvdygpO1xuICAgIGlmICggIXdpbiApIHJldHVybiBudWxsO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRpYWxvZy5zaG93T3BlbkRpYWxvZyggd2luLCB7XG4gICAgICAgIHByb3BlcnRpZXM6IFsgJ29wZW5GaWxlJyBdLFxuICAgICAgICBmaWx0ZXJzOiBbIHsgbmFtZTogJ2ZpbGVzJywgZXh0ZW5zaW9ucyB9IF0sXG4gICAgfSApO1xuICAgIHJldHVybiByZXN1bHQuY2FuY2VsZWQgPyBudWxsIDogcmVzdWx0LmZpbGVQYXRocztcbn1cblxuLyoqXG4gKiBJbi1wcm9jZXNzIHJ1bnRpbWUgQVBJIGNvbnN1bWVkIGJ5IHRoZSBNQ1AgUnVudGltZVRvb2xzIChzYW1lIGV4dGVuc2lvbiwgbm8gSVBDIGhvcCkuXG4gKiBFdmVyeSBjYWxsIHJldHVybnMgcGxhaW4gZGF0YTsgZmFpbHVyZXMgY29tZSBiYWNrIGFzIHsgb2s6IGZhbHNlLCBlcnJvciB9LlxuICovXG5jb25zdCBydW50aW1lID0ge1xuICAgIHN0YXR1cygpOiBSdW50aW1lU3RhdHVzIHtcbiAgICAgICAgcmV0dXJuIHJ1bnRpbWVfYXBpLmdldFN0YXR1cygpO1xuICAgIH0sXG4gICAgYXN5bmMgb3BlbiggbW9kZTogSW5zcGVjdG9yTW9kZSA9IEluc3BlY3Rvck1vZGUuUHJldmlldyApOiBQcm9taXNlPFJ1bnRpbWVTdGF0dXM+IHtcbiAgICAgICAgaWYgKCAhdW5sb2FkZWQgKSBhd2FpdCBvcGVuSW5zcGVjdG9yKCBtb2RlICk7XG4gICAgICAgIHJldHVybiBydW50aW1lX2FwaS5nZXRTdGF0dXMoKTtcbiAgICB9LFxuICAgIGV2YWwoIGNvZGU6IHN0cmluZyApOiBQcm9taXNlPFJ1bnRpbWVFdmFsUmVzdWx0PiB7XG4gICAgICAgIHJldHVybiBydW50aW1lX2FwaS5ldmFsSW5HYW1lKCBjb2RlICk7XG4gICAgfSxcbiAgICBjYXB0dXJlKCBvdXRQYXRoOiBzdHJpbmcgKTogUHJvbWlzZTxSdW50aW1lQ2FwdHVyZVJlc3VsdD4ge1xuICAgICAgICByZXR1cm4gcnVudGltZV9hcGkuY2FwdHVyZSggb3V0UGF0aCApO1xuICAgIH0sXG4gICAgY29uc29sZSggc2luY2VTZXEgPSAwLCBsZXZlbD86IFJ1bnRpbWVDb25zb2xlTGV2ZWwgfCAnYWxsJyApOiBSdW50aW1lQ29uc29sZVJlc3VsdCB7XG4gICAgICAgIHJldHVybiBydW50aW1lX2FwaS5yZWFkQ29uc29sZSggTnVtYmVyKCBzaW5jZVNlcSApIHx8IDAsIGxldmVsICk7XG4gICAgfSxcbiAgICBjbGVhckNvbnNvbGUoKTogUnVudGltZUNvbnNvbGVSZXN1bHQge1xuICAgICAgICByZXR1cm4gcnVudGltZV9hcGkuY2xlYXJDb25zb2xlKCk7XG4gICAgfSxcbn07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIHJ1bnRpbWUsXG4gICAgYXN5bmMgbG9hZCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgcmVzZXRMb2dGaWxlKCk7XG4gICAgICAgIGxvZyggYG1haW4gbG9hZGVkICh2JHsgUEtHX1ZFUlNJT04gfSlgLCB7IGVsZWN0cm9uOiBwcm9jZXNzLnZlcnNpb25zLmVsZWN0cm9uIH0gKTtcbiAgICAgICAgaXBjTWFpbi5vbiggSXBjU2VuZC5mb2N1c05vZGUsIGZvY3VzTm9kZSApO1xuICAgICAgICBpcGNNYWluLm9uKCBJcGNTZW5kLmZvY3VzQXNzZXQsIGZvY3VzQXNzZXQgKTtcbiAgICAgICAgaXBjTWFpbi5oYW5kbGUoIElwY0ludm9rZS53aXJlRGV2dG9vbHMsICggX2V2ZW50LCBnYW1lV2NJZDogbnVtYmVyLCBkZXZ0b29sc1djSWQ6IG51bWJlciApID0+XG4gICAgICAgICAgICB3aXJlRGV2dG9vbHMoIGdhbWVXY0lkLCBkZXZ0b29sc1djSWQsICgpID0+IG5vdGlmeVJlbmRlcmVyKCBJcGNFdmVudC5kZWJ1Z2dlclBhdXNlZCApICkgKTtcbiAgICAgICAgaXBjTWFpbi5oYW5kbGUoIElwY0ludm9rZS5zZXRBdWRpb011dGVkLCAoIF9ldmVudCwgZ2FtZVdjSWQ6IG51bWJlciwgbXV0ZWQ6IGJvb2xlYW4gKSA9PlxuICAgICAgICAgICAgc2V0R2FtZUF1ZGlvTXV0ZWQoIGdhbWVXY0lkLCBtdXRlZCApICk7XG4gICAgICAgIGlwY01haW4uaGFuZGxlKCBJcGNJbnZva2Uuc2hvd01lbnUsIHNob3dDb250ZXh0TWVudSApO1xuICAgICAgICBpcGNNYWluLmhhbmRsZSggSXBjSW52b2tlLnNob3dPcGVuRGlhbG9nLCBzaG93T3BlbkRpYWxvZyApO1xuICAgICAgICBpcGNNYWluLmhhbmRsZSggSXBjSW52b2tlLmdldExvY2FsZSwgKCkgPT4gYXBwLmdldExvY2FsZSgpICk7XG4gICAgICAgIGlwY01haW4uaGFuZGxlKCBJcGNJbnZva2Uuc3luY1dpbmRvd01vZGUsIHN5bmNXaW5kb3dNb2RlICk7XG4gICAgICAgIGlwY01haW4uaGFuZGxlKCBJcGNJbnZva2Uub3BlbkFwcERldnRvb2xzLCAoKSA9PiBnZXRJbnNwZWN0b3JXaW5kb3coKT8ud2ViQ29udGVudHMub3BlbkRldlRvb2xzKCkgKTtcbiAgICB9LFxuXG4gICAgdW5sb2FkKCk6IHZvaWQge1xuICAgICAgICB1bmxvYWRlZCA9IHRydWU7XG4gICAgICAgIGlwY01haW4ucmVtb3ZlQWxsTGlzdGVuZXJzKCBJcGNTZW5kLmZvY3VzTm9kZSApO1xuICAgICAgICBpcGNNYWluLnJlbW92ZUFsbExpc3RlbmVycyggSXBjU2VuZC5mb2N1c0Fzc2V0ICk7XG4gICAgICAgIGZvciAoIGNvbnN0IGNoYW5uZWwgb2YgWyBJcGNJbnZva2Uud2lyZURldnRvb2xzLCBJcGNJbnZva2Uuc2V0QXVkaW9NdXRlZCwgSXBjSW52b2tlLnNob3dNZW51LCBJcGNJbnZva2Uuc2hvd09wZW5EaWFsb2csIElwY0ludm9rZS5nZXRMb2NhbGUsIElwY0ludm9rZS5zeW5jV2luZG93TW9kZSwgSXBjSW52b2tlLm9wZW5BcHBEZXZ0b29scyBdICkge1xuICAgICAgICAgICAgaXBjTWFpbi5yZW1vdmVIYW5kbGVyKCBjaGFubmVsICk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgbWV0aG9kczoge1xuICAgICAgICBwcmV2aWV3TW9kZSgpOiB2b2lkIHtcbiAgICAgICAgICAgIGlmICggIXVubG9hZGVkICkgdHJ5U2hvd1dpbmRvdyggSW5zcGVjdG9yTW9kZS5QcmV2aWV3ICk7XG4gICAgICAgIH0sXG4gICAgICAgIGJ1aWxkTW9iaWxlTW9kZSgpOiB2b2lkIHtcbiAgICAgICAgICAgIGlmICggIXVubG9hZGVkICkgdHJ5U2hvd1dpbmRvdyggSW5zcGVjdG9yTW9kZS5CdWlsZE1vYmlsZSApO1xuICAgICAgICB9LFxuICAgICAgICBidWlsZERlc2t0b3BNb2RlKCk6IHZvaWQge1xuICAgICAgICAgICAgaWYgKCAhdW5sb2FkZWQgKSB0cnlTaG93V2luZG93KCBJbnNwZWN0b3JNb2RlLkJ1aWxkRGVza3RvcCApO1xuICAgICAgICB9LFxuICAgICAgICBvcGVuQ3VzdG9tUGFnZSgpOiB2b2lkIHtcbiAgICAgICAgICAgIGlmICggIXVubG9hZGVkICkgdHJ5U2hvd1dpbmRvdyggSW5zcGVjdG9yTW9kZS5DdXN0b21QYWdlICk7XG4gICAgICAgIH0sXG5cbiAgICB9LFxufTtcbiIsICIvLyBNZXNzYWdlIHByb3RvY29sIHNoYXJlZCBiZXR3ZWVuIHRoZSBleHRlbnNpb24gbWFpbiBwcm9jZXNzLCB0aGUgaW5zcGVjdG9yIHJlbmRlcmVyLFxuLy8gdGhlIGdhbWUtd2VidmlldyBwcmVsb2FkLCBhbmQgdGhlIGluamVjdGVkIHByb2JlIHNjcmlwdC5cblxuLyoqIEhvc3QgZXh0ZW5zaW9uIHBhY2thZ2UgbmFtZSAodGhlIGluc3BlY3RvciBzaGlwcyBpbnNpZGUgY29jb3MtbWNwLXNlcnZlcik7IGV2ZXJ5IElQQyBjaGFubmVsIGlzIHByZWZpeGVkIHdpdGggaXQuICovXG5leHBvcnQgY29uc3QgUEtHX05BTUUgPSAnY29jb3MtbWNwLXNlcnZlcic7XG5cbi8qKiBXaW5kb3cgb3BlbiBtb2RlcyB0cmlnZ2VyZWQgZnJvbSB0aGUgQ3JlYXRvciBleHRlbnNpb24gbWVudS4gKi9cbmV4cG9ydCBlbnVtIEluc3BlY3Rvck1vZGUge1xuICAgIFByZXZpZXcgPSAwLFxuICAgIEJ1aWxkTW9iaWxlID0gMSxcbiAgICBDdXN0b21QYWdlID0gMixcbiAgICBCdWlsZERlc2t0b3AgPSAzLFxufVxuXG4vKiogcmVuZGVyZXIgLT4gbWFpbiAoaXBjUmVuZGVyZXIuc2VuZCkuICovXG5leHBvcnQgY29uc3QgSXBjU2VuZCA9IHtcbiAgICBmb2N1c05vZGU6IGAkeyBQS0dfTkFNRSB9OmZvY3VzTm9kZWAsXG4gICAgZm9jdXNBc3NldDogYCR7IFBLR19OQU1FIH06Zm9jdXNBc3NldGAsXG59IGFzIGNvbnN0O1xuXG4vKiogcmVuZGVyZXIgLT4gbWFpbiAoaXBjUmVuZGVyZXIuaW52b2tlKS4gKi9cbmV4cG9ydCBjb25zdCBJcGNJbnZva2UgPSB7XG4gICAgd2lyZURldnRvb2xzOiBgJHsgUEtHX05BTUUgfTp3aXJlLWRldnRvb2xzYCxcbiAgICBzZXRBdWRpb011dGVkOiBgJHsgUEtHX05BTUUgfTpzZXQtYXVkaW8tbXV0ZWRgLFxuICAgIHNob3dNZW51OiBgJHsgUEtHX05BTUUgfTpzaG93LW1lbnVgLFxuICAgIHNob3dPcGVuRGlhbG9nOiBgJHsgUEtHX05BTUUgfTpzaG93LW9wZW4tZGlhbG9nYCxcbiAgICBnZXRMb2NhbGU6IGAkeyBQS0dfTkFNRSB9OmdldC1sb2NhbGVgLFxuICAgIHN5bmNXaW5kb3dNb2RlOiBgJHsgUEtHX05BTUUgfTpzeW5jLXdpbmRvdy1tb2RlYCxcbiAgICBvcGVuQXBwRGV2dG9vbHM6IGAkeyBQS0dfTkFNRSB9Om9wZW4tYXBwLWRldnRvb2xzYCxcbn0gYXMgY29uc3Q7XG5cbi8qKiBtYWluIC0+IHJlbmRlcmVyICh3ZWJDb250ZW50cy5zZW5kKS4gKi9cbmV4cG9ydCBjb25zdCBJcGNFdmVudCA9IHtcbiAgICBkZWJ1Z2dlclBhdXNlZDogYCR7IFBLR19OQU1FIH06ZGVidWdnZXItcGF1c2VkYCxcbiAgICBtZW51Q2xpY2tlZDogYCR7IFBLR19OQU1FIH06bWVudS1jbGlja2VkYCxcbn0gYXMgY29uc3Q7XG5cbmV4cG9ydCBpbnRlcmZhY2UgV2lyZURldnRvb2xzUmVzdWx0IHtcbiAgICBvazogYm9vbGVhbjtcbiAgICBlcnJvcj86IHN0cmluZztcbiAgICBtdXRlZD86IGJvb2xlYW47XG59XG5cbi8qKiBPbmUgZW50cnkgb2YgYSBjb250ZXh0IG1lbnUgcmVxdWVzdGVkIGJ5IHRoZSByZW5kZXJlci4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgTWVudUl0ZW1TcGVjIHtcbiAgICBpZD86IHN0cmluZztcbiAgICBsYWJlbD86IHN0cmluZztcbiAgICB0eXBlPzogJ25vcm1hbCcgfCAnc2VwYXJhdG9yJyB8ICdjaGVja2JveCc7XG4gICAgY2hlY2tlZD86IGJvb2xlYW47XG4gICAgZW5hYmxlZD86IGJvb2xlYW47XG4gICAgc3VibWVudT86IE1lbnVJdGVtU3BlY1tdO1xufVxuXG4vKipcbiAqIENoYW5uZWxzIHVzZWQgYnkgdGhlIGdhbWUtd2VidmlldyBwcmVsb2FkOiB0aGUgaW5qZWN0ZWQgcHJvYmUgY2FsbHMgdGhlIG1hdGNoaW5nIGdsb2JhbFxuICogZnVuY3Rpb24sIHRoZSBwcmVsb2FkIGZvcndhcmRzIGl0IHRvIHRoZSBpbnNwZWN0b3IgcmVuZGVyZXIgdmlhIGlwY1JlbmRlcmVyLnNlbmRUb0hvc3QuXG4gKi9cbmV4cG9ydCBjb25zdCBIb3N0Q2hhbm5lbCA9IHtcbiAgICBnYW1lU3RhdGU6ICdnYW1lU3RhdGUnLFxuICAgIGxvY2F0ZU5vZGU6ICdsb2NhdGVOb2RlJyxcbiAgICBjb25zb2xlTG9nOiAnY29uc29sZUxvZycsXG4gICAgY29uc29sZUVycm9yOiAnY29uc29sZUVycm9yJyxcbiAgICBjb25zb2xlV2FybjogJ2NvbnNvbGVXYXJuJyxcbiAgICB1cGRhdGVUcmVlOiAndXBkYXRlVHJlZScsXG4gICAgc2hvd05vZGVEZXRhaWw6ICdzaG93Tm9kZURldGFpbCcsXG4gICAgc2VuZFN0YXRpc3RpYzogJ3NlbmRTdGF0aXN0aWMnLFxuICAgIGNhblVwZGF0ZVRyZWU6ICdjYW5VcGRhdGVUcmVlJyxcbn0gYXMgY29uc3Q7XG5cbi8qKiBQZXJzaXN0ZWQgaW5zcGVjdG9yIHNldHRpbmdzIChleHRlbnNpb25zL2NvY29zLWluc3BlY3Rvci1jb25maWcuanNvbikuICovXG5leHBvcnQgaW50ZXJmYWNlIEluc3BlY3RvckNvbmZpZyB7XG4gICAgbG9nQ291bnQ6IG51bWJlciB8IHN0cmluZztcbiAgICByZXRpbmFFbmFibGU6IGJvb2xlYW47XG4gICAgYXV0b1VwZGF0ZVRyZWU6IGJvb2xlYW47XG4gICAgZGlzcGxheUFzRmFpcnlUcmVlPzogYm9vbGVhbjtcbiAgICBoaWRlRmFpcnlDb21Db250YWluZXI/OiBib29sZWFuO1xuICAgIHN5bmNOb2RlRGV0YWlsPzogYm9vbGVhbjtcbiAgICBkaXNhYmxlV2ViU2VjPzogYm9vbGVhbjtcbiAgICBzaG93RGV2VG9vbEluVGFiPzogYm9vbGVhbjtcbiAgICBzaXplOiBbIG51bWJlciwgbnVtYmVyIF07XG4gICAgZXh0cmFTaXplcz86IHVua25vd25bXTtcbiAgICBpc1BvcnRyYWl0OiBib29sZWFuO1xuICAgIHNob3c6IGJvb2xlYW47XG4gICAgdXJsUGFyYW1zPzogc3RyaW5nO1xuICAgIGN1c3RvbVVybD86IHN0cmluZztcbiAgICBjbGVhckxvZ0FmdGVyUmVmcmVzaD86IGJvb2xlYW47XG4gICAgZXh0ZW5zaW9uRmlsZT86IHN0cmluZztcbiAgICBlbmFibGVFeHRlbnNpb24/OiBib29sZWFuO1xuICAgIHN0YXRpc3RpY2luZz86IGJvb2xlYW47XG4gICAgc3RhdGlzdGljcz86IHVua25vd247XG4gICAgc29ydENvbXBQcm9wZXJ0aWVzPzogUmVjb3JkPHN0cmluZywgYm9vbGVhbj47XG4gICAgc2ltcGxlTW9kZT86IGJvb2xlYW47XG4gICAgLyoqIHRydWUgKGRlZmF1bHQpOiBnYW1lIHZpZXcgZm9sbG93cyB0aGUgcHJvamVjdCBkZXNpZ24gcmVzb2x1dGlvbjsgZmFsc2U6IHVzZXItcGlja2VkIHNpemUgKi9cbiAgICBtYXRjaERlc2lnbj86IGJvb2xlYW47XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gUnVudGltZSBBUEkgZXhwb3NlZCB0byBvdGhlciBleHRlbnNpb25zIHRocm91Z2ggRWRpdG9yLk1lc3NhZ2UgKHBhY2thZ2UuanNvbiBcInJ1bnRpbWUtKlwiKS5cbi8vIFBheWxvYWRzIG11c3Qgc3RheSBKU09OLXNlcmlhbGl6YWJsZTogdGhleSBjcm9zcyB0aGUgQ3JlYXRvciBJUEMgYm91bmRhcnkuXG5cbmV4cG9ydCB0eXBlIFJ1bnRpbWVDb25zb2xlTGV2ZWwgPSAndmVyYm9zZScgfCAnaW5mbycgfCAnd2FybmluZycgfCAnZXJyb3InO1xuXG5leHBvcnQgaW50ZXJmYWNlIFJ1bnRpbWVTdGF0dXMge1xuICAgIHdpbmRvd09wZW46IGJvb2xlYW47XG4gICAgZ2FtZVJlYWR5OiBib29sZWFuO1xuICAgIGdhbWVVcmw6IHN0cmluZyB8IG51bGw7XG4gICAgcHJldmlld1BvcnQ6IG51bWJlciB8IG51bGw7XG4gICAgY29uc29sZVNlcTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJ1bnRpbWVFdmFsUmVzdWx0IHtcbiAgICBvazogYm9vbGVhbjtcbiAgICB2YWx1ZT86IHVua25vd247XG4gICAgZXJyb3I/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUnVudGltZUNvbnNvbGVFbnRyeSB7XG4gICAgc2VxOiBudW1iZXI7XG4gICAgdDogbnVtYmVyO1xuICAgIGxldmVsOiBSdW50aW1lQ29uc29sZUxldmVsO1xuICAgIG1lc3NhZ2U6IHN0cmluZztcbiAgICBsaW5lOiBudW1iZXI7XG4gICAgc291cmNlSWQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSdW50aW1lQ29uc29sZVJlc3VsdCB7XG4gICAgb2s6IGJvb2xlYW47XG4gICAgZW50cmllczogUnVudGltZUNvbnNvbGVFbnRyeVtdO1xuICAgIGxhdGVzdFNlcTogbnVtYmVyO1xuICAgIGVycm9yPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJ1bnRpbWVDYXB0dXJlUmVzdWx0IHtcbiAgICBvazogYm9vbGVhbjtcbiAgICBwYXRoPzogc3RyaW5nO1xuICAgIHdpZHRoPzogbnVtYmVyO1xuICAgIGhlaWdodD86IG51bWJlcjtcbiAgICBieXRlcz86IG51bWJlcjtcbiAgICBlcnJvcj86IHN0cmluZztcbn1cbiIsICIvLyBJUEMgaGFuZGxlcnMgdGhhdCBvcGVyYXRlIG9uIHRoZSBnYW1lIHdlYnZpZXcncyB3ZWJDb250ZW50cyBmcm9tIHRoZSBtYWluIHByb2Nlc3MsXG4vLyBzbyB0aGUgcmVuZGVyZXIgbmV2ZXIgbmVlZHMgdGhlIGRlcHJlY2F0ZWQgYHJlbW90ZWAgbW9kdWxlLlxuaW1wb3J0IHsgd2ViQ29udGVudHMgfSBmcm9tICdlbGVjdHJvbic7XG5pbXBvcnQgdHlwZSB7IFdlYkNvbnRlbnRzIH0gZnJvbSAnZWxlY3Ryb24nO1xuaW1wb3J0IHsgc3RhcnREZXZ0b29sc0JyaWRnZSwgYnJpZGdlRnJvbnRlbmRVcmwgfSBmcm9tICcuL2RldnRvb2xzLWJyaWRnZSc7XG5pbXBvcnQgeyBJcGNFdmVudCwgdHlwZSBXaXJlRGV2dG9vbHNSZXN1bHQgfSBmcm9tICdAc2hhcmVkL3Byb3RvY29sJztcbmltcG9ydCB7IGxvZyB9IGZyb20gJy4vbG9nJztcblxuaW50ZXJmYWNlIEdhbWVXZWJDb250ZW50cyBleHRlbmRzIFdlYkNvbnRlbnRzIHtcbiAgICBfX2luc3BlY3RvcldpcmVkPzogYm9vbGVhbjtcbiAgICBfX2luc3BlY3RvcldhdGNoZXI/OiBib29sZWFuO1xufVxuXG50eXBlIFBhdXNlZE5vdGlmaWVyID0gKCkgPT4gdm9pZDtcblxuLyoqXG4gKiBXYXRjaGVzIHRoZSBnYW1lJ3MgZGVidWdnZXIgc2Vzc2lvbiBmb3IgRGVidWdnZXIucGF1c2VkIHNvIHRoZSBpbnNwZWN0b3IgY2FuIGF1dG8tc3dpdGNoIHRvXG4gKiB0aGUgRGV2VG9vbCB0YWIsIGFuZCBrZWVwcyB0aGUgXCJQYXVzZWQgaW4gZGVidWdnZXJcIiBvdmVybGF5IGZyb20gY292ZXJpbmcgdGhlIGdhbWUgdmlldy5cbiAqL1xuZnVuY3Rpb24gZW5zdXJlUGF1c2VkV2F0Y2hlciggZ2FtZTogR2FtZVdlYkNvbnRlbnRzLCBkZXZ0b29sc1ZpZXc6IFdlYkNvbnRlbnRzLCBub3RpZnlQYXVzZWQ6IFBhdXNlZE5vdGlmaWVyICk6IHZvaWQge1xuICAgIGlmICggZ2FtZS5fX2luc3BlY3RvcldhdGNoZXIgKSByZXR1cm47XG4gICAgZ2FtZS5fX2luc3BlY3RvcldhdGNoZXIgPSB0cnVlO1xuICAgIGlmICggIWdhbWUuZGVidWdnZXIuaXNBdHRhY2hlZCgpICkgZ2FtZS5kZWJ1Z2dlci5hdHRhY2goKTtcbiAgICBnYW1lLmRlYnVnZ2VyLm9uKCAnbWVzc2FnZScsICggX2V2ZW50LCBtZXRob2QgKSA9PiB7XG4gICAgICAgIGlmICggbWV0aG9kICE9PSAnRGVidWdnZXIucGF1c2VkJyApIHJldHVybjtcbiAgICAgICAgbm90aWZ5UGF1c2VkKCk7XG4gICAgICAgIHZvaWQgZGlzYWJsZVBhdXNlZE92ZXJsYXkoIGRldnRvb2xzVmlldyApO1xuICAgIH0gKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZGlzYWJsZVBhdXNlZE92ZXJsYXkoIGRldnRvb2xzVmlldzogV2ViQ29udGVudHMgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgb3ZlcmxheURpc2FibGVkID0gYXdhaXQgZGV2dG9vbHNWaWV3LmV4ZWN1dGVKYXZhU2NyaXB0KFxuICAgICAgICAgICAgXCJDb21tb24uc2V0dGluZ3MubW9kdWxlU2V0dGluZygnZGlzYWJsZVBhdXNlZFN0YXRlT3ZlcmxheScpLmdldCgpXCJcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKCAhb3ZlcmxheURpc2FibGVkICkge1xuICAgICAgICAgICAgYXdhaXQgZGV2dG9vbHNWaWV3LmV4ZWN1dGVKYXZhU2NyaXB0KFxuICAgICAgICAgICAgICAgIFwiQ29tbW9uLnNldHRpbmdzLm1vZHVsZVNldHRpbmcoJ2Rpc2FibGVQYXVzZWRTdGF0ZU92ZXJsYXknKS5zZXQodHJ1ZSlcIlxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2gge1xuICAgICAgICAvLyBkZXZ0b29scyBmcm9udGVuZCBpbnRlcm5hbHMgbWF5IGNoYW5nZSBiZXR3ZWVuIHZlcnNpb25zOyB0aGUgb3ZlcmxheSB0d2VhayBpcyBvcHRpb25hbFxuICAgIH1cbn1cblxuLyoqXG4gKiBMb2FkcyB0aGUgRGV2VG9vbHMgZnJvbnRlbmQgaW50byB0aGUgZGV2dG9vbHMgd2VidmlldyBhbmQgY29ubmVjdHMgaXQgdG8gdGhlIGdhbWUgcGFnZS5cbiAqIElkZW1wb3RlbnQ6IHJlcGVhdGVkIGNhbGxzIHdoaWxlIHdpcmVkIGFyZSBuby1vcHMgKHJlLXdpcmluZyByZWxvYWRzIHRoZSBmcm9udGVuZCBhbmQgbWFrZXNcbiAqIGl0IG1pc3MgdGhlIGJvb3QtdGltZSBsb2dzOyByZXBlYXRlZCBzZXREZXZUb29sc1dlYkNvbnRlbnRzIGNvcnJ1cHRzIHRoZSBiaW5kaW5nIGVudGlyZWx5KS5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdpcmVEZXZ0b29scyhcbiAgICBnYW1lV2NJZDogbnVtYmVyLFxuICAgIGRldnRvb2xzV2NJZDogbnVtYmVyLFxuICAgIG5vdGlmeVBhdXNlZDogUGF1c2VkTm90aWZpZXJcbik6IFByb21pc2U8V2lyZURldnRvb2xzUmVzdWx0PiB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgZ2FtZSA9IHdlYkNvbnRlbnRzLmZyb21JZCggZ2FtZVdjSWQgKSBhcyBHYW1lV2ViQ29udGVudHMgfCBudWxsO1xuICAgICAgICBjb25zdCBkZXZ0b29sc1ZpZXcgPSB3ZWJDb250ZW50cy5mcm9tSWQoIGRldnRvb2xzV2NJZCApO1xuICAgICAgICBpZiAoICFnYW1lIHx8ICFkZXZ0b29sc1ZpZXcgKSB7XG4gICAgICAgICAgICBsb2coICd3aXJlLWRldnRvb2xzOiB3ZWJDb250ZW50cyBub3QgZm91bmQnLCB7IGdhbWVXY0lkLCBkZXZ0b29sc1djSWQgfSApO1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYHdlYkNvbnRlbnRzIG5vdCBmb3VuZCAoZ2FtZT0keyBnYW1lV2NJZCB9LCBkZXZ0b29scz0keyBkZXZ0b29sc1djSWQgfSlgIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZ2FtZVVybCA9IFN0cmluZyggZ2FtZS5nZXRVUkwoKSApO1xuICAgICAgICBpZiAoICEvXihodHRwcz98ZmlsZSk6Ly50ZXN0KCBnYW1lVXJsICkgKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnZ2FtZSBwYWdlIG5vdCBsb2FkZWQgeWV0JyB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGFscmVhZHlXaXJlZCA9IEJvb2xlYW4oIGdhbWUuX19pbnNwZWN0b3JXaXJlZCApICYmIFN0cmluZyggZGV2dG9vbHNWaWV3LmdldFVSTCgpICkuc3RhcnRzV2l0aCggJ2RldnRvb2xzOi8vJyApO1xuICAgICAgICBpZiAoICFhbHJlYWR5V2lyZWQgKSB7XG4gICAgICAgICAgICBjb25zdCBwb3J0ID0gYXdhaXQgc3RhcnREZXZ0b29sc0JyaWRnZSggZ2FtZSwgbG9nICk7XG4gICAgICAgICAgICBjb25zdCBmcm9udGVuZFVybCA9IGJyaWRnZUZyb250ZW5kVXJsKCBwb3J0ICk7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGF3YWl0IGRldnRvb2xzVmlldy5sb2FkVVJMKCBmcm9udGVuZFVybCApO1xuICAgICAgICAgICAgICAgIGxvZyggJ3dpcmUtZGV2dG9vbHM6IGZyb250ZW5kIGxvYWRlZCB2aWEgd3MgYnJpZGdlJywgeyBnYW1lV2NJZCwgcG9ydCB9ICk7XG4gICAgICAgICAgICB9IGNhdGNoICggZXJyb3IgKSB7XG4gICAgICAgICAgICAgICAgLy8gc29tZSBlbnZpcm9ubWVudHMgcmVmdXNlIGRpcmVjdCBkZXZ0b29sczovLyBuYXZpZ2F0aW9uIG9uIGEgd2VidmlldzsgYm9vdHN0cmFwXG4gICAgICAgICAgICAgICAgLy8gdGhlIGZyb250ZW5kIHRocm91Z2ggdGhlIGVtYmVkZGVyIEFQSSwgdGhlbiByZWRpcmVjdCBpdCB0byB0aGUgd3MgdHJhbnNwb3J0XG4gICAgICAgICAgICAgICAgbG9nKCAnd2lyZS1kZXZ0b29sczogZGlyZWN0IGRldnRvb2xzOi8vIGxvYWQgZmFpbGVkLCB1c2luZyBlbWJlZGRlciBib290c3RyYXAnLCBTdHJpbmcoICggZXJyb3IgYXMgRXJyb3IgKT8ubWVzc2FnZSA/PyBlcnJvciApICk7XG4gICAgICAgICAgICAgICAgZ2FtZS5zZXREZXZUb29sc1dlYkNvbnRlbnRzKCBkZXZ0b29sc1ZpZXcgKTtcbiAgICAgICAgICAgICAgICBnYW1lLm9wZW5EZXZUb29scygpO1xuICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgZGV2dG9vbHNWaWV3LmxvYWRVUkwoIGZyb250ZW5kVXJsICkuY2F0Y2goXG4gICAgICAgICAgICAgICAgICAgICAgICAoIHJlZGlyZWN0RXJyb3I6IEVycm9yICkgPT4gbG9nKCAnd2lyZS1kZXZ0b29sczogd3MgcmVkaXJlY3QgZmFpbGVkJywgU3RyaW5nKCByZWRpcmVjdEVycm9yPy5tZXNzYWdlID8/IHJlZGlyZWN0RXJyb3IgKSApXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfSwgODAwICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBnYW1lLl9faW5zcGVjdG9yV2lyZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVuc3VyZVBhdXNlZFdhdGNoZXIoIGdhbWUsIGRldnRvb2xzVmlldywgbm90aWZ5UGF1c2VkICk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBtdXRlZDogZ2FtZS5pc0F1ZGlvTXV0ZWQoKSB9O1xuICAgIH0gY2F0Y2ggKCBlcnJvciApIHtcbiAgICAgICAgbG9nKCAnd2lyZS1kZXZ0b29sczogRkFJTEVEJywgU3RyaW5nKCAoIGVycm9yIGFzIEVycm9yICk/LnN0YWNrID8/IGVycm9yICkgKTtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogU3RyaW5nKCAoIGVycm9yIGFzIEVycm9yICk/Lm1lc3NhZ2UgPz8gZXJyb3IgKSB9O1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNldEdhbWVBdWRpb011dGVkKCBnYW1lV2NJZDogbnVtYmVyLCBtdXRlZDogYm9vbGVhbiApOiBXaXJlRGV2dG9vbHNSZXN1bHQge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGdhbWUgPSB3ZWJDb250ZW50cy5mcm9tSWQoIGdhbWVXY0lkICk7XG4gICAgICAgIGlmICggZ2FtZSApIGdhbWUuc2V0QXVkaW9NdXRlZCggQm9vbGVhbiggbXV0ZWQgKSApO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgIH0gY2F0Y2ggKCBlcnJvciApIHtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogU3RyaW5nKCAoIGVycm9yIGFzIEVycm9yICk/Lm1lc3NhZ2UgPz8gZXJyb3IgKSB9O1xuICAgIH1cbn1cblxuZXhwb3J0IHsgSXBjRXZlbnQgfTtcbiIsICIvLyBEZXZUb29scyBDRFAtb3Zlci1XZWJTb2NrZXQgYnJpZGdlLlxuLy9cbi8vIEluc2lkZSBDb2NvcyBDcmVhdG9yLCBFbGVjdHJvbidzIGVtYmVkZGVyIGJpbmRpbmcgZm9yIGN1c3RvbSBkZXZ0b29scyBmcm9udGVuZHNcbi8vICh3ZWJDb250ZW50cy5zZXREZXZUb29sc1dlYkNvbnRlbnRzKSBkZWxpdmVycyBubyBSdW50aW1lL0RPTS9Db25zb2xlIHRyYWZmaWMsIHdoaWxlXG4vLyB3ZWJDb250ZW50cy5kZWJ1Z2dlciBvbiB0aGUgc2FtZSBwYWdlIHdvcmtzIGZpbmUuIFNvIHRoZSBpbi10YWIgRGV2VG9vbHMgZnJvbnRlbmQgaXMgbG9hZGVkXG4vLyBpbiBzdGFuZGFyZCByZW1vdGUtZGVidWdnaW5nIG1vZGUgKGluc3BlY3Rvci5odG1sP3dzPS4uLikgYW5kIGl0cyBDRFAgbWVzc2FnZXMgYXJlIGJyaWRnZWRcbi8vIHRvIHdlYkNvbnRlbnRzLmRlYnVnZ2VyIHRocm91Z2ggYSBtaW5pbWFsIGxvY2FsIFdlYlNvY2tldCBzZXJ2ZXIgKFJGQzY0NTUsIHRleHQgZnJhbWVzIG9ubHksXG4vLyB6ZXJvIGRlcGVuZGVuY2llcykuXG5pbXBvcnQgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0ICogYXMgY3J5cHRvIGZyb20gJ2NyeXB0byc7XG5pbXBvcnQgdHlwZSB7IFNvY2tldCB9IGZyb20gJ25ldCc7XG5pbXBvcnQgdHlwZSB7IFdlYkNvbnRlbnRzIH0gZnJvbSAnZWxlY3Ryb24nO1xuXG5jb25zdCBXU19BQ0NFUFRfR1VJRCA9ICcyNThFQUZBNS1FOTE0LTQ3REEtOTVDQS1DNUFCMERDODVCMTEnO1xuY29uc3QgT1BDT0RFX0NPTlRJTlVBVElPTiA9IDB4MDtcbmNvbnN0IE9QQ09ERV9URVhUID0gMHgxO1xuY29uc3QgT1BDT0RFX0NMT1NFID0gMHg4O1xuY29uc3QgT1BDT0RFX1BJTkcgPSAweDk7XG5jb25zdCBQT05HX0hFQURFUiA9IDB4OGE7XG5cbmludGVyZmFjZSBDZHBSZXF1ZXN0IHtcbiAgICBpZDogbnVtYmVyO1xuICAgIG1ldGhvZDogc3RyaW5nO1xuICAgIHBhcmFtcz86IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xufVxuXG5pbnRlcmZhY2UgQnJpZGdlIHtcbiAgICBzZXJ2ZXI6IGh0dHAuU2VydmVyO1xuICAgIHBvcnQ6IG51bWJlcjtcbiAgICBhY3RpdmVTb2NrZXQ6IFNvY2tldCB8IG51bGw7XG59XG5cbnR5cGUgTG9nRnVuY3Rpb24gPSAoIC4uLnBhcnRzOiB1bmtub3duW10gKSA9PiB2b2lkO1xuXG5jb25zdCBicmlkZ2VzID0gbmV3IE1hcDxudW1iZXIsIEJyaWRnZT4oKTtcblxuZnVuY3Rpb24gZW5jb2RlVGV4dEZyYW1lKCBwYXlsb2FkOiBzdHJpbmcgKTogQnVmZmVyIHtcbiAgICBjb25zdCBkYXRhID0gQnVmZmVyLmZyb20oIHBheWxvYWQsICd1dGY4JyApO1xuICAgIGxldCBoZWFkZXI6IEJ1ZmZlcjtcbiAgICBpZiAoIGRhdGEubGVuZ3RoIDwgMTI2ICkge1xuICAgICAgICBoZWFkZXIgPSBCdWZmZXIuZnJvbSggWyAweDgwIHwgT1BDT0RFX1RFWFQsIGRhdGEubGVuZ3RoIF0gKTtcbiAgICB9IGVsc2UgaWYgKCBkYXRhLmxlbmd0aCA8IDY1NTM2ICkge1xuICAgICAgICBoZWFkZXIgPSBCdWZmZXIuYWxsb2MoIDQgKTtcbiAgICAgICAgaGVhZGVyWyAwIF0gPSAweDgwIHwgT1BDT0RFX1RFWFQ7XG4gICAgICAgIGhlYWRlclsgMSBdID0gMTI2O1xuICAgICAgICBoZWFkZXIud3JpdGVVSW50MTZCRSggZGF0YS5sZW5ndGgsIDIgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBoZWFkZXIgPSBCdWZmZXIuYWxsb2MoIDEwICk7XG4gICAgICAgIGhlYWRlclsgMCBdID0gMHg4MCB8IE9QQ09ERV9URVhUO1xuICAgICAgICBoZWFkZXJbIDEgXSA9IDEyNztcbiAgICAgICAgaGVhZGVyLndyaXRlQmlnVUludDY0QkUoIEJpZ0ludCggZGF0YS5sZW5ndGggKSwgMiApO1xuICAgIH1cbiAgICByZXR1cm4gQnVmZmVyLmNvbmNhdCggWyBoZWFkZXIsIGRhdGEgXSApO1xufVxuXG4vKiogRmVlZHMgc29ja2V0IGJ5dGVzIHRocm91Z2ggYSB3ZWJzb2NrZXQgZnJhbWUgcGFyc2VyOyBvbk1lc3NhZ2UgZmlyZXMgcGVyIGNvbXBsZXRlIHRleHQgbWVzc2FnZS4gKi9cbmZ1bmN0aW9uIGF0dGFjaEZyYW1lUmVjZWl2ZXIoIHNvY2tldDogU29ja2V0LCBvbk1lc3NhZ2U6ICggdGV4dDogc3RyaW5nICkgPT4gdm9pZCwgb25DbG9zZTogKCkgPT4gdm9pZCApOiB2b2lkIHtcbiAgICBsZXQgYnVmZmVyID0gQnVmZmVyLmFsbG9jKCAwICk7XG4gICAgbGV0IGZyYWdtZW50czogQnVmZmVyW10gPSBbXTtcbiAgICBzb2NrZXQub24oICdkYXRhJywgKCBjaHVuazogQnVmZmVyICkgPT4ge1xuICAgICAgICBidWZmZXIgPSBCdWZmZXIuY29uY2F0KCBbIGJ1ZmZlciwgY2h1bmsgXSApO1xuICAgICAgICB3aGlsZSAoIHRydWUgKSB7XG4gICAgICAgICAgICBpZiAoIGJ1ZmZlci5sZW5ndGggPCAyICkgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgZmluID0gKCBidWZmZXJbIDAgXSAmIDB4ODAgKSAhPT0gMDtcbiAgICAgICAgICAgIGNvbnN0IG9wY29kZSA9IGJ1ZmZlclsgMCBdICYgMHgwZjtcbiAgICAgICAgICAgIGNvbnN0IG1hc2tlZCA9ICggYnVmZmVyWyAxIF0gJiAweDgwICkgIT09IDA7XG4gICAgICAgICAgICBsZXQgbGVuZ3RoID0gYnVmZmVyWyAxIF0gJiAweDdmO1xuICAgICAgICAgICAgbGV0IG9mZnNldCA9IDI7XG4gICAgICAgICAgICBpZiAoIGxlbmd0aCA9PT0gMTI2ICkge1xuICAgICAgICAgICAgICAgIGlmICggYnVmZmVyLmxlbmd0aCA8IDQgKSByZXR1cm47XG4gICAgICAgICAgICAgICAgbGVuZ3RoID0gYnVmZmVyLnJlYWRVSW50MTZCRSggMiApO1xuICAgICAgICAgICAgICAgIG9mZnNldCA9IDQ7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCBsZW5ndGggPT09IDEyNyApIHtcbiAgICAgICAgICAgICAgICBpZiAoIGJ1ZmZlci5sZW5ndGggPCAxMCApIHJldHVybjtcbiAgICAgICAgICAgICAgICBsZW5ndGggPSBOdW1iZXIoIGJ1ZmZlci5yZWFkQmlnVUludDY0QkUoIDIgKSApO1xuICAgICAgICAgICAgICAgIG9mZnNldCA9IDEwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgbWFza0xlbmd0aCA9IG1hc2tlZCA/IDQgOiAwO1xuICAgICAgICAgICAgaWYgKCBidWZmZXIubGVuZ3RoIDwgb2Zmc2V0ICsgbWFza0xlbmd0aCArIGxlbmd0aCApIHJldHVybjtcbiAgICAgICAgICAgIGxldCBwYXlsb2FkID0gYnVmZmVyLnNsaWNlKCBvZmZzZXQgKyBtYXNrTGVuZ3RoLCBvZmZzZXQgKyBtYXNrTGVuZ3RoICsgbGVuZ3RoICk7XG4gICAgICAgICAgICBpZiAoIG1hc2tlZCApIHtcbiAgICAgICAgICAgICAgICBjb25zdCBtYXNrID0gYnVmZmVyLnNsaWNlKCBvZmZzZXQsIG9mZnNldCArIDQgKTtcbiAgICAgICAgICAgICAgICBwYXlsb2FkID0gQnVmZmVyLmZyb20oIHBheWxvYWQgKTtcbiAgICAgICAgICAgICAgICBmb3IgKCBsZXQgaSA9IDA7IGkgPCBwYXlsb2FkLmxlbmd0aDsgaSsrICkgcGF5bG9hZFsgaSBdIF49IG1hc2tbIGkgJiAzIF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBidWZmZXIgPSBidWZmZXIuc2xpY2UoIG9mZnNldCArIG1hc2tMZW5ndGggKyBsZW5ndGggKTtcbiAgICAgICAgICAgIGlmICggb3Bjb2RlID09PSBPUENPREVfQ0xPU0UgKSB7XG4gICAgICAgICAgICAgICAgb25DbG9zZSgpO1xuICAgICAgICAgICAgICAgIHNvY2tldC5lbmQoKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIG9wY29kZSA9PT0gT1BDT0RFX1BJTkcgKSB7XG4gICAgICAgICAgICAgICAgc29ja2V0LndyaXRlKCBCdWZmZXIuY29uY2F0KCBbIEJ1ZmZlci5mcm9tKCBbIFBPTkdfSEVBREVSLCBwYXlsb2FkLmxlbmd0aCBdICksIHBheWxvYWQgXSApICk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIG9wY29kZSA9PT0gT1BDT0RFX1RFWFQgfHwgb3Bjb2RlID09PSBPUENPREVfQ09OVElOVUFUSU9OICkge1xuICAgICAgICAgICAgICAgIGZyYWdtZW50cy5wdXNoKCBwYXlsb2FkICk7XG4gICAgICAgICAgICAgICAgaWYgKCBmaW4gKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBCdWZmZXIuY29uY2F0KCBmcmFnbWVudHMgKS50b1N0cmluZyggJ3V0ZjgnICk7XG4gICAgICAgICAgICAgICAgICAgIGZyYWdtZW50cyA9IFtdO1xuICAgICAgICAgICAgICAgICAgICBvbk1lc3NhZ2UoIG1lc3NhZ2UgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9ICk7XG4gICAgc29ja2V0Lm9uKCAnZXJyb3InLCBvbkNsb3NlICk7XG4gICAgc29ja2V0Lm9uKCAnY2xvc2UnLCBvbkNsb3NlICk7XG59XG5cbmZ1bmN0aW9uIGhhbmRsZUNvbm5lY3Rpb24oIGJyaWRnZTogQnJpZGdlLCBnYW1lOiBXZWJDb250ZW50cywgc29ja2V0OiBTb2NrZXQsIGxvZzogTG9nRnVuY3Rpb24gKTogdm9pZCB7XG4gICAgc29ja2V0LnNldE5vRGVsYXkoIHRydWUgKTtcbiAgICBpZiAoIGJyaWRnZS5hY3RpdmVTb2NrZXQgKSB7XG4gICAgICAgIHRyeSB7IGJyaWRnZS5hY3RpdmVTb2NrZXQuZGVzdHJveSgpOyB9IGNhdGNoIHsgLyogcmVwbGFjZWQgYnkgdGhlIG5ldyBmcm9udGVuZCBjb25uZWN0aW9uICovIH1cbiAgICB9XG4gICAgYnJpZGdlLmFjdGl2ZVNvY2tldCA9IHNvY2tldDtcbiAgICBsb2coICdicmlkZ2U6IGRldnRvb2xzIGZyb250ZW5kIGNvbm5lY3RlZCcsIHsgZ2FtZVdjSWQ6IGdhbWUuaWQgfSApO1xuXG4gICAgbGV0IGNsb3NlZCA9IGZhbHNlO1xuICAgIGNvbnN0IGNsb3NlID0gKCk6IHZvaWQgPT4ge1xuICAgICAgICBpZiAoIGNsb3NlZCApIHJldHVybjtcbiAgICAgICAgY2xvc2VkID0gdHJ1ZTtcbiAgICAgICAgaWYgKCBicmlkZ2UuYWN0aXZlU29ja2V0ID09PSBzb2NrZXQgKSBicmlkZ2UuYWN0aXZlU29ja2V0ID0gbnVsbDtcbiAgICB9O1xuICAgIGNvbnN0IHNlbmQgPSAoIG1lc3NhZ2U6IG9iamVjdCApOiB2b2lkID0+IHtcbiAgICAgICAgaWYgKCBjbG9zZWQgfHwgYnJpZGdlLmFjdGl2ZVNvY2tldCAhPT0gc29ja2V0ICkgcmV0dXJuO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgc29ja2V0LndyaXRlKCBlbmNvZGVUZXh0RnJhbWUoIEpTT04uc3RyaW5naWZ5KCBtZXNzYWdlICkgKSApO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgIGNsb3NlKCk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIGNvbnN0IG9uRGVidWdnZXJNZXNzYWdlID0gKCBfZXZlbnQ6IHVua25vd24sIG1ldGhvZDogc3RyaW5nLCBwYXJhbXM6IHVua25vd24gKTogdm9pZCA9PiBzZW5kKCB7IG1ldGhvZCwgcGFyYW1zIH0gKTtcbiAgICBjb25zdCBvbkRlYnVnZ2VyRGV0YWNoID0gKCk6IHZvaWQgPT4ge1xuICAgICAgICBjbG9zZSgpO1xuICAgICAgICB0cnkgeyBzb2NrZXQuZW5kKCk7IH0gY2F0Y2ggeyAvKiBhbHJlYWR5IGdvbmUgKi8gfVxuICAgIH07XG5cbiAgICB0cnkge1xuICAgICAgICBpZiAoICFnYW1lLmRlYnVnZ2VyLmlzQXR0YWNoZWQoKSApIGdhbWUuZGVidWdnZXIuYXR0YWNoKCk7XG4gICAgfSBjYXRjaCAoIGVycm9yICkge1xuICAgICAgICBsb2coICdicmlkZ2U6IGRlYnVnZ2VyIGF0dGFjaCBmYWlsZWQnLCBTdHJpbmcoIGVycm9yICkgKTtcbiAgICB9XG4gICAgZ2FtZS5kZWJ1Z2dlci5vbiggJ21lc3NhZ2UnLCBvbkRlYnVnZ2VyTWVzc2FnZSApO1xuICAgIGdhbWUuZGVidWdnZXIub25jZSggJ2RldGFjaCcsIG9uRGVidWdnZXJEZXRhY2ggKTtcbiAgICBzb2NrZXQub25jZSggJ2Nsb3NlJywgKCkgPT4ge1xuICAgICAgICBnYW1lLmRlYnVnZ2VyLnJlbW92ZUxpc3RlbmVyKCAnbWVzc2FnZScsIG9uRGVidWdnZXJNZXNzYWdlICk7XG4gICAgICAgIGdhbWUuZGVidWdnZXIucmVtb3ZlTGlzdGVuZXIoICdkZXRhY2gnLCBvbkRlYnVnZ2VyRGV0YWNoICk7XG4gICAgICAgIGNsb3NlKCk7XG4gICAgfSApO1xuXG4gICAgYXR0YWNoRnJhbWVSZWNlaXZlciggc29ja2V0LCAoIHRleHQgKSA9PiB7XG4gICAgICAgIGxldCByZXF1ZXN0OiBDZHBSZXF1ZXN0O1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcmVxdWVzdCA9IEpTT04ucGFyc2UoIHRleHQgKSBhcyBDZHBSZXF1ZXN0O1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBnYW1lLmRlYnVnZ2VyLnNlbmRDb21tYW5kKCByZXF1ZXN0Lm1ldGhvZCwgcmVxdWVzdC5wYXJhbXMgPz8ge30gKS50aGVuKFxuICAgICAgICAgICAgKCByZXN1bHQgKSA9PiBzZW5kKCB7IGlkOiByZXF1ZXN0LmlkLCByZXN1bHQ6IHJlc3VsdCA/PyB7fSB9ICksXG4gICAgICAgICAgICAoIGVycm9yOiB1bmtub3duICkgPT4gc2VuZCgge1xuICAgICAgICAgICAgICAgIGlkOiByZXF1ZXN0LmlkLFxuICAgICAgICAgICAgICAgIGVycm9yOiB7IGNvZGU6IC0zMjAwMCwgbWVzc2FnZTogU3RyaW5nKCAoIGVycm9yIGFzIEVycm9yICk/Lm1lc3NhZ2UgPz8gZXJyb3IgKSB9LFxuICAgICAgICAgICAgfSApXG4gICAgICAgICk7XG4gICAgfSwgY2xvc2UgKTtcbn1cblxuLyoqIFN0YXJ0cyAob3IgcmV1c2VzKSB0aGUgYnJpZGdlIHNlcnZlciBmb3Igb25lIGdhbWUgd2ViQ29udGVudHM7IHJlc29sdmVzIHdpdGggaXRzIHBvcnQuICovXG5leHBvcnQgZnVuY3Rpb24gc3RhcnREZXZ0b29sc0JyaWRnZSggZ2FtZTogV2ViQ29udGVudHMsIGxvZzogTG9nRnVuY3Rpb24gKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgICBjb25zdCBleGlzdGluZyA9IGJyaWRnZXMuZ2V0KCBnYW1lLmlkICk7XG4gICAgaWYgKCBleGlzdGluZyApIHJldHVybiBQcm9taXNlLnJlc29sdmUoIGV4aXN0aW5nLnBvcnQgKTtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoICggcmVzb2x2ZSwgcmVqZWN0ICkgPT4ge1xuICAgICAgICBjb25zdCBzZXJ2ZXIgPSBodHRwLmNyZWF0ZVNlcnZlciggKCBfcmVxLCByZXMgKSA9PiB7XG4gICAgICAgICAgICByZXMud3JpdGVIZWFkKCA0MDQgKTtcbiAgICAgICAgICAgIHJlcy5lbmQoKTtcbiAgICAgICAgfSApO1xuICAgICAgICBjb25zdCBicmlkZ2U6IEJyaWRnZSA9IHsgc2VydmVyLCBwb3J0OiAwLCBhY3RpdmVTb2NrZXQ6IG51bGwgfTtcbiAgICAgICAgc2VydmVyLm9uKCAndXBncmFkZScsICggcmVxdWVzdCwgc29ja2V0ICkgPT4ge1xuICAgICAgICAgICAgY29uc3Qga2V5ID0gcmVxdWVzdC5oZWFkZXJzWyAnc2VjLXdlYnNvY2tldC1rZXknIF07XG4gICAgICAgICAgICBpZiAoICFrZXkgKSB7XG4gICAgICAgICAgICAgICAgc29ja2V0LmRlc3Ryb3koKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBhY2NlcHQgPSBjcnlwdG8uY3JlYXRlSGFzaCggJ3NoYTEnICkudXBkYXRlKCBrZXkgKyBXU19BQ0NFUFRfR1VJRCApLmRpZ2VzdCggJ2Jhc2U2NCcgKTtcbiAgICAgICAgICAgIHNvY2tldC53cml0ZShcbiAgICAgICAgICAgICAgICAnSFRUUC8xLjEgMTAxIFN3aXRjaGluZyBQcm90b2NvbHNcXHJcXG4nICtcbiAgICAgICAgICAgICAgICAnVXBncmFkZTogd2Vic29ja2V0XFxyXFxuQ29ubmVjdGlvbjogVXBncmFkZVxcclxcbicgK1xuICAgICAgICAgICAgICAgIGBTZWMtV2ViU29ja2V0LUFjY2VwdDogJHsgYWNjZXB0IH1cXHJcXG5cXHJcXG5gXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgaGFuZGxlQ29ubmVjdGlvbiggYnJpZGdlLCBnYW1lLCBzb2NrZXQgYXMgU29ja2V0LCBsb2cgKTtcbiAgICAgICAgfSApO1xuICAgICAgICBzZXJ2ZXIub24oICdlcnJvcicsIHJlamVjdCApO1xuICAgICAgICBzZXJ2ZXIubGlzdGVuKCAwLCAnMTI3LjAuMC4xJywgKCkgPT4ge1xuICAgICAgICAgICAgYnJpZGdlLnBvcnQgPSAoIHNlcnZlci5hZGRyZXNzKCkgYXMgeyBwb3J0OiBudW1iZXIgfSApLnBvcnQ7XG4gICAgICAgICAgICBicmlkZ2VzLnNldCggZ2FtZS5pZCwgYnJpZGdlICk7XG4gICAgICAgICAgICBnYW1lLm9uY2UoICdkZXN0cm95ZWQnLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgdHJ5IHsgc2VydmVyLmNsb3NlKCk7IH0gY2F0Y2ggeyAvKiBzaHV0dGluZyBkb3duICovIH1cbiAgICAgICAgICAgICAgICBicmlkZ2VzLmRlbGV0ZSggZ2FtZS5pZCApO1xuICAgICAgICAgICAgfSApO1xuICAgICAgICAgICAgbG9nKCAnYnJpZGdlOiBsaXN0ZW5pbmcnLCB7IGdhbWVXY0lkOiBnYW1lLmlkLCBwb3J0OiBicmlkZ2UucG9ydCB9ICk7XG4gICAgICAgICAgICByZXNvbHZlKCBicmlkZ2UucG9ydCApO1xuICAgICAgICB9ICk7XG4gICAgfSApO1xufVxuXG4vKiogVGhlIGRldnRvb2xzIGZyb250ZW5kIFVSTCB0aGF0IHRhbGtzIHRvIHRoZSBicmlkZ2Ugb24gdGhlIGdpdmVuIHBvcnQuICovXG5leHBvcnQgZnVuY3Rpb24gYnJpZGdlRnJvbnRlbmRVcmwoIHBvcnQ6IG51bWJlciApOiBzdHJpbmcge1xuICAgIHJldHVybiBgZGV2dG9vbHM6Ly9kZXZ0b29scy9idW5kbGVkL2luc3BlY3Rvci5odG1sP3dzPTEyNy4wLjAuMTokeyBwb3J0IH0vZ2FtZWA7XG59XG4iLCAiLy8gTG9nZ2luZyBmb3IgdGhlIGV4dGVuc2lvbiBtYWluIHByb2Nlc3MuIENvbnNvbGUgYWx3YXlzOyBvcHRpb25hbCBmaWxlIGxvZyBmb3IgZGlhZ25vc2luZ1xuLy8gaXNzdWVzIGluc2lkZSBDcmVhdG9yIChlbmFibGUgYnkgc2V0dGluZyBDT0NPU19JTlNQRUNUT1JfREVCVUdfTE9HPTEgYmVmb3JlIGxhdW5jaGluZyBDcmVhdG9yKS5cbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5cbmRlY2xhcmUgY29uc3QgRWRpdG9yOiB7IFByb2plY3Q/OiB7IHRtcERpcjogc3RyaW5nIH0gfSB8IHVuZGVmaW5lZDtcblxuY29uc3QgRklMRV9MT0dfRU5BQkxFRCA9IHByb2Nlc3MuZW52LkNPQ09TX0lOU1BFQ1RPUl9ERUJVR19MT0cgPT09ICcxJztcbmNvbnN0IExPR19GSUxFX05BTUUgPSAnaW5zcGVjdG9yLWRlYnVnLmxvZyc7XG5cbmZ1bmN0aW9uIHJlc29sdmVMb2dQYXRoKCk6IHN0cmluZyB7XG4gICAgLy8gcHJvamVjdCB0ZW1wIGRpciB3aGVuIHJ1bm5pbmcgaW5zaWRlIENyZWF0b3I7IGV4dGVuc2lvbiBmb2xkZXIgb3RoZXJ3aXNlXG4gICAgY29uc3QgYmFzZSA9ICggdHlwZW9mIEVkaXRvciAhPT0gJ3VuZGVmaW5lZCcgJiYgRWRpdG9yPy5Qcm9qZWN0Py50bXBEaXIgKSA/IEVkaXRvci5Qcm9qZWN0LnRtcERpciA6IHBhdGguam9pbiggX19kaXJuYW1lLCAnLi4nICk7XG4gICAgcmV0dXJuIHBhdGguam9pbiggYmFzZSwgTE9HX0ZJTEVfTkFNRSApO1xufVxuY29uc3QgTE9HX1BBVEggPSByZXNvbHZlTG9nUGF0aCgpO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVzZXRMb2dGaWxlKCk6IHZvaWQge1xuICAgIGlmICggIUZJTEVfTE9HX0VOQUJMRUQgKSByZXR1cm47XG4gICAgdHJ5IHsgZnMud3JpdGVGaWxlU3luYyggTE9HX1BBVEgsICcnICk7IH0gY2F0Y2ggeyAvKiBsb2dnaW5nIG11c3QgbmV2ZXIgYnJlYWsgdGhlIHRvb2wgKi8gfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gbG9nKCAuLi5wYXJ0czogdW5rbm93bltdICk6IHZvaWQge1xuICAgIGNvbnNvbGUubG9nKCAnW2NvY29zLWluc3BlY3Rvcl0nLCAuLi5wYXJ0cyApO1xuICAgIGlmICggIUZJTEVfTE9HX0VOQUJMRUQgKSByZXR1cm47XG4gICAgY29uc3QgbGluZSA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSArICcgJyArIHBhcnRzLm1hcChcbiAgICAgICAgKCBwYXJ0ICkgPT4gKCB0eXBlb2YgcGFydCA9PT0gJ3N0cmluZycgPyBwYXJ0IDogSlNPTi5zdHJpbmdpZnkoIHBhcnQgKSApXG4gICAgKS5qb2luKCAnICcgKTtcbiAgICB0cnkgeyBmcy5hcHBlbmRGaWxlU3luYyggTE9HX1BBVEgsIGxpbmUgKyAnXFxuJyApOyB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cbn1cbiIsICIvLyBJbnNwZWN0b3IgQnJvd3NlcldpbmRvdyArIHRyYXkgbGlmZWN5Y2xlLlxuaW1wb3J0IHsgQnJvd3NlcldpbmRvdywgTWVudSwgTWVudUl0ZW0sIFRyYXksIG5hdGl2ZUltYWdlIH0gZnJvbSAnZWxlY3Ryb24nO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IHJlYWRDb25maWcsIGdldFByb2plY3RDb25maWdQYXRoLCByZWFkUHJvamVjdERlc2lnblNpemUsIENPTkZJR19QQVRIX0FSRywgREVTSUdOX1NJWkVfQVJHIH0gZnJvbSAnLi9jb25maWcnO1xuaW1wb3J0IHsgSW5zcGVjdG9yTW9kZSwgdHlwZSBJbnNwZWN0b3JDb25maWcgfSBmcm9tICdAc2hhcmVkL3Byb3RvY29sJztcbmltcG9ydCB7IGxvZyB9IGZyb20gJy4vbG9nJztcbmltcG9ydCB7IHRyYWNrSG9zdFdpbmRvdywgc2V0UHJldmlld1BvcnQsIHdhaXRGb3JHYW1lUmVhZHkgfSBmcm9tICcuL3J1bnRpbWUtYXBpJztcblxuLy8gRWRpdG9yIGlzIENvY29zIENyZWF0b3IncyBnbG9iYWwgaW4gdGhlIGV4dGVuc2lvbiBob3N0IHByb2Nlc3MuXG5kZWNsYXJlIGNvbnN0IEVkaXRvcjoge1xuICAgIE1lc3NhZ2U6IHsgcmVxdWVzdDogKCB0YXJnZXQ6IHN0cmluZywgbWVzc2FnZTogc3RyaW5nICkgPT4gUHJvbWlzZTxudW1iZXI+IH07XG59O1xuXG5jb25zdCBFWFRFTlNJT05fUk9PVCA9IHBhdGguam9pbiggX19kaXJuYW1lLCAnLi4nICk7XG5jb25zdCBQS0dfVkVSU0lPTjogc3RyaW5nID0gX19QS0dfVkVSU0lPTl9fO1xuXG5jb25zdCBERUZBVUxUX1dJRFRIID0gODc4O1xuY29uc3QgREVGQVVMVF9IRUlHSFQgPSA2MDA7XG5jb25zdCBTSU1QTEVfTU9ERV9UT09MQkFSX0hFSUdIVCA9IDUxO1xuY29uc3QgVFJBWV9JQ09OX1NJWkUgPSAxNjtcbmNvbnN0IE9QRU5fVElNRU9VVF9NUyA9IDE1MDAwO1xuXG5sZXQgd2luOiBCcm93c2VyV2luZG93IHwgbnVsbCA9IG51bGw7XG5sZXQgdHJheTogVHJheSB8IG51bGwgPSBudWxsO1xubGV0IG1vZGU6IEluc3BlY3Rvck1vZGUgPSBJbnNwZWN0b3JNb2RlLlByZXZpZXc7XG5sZXQgY29uZmlnOiBJbnNwZWN0b3JDb25maWcgPSByZWFkQ29uZmlnKCk7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRJbnNwZWN0b3JXaW5kb3coKTogQnJvd3NlcldpbmRvdyB8IG51bGwge1xuICAgIHJldHVybiB3aW47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBub3RpZnlSZW5kZXJlciggY2hhbm5lbDogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10gKTogdm9pZCB7XG4gICAgaWYgKCB3aW4gJiYgIXdpbi5pc0Rlc3Ryb3llZCgpICkgd2luLndlYkNvbnRlbnRzLnNlbmQoIGNoYW5uZWwsIC4uLmFyZ3MgKTtcbn1cblxuZnVuY3Rpb24gZGVzaXJlZENvbnRlbnRTaXplKCk6IFsgbnVtYmVyLCBudW1iZXIgXSB7XG4gICAgaWYgKCBjb25maWcuc2ltcGxlTW9kZSApIHtcbiAgICAgICAgY29uc3Qgd2lkdGggPSBjb25maWcuaXNQb3J0cmFpdCA/IGNvbmZpZy5zaXplWyAwIF0gOiBjb25maWcuc2l6ZVsgMSBdO1xuICAgICAgICBjb25zdCBoZWlnaHQgPSAoIGNvbmZpZy5pc1BvcnRyYWl0ID8gY29uZmlnLnNpemVbIDEgXSA6IGNvbmZpZy5zaXplWyAwIF0gKSArIFNJTVBMRV9NT0RFX1RPT0xCQVJfSEVJR0hUO1xuICAgICAgICByZXR1cm4gWyB3aWR0aCwgaGVpZ2h0IF07XG4gICAgfVxuICAgIHJldHVybiBbIERFRkFVTFRfV0lEVEgsIERFRkFVTFRfSEVJR0hUIF07XG59XG5cbi8qKiBJbiBzaW1wbGUgbW9kZSB0aGUgd2luZG93IHNpemUgaXMgbG9ja2VkIHRvIHRoZSBjb25maWd1cmVkIGdhbWUgcmVzb2x1dGlvbi4gKi9cbmZ1bmN0aW9uIGVuZm9yY2VTaW1wbGVNb2RlU2l6ZSgpOiB2b2lkIHtcbiAgICBpZiAoICF3aW4gKSByZXR1cm47XG4gICAgd2luLndlYkNvbnRlbnRzLmV4ZWN1dGVKYXZhU2NyaXB0KCAnc2V0dGluZy5jb25maWdEYXRhRm9yTWFpbicgKS50aGVuKCAoIGxhdGVzdENvbmZpZzogSW5zcGVjdG9yQ29uZmlnIHwgbnVsbCApID0+IHtcbiAgICAgICAgaWYgKCBsYXRlc3RDb25maWcgKSBjb25maWcgPSBsYXRlc3RDb25maWc7XG4gICAgICAgIGlmICggIWNvbmZpZy5zaW1wbGVNb2RlIHx8ICF3aW4gKSByZXR1cm47XG4gICAgICAgIGNvbnN0IFsgd2lkdGgsIGhlaWdodCBdID0gZGVzaXJlZENvbnRlbnRTaXplKCk7XG4gICAgICAgIGNvbnN0IGN1cnJlbnQgPSB3aW4uZ2V0Q29udGVudFNpemUoKTtcbiAgICAgICAgaWYgKCB3aWR0aCAhPT0gY3VycmVudFsgMCBdIHx8IGhlaWdodCAhPT0gY3VycmVudFsgMSBdICkgd2luLnNldENvbnRlbnRTaXplKCB3aWR0aCwgaGVpZ2h0ICk7XG4gICAgfSApLmNhdGNoKCAoIGVycm9yOiBFcnJvciApID0+IGxvZyggJ3Jlc2l6ZSBzeW5jIGZhaWxlZCcsIFN0cmluZyggZXJyb3I/Lm1lc3NhZ2UgPz8gZXJyb3IgKSApICk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlcmVyQXJndW1lbnRzKCk6IHN0cmluZ1tdIHtcbiAgICBjb25zdCBhcmdzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGNvbmZpZ1BhdGggPSBnZXRQcm9qZWN0Q29uZmlnUGF0aCgpO1xuICAgIGlmICggY29uZmlnUGF0aCApIGFyZ3MucHVzaCggQ09ORklHX1BBVEhfQVJHICsgY29uZmlnUGF0aCApO1xuICAgIGNvbnN0IGRlc2lnblNpemUgPSByZWFkUHJvamVjdERlc2lnblNpemUoKTtcbiAgICBpZiAoIGRlc2lnblNpemUgKSBhcmdzLnB1c2goIERFU0lHTl9TSVpFX0FSRyArIGRlc2lnblNpemUuam9pbiggJ3gnICkgKTtcbiAgICByZXR1cm4gYXJncztcbn1cblxuYXN5bmMgZnVuY3Rpb24gc2hvd1dpbmRvdygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIHdpbiApIHtcbiAgICAgICAgd2luLnNob3coKTtcbiAgICAgICAgd2luLndlYkNvbnRlbnRzLmV4ZWN1dGVKYXZhU2NyaXB0KCBgdi5zd2l0Y2hNb2RlKCR7IG1vZGUgfSlgICk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgWyB3aWR0aCwgaGVpZ2h0IF0gPSBkZXNpcmVkQ29udGVudFNpemUoKTtcbiAgICB3aW4gPSBuZXcgQnJvd3NlcldpbmRvdygge1xuICAgICAgICB3aWR0aCxcbiAgICAgICAgaGVpZ2h0LFxuICAgICAgICB0aXRsZTogYENvY29zIEluc3BlY3RvciB2JHsgUEtHX1ZFUlNJT04gfWAsXG4gICAgICAgIGJhY2tncm91bmRDb2xvcjogJyMyZTJjMjknLFxuICAgICAgICBhdXRvSGlkZU1lbnVCYXI6IHRydWUsXG4gICAgICAgIHdlYlByZWZlcmVuY2VzOiB7XG4gICAgICAgICAgICAvLyBtYXRjaGVzIHRoZSBoaXN0b3JpY2FsIHJ1bnRpbWUgZW52aXJvbm1lbnQgb2YgdGhlIHBsdWdpbiAoRWxlY3Ryb24gMTMpXG4gICAgICAgICAgICB3ZWJ2aWV3VGFnOiB0cnVlLFxuICAgICAgICAgICAgbm9kZUludGVncmF0aW9uOiB0cnVlLFxuICAgICAgICAgICAgbm9kZUludGVncmF0aW9uSW5TdWJGcmFtZXM6IHRydWUsXG4gICAgICAgICAgICBlbmFibGVSZW1vdGVNb2R1bGU6IHRydWUsXG4gICAgICAgICAgICBzYW5kYm94OiBmYWxzZSxcbiAgICAgICAgICAgIGRldlRvb2xzOiB0cnVlLFxuICAgICAgICAgICAgY29udGV4dElzb2xhdGlvbjogZmFsc2UsXG4gICAgICAgICAgICB3ZWJTZWN1cml0eTogIWNvbmZpZy5kaXNhYmxlV2ViU2VjLFxuICAgICAgICAgICAgcHJlbG9hZDogcGF0aC5qb2luKCBfX2Rpcm5hbWUsICdtYWluUHJlbG9hZC5qcycgKSxcbiAgICAgICAgICAgIC8vIHRoZSByZW5kZXJlciBoYXMgbm8gRWRpdG9yIGdsb2JhbDsgaGFuZCBpdCB0aGUgcHJvamVjdC1sZXZlbCBjb25maWcgcGF0aCBhbmQgZGVzaWduIHJlc29sdXRpb25cbiAgICAgICAgICAgIGFkZGl0aW9uYWxBcmd1bWVudHM6IHJlbmRlcmVyQXJndW1lbnRzKCksXG4gICAgICAgIH0sXG4gICAgICAgIHJlc2l6YWJsZTogIWNvbmZpZy5zaW1wbGVNb2RlLFxuICAgICAgICBtaW5pbWl6YWJsZTogIWNvbmZpZy5zaW1wbGVNb2RlLFxuICAgICAgICBtYXhpbWl6YWJsZTogIWNvbmZpZy5zaW1wbGVNb2RlLFxuICAgICAgICB1c2VDb250ZW50U2l6ZTogdHJ1ZSxcbiAgICB9ICk7XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gdGhlIGluc3BlY3RvciB3aW5kb3cgbWFuYWdlcyBpdHMgb3duIFVJOyBibG9jayB0aGUgZGVmYXVsdCBtZW51IGJhciBwZXJtYW5lbnRseVxuICAgICAgICB3aW4uc2V0TWVudSggbnVsbCApO1xuICAgICAgICB3aW4uc2V0TWVudUJhclZpc2liaWxpdHkoIGZhbHNlICk7XG4gICAgICAgICggd2luIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gKS5zZXRNZW51QmFyVmlzaWJpbGl0eSA9ICgpID0+IHVuZGVmaW5lZDtcbiAgICAgICAgKCB3aW4gYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiApLnNldE1lbnUgPSAoKSA9PiB1bmRlZmluZWQ7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIC8vIHNvbWUgZWxlY3Ryb24gdmVyc2lvbnMgcmVzdHJpY3Qgb3ZlcnJpZGluZyB0aGVzZSBtZXRob2RzXG4gICAgfVxuICAgIHRyYWNrSG9zdFdpbmRvdyggd2luICk7XG4gICAgd2luLm9uKCAncmVzaXplJywgZW5mb3JjZVNpbXBsZU1vZGVTaXplICk7XG4gICAgd2luLm9uKCAncmVhZHktdG8tc2hvdycsICgpID0+IHdpbj8uc2hvdygpICk7XG4gICAgd2luLm9uKCAnY2xvc2VkJywgKCkgPT4ge1xuICAgICAgICB3aW4gPSBudWxsO1xuICAgICAgICBpZiAoIHRyYXkgKSB0cmF5LmRlc3Ryb3koKTtcbiAgICAgICAgdHJheSA9IG51bGw7XG4gICAgfSApO1xuXG4gICAgY29uc3QgcG9ydCA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoICdzZXJ2ZXInLCAncXVlcnktcG9ydCcgKTtcbiAgICBzZXRQcmV2aWV3UG9ydCggcG9ydCApO1xuICAgIGNvbnN0IHBhZ2VVcmwgPSBwYXRoLmpvaW4oIEVYVEVOU0lPTl9ST09ULCBgaW5kZXguaHRtbD9wb3J0PSR7IHBvcnQgfSZtb2RlPSR7IG1vZGUgfWAgKTtcbiAgICBsb2coICdpbnNwZWN0b3Igd2luZG93IGNyZWF0ZWQnLCB7IG1vZGUsIHNpbXBsZU1vZGU6IEJvb2xlYW4oIGNvbmZpZy5zaW1wbGVNb2RlICkgfSApO1xuICAgIHdpbi5sb2FkVVJMKCBgZmlsZTovLyR7IHBhZ2VVcmwgfWAgKTtcbn1cblxuZnVuY3Rpb24gZW5zdXJlVHJheSgpOiB2b2lkIHtcbiAgICB0cnkge1xuICAgICAgICBsZXQgaWNvbiA9IG5hdGl2ZUltYWdlLmNyZWF0ZUZyb21QYXRoKCBwYXRoLmpvaW4oIEVYVEVOU0lPTl9ST09ULCAnaWNvbi5wbmcnICkgKTtcbiAgICAgICAgaWNvbiA9IGljb24ucmVzaXplKCB7IHdpZHRoOiBUUkFZX0lDT05fU0laRSwgaGVpZ2h0OiBUUkFZX0lDT05fU0laRSB9ICk7XG4gICAgICAgIGlmICggdHJheSApIHtcbiAgICAgICAgICAgIHRyYXkuc2V0SW1hZ2UoIGljb24gKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0cmF5ID0gbmV3IFRyYXkoIGljb24gKTtcbiAgICAgICAgdHJheS5vbiggJ2NsaWNrJywgKCkgPT4gd2luPy5zaG93KCkgKTtcbiAgICAgICAgY29uc3QgdHJheU1lbnUgPSBuZXcgTWVudSgpO1xuICAgICAgICB0cmF5TWVudS5hcHBlbmQoIG5ldyBNZW51SXRlbSgge1xuICAgICAgICAgICAgbGFiZWw6ICdUb2dnbGUgTWluaSBNb2RlJyxcbiAgICAgICAgICAgIGNsaWNrOiAoKSA9PiB3aW4/LndlYkNvbnRlbnRzLmV4ZWN1dGVKYXZhU2NyaXB0KCAnc2V0dGluZy50b2dnbGVTaW1wbGVNb2RlKCknICksXG4gICAgICAgIH0gKSApO1xuICAgICAgICB0cmF5TWVudS5hcHBlbmQoIG5ldyBNZW51SXRlbSgge1xuICAgICAgICAgICAgbGFiZWw6ICdPcGVuRGV2VG9vbHMnLFxuICAgICAgICAgICAgY2xpY2s6ICgpID0+IHdpbj8ud2ViQ29udGVudHMub3BlbkRldlRvb2xzKCksXG4gICAgICAgIH0gKSApO1xuICAgICAgICB0cmF5LnNldENvbnRleHRNZW51KCB0cmF5TWVudSApO1xuICAgIH0gY2F0Y2ggKCBlcnJvciApIHtcbiAgICAgICAgbG9nKCAndHJheSBzZXR1cCBmYWlsZWQnLCBTdHJpbmcoIGVycm9yICkgKTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0cnlTaG93V2luZG93KCBuZXh0TW9kZTogSW5zcGVjdG9yTW9kZSApOiB2b2lkIHtcbiAgICBvcGVuSW5zcGVjdG9yKCBuZXh0TW9kZSApLmNhdGNoKCAoIGVycm9yOiBFcnJvciApID0+IGxvZyggJ3Nob3dXaW5kb3cgZmFpbGVkJywgU3RyaW5nKCBlcnJvcj8uc3RhY2sgPz8gZXJyb3IgKSApICk7XG59XG5cbi8qKiBBd2FpdGFibGUgdmFyaWFudCBmb3IgdGhlIHJ1bnRpbWUgQVBJOiByZXNvbHZlcyB0cnVlIG9uY2UgdGhlIGdhbWUgcGFnZSBoYXMgbG9hZGVkLiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG9wZW5JbnNwZWN0b3IoIG5leHRNb2RlOiBJbnNwZWN0b3JNb2RlICk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGVuc3VyZVRyYXkoKTtcbiAgICBtb2RlID0gbmV4dE1vZGU7XG4gICAgYXdhaXQgc2hvd1dpbmRvdygpO1xuICAgIHJldHVybiB3YWl0Rm9yR2FtZVJlYWR5KCBPUEVOX1RJTUVPVVRfTVMgKTtcbn1cbiIsICIvLyBJbnNwZWN0b3Igc2V0dGluZ3MgcGVyc2lzdGVuY2UsIHNoYXJlZCB3aXRoIHRoZSByZW5kZXJlciBwcmVsb2FkLlxuLy8gUmVzb2x1dGlvbiBvcmRlcjogdGhlIHBhdGggaGFuZGVkIG92ZXIgYnkgdGhlIG1haW4gcHJvY2VzcyAocHJvamVjdCBzZXR0aW5ncyBkaXIpLFxuLy8gdGhlbiB0aGUgbGVnYWN5IGV4dGVuc2lvbnMvY29jb3MtaW5zcGVjdG9yLWNvbmZpZy5qc29uLCB0aGVuIHRoZSBidW5kbGVkIGRlZmF1bHQgY29uZmlnLmpzb24uXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHR5cGUgeyBJbnNwZWN0b3JDb25maWcgfSBmcm9tICdAc2hhcmVkL3Byb3RvY29sJztcblxuLyoqIENMSSBzd2l0Y2hlcyB1c2VkIHRvIGhhbmQgcHJvamVjdCBmYWN0cyB0byB0aGUgaW5zcGVjdG9yIHJlbmRlcmVyICh3ZWJQcmVmZXJlbmNlcy5hZGRpdGlvbmFsQXJndW1lbnRzKS4gKi9cbmV4cG9ydCBjb25zdCBDT05GSUdfUEFUSF9BUkcgPSAnLS1pbnNwZWN0b3ItY29uZmlnPSc7XG5leHBvcnQgY29uc3QgREVTSUdOX1NJWkVfQVJHID0gJy0tZGVzaWduLXNpemU9JztcbmV4cG9ydCBjb25zdCBDT05GSUdfRklMRV9OQU1FID0gJ2NvY29zLWluc3BlY3Rvci5qc29uJztcbmNvbnN0IFBST0pFQ1RfU0VUVElOR1NfUkVMQVRJVkUgPSBbICdzZXR0aW5ncycsICd2MicsICdwYWNrYWdlcycsICdwcm9qZWN0Lmpzb24nIF07XG5cbi8vIF9fZGlybmFtZSBpcyBpbnNwZWN0b3IvZGlzdCBhdCBydW50aW1lOyB0aGUgYnVuZGxlZCBkZWZhdWx0IGxpdmVzIGluIHRoZSBpbnNwZWN0b3Igcm9vdC5cbmNvbnN0IElOU1BFQ1RPUl9ST09UID0gcGF0aC5qb2luKCBfX2Rpcm5hbWUsICcuLicgKTtcbmNvbnN0IExPQ0FMX0NPTkZJR19QQVRIID0gcGF0aC5qb2luKCBJTlNQRUNUT1JfUk9PVCwgJ2NvbmZpZy5qc29uJyApO1xuLy8gcHJlLW1lcmdlIGxvY2F0aW9uIChDb2Nvc0luc3BlY3RvciB3YXMgYSBzaWJsaW5nIGV4dGVuc2lvbiwgY29uZmlnIHNhdCBuZXh0IHRvIGl0KVxuY29uc3QgTEVHQUNZX0NPTkZJR19QQVRIID0gcGF0aC5qb2luKCBJTlNQRUNUT1JfUk9PVCwgJy4uLy4uL2NvY29zLWluc3BlY3Rvci1jb25maWcuanNvbicgKTtcblxuZGVjbGFyZSBjb25zdCBFZGl0b3I6IHsgUHJvamVjdD86IHsgcGF0aDogc3RyaW5nIH0gfSB8IHVuZGVmaW5lZDtcblxuLyoqIFByb2plY3QtbGV2ZWwgY29uZmlnIHBhdGg6IGZyb20gYXJndiBpbiB0aGUgcmVuZGVyZXIsIGZyb20gRWRpdG9yIGluIHRoZSBtYWluIHByb2Nlc3MuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0UHJvamVjdENvbmZpZ1BhdGgoKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgY29uc3QgZnJvbUFyZ3YgPSBwcm9jZXNzLmFyZ3YuZmluZCggKCBhcmcgKSA9PiBhcmcuc3RhcnRzV2l0aCggQ09ORklHX1BBVEhfQVJHICkgKTtcbiAgICBpZiAoIGZyb21Bcmd2ICkgcmV0dXJuIGZyb21Bcmd2LnNsaWNlKCBDT05GSUdfUEFUSF9BUkcubGVuZ3RoICk7XG4gICAgaWYgKCB0eXBlb2YgRWRpdG9yICE9PSAndW5kZWZpbmVkJyAmJiBFZGl0b3I/LlByb2plY3Q/LnBhdGggKSB7XG4gICAgICAgIHJldHVybiBwYXRoLmpvaW4oIEVkaXRvci5Qcm9qZWN0LnBhdGgsICdzZXR0aW5ncycsIENPTkZJR19GSUxFX05BTUUgKTtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbi8qKiBQcm9qZWN0IGRlc2lnbiByZXNvbHV0aW9uIFt3aWR0aCwgaGVpZ2h0XSBmcm9tIHNldHRpbmdzL3YyL3BhY2thZ2VzL3Byb2plY3QuanNvbiAobWFpbiBwcm9jZXNzIG9ubHkpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlYWRQcm9qZWN0RGVzaWduU2l6ZSgpOiBbIG51bWJlciwgbnVtYmVyIF0gfCBudWxsIHtcbiAgICBpZiAoIHR5cGVvZiBFZGl0b3IgPT09ICd1bmRlZmluZWQnIHx8ICFFZGl0b3I/LlByb2plY3Q/LnBhdGggKSByZXR1cm4gbnVsbDtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCByYXcgPSBmcy5yZWFkRmlsZVN5bmMoIHBhdGguam9pbiggRWRpdG9yLlByb2plY3QucGF0aCwgLi4uUFJPSkVDVF9TRVRUSU5HU19SRUxBVElWRSApLCB7IGVuY29kaW5nOiAndXRmLTgnIH0gKTtcbiAgICAgICAgY29uc3QgcmVzb2x1dGlvbiA9IEpTT04ucGFyc2UoIHJhdyApPy5nZW5lcmFsPy5kZXNpZ25SZXNvbHV0aW9uO1xuICAgICAgICBpZiAoIHR5cGVvZiByZXNvbHV0aW9uPy53aWR0aCA9PT0gJ251bWJlcicgJiYgdHlwZW9mIHJlc29sdXRpb24/LmhlaWdodCA9PT0gJ251bWJlcicgKSB7XG4gICAgICAgICAgICByZXR1cm4gWyByZXNvbHV0aW9uLndpZHRoLCByZXNvbHV0aW9uLmhlaWdodCBdO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCB7IC8qIHByb2plY3QgaGFzIG5vIGV4cGxpY2l0IGRlc2lnbiByZXNvbHV0aW9uICovIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuLyoqIERlc2lnbiByZXNvbHV0aW9uIGhhbmRlZCBvdmVyIGJ5IHRoZSBtYWluIHByb2Nlc3MgKHJlbmRlcmVyIHNpZGUpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldERlc2lnblNpemUoKTogWyBudW1iZXIsIG51bWJlciBdIHwgbnVsbCB7XG4gICAgY29uc3QgZnJvbUFyZ3YgPSBwcm9jZXNzLmFyZ3YuZmluZCggKCBhcmcgKSA9PiBhcmcuc3RhcnRzV2l0aCggREVTSUdOX1NJWkVfQVJHICkgKTtcbiAgICBpZiAoICFmcm9tQXJndiApIHJldHVybiBudWxsO1xuICAgIGNvbnN0IFsgd2lkdGgsIGhlaWdodCBdID0gZnJvbUFyZ3Yuc2xpY2UoIERFU0lHTl9TSVpFX0FSRy5sZW5ndGggKS5zcGxpdCggJ3gnICkubWFwKCBOdW1iZXIgKTtcbiAgICByZXR1cm4gd2lkdGggPiAwICYmIGhlaWdodCA+IDAgPyBbIHdpZHRoLCBoZWlnaHQgXSA6IG51bGw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWFkQ29uZmlnKCk6IEluc3BlY3RvckNvbmZpZyB7XG4gICAgY29uc3QgcHJvamVjdFBhdGggPSBnZXRQcm9qZWN0Q29uZmlnUGF0aCgpO1xuICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBbIHByb2plY3RQYXRoLCBMRUdBQ1lfQ09ORklHX1BBVEgsIExPQ0FMX0NPTkZJR19QQVRIIF0uZmlsdGVyKCAoIHAgKTogcCBpcyBzdHJpbmcgPT4gQm9vbGVhbiggcCApICk7XG4gICAgY29uc3QgY29uZmlnUGF0aCA9IGNhbmRpZGF0ZXMuZmluZCggKCBwICkgPT4gZnMuZXhpc3RzU3luYyggcCApICkgPz8gTE9DQUxfQ09ORklHX1BBVEg7XG4gICAgcmV0dXJuIEpTT04ucGFyc2UoIGZzLnJlYWRGaWxlU3luYyggY29uZmlnUGF0aCwgeyBlbmNvZGluZzogJ3V0Zi04JyB9ICkgKSBhcyBJbnNwZWN0b3JDb25maWc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzYXZlQ29uZmlnKCBjb25maWc6IEluc3BlY3RvckNvbmZpZyApOiB2b2lkIHtcbiAgICBjb25zdCB0YXJnZXQgPSBnZXRQcm9qZWN0Q29uZmlnUGF0aCgpID8/IExFR0FDWV9DT05GSUdfUEFUSDtcbiAgICBmcy5ta2RpclN5bmMoIHBhdGguZGlybmFtZSggdGFyZ2V0ICksIHsgcmVjdXJzaXZlOiB0cnVlIH0gKTtcbiAgICBmcy53cml0ZUZpbGVTeW5jKCB0YXJnZXQsIEpTT04uc3RyaW5naWZ5KCBjb25maWcgKSwgeyBlbmNvZGluZzogJ3V0Zi04JyB9ICk7XG59XG4iLCAiLy8gTWFpbi1wcm9jZXNzIGFjY2VzcyB0byB0aGUgZ2FtZSB3ZWJ2aWV3IGZvciB0aGUgcnVudGltZSBBUEkgKEVkaXRvci5NZXNzYWdlIFwicnVudGltZS0qXCIpLlxuLy8gVHJhY2tzIHRoZSBnYW1lIGd1ZXN0IHdlYkNvbnRlbnRzIG9mIHRoZSBpbnNwZWN0b3Igd2luZG93LCBtaXJyb3JzIGl0cyBjb25zb2xlIG91dHB1dCBpbnRvIGFcbi8vIHJpbmcgYnVmZmVyLCBhbmQgb2ZmZXJzIGV2YWwgLyBjYXB0dXJlIHByaW1pdGl2ZXMuIE5ldmVyIHRocm93czogY2FsbGVycyBnZXQgeyBvazogZmFsc2UgfS5cbmltcG9ydCB7IHdlYkNvbnRlbnRzIH0gZnJvbSAnZWxlY3Ryb24nO1xuaW1wb3J0IHR5cGUgeyBCcm93c2VyV2luZG93LCBXZWJDb250ZW50cyB9IGZyb20gJ2VsZWN0cm9uJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgdHlwZSB7XG4gICAgUnVudGltZUNhcHR1cmVSZXN1bHQsXG4gICAgUnVudGltZUNvbnNvbGVFbnRyeSxcbiAgICBSdW50aW1lQ29uc29sZUxldmVsLFxuICAgIFJ1bnRpbWVDb25zb2xlUmVzdWx0LFxuICAgIFJ1bnRpbWVFdmFsUmVzdWx0LFxuICAgIFJ1bnRpbWVTdGF0dXMsXG59IGZyb20gJ0BzaGFyZWQvcHJvdG9jb2wnO1xuaW1wb3J0IHsgbG9nIH0gZnJvbSAnLi9sb2cnO1xuXG5jb25zdCBDT05TT0xFX1JJTkdfQ0FQQUNJVFkgPSA1MDA7XG5jb25zdCBHQU1FX1JFQURZX1BPTExfTVMgPSAxMDA7XG5jb25zdCBHQU1FX1VSTF9QQVRURVJOID0gL15odHRwcz86LztcbmNvbnN0IExFVkVMX05BTUVTOiBSdW50aW1lQ29uc29sZUxldmVsW10gPSBbICd2ZXJib3NlJywgJ2luZm8nLCAnd2FybmluZycsICdlcnJvcicgXTtcbmNvbnN0IEVSUk9SX1dJTkRPV19OT1RfT1BFTiA9ICdpbnNwZWN0b3Igd2luZG93IG5vdCBvcGVuJztcbmNvbnN0IEVSUk9SX0dBTUVfTk9UX1JFQURZID0gJ2dhbWUgcGFnZSBub3QgbG9hZGVkIHlldCc7XG5cbmxldCBob3N0V2luZG93OiBCcm93c2VyV2luZG93IHwgbnVsbCA9IG51bGw7XG5sZXQgZ2FtZUd1ZXN0OiBXZWJDb250ZW50cyB8IG51bGwgPSBudWxsO1xubGV0IHByZXZpZXdQb3J0OiBudW1iZXIgfCBudWxsID0gbnVsbDtcbmxldCBjb25zb2xlU2VxID0gMDtcbmNvbnN0IGNvbnNvbGVSaW5nOiBSdW50aW1lQ29uc29sZUVudHJ5W10gPSBbXTtcblxuZnVuY3Rpb24gaXNHYW1lR3Vlc3QoIGd1ZXN0OiBXZWJDb250ZW50cyApOiBib29sZWFuIHtcbiAgICByZXR1cm4gR0FNRV9VUkxfUEFUVEVSTi50ZXN0KCBTdHJpbmcoIGd1ZXN0LmdldFVSTCgpICkgKTtcbn1cblxuZnVuY3Rpb24gcHVzaENvbnNvbGVFbnRyeSggbGV2ZWw6IG51bWJlciwgbWVzc2FnZTogc3RyaW5nLCBsaW5lOiBudW1iZXIsIHNvdXJjZUlkOiBzdHJpbmcgKTogdm9pZCB7XG4gICAgY29uc29sZVNlcSArPSAxO1xuICAgIGNvbnNvbGVSaW5nLnB1c2goIHtcbiAgICAgICAgc2VxOiBjb25zb2xlU2VxLFxuICAgICAgICB0OiBEYXRlLm5vdygpLFxuICAgICAgICBsZXZlbDogTEVWRUxfTkFNRVNbIGxldmVsIF0gPz8gJ2luZm8nLFxuICAgICAgICBtZXNzYWdlLFxuICAgICAgICBsaW5lLFxuICAgICAgICBzb3VyY2VJZCxcbiAgICB9ICk7XG4gICAgaWYgKCBjb25zb2xlUmluZy5sZW5ndGggPiBDT05TT0xFX1JJTkdfQ0FQQUNJVFkgKSBjb25zb2xlUmluZy5zaGlmdCgpO1xufVxuXG5mdW5jdGlvbiBhdHRhY2hHdWVzdCggZ3Vlc3Q6IFdlYkNvbnRlbnRzICk6IHZvaWQge1xuICAgIGlmICggZ2FtZUd1ZXN0ID09PSBndWVzdCApIHJldHVybjtcbiAgICBnYW1lR3Vlc3QgPSBndWVzdDtcbiAgICBsb2coICdydW50aW1lLWFwaTogZ2FtZSBndWVzdCBhdHRhY2hlZCcsIHsgaWQ6IGd1ZXN0LmlkIH0gKTtcbiAgICBndWVzdC5vbiggJ2NvbnNvbGUtbWVzc2FnZScsICggX2V2ZW50LCBsZXZlbCwgbWVzc2FnZSwgbGluZSwgc291cmNlSWQgKSA9PiB7XG4gICAgICAgIHB1c2hDb25zb2xlRW50cnkoIGxldmVsLCBtZXNzYWdlLCBsaW5lLCBzb3VyY2VJZCApO1xuICAgIH0gKTtcbiAgICBndWVzdC5vbiggJ2Rlc3Ryb3llZCcsICgpID0+IHtcbiAgICAgICAgaWYgKCBnYW1lR3Vlc3QgPT09IGd1ZXN0ICkgZ2FtZUd1ZXN0ID0gbnVsbDtcbiAgICB9ICk7XG59XG5cbi8qKiBGYWxsYmFjayB3aGVuIGRpZC1hdHRhY2gtd2VidmlldyB3YXMgbWlzc2VkIChlLmcuIHdpbmRvdyBvcGVuZWQgYmVmb3JlIHRoaXMgbW9kdWxlIGxvYWRlZCkuICovXG5mdW5jdGlvbiBmaW5kR2FtZUd1ZXN0KCk6IFdlYkNvbnRlbnRzIHwgbnVsbCB7XG4gICAgaWYgKCAhaG9zdFdpbmRvdyB8fCBob3N0V2luZG93LmlzRGVzdHJveWVkKCkgKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBob3N0SWQgPSBob3N0V2luZG93LndlYkNvbnRlbnRzLmlkO1xuICAgIGNvbnN0IGd1ZXN0ID0gd2ViQ29udGVudHMuZ2V0QWxsV2ViQ29udGVudHMoKS5maW5kKCAoIGNhbmRpZGF0ZSApID0+XG4gICAgICAgIGNhbmRpZGF0ZS5nZXRUeXBlKCkgPT09ICd3ZWJ2aWV3J1xuICAgICAgICAmJiBjYW5kaWRhdGUuaG9zdFdlYkNvbnRlbnRzPy5pZCA9PT0gaG9zdElkXG4gICAgICAgICYmIGlzR2FtZUd1ZXN0KCBjYW5kaWRhdGUgKVxuICAgICk7XG4gICAgcmV0dXJuIGd1ZXN0ID8/IG51bGw7XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVHYW1lR3Vlc3QoKTogV2ViQ29udGVudHMgfCBudWxsIHtcbiAgICBpZiAoIGdhbWVHdWVzdCAmJiAhZ2FtZUd1ZXN0LmlzRGVzdHJveWVkKCkgKSByZXR1cm4gZ2FtZUd1ZXN0O1xuICAgIGNvbnN0IGZvdW5kID0gZmluZEdhbWVHdWVzdCgpO1xuICAgIGlmICggZm91bmQgKSBhdHRhY2hHdWVzdCggZm91bmQgKTtcbiAgICByZXR1cm4gZm91bmQ7XG59XG5cbmZ1bmN0aW9uIGlzV2luZG93T3BlbigpOiBib29sZWFuIHtcbiAgICByZXR1cm4gQm9vbGVhbiggaG9zdFdpbmRvdyAmJiAhaG9zdFdpbmRvdy5pc0Rlc3Ryb3llZCgpICk7XG59XG5cbi8qKiBIb29rcyB0aGUgaW5zcGVjdG9yIHdpbmRvdyBzbyBldmVyeSBhdHRhY2hlZCA8d2Vidmlldz4gd2hvc2UgVVJMIGlzIHRoZSBnYW1lIGdldHMgdHJhY2tlZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0cmFja0hvc3RXaW5kb3coIHdpbjogQnJvd3NlcldpbmRvdyApOiB2b2lkIHtcbiAgICBob3N0V2luZG93ID0gd2luO1xuICAgIHdpbi53ZWJDb250ZW50cy5vbiggJ2RpZC1hdHRhY2gtd2VidmlldycsICggX2V2ZW50LCBndWVzdCApID0+IHtcbiAgICAgICAgLy8gdGhlIGRldnRvb2xzIHdlYnZpZXcgYXR0YWNoZXMgd2l0aCBhYm91dDpibGFuayAvIGRldnRvb2xzOi8vOyB3YWl0IGZvciB0aGUgZ2FtZSBVUkxcbiAgICAgICAgaWYgKCBpc0dhbWVHdWVzdCggZ3Vlc3QgKSApIHtcbiAgICAgICAgICAgIGF0dGFjaEd1ZXN0KCBndWVzdCApO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGd1ZXN0Lm9uY2UoICdkaWQtZmluaXNoLWxvYWQnLCAoKSA9PiB7XG4gICAgICAgICAgICBpZiAoIGlzR2FtZUd1ZXN0KCBndWVzdCApICkgYXR0YWNoR3Vlc3QoIGd1ZXN0ICk7XG4gICAgICAgIH0gKTtcbiAgICB9ICk7XG4gICAgd2luLm9uKCAnY2xvc2VkJywgKCkgPT4ge1xuICAgICAgICBpZiAoIGhvc3RXaW5kb3cgPT09IHdpbiApIGhvc3RXaW5kb3cgPSBudWxsO1xuICAgICAgICBnYW1lR3Vlc3QgPSBudWxsO1xuICAgIH0gKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNldFByZXZpZXdQb3J0KCBwb3J0OiBudW1iZXIgKTogdm9pZCB7XG4gICAgcHJldmlld1BvcnQgPSBwb3J0O1xufVxuXG4vKiogUmVzb2x2ZXMgb25jZSB0aGUgZ2FtZSBwYWdlIGhhcyBmaW5pc2hlZCBsb2FkaW5nIChvciBpbW1lZGlhdGVseSBpZiBpdCBhbHJlYWR5IGhhcykuICovXG5leHBvcnQgZnVuY3Rpb24gd2FpdEZvckdhbWVSZWFkeSggdGltZW91dE1zOiBudW1iZXIgKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgY29uc3QgZ3Vlc3QgPSByZXNvbHZlR2FtZUd1ZXN0KCk7XG4gICAgaWYgKCBndWVzdCAmJiAhZ3Vlc3QuaXNMb2FkaW5nKCkgKSByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCB0cnVlICk7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKCAoIHJlc29sdmUgKSA9PiB7XG4gICAgICAgIGNvbnN0IHN0YXJ0ZWRBdCA9IERhdGUubm93KCk7XG4gICAgICAgIGNvbnN0IHRpbWVyID0gc2V0SW50ZXJ2YWwoICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnQgPSByZXNvbHZlR2FtZUd1ZXN0KCk7XG4gICAgICAgICAgICBpZiAoIGN1cnJlbnQgJiYgIWN1cnJlbnQuaXNMb2FkaW5nKCkgKSB7XG4gICAgICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCggdGltZXIgKTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKCB0cnVlICk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCBEYXRlLm5vdygpIC0gc3RhcnRlZEF0ID49IHRpbWVvdXRNcyApIHtcbiAgICAgICAgICAgICAgICBjbGVhckludGVydmFsKCB0aW1lciApO1xuICAgICAgICAgICAgICAgIHJlc29sdmUoIGZhbHNlICk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIEdBTUVfUkVBRFlfUE9MTF9NUyApO1xuICAgIH0gKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFN0YXR1cygpOiBSdW50aW1lU3RhdHVzIHtcbiAgICBjb25zdCB3aW5kb3dPcGVuID0gaXNXaW5kb3dPcGVuKCk7XG4gICAgY29uc3QgZ3Vlc3QgPSB3aW5kb3dPcGVuID8gcmVzb2x2ZUdhbWVHdWVzdCgpIDogbnVsbDtcbiAgICByZXR1cm4ge1xuICAgICAgICB3aW5kb3dPcGVuLFxuICAgICAgICBnYW1lUmVhZHk6IEJvb2xlYW4oIGd1ZXN0ICYmICFndWVzdC5pc0xvYWRpbmcoKSApLFxuICAgICAgICBnYW1lVXJsOiBndWVzdCA/IFN0cmluZyggZ3Vlc3QuZ2V0VVJMKCkgKSA6IG51bGwsXG4gICAgICAgIHByZXZpZXdQb3J0LFxuICAgICAgICBjb25zb2xlU2VxLFxuICAgIH07XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBldmFsSW5HYW1lKCBjb2RlOiBzdHJpbmcgKTogUHJvbWlzZTxSdW50aW1lRXZhbFJlc3VsdD4ge1xuICAgIGlmICggIWlzV2luZG93T3BlbigpICkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogRVJST1JfV0lORE9XX05PVF9PUEVOIH07XG4gICAgY29uc3QgZ3Vlc3QgPSByZXNvbHZlR2FtZUd1ZXN0KCk7XG4gICAgaWYgKCAhZ3Vlc3QgKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBFUlJPUl9HQU1FX05PVF9SRUFEWSB9O1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gYXdhaXQgZ3Vlc3QuZXhlY3V0ZUphdmFTY3JpcHQoIFN0cmluZyggY29kZSApLCB0cnVlICk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCB2YWx1ZSB9O1xuICAgIH0gY2F0Y2ggKCBlcnJvciApIHtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogU3RyaW5nKCAoIGVycm9yIGFzIEVycm9yICk/LnN0YWNrID8/ICggZXJyb3IgYXMgRXJyb3IgKT8ubWVzc2FnZSA/PyBlcnJvciApIH07XG4gICAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY2FwdHVyZSggb3V0UGF0aDogc3RyaW5nICk6IFByb21pc2U8UnVudGltZUNhcHR1cmVSZXN1bHQ+IHtcbiAgICBpZiAoICFpc1dpbmRvd09wZW4oKSApIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IEVSUk9SX1dJTkRPV19OT1RfT1BFTiB9O1xuICAgIGNvbnN0IGd1ZXN0ID0gcmVzb2x2ZUdhbWVHdWVzdCgpO1xuICAgIGlmICggIWd1ZXN0ICkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogRVJST1JfR0FNRV9OT1RfUkVBRFkgfTtcbiAgICB0cnkge1xuICAgICAgICAvLyBhIG1pbmltaXplZCAvIGhpZGRlbiB3aW5kb3cgeWllbGRzIGEgYmxhbmsgY2FwdHVyZVxuICAgICAgICBpZiAoIGhvc3RXaW5kb3chLmlzTWluaW1pemVkKCkgKSBob3N0V2luZG93IS5yZXN0b3JlKCk7XG4gICAgICAgIGlmICggIWhvc3RXaW5kb3chLmlzVmlzaWJsZSgpICkgaG9zdFdpbmRvdyEuc2hvdygpO1xuICAgICAgICBjb25zdCBpbWFnZSA9IGF3YWl0IGd1ZXN0LmNhcHR1cmVQYWdlKCk7XG4gICAgICAgIGNvbnN0IHNpemUgPSBpbWFnZS5nZXRTaXplKCk7XG4gICAgICAgIGNvbnN0IHBuZyA9IGltYWdlLnRvUE5HKCk7XG4gICAgICAgIGZzLm1rZGlyU3luYyggcGF0aC5kaXJuYW1lKCBvdXRQYXRoICksIHsgcmVjdXJzaXZlOiB0cnVlIH0gKTtcbiAgICAgICAgZnMud3JpdGVGaWxlU3luYyggb3V0UGF0aCwgcG5nICk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBwYXRoOiBvdXRQYXRoLCB3aWR0aDogc2l6ZS53aWR0aCwgaGVpZ2h0OiBzaXplLmhlaWdodCwgYnl0ZXM6IHBuZy5sZW5ndGggfTtcbiAgICB9IGNhdGNoICggZXJyb3IgKSB7XG4gICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFN0cmluZyggKCBlcnJvciBhcyBFcnJvciApPy5tZXNzYWdlID8/IGVycm9yICkgfTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWFkQ29uc29sZSggc2luY2VTZXE6IG51bWJlciwgbGV2ZWw/OiBSdW50aW1lQ29uc29sZUxldmVsIHwgJ2FsbCcgKTogUnVudGltZUNvbnNvbGVSZXN1bHQge1xuICAgIGNvbnN0IHdhbnRMZXZlbCA9IGxldmVsICYmIGxldmVsICE9PSAnYWxsJyA/IGxldmVsIDogbnVsbDtcbiAgICBjb25zdCBlbnRyaWVzID0gY29uc29sZVJpbmcuZmlsdGVyKCAoIGVudHJ5ICkgPT5cbiAgICAgICAgZW50cnkuc2VxID4gc2luY2VTZXEgJiYgKCAhd2FudExldmVsIHx8IGVudHJ5LmxldmVsID09PSB3YW50TGV2ZWwgKVxuICAgICk7XG4gICAgcmV0dXJuIHsgb2s6IHRydWUsIGVudHJpZXMsIGxhdGVzdFNlcTogY29uc29sZVNlcSB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJDb25zb2xlKCk6IFJ1bnRpbWVDb25zb2xlUmVzdWx0IHtcbiAgICBjb25zb2xlUmluZy5sZW5ndGggPSAwO1xuICAgIHJldHVybiB7IG9rOiB0cnVlLCBlbnRyaWVzOiBbXSwgbGF0ZXN0U2VxOiBjb25zb2xlU2VxIH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUEsSUFBQUEsbUJBQXFEOzs7QUNFOUMsSUFBTSxXQUFXO0FBV2pCLElBQU0sVUFBVTtBQUFBLEVBQ25CLFdBQVcsR0FBSSxRQUFTO0FBQUEsRUFDeEIsWUFBWSxHQUFJLFFBQVM7QUFDN0I7QUFHTyxJQUFNLFlBQVk7QUFBQSxFQUNyQixjQUFjLEdBQUksUUFBUztBQUFBLEVBQzNCLGVBQWUsR0FBSSxRQUFTO0FBQUEsRUFDNUIsVUFBVSxHQUFJLFFBQVM7QUFBQSxFQUN2QixnQkFBZ0IsR0FBSSxRQUFTO0FBQUEsRUFDN0IsV0FBVyxHQUFJLFFBQVM7QUFBQSxFQUN4QixnQkFBZ0IsR0FBSSxRQUFTO0FBQUEsRUFDN0IsaUJBQWlCLEdBQUksUUFBUztBQUNsQztBQUdPLElBQU0sV0FBVztBQUFBLEVBQ3BCLGdCQUFnQixHQUFJLFFBQVM7QUFBQSxFQUM3QixhQUFhLEdBQUksUUFBUztBQUM5Qjs7O0FDakNBLHNCQUE0Qjs7O0FDTTVCLFdBQXNCO0FBQ3RCLGFBQXdCO0FBSXhCLElBQU0saUJBQWlCO0FBQ3ZCLElBQU0sc0JBQXNCO0FBQzVCLElBQU0sY0FBYztBQUNwQixJQUFNLGVBQWU7QUFDckIsSUFBTSxjQUFjO0FBQ3BCLElBQU0sY0FBYztBQWdCcEIsSUFBTSxVQUFVLG9CQUFJLElBQW9CO0FBRXhDLFNBQVMsZ0JBQWlCLFNBQTBCO0FBQ2hELFFBQU0sT0FBTyxPQUFP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QUFJO0FBQ2pNLCtCQUFRLGNBQWUsT0FBUTtBQUFBLElBQ25DO0FBQUEsRUFDSjtBQUFBLEVBRUEsU0FBUztBQUFBLElBQ0wsY0FBb0I7QUFDaEIsVUFBSyxDQUFDLFNBQVcsOEJBQXFDO0FBQUEsSUFDMUQ7QUFBQSxJQUNBLGtCQUF3QjtBQUNwQixVQUFLLENBQUMsU0FBVyxrQ0FBeUM7QUFBQSxJQUM5RDtBQUFBLElBQ0EsbUJBQXlCO0FBQ3JCLFVBQUssQ0FBQyxTQUFXLG1DQUEwQztBQUFBLElBQy9EO0FBQUEsSUFDQSxpQkFBdUI7QUFDbkIsVUFBSyxDQUFDLFNBQVcsaUNBQXdDO0FBQUEsSUFDN0Q7QUFBQSxFQUVKO0FBQ0o7IiwKICAibmFtZXMiOiBbImltcG9ydF9lbGVjdHJvbiIsICJsb2ciLCAiaW1wb3J0X2VsZWN0cm9uIiwgInBhdGgiLCAiZnMiLCAicGF0aCIsICJpbXBvcnRfZWxlY3Ryb24iLCAiZnMiLCAicGF0aCIsICJ3aW4iLCAiUEtHX1ZFUlNJT04iLCAid2luIiwgIm1vZGUiXQp9Cg==
