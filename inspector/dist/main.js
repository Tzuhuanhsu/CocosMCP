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
  const onDebuggerMessage = (_event, method, params, sessionId) => send(sessionId ? { method, params, sessionId } : { method, params });
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
    const sessionId = request.sessionId;
    game.debugger.sendCommand(request.method, request.params ?? {}, sessionId).then(
      (result) => send({ id: request.id, result: result ?? {}, sessionId }),
      (error) => send({
        id: request.id,
        error: { code: -32e3, message: String((error == null ? void 0 : error.message) ?? error) },
        sessionId
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL21haW4vbWFpbi50cyIsICIuLi9zcmMvc2hhcmVkL3Byb3RvY29sLnRzIiwgIi4uL3NyYy9tYWluL2RldnRvb2xzLXdpcmluZy50cyIsICIuLi9zcmMvbWFpbi9kZXZ0b29scy1icmlkZ2UudHMiLCAiLi4vc3JjL21haW4vbG9nLnRzIiwgIi4uL3NyYy9tYWluL3dpbmRvdy50cyIsICIuLi9zcmMvbWFpbi9jb25maWcudHMiLCAiLi4vc3JjL21haW4vcnVudGltZS1hcGkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIENvY29zIEluc3BlY3RvciAtIHJ1bnRpbWUgaW5zcGVjdG9yIG1vZHVsZSwgaG9zdGVkIGJ5IHRoZSBjb2Nvcy1tY3Atc2VydmVyIGV4dGVuc2lvbiAobWFpbiBwcm9jZXNzKS5cbi8vIFRoZSBob3N0J3Mgc291cmNlL21haW4udHMgY2FsbHMgbG9hZCgpL3VubG9hZCgpIGFuZCByZS1leHBvcnRzIGBtZXRob2RzYDsgUnVudGltZVRvb2xzIHVzZXMgYHJ1bnRpbWVgLlxuaW1wb3J0IHsgaXBjTWFpbiwgZGlhbG9nLCBhcHAsIE1lbnUsIE1lbnVJdGVtIH0gZnJvbSAnZWxlY3Ryb24nO1xuaW1wb3J0IHR5cGUgeyBJcGNNYWluRXZlbnQsIElwY01haW5JbnZva2VFdmVudCB9IGZyb20gJ2VsZWN0cm9uJztcbmltcG9ydCB7XG4gICAgSXBjU2VuZCwgSXBjSW52b2tlLCBJcGNFdmVudCwgSW5zcGVjdG9yTW9kZSxcbiAgICB0eXBlIE1lbnVJdGVtU3BlYywgdHlwZSBSdW50aW1lU3RhdHVzLCB0eXBlIFJ1bnRpbWVFdmFsUmVzdWx0LCB0eXBlIFJ1bnRpbWVDYXB0dXJlUmVzdWx0LFxuICAgIHR5cGUgUnVudGltZUNvbnNvbGVSZXN1bHQsIHR5cGUgUnVudGltZUNvbnNvbGVMZXZlbCxcbn0gZnJvbSAnQHNoYXJlZC9wcm90b2NvbCc7XG5pbXBvcnQgeyB3aXJlRGV2dG9vbHMsIHNldEdhbWVBdWRpb011dGVkIH0gZnJvbSAnLi9kZXZ0b29scy13aXJpbmcnO1xuaW1wb3J0IHsgdHJ5U2hvd1dpbmRvdywgb3Blbkluc3BlY3RvciwgZ2V0SW5zcGVjdG9yV2luZG93LCBub3RpZnlSZW5kZXJlciB9IGZyb20gJy4vd2luZG93JztcbmltcG9ydCAqIGFzIHJ1bnRpbWVfYXBpIGZyb20gJy4vcnVudGltZS1hcGknO1xuaW1wb3J0IHsgbG9nLCByZXNldExvZ0ZpbGUgfSBmcm9tICcuL2xvZyc7XG5cbi8vIEVkaXRvciBpcyBDb2NvcyBDcmVhdG9yJ3MgZ2xvYmFsIGluIHRoZSBleHRlbnNpb24gaG9zdCBwcm9jZXNzLlxuZGVjbGFyZSBjb25zdCBFZGl0b3I6IHtcbiAgICBTZWxlY3Rpb246IHtcbiAgICAgICAgZ2V0U2VsZWN0ZWQ6ICggdHlwZTogc3RyaW5nICkgPT4gc3RyaW5nW107XG4gICAgICAgIHVuc2VsZWN0OiAoIHR5cGU6IHN0cmluZywgdXVpZHM6IHN0cmluZ1tdICkgPT4gdm9pZDtcbiAgICAgICAgc2VsZWN0OiAoIHR5cGU6IHN0cmluZywgdXVpZDogc3RyaW5nICkgPT4gdm9pZDtcbiAgICB9O1xuICAgIE1lc3NhZ2U6IHsgYnJvYWRjYXN0OiAoIG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdICkgPT4gdm9pZCB9O1xufTtcblxuY29uc3QgUEtHX1ZFUlNJT046IHN0cmluZyA9IF9fUEtHX1ZFUlNJT05fXztcblxubGV0IHVubG9hZGVkID0gZmFsc2U7XG5cbmZ1bmN0aW9uIGZvY3VzTm9kZSggX2V2ZW50OiBJcGNNYWluRXZlbnQsIHV1aWQ6IHN0cmluZyApOiB2b2lkIHtcbiAgICBjb25zdCBzZWxlY3RlZCA9IEVkaXRvci5TZWxlY3Rpb24uZ2V0U2VsZWN0ZWQoICdub2RlJyApO1xuICAgIEVkaXRvci5TZWxlY3Rpb24udW5zZWxlY3QoICdub2RlJywgc2VsZWN0ZWQgKTtcbiAgICBFZGl0b3IuU2VsZWN0aW9uLnNlbGVjdCggJ25vZGUnLCB1dWlkICk7XG59XG5cbmZ1bmN0aW9uIGZvY3VzQXNzZXQoIF9ldmVudDogSXBjTWFpbkV2ZW50LCB1dWlkOiBzdHJpbmcgKTogdm9pZCB7XG4gICAgRWRpdG9yLk1lc3NhZ2UuYnJvYWRjYXN0KCAndWkta2l0OnRvdWNoLWFzc2V0JywgdXVpZCApO1xuICAgIGNvbnN0IHNlbGVjdGVkID0gRWRpdG9yLlNlbGVjdGlvbi5nZXRTZWxlY3RlZCggJ2Fzc2V0JyApO1xuICAgIEVkaXRvci5TZWxlY3Rpb24udW5zZWxlY3QoICdhc3NldCcsIHNlbGVjdGVkICk7XG4gICAgRWRpdG9yLlNlbGVjdGlvbi5zZWxlY3QoICdhc3NldCcsIHV1aWQgKTtcbn1cblxuZnVuY3Rpb24gYnVpbGRNZW51KCBpdGVtczogTWVudUl0ZW1TcGVjW10sIG9uQ2xpY2s6ICggaWQ6IHN0cmluZyB8IG51bGwgKSA9PiB2b2lkICk6IEVsZWN0cm9uLk1lbnUge1xuICAgIGNvbnN0IG1lbnUgPSBuZXcgTWVudSgpO1xuICAgIGZvciAoIGNvbnN0IGl0ZW0gb2YgaXRlbXMgKSB7XG4gICAgICAgIG1lbnUuYXBwZW5kKCBuZXcgTWVudUl0ZW0oIHtcbiAgICAgICAgICAgIGxhYmVsOiBpdGVtLmxhYmVsID8/ICcnLFxuICAgICAgICAgICAgdHlwZTogaXRlbS5zdWJtZW51ID8gJ3N1Ym1lbnUnIDogKCBpdGVtLnR5cGUgPz8gJ25vcm1hbCcgKSxcbiAgICAgICAgICAgIGNoZWNrZWQ6IGl0ZW0uY2hlY2tlZCxcbiAgICAgICAgICAgIGVuYWJsZWQ6IGl0ZW0uZW5hYmxlZCAhPT0gZmFsc2UsXG4gICAgICAgICAgICBzdWJtZW51OiBpdGVtLnN1Ym1lbnUgPyBidWlsZE1lbnUoIGl0ZW0uc3VibWVudSwgb25DbGljayApIDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgY2xpY2s6IGl0ZW0uc3VibWVudSA/IHVuZGVmaW5lZCA6ICgpID0+IG9uQ2xpY2soIGl0ZW0uaWQgPz8gaXRlbS5sYWJlbCA/PyBudWxsICksXG4gICAgICAgIH0gKSApO1xuICAgIH1cbiAgICByZXR1cm4gbWVudTtcbn1cblxuLyoqIFNob3dzIGEgbmF0aXZlIGNvbnRleHQgbWVudSBvbiB0aGUgaW5zcGVjdG9yIHdpbmRvdzsgcmVzb2x2ZXMgd2l0aCB0aGUgY2xpY2tlZCBpdGVtIGlkLiAqL1xuZnVuY3Rpb24gc2hvd0NvbnRleHRNZW51KCBfZXZlbnQ6IElwY01haW5JbnZva2VFdmVudCwgaXRlbXM6IE1lbnVJdGVtU3BlY1tdICk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSggKCByZXNvbHZlICkgPT4ge1xuICAgICAgICBjb25zdCB3aW4gPSBnZXRJbnNwZWN0b3JXaW5kb3coKTtcbiAgICAgICAgaWYgKCAhd2luICkgcmV0dXJuIHJlc29sdmUoIG51bGwgKTtcbiAgICAgICAgbGV0IGNsaWNrZWRJZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgIGNvbnN0IG1lbnUgPSBidWlsZE1lbnUoIGl0ZW1zLCAoIGlkICkgPT4geyBjbGlja2VkSWQgPSBpZDsgfSApO1xuICAgICAgICBtZW51LnBvcHVwKCB7IHdpbmRvdzogd2luLCBjYWxsYmFjazogKCkgPT4gcmVzb2x2ZSggY2xpY2tlZElkICkgfSApO1xuICAgIH0gKTtcbn1cblxuLyoqIEFwcGxpZXMgd2luZG93IHNpemluZy9kZWNvcmF0aW9uIHJ1bGVzIHdoZW4gdGhlIGluc3BlY3RvciBlbnRlcnMgb3IgbGVhdmVzIG1pbmkgbW9kZS4gKi9cbmZ1bmN0aW9uIHN5bmNXaW5kb3dNb2RlKCBfZXZlbnQ6IElwY01haW5JbnZva2VFdmVudCwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIHNpbXBsZU1vZGU6IGJvb2xlYW4sIG1pbkhlaWdodEV4dHJhOiBudW1iZXIgKTogdm9pZCB7XG4gICAgY29uc3Qgd2luID0gZ2V0SW5zcGVjdG9yV2luZG93KCk7XG4gICAgaWYgKCAhd2luICkgcmV0dXJuO1xuICAgIGlmICggc2ltcGxlTW9kZSApIHtcbiAgICAgICAgaWYgKCB3aW4uaXNNYXhpbWl6ZWQoKSApIHdpbi51bm1heGltaXplKCk7XG4gICAgICAgIGlmICggd2luLmlzRnVsbFNjcmVlbigpICkgd2luLnNldEZ1bGxTY3JlZW4oIGZhbHNlICk7XG4gICAgICAgIHdpbi5zZXRNaW5pbXVtU2l6ZSggd2lkdGgsIGhlaWdodCApO1xuICAgICAgICB3aW4uc2V0TWluaW1pemFibGUoIGZhbHNlICk7XG4gICAgICAgIHdpbi5zZXRSZXNpemFibGUoIGZhbHNlICk7XG4gICAgICAgIHdpbi5zZXRNYXhpbWl6YWJsZSggZmFsc2UgKTtcbiAgICAgICAgd2luLnNldENvbnRlbnRTaXplKCB3aWR0aCwgaGVpZ2h0ICk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgd2luLnNldE1pbmltaXphYmxlKCB0cnVlICk7XG4gICAgICAgIHdpbi5zZXRSZXNpemFibGUoIHRydWUgKTtcbiAgICAgICAgd2luLnNldE1heGltaXphYmxlKCB0cnVlICk7XG4gICAgICAgIHdpbi5zZXRNaW5pbXVtU2l6ZSggd2lkdGgsIGhlaWdodCArIG1pbkhlaWdodEV4dHJhICk7XG4gICAgICAgIGNvbnN0IGN1cnJlbnQgPSB3aW4uZ2V0Q29udGVudFNpemUoKTtcbiAgICAgICAgd2luLnNldENvbnRlbnRTaXplKCBNYXRoLm1heCggd2lkdGgsIGN1cnJlbnRbIDAgXSApLCBNYXRoLm1heCggaGVpZ2h0LCBjdXJyZW50WyAxIF0gKSApO1xuICAgIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gc2hvd09wZW5EaWFsb2coIF9ldmVudDogSXBjTWFpbkludm9rZUV2ZW50LCBleHRlbnNpb25zOiBzdHJpbmdbXSApOiBQcm9taXNlPHN0cmluZ1tdIHwgbnVsbD4ge1xuICAgIGNvbnN0IHdpbiA9IGdldEluc3BlY3RvcldpbmRvdygpO1xuICAgIGlmICggIXdpbiApIHJldHVybiBudWxsO1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRpYWxvZy5zaG93T3BlbkRpYWxvZyggd2luLCB7XG4gICAgICAgIHByb3BlcnRpZXM6IFsgJ29wZW5GaWxlJyBdLFxuICAgICAgICBmaWx0ZXJzOiBbIHsgbmFtZTogJ2ZpbGVzJywgZXh0ZW5zaW9ucyB9IF0sXG4gICAgfSApO1xuICAgIHJldHVybiByZXN1bHQuY2FuY2VsZWQgPyBudWxsIDogcmVzdWx0LmZpbGVQYXRocztcbn1cblxuLyoqXG4gKiBJbi1wcm9jZXNzIHJ1bnRpbWUgQVBJIGNvbnN1bWVkIGJ5IHRoZSBNQ1AgUnVudGltZVRvb2xzIChzYW1lIGV4dGVuc2lvbiwgbm8gSVBDIGhvcCkuXG4gKiBFdmVyeSBjYWxsIHJldHVybnMgcGxhaW4gZGF0YTsgZmFpbHVyZXMgY29tZSBiYWNrIGFzIHsgb2s6IGZhbHNlLCBlcnJvciB9LlxuICovXG5jb25zdCBydW50aW1lID0ge1xuICAgIHN0YXR1cygpOiBSdW50aW1lU3RhdHVzIHtcbiAgICAgICAgcmV0dXJuIHJ1bnRpbWVfYXBpLmdldFN0YXR1cygpO1xuICAgIH0sXG4gICAgYXN5bmMgb3BlbiggbW9kZTogSW5zcGVjdG9yTW9kZSA9IEluc3BlY3Rvck1vZGUuUHJldmlldyApOiBQcm9taXNlPFJ1bnRpbWVTdGF0dXM+IHtcbiAgICAgICAgaWYgKCAhdW5sb2FkZWQgKSBhd2FpdCBvcGVuSW5zcGVjdG9yKCBtb2RlICk7XG4gICAgICAgIHJldHVybiBydW50aW1lX2FwaS5nZXRTdGF0dXMoKTtcbiAgICB9LFxuICAgIGV2YWwoIGNvZGU6IHN0cmluZyApOiBQcm9taXNlPFJ1bnRpbWVFdmFsUmVzdWx0PiB7XG4gICAgICAgIHJldHVybiBydW50aW1lX2FwaS5ldmFsSW5HYW1lKCBjb2RlICk7XG4gICAgfSxcbiAgICBjYXB0dXJlKCBvdXRQYXRoOiBzdHJpbmcgKTogUHJvbWlzZTxSdW50aW1lQ2FwdHVyZVJlc3VsdD4ge1xuICAgICAgICByZXR1cm4gcnVudGltZV9hcGkuY2FwdHVyZSggb3V0UGF0aCApO1xuICAgIH0sXG4gICAgY29uc29sZSggc2luY2VTZXEgPSAwLCBsZXZlbD86IFJ1bnRpbWVDb25zb2xlTGV2ZWwgfCAnYWxsJyApOiBSdW50aW1lQ29uc29sZVJlc3VsdCB7XG4gICAgICAgIHJldHVybiBydW50aW1lX2FwaS5yZWFkQ29uc29sZSggTnVtYmVyKCBzaW5jZVNlcSApIHx8IDAsIGxldmVsICk7XG4gICAgfSxcbiAgICBjbGVhckNvbnNvbGUoKTogUnVudGltZUNvbnNvbGVSZXN1bHQge1xuICAgICAgICByZXR1cm4gcnVudGltZV9hcGkuY2xlYXJDb25zb2xlKCk7XG4gICAgfSxcbn07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIHJ1bnRpbWUsXG4gICAgYXN5bmMgbG9hZCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgcmVzZXRMb2dGaWxlKCk7XG4gICAgICAgIGxvZyggYG1haW4gbG9hZGVkICh2JHsgUEtHX1ZFUlNJT04gfSlgLCB7IGVsZWN0cm9uOiBwcm9jZXNzLnZlcnNpb25zLmVsZWN0cm9uIH0gKTtcbiAgICAgICAgaXBjTWFpbi5vbiggSXBjU2VuZC5mb2N1c05vZGUsIGZvY3VzTm9kZSApO1xuICAgICAgICBpcGNNYWluLm9uKCBJcGNTZW5kLmZvY3VzQXNzZXQsIGZvY3VzQXNzZXQgKTtcbiAgICAgICAgaXBjTWFpbi5oYW5kbGUoIElwY0ludm9rZS53aXJlRGV2dG9vbHMsICggX2V2ZW50LCBnYW1lV2NJZDogbnVtYmVyLCBkZXZ0b29sc1djSWQ6IG51bWJlciApID0+XG4gICAgICAgICAgICB3aXJlRGV2dG9vbHMoIGdhbWVXY0lkLCBkZXZ0b29sc1djSWQsICgpID0+IG5vdGlmeVJlbmRlcmVyKCBJcGNFdmVudC5kZWJ1Z2dlclBhdXNlZCApICkgKTtcbiAgICAgICAgaXBjTWFpbi5oYW5kbGUoIElwY0ludm9rZS5zZXRBdWRpb011dGVkLCAoIF9ldmVudCwgZ2FtZVdjSWQ6IG51bWJlciwgbXV0ZWQ6IGJvb2xlYW4gKSA9PlxuICAgICAgICAgICAgc2V0R2FtZUF1ZGlvTXV0ZWQoIGdhbWVXY0lkLCBtdXRlZCApICk7XG4gICAgICAgIGlwY01haW4uaGFuZGxlKCBJcGNJbnZva2Uuc2hvd01lbnUsIHNob3dDb250ZXh0TWVudSApO1xuICAgICAgICBpcGNNYWluLmhhbmRsZSggSXBjSW52b2tlLnNob3dPcGVuRGlhbG9nLCBzaG93T3BlbkRpYWxvZyApO1xuICAgICAgICBpcGNNYWluLmhhbmRsZSggSXBjSW52b2tlLmdldExvY2FsZSwgKCkgPT4gYXBwLmdldExvY2FsZSgpICk7XG4gICAgICAgIGlwY01haW4uaGFuZGxlKCBJcGNJbnZva2Uuc3luY1dpbmRvd01vZGUsIHN5bmNXaW5kb3dNb2RlICk7XG4gICAgICAgIGlwY01haW4uaGFuZGxlKCBJcGNJbnZva2Uub3BlbkFwcERldnRvb2xzLCAoKSA9PiBnZXRJbnNwZWN0b3JXaW5kb3coKT8ud2ViQ29udGVudHMub3BlbkRldlRvb2xzKCkgKTtcbiAgICB9LFxuXG4gICAgdW5sb2FkKCk6IHZvaWQge1xuICAgICAgICB1bmxvYWRlZCA9IHRydWU7XG4gICAgICAgIGlwY01haW4ucmVtb3ZlQWxsTGlzdGVuZXJzKCBJcGNTZW5kLmZvY3VzTm9kZSApO1xuICAgICAgICBpcGNNYWluLnJlbW92ZUFsbExpc3RlbmVycyggSXBjU2VuZC5mb2N1c0Fzc2V0ICk7XG4gICAgICAgIGZvciAoIGNvbnN0IGNoYW5uZWwgb2YgWyBJcGNJbnZva2Uud2lyZURldnRvb2xzLCBJcGNJbnZva2Uuc2V0QXVkaW9NdXRlZCwgSXBjSW52b2tlLnNob3dNZW51LCBJcGNJbnZva2Uuc2hvd09wZW5EaWFsb2csIElwY0ludm9rZS5nZXRMb2NhbGUsIElwY0ludm9rZS5zeW5jV2luZG93TW9kZSwgSXBjSW52b2tlLm9wZW5BcHBEZXZ0b29scyBdICkge1xuICAgICAgICAgICAgaXBjTWFpbi5yZW1vdmVIYW5kbGVyKCBjaGFubmVsICk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgbWV0aG9kczoge1xuICAgICAgICBwcmV2aWV3TW9kZSgpOiB2b2lkIHtcbiAgICAgICAgICAgIGlmICggIXVubG9hZGVkICkgdHJ5U2hvd1dpbmRvdyggSW5zcGVjdG9yTW9kZS5QcmV2aWV3ICk7XG4gICAgICAgIH0sXG4gICAgICAgIGJ1aWxkTW9iaWxlTW9kZSgpOiB2b2lkIHtcbiAgICAgICAgICAgIGlmICggIXVubG9hZGVkICkgdHJ5U2hvd1dpbmRvdyggSW5zcGVjdG9yTW9kZS5CdWlsZE1vYmlsZSApO1xuICAgICAgICB9LFxuICAgICAgICBidWlsZERlc2t0b3BNb2RlKCk6IHZvaWQge1xuICAgICAgICAgICAgaWYgKCAhdW5sb2FkZWQgKSB0cnlTaG93V2luZG93KCBJbnNwZWN0b3JNb2RlLkJ1aWxkRGVza3RvcCApO1xuICAgICAgICB9LFxuICAgICAgICBvcGVuQ3VzdG9tUGFnZSgpOiB2b2lkIHtcbiAgICAgICAgICAgIGlmICggIXVubG9hZGVkICkgdHJ5U2hvd1dpbmRvdyggSW5zcGVjdG9yTW9kZS5DdXN0b21QYWdlICk7XG4gICAgICAgIH0sXG5cbiAgICB9LFxufTtcbiIsICIvLyBNZXNzYWdlIHByb3RvY29sIHNoYXJlZCBiZXR3ZWVuIHRoZSBleHRlbnNpb24gbWFpbiBwcm9jZXNzLCB0aGUgaW5zcGVjdG9yIHJlbmRlcmVyLFxuLy8gdGhlIGdhbWUtd2VidmlldyBwcmVsb2FkLCBhbmQgdGhlIGluamVjdGVkIHByb2JlIHNjcmlwdC5cblxuLyoqIEhvc3QgZXh0ZW5zaW9uIHBhY2thZ2UgbmFtZSAodGhlIGluc3BlY3RvciBzaGlwcyBpbnNpZGUgY29jb3MtbWNwLXNlcnZlcik7IGV2ZXJ5IElQQyBjaGFubmVsIGlzIHByZWZpeGVkIHdpdGggaXQuICovXG5leHBvcnQgY29uc3QgUEtHX05BTUUgPSAnY29jb3MtbWNwLXNlcnZlcic7XG5cbi8qKiBXaW5kb3cgb3BlbiBtb2RlcyB0cmlnZ2VyZWQgZnJvbSB0aGUgQ3JlYXRvciBleHRlbnNpb24gbWVudS4gKi9cbmV4cG9ydCBlbnVtIEluc3BlY3Rvck1vZGUge1xuICAgIFByZXZpZXcgPSAwLFxuICAgIEJ1aWxkTW9iaWxlID0gMSxcbiAgICBDdXN0b21QYWdlID0gMixcbiAgICBCdWlsZERlc2t0b3AgPSAzLFxufVxuXG4vKiogcmVuZGVyZXIgLT4gbWFpbiAoaXBjUmVuZGVyZXIuc2VuZCkuICovXG5leHBvcnQgY29uc3QgSXBjU2VuZCA9IHtcbiAgICBmb2N1c05vZGU6IGAkeyBQS0dfTkFNRSB9OmZvY3VzTm9kZWAsXG4gICAgZm9jdXNBc3NldDogYCR7IFBLR19OQU1FIH06Zm9jdXNBc3NldGAsXG59IGFzIGNvbnN0O1xuXG4vKiogcmVuZGVyZXIgLT4gbWFpbiAoaXBjUmVuZGVyZXIuaW52b2tlKS4gKi9cbmV4cG9ydCBjb25zdCBJcGNJbnZva2UgPSB7XG4gICAgd2lyZURldnRvb2xzOiBgJHsgUEtHX05BTUUgfTp3aXJlLWRldnRvb2xzYCxcbiAgICBzZXRBdWRpb011dGVkOiBgJHsgUEtHX05BTUUgfTpzZXQtYXVkaW8tbXV0ZWRgLFxuICAgIHNob3dNZW51OiBgJHsgUEtHX05BTUUgfTpzaG93LW1lbnVgLFxuICAgIHNob3dPcGVuRGlhbG9nOiBgJHsgUEtHX05BTUUgfTpzaG93LW9wZW4tZGlhbG9nYCxcbiAgICBnZXRMb2NhbGU6IGAkeyBQS0dfTkFNRSB9OmdldC1sb2NhbGVgLFxuICAgIHN5bmNXaW5kb3dNb2RlOiBgJHsgUEtHX05BTUUgfTpzeW5jLXdpbmRvdy1tb2RlYCxcbiAgICBvcGVuQXBwRGV2dG9vbHM6IGAkeyBQS0dfTkFNRSB9Om9wZW4tYXBwLWRldnRvb2xzYCxcbn0gYXMgY29uc3Q7XG5cbi8qKiBtYWluIC0+IHJlbmRlcmVyICh3ZWJDb250ZW50cy5zZW5kKS4gKi9cbmV4cG9ydCBjb25zdCBJcGNFdmVudCA9IHtcbiAgICBkZWJ1Z2dlclBhdXNlZDogYCR7IFBLR19OQU1FIH06ZGVidWdnZXItcGF1c2VkYCxcbiAgICBtZW51Q2xpY2tlZDogYCR7IFBLR19OQU1FIH06bWVudS1jbGlja2VkYCxcbn0gYXMgY29uc3Q7XG5cbmV4cG9ydCBpbnRlcmZhY2UgV2lyZURldnRvb2xzUmVzdWx0IHtcbiAgICBvazogYm9vbGVhbjtcbiAgICBlcnJvcj86IHN0cmluZztcbiAgICBtdXRlZD86IGJvb2xlYW47XG59XG5cbi8qKiBPbmUgZW50cnkgb2YgYSBjb250ZXh0IG1lbnUgcmVxdWVzdGVkIGJ5IHRoZSByZW5kZXJlci4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgTWVudUl0ZW1TcGVjIHtcbiAgICBpZD86IHN0cmluZztcbiAgICBsYWJlbD86IHN0cmluZztcbiAgICB0eXBlPzogJ25vcm1hbCcgfCAnc2VwYXJhdG9yJyB8ICdjaGVja2JveCc7XG4gICAgY2hlY2tlZD86IGJvb2xlYW47XG4gICAgZW5hYmxlZD86IGJvb2xlYW47XG4gICAgc3VibWVudT86IE1lbnVJdGVtU3BlY1tdO1xufVxuXG4vKipcbiAqIENoYW5uZWxzIHVzZWQgYnkgdGhlIGdhbWUtd2VidmlldyBwcmVsb2FkOiB0aGUgaW5qZWN0ZWQgcHJvYmUgY2FsbHMgdGhlIG1hdGNoaW5nIGdsb2JhbFxuICogZnVuY3Rpb24sIHRoZSBwcmVsb2FkIGZvcndhcmRzIGl0IHRvIHRoZSBpbnNwZWN0b3IgcmVuZGVyZXIgdmlhIGlwY1JlbmRlcmVyLnNlbmRUb0hvc3QuXG4gKi9cbmV4cG9ydCBjb25zdCBIb3N0Q2hhbm5lbCA9IHtcbiAgICBnYW1lU3RhdGU6ICdnYW1lU3RhdGUnLFxuICAgIGxvY2F0ZU5vZGU6ICdsb2NhdGVOb2RlJyxcbiAgICBjb25zb2xlTG9nOiAnY29uc29sZUxvZycsXG4gICAgY29uc29sZUVycm9yOiAnY29uc29sZUVycm9yJyxcbiAgICBjb25zb2xlV2FybjogJ2NvbnNvbGVXYXJuJyxcbiAgICB1cGRhdGVUcmVlOiAndXBkYXRlVHJlZScsXG4gICAgc2hvd05vZGVEZXRhaWw6ICdzaG93Tm9kZURldGFpbCcsXG4gICAgc2VuZFN0YXRpc3RpYzogJ3NlbmRTdGF0aXN0aWMnLFxuICAgIGNhblVwZGF0ZVRyZWU6ICdjYW5VcGRhdGVUcmVlJyxcbn0gYXMgY29uc3Q7XG5cbi8qKiBQZXJzaXN0ZWQgaW5zcGVjdG9yIHNldHRpbmdzIChleHRlbnNpb25zL2NvY29zLWluc3BlY3Rvci1jb25maWcuanNvbikuICovXG5leHBvcnQgaW50ZXJmYWNlIEluc3BlY3RvckNvbmZpZyB7XG4gICAgbG9nQ291bnQ6IG51bWJlciB8IHN0cmluZztcbiAgICByZXRpbmFFbmFibGU6IGJvb2xlYW47XG4gICAgYXV0b1VwZGF0ZVRyZWU6IGJvb2xlYW47XG4gICAgZGlzcGxheUFzRmFpcnlUcmVlPzogYm9vbGVhbjtcbiAgICBoaWRlRmFpcnlDb21Db250YWluZXI/OiBib29sZWFuO1xuICAgIHN5bmNOb2RlRGV0YWlsPzogYm9vbGVhbjtcbiAgICBkaXNhYmxlV2ViU2VjPzogYm9vbGVhbjtcbiAgICBzaG93RGV2VG9vbEluVGFiPzogYm9vbGVhbjtcbiAgICBzaXplOiBbIG51bWJlciwgbnVtYmVyIF07XG4gICAgZXh0cmFTaXplcz86IHVua25vd25bXTtcbiAgICBpc1BvcnRyYWl0OiBib29sZWFuO1xuICAgIHNob3c6IGJvb2xlYW47XG4gICAgdXJsUGFyYW1zPzogc3RyaW5nO1xuICAgIGN1c3RvbVVybD86IHN0cmluZztcbiAgICBjbGVhckxvZ0FmdGVyUmVmcmVzaD86IGJvb2xlYW47XG4gICAgZXh0ZW5zaW9uRmlsZT86IHN0cmluZztcbiAgICBlbmFibGVFeHRlbnNpb24/OiBib29sZWFuO1xuICAgIHN0YXRpc3RpY2luZz86IGJvb2xlYW47XG4gICAgc3RhdGlzdGljcz86IHVua25vd247XG4gICAgc29ydENvbXBQcm9wZXJ0aWVzPzogUmVjb3JkPHN0cmluZywgYm9vbGVhbj47XG4gICAgc2ltcGxlTW9kZT86IGJvb2xlYW47XG4gICAgLyoqIHRydWUgKGRlZmF1bHQpOiBnYW1lIHZpZXcgZm9sbG93cyB0aGUgcHJvamVjdCBkZXNpZ24gcmVzb2x1dGlvbjsgZmFsc2U6IHVzZXItcGlja2VkIHNpemUgKi9cbiAgICBtYXRjaERlc2lnbj86IGJvb2xlYW47XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gUnVudGltZSBBUEkgZXhwb3NlZCB0byBvdGhlciBleHRlbnNpb25zIHRocm91Z2ggRWRpdG9yLk1lc3NhZ2UgKHBhY2thZ2UuanNvbiBcInJ1bnRpbWUtKlwiKS5cbi8vIFBheWxvYWRzIG11c3Qgc3RheSBKU09OLXNlcmlhbGl6YWJsZTogdGhleSBjcm9zcyB0aGUgQ3JlYXRvciBJUEMgYm91bmRhcnkuXG5cbmV4cG9ydCB0eXBlIFJ1bnRpbWVDb25zb2xlTGV2ZWwgPSAndmVyYm9zZScgfCAnaW5mbycgfCAnd2FybmluZycgfCAnZXJyb3InO1xuXG5leHBvcnQgaW50ZXJmYWNlIFJ1bnRpbWVTdGF0dXMge1xuICAgIHdpbmRvd09wZW46IGJvb2xlYW47XG4gICAgZ2FtZVJlYWR5OiBib29sZWFuO1xuICAgIGdhbWVVcmw6IHN0cmluZyB8IG51bGw7XG4gICAgcHJldmlld1BvcnQ6IG51bWJlciB8IG51bGw7XG4gICAgY29uc29sZVNlcTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJ1bnRpbWVFdmFsUmVzdWx0IHtcbiAgICBvazogYm9vbGVhbjtcbiAgICB2YWx1ZT86IHVua25vd247XG4gICAgZXJyb3I/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUnVudGltZUNvbnNvbGVFbnRyeSB7XG4gICAgc2VxOiBudW1iZXI7XG4gICAgdDogbnVtYmVyO1xuICAgIGxldmVsOiBSdW50aW1lQ29uc29sZUxldmVsO1xuICAgIG1lc3NhZ2U6IHN0cmluZztcbiAgICBsaW5lOiBudW1iZXI7XG4gICAgc291cmNlSWQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSdW50aW1lQ29uc29sZVJlc3VsdCB7XG4gICAgb2s6IGJvb2xlYW47XG4gICAgZW50cmllczogUnVudGltZUNvbnNvbGVFbnRyeVtdO1xuICAgIGxhdGVzdFNlcTogbnVtYmVyO1xuICAgIGVycm9yPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJ1bnRpbWVDYXB0dXJlUmVzdWx0IHtcbiAgICBvazogYm9vbGVhbjtcbiAgICBwYXRoPzogc3RyaW5nO1xuICAgIHdpZHRoPzogbnVtYmVyO1xuICAgIGhlaWdodD86IG51bWJlcjtcbiAgICBieXRlcz86IG51bWJlcjtcbiAgICBlcnJvcj86IHN0cmluZztcbn1cbiIsICIvLyBJUEMgaGFuZGxlcnMgdGhhdCBvcGVyYXRlIG9uIHRoZSBnYW1lIHdlYnZpZXcncyB3ZWJDb250ZW50cyBmcm9tIHRoZSBtYWluIHByb2Nlc3MsXG4vLyBzbyB0aGUgcmVuZGVyZXIgbmV2ZXIgbmVlZHMgdGhlIGRlcHJlY2F0ZWQgYHJlbW90ZWAgbW9kdWxlLlxuaW1wb3J0IHsgd2ViQ29udGVudHMgfSBmcm9tICdlbGVjdHJvbic7XG5pbXBvcnQgdHlwZSB7IFdlYkNvbnRlbnRzIH0gZnJvbSAnZWxlY3Ryb24nO1xuaW1wb3J0IHsgc3RhcnREZXZ0b29sc0JyaWRnZSwgYnJpZGdlRnJvbnRlbmRVcmwgfSBmcm9tICcuL2RldnRvb2xzLWJyaWRnZSc7XG5pbXBvcnQgeyBJcGNFdmVudCwgdHlwZSBXaXJlRGV2dG9vbHNSZXN1bHQgfSBmcm9tICdAc2hhcmVkL3Byb3RvY29sJztcbmltcG9ydCB7IGxvZyB9IGZyb20gJy4vbG9nJztcblxuaW50ZXJmYWNlIEdhbWVXZWJDb250ZW50cyBleHRlbmRzIFdlYkNvbnRlbnRzIHtcbiAgICBfX2luc3BlY3RvcldpcmVkPzogYm9vbGVhbjtcbiAgICBfX2luc3BlY3RvcldhdGNoZXI/OiBib29sZWFuO1xufVxuXG50eXBlIFBhdXNlZE5vdGlmaWVyID0gKCkgPT4gdm9pZDtcblxuLyoqXG4gKiBXYXRjaGVzIHRoZSBnYW1lJ3MgZGVidWdnZXIgc2Vzc2lvbiBmb3IgRGVidWdnZXIucGF1c2VkIHNvIHRoZSBpbnNwZWN0b3IgY2FuIGF1dG8tc3dpdGNoIHRvXG4gKiB0aGUgRGV2VG9vbCB0YWIsIGFuZCBrZWVwcyB0aGUgXCJQYXVzZWQgaW4gZGVidWdnZXJcIiBvdmVybGF5IGZyb20gY292ZXJpbmcgdGhlIGdhbWUgdmlldy5cbiAqL1xuZnVuY3Rpb24gZW5zdXJlUGF1c2VkV2F0Y2hlciggZ2FtZTogR2FtZVdlYkNvbnRlbnRzLCBkZXZ0b29sc1ZpZXc6IFdlYkNvbnRlbnRzLCBub3RpZnlQYXVzZWQ6IFBhdXNlZE5vdGlmaWVyICk6IHZvaWQge1xuICAgIGlmICggZ2FtZS5fX2luc3BlY3RvcldhdGNoZXIgKSByZXR1cm47XG4gICAgZ2FtZS5fX2luc3BlY3RvcldhdGNoZXIgPSB0cnVlO1xuICAgIGlmICggIWdhbWUuZGVidWdnZXIuaXNBdHRhY2hlZCgpICkgZ2FtZS5kZWJ1Z2dlci5hdHRhY2goKTtcbiAgICBnYW1lLmRlYnVnZ2VyLm9uKCAnbWVzc2FnZScsICggX2V2ZW50LCBtZXRob2QgKSA9PiB7XG4gICAgICAgIGlmICggbWV0aG9kICE9PSAnRGVidWdnZXIucGF1c2VkJyApIHJldHVybjtcbiAgICAgICAgbm90aWZ5UGF1c2VkKCk7XG4gICAgICAgIHZvaWQgZGlzYWJsZVBhdXNlZE92ZXJsYXkoIGRldnRvb2xzVmlldyApO1xuICAgIH0gKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZGlzYWJsZVBhdXNlZE92ZXJsYXkoIGRldnRvb2xzVmlldzogV2ViQ29udGVudHMgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgb3ZlcmxheURpc2FibGVkID0gYXdhaXQgZGV2dG9vbHNWaWV3LmV4ZWN1dGVKYXZhU2NyaXB0KFxuICAgICAgICAgICAgXCJDb21tb24uc2V0dGluZ3MubW9kdWxlU2V0dGluZygnZGlzYWJsZVBhdXNlZFN0YXRlT3ZlcmxheScpLmdldCgpXCJcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKCAhb3ZlcmxheURpc2FibGVkICkge1xuICAgICAgICAgICAgYXdhaXQgZGV2dG9vbHNWaWV3LmV4ZWN1dGVKYXZhU2NyaXB0KFxuICAgICAgICAgICAgICAgIFwiQ29tbW9uLnNldHRpbmdzLm1vZHVsZVNldHRpbmcoJ2Rpc2FibGVQYXVzZWRTdGF0ZU92ZXJsYXknKS5zZXQodHJ1ZSlcIlxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2gge1xuICAgICAgICAvLyBkZXZ0b29scyBmcm9udGVuZCBpbnRlcm5hbHMgbWF5IGNoYW5nZSBiZXR3ZWVuIHZlcnNpb25zOyB0aGUgb3ZlcmxheSB0d2VhayBpcyBvcHRpb25hbFxuICAgIH1cbn1cblxuLyoqXG4gKiBMb2FkcyB0aGUgRGV2VG9vbHMgZnJvbnRlbmQgaW50byB0aGUgZGV2dG9vbHMgd2VidmlldyBhbmQgY29ubmVjdHMgaXQgdG8gdGhlIGdhbWUgcGFnZS5cbiAqIElkZW1wb3RlbnQ6IHJlcGVhdGVkIGNhbGxzIHdoaWxlIHdpcmVkIGFyZSBuby1vcHMgKHJlLXdpcmluZyByZWxvYWRzIHRoZSBmcm9udGVuZCBhbmQgbWFrZXNcbiAqIGl0IG1pc3MgdGhlIGJvb3QtdGltZSBsb2dzOyByZXBlYXRlZCBzZXREZXZUb29sc1dlYkNvbnRlbnRzIGNvcnJ1cHRzIHRoZSBiaW5kaW5nIGVudGlyZWx5KS5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdpcmVEZXZ0b29scyhcbiAgICBnYW1lV2NJZDogbnVtYmVyLFxuICAgIGRldnRvb2xzV2NJZDogbnVtYmVyLFxuICAgIG5vdGlmeVBhdXNlZDogUGF1c2VkTm90aWZpZXJcbik6IFByb21pc2U8V2lyZURldnRvb2xzUmVzdWx0PiB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgZ2FtZSA9IHdlYkNvbnRlbnRzLmZyb21JZCggZ2FtZVdjSWQgKSBhcyBHYW1lV2ViQ29udGVudHMgfCBudWxsO1xuICAgICAgICBjb25zdCBkZXZ0b29sc1ZpZXcgPSB3ZWJDb250ZW50cy5mcm9tSWQoIGRldnRvb2xzV2NJZCApO1xuICAgICAgICBpZiAoICFnYW1lIHx8ICFkZXZ0b29sc1ZpZXcgKSB7XG4gICAgICAgICAgICBsb2coICd3aXJlLWRldnRvb2xzOiB3ZWJDb250ZW50cyBub3QgZm91bmQnLCB7IGdhbWVXY0lkLCBkZXZ0b29sc1djSWQgfSApO1xuICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogYHdlYkNvbnRlbnRzIG5vdCBmb3VuZCAoZ2FtZT0keyBnYW1lV2NJZCB9LCBkZXZ0b29scz0keyBkZXZ0b29sc1djSWQgfSlgIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZ2FtZVVybCA9IFN0cmluZyggZ2FtZS5nZXRVUkwoKSApO1xuICAgICAgICBpZiAoICEvXihodHRwcz98ZmlsZSk6Ly50ZXN0KCBnYW1lVXJsICkgKSB7XG4gICAgICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiAnZ2FtZSBwYWdlIG5vdCBsb2FkZWQgeWV0JyB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGFscmVhZHlXaXJlZCA9IEJvb2xlYW4oIGdhbWUuX19pbnNwZWN0b3JXaXJlZCApICYmIFN0cmluZyggZGV2dG9vbHNWaWV3LmdldFVSTCgpICkuc3RhcnRzV2l0aCggJ2RldnRvb2xzOi8vJyApO1xuICAgICAgICBpZiAoICFhbHJlYWR5V2lyZWQgKSB7XG4gICAgICAgICAgICBjb25zdCBwb3J0ID0gYXdhaXQgc3RhcnREZXZ0b29sc0JyaWRnZSggZ2FtZSwgbG9nICk7XG4gICAgICAgICAgICBjb25zdCBmcm9udGVuZFVybCA9IGJyaWRnZUZyb250ZW5kVXJsKCBwb3J0ICk7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGF3YWl0IGRldnRvb2xzVmlldy5sb2FkVVJMKCBmcm9udGVuZFVybCApO1xuICAgICAgICAgICAgICAgIGxvZyggJ3dpcmUtZGV2dG9vbHM6IGZyb250ZW5kIGxvYWRlZCB2aWEgd3MgYnJpZGdlJywgeyBnYW1lV2NJZCwgcG9ydCB9ICk7XG4gICAgICAgICAgICB9IGNhdGNoICggZXJyb3IgKSB7XG4gICAgICAgICAgICAgICAgLy8gc29tZSBlbnZpcm9ubWVudHMgcmVmdXNlIGRpcmVjdCBkZXZ0b29sczovLyBuYXZpZ2F0aW9uIG9uIGEgd2VidmlldzsgYm9vdHN0cmFwXG4gICAgICAgICAgICAgICAgLy8gdGhlIGZyb250ZW5kIHRocm91Z2ggdGhlIGVtYmVkZGVyIEFQSSwgdGhlbiByZWRpcmVjdCBpdCB0byB0aGUgd3MgdHJhbnNwb3J0XG4gICAgICAgICAgICAgICAgbG9nKCAnd2lyZS1kZXZ0b29sczogZGlyZWN0IGRldnRvb2xzOi8vIGxvYWQgZmFpbGVkLCB1c2luZyBlbWJlZGRlciBib290c3RyYXAnLCBTdHJpbmcoICggZXJyb3IgYXMgRXJyb3IgKT8ubWVzc2FnZSA/PyBlcnJvciApICk7XG4gICAgICAgICAgICAgICAgZ2FtZS5zZXREZXZUb29sc1dlYkNvbnRlbnRzKCBkZXZ0b29sc1ZpZXcgKTtcbiAgICAgICAgICAgICAgICBnYW1lLm9wZW5EZXZUb29scygpO1xuICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgZGV2dG9vbHNWaWV3LmxvYWRVUkwoIGZyb250ZW5kVXJsICkuY2F0Y2goXG4gICAgICAgICAgICAgICAgICAgICAgICAoIHJlZGlyZWN0RXJyb3I6IEVycm9yICkgPT4gbG9nKCAnd2lyZS1kZXZ0b29sczogd3MgcmVkaXJlY3QgZmFpbGVkJywgU3RyaW5nKCByZWRpcmVjdEVycm9yPy5tZXNzYWdlID8/IHJlZGlyZWN0RXJyb3IgKSApXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfSwgODAwICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBnYW1lLl9faW5zcGVjdG9yV2lyZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVuc3VyZVBhdXNlZFdhdGNoZXIoIGdhbWUsIGRldnRvb2xzVmlldywgbm90aWZ5UGF1c2VkICk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBtdXRlZDogZ2FtZS5pc0F1ZGlvTXV0ZWQoKSB9O1xuICAgIH0gY2F0Y2ggKCBlcnJvciApIHtcbiAgICAgICAgbG9nKCAnd2lyZS1kZXZ0b29sczogRkFJTEVEJywgU3RyaW5nKCAoIGVycm9yIGFzIEVycm9yICk/LnN0YWNrID8/IGVycm9yICkgKTtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogU3RyaW5nKCAoIGVycm9yIGFzIEVycm9yICk/Lm1lc3NhZ2UgPz8gZXJyb3IgKSB9O1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNldEdhbWVBdWRpb011dGVkKCBnYW1lV2NJZDogbnVtYmVyLCBtdXRlZDogYm9vbGVhbiApOiBXaXJlRGV2dG9vbHNSZXN1bHQge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGdhbWUgPSB3ZWJDb250ZW50cy5mcm9tSWQoIGdhbWVXY0lkICk7XG4gICAgICAgIGlmICggZ2FtZSApIGdhbWUuc2V0QXVkaW9NdXRlZCggQm9vbGVhbiggbXV0ZWQgKSApO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgIH0gY2F0Y2ggKCBlcnJvciApIHtcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogU3RyaW5nKCAoIGVycm9yIGFzIEVycm9yICk/Lm1lc3NhZ2UgPz8gZXJyb3IgKSB9O1xuICAgIH1cbn1cblxuZXhwb3J0IHsgSXBjRXZlbnQgfTtcbiIsICIvLyBEZXZUb29scyBDRFAtb3Zlci1XZWJTb2NrZXQgYnJpZGdlLlxuLy9cbi8vIEluc2lkZSBDb2NvcyBDcmVhdG9yLCBFbGVjdHJvbidzIGVtYmVkZGVyIGJpbmRpbmcgZm9yIGN1c3RvbSBkZXZ0b29scyBmcm9udGVuZHNcbi8vICh3ZWJDb250ZW50cy5zZXREZXZUb29sc1dlYkNvbnRlbnRzKSBkZWxpdmVycyBubyBSdW50aW1lL0RPTS9Db25zb2xlIHRyYWZmaWMsIHdoaWxlXG4vLyB3ZWJDb250ZW50cy5kZWJ1Z2dlciBvbiB0aGUgc2FtZSBwYWdlIHdvcmtzIGZpbmUuIFNvIHRoZSBpbi10YWIgRGV2VG9vbHMgZnJvbnRlbmQgaXMgbG9hZGVkXG4vLyBpbiBzdGFuZGFyZCByZW1vdGUtZGVidWdnaW5nIG1vZGUgKGluc3BlY3Rvci5odG1sP3dzPS4uLikgYW5kIGl0cyBDRFAgbWVzc2FnZXMgYXJlIGJyaWRnZWRcbi8vIHRvIHdlYkNvbnRlbnRzLmRlYnVnZ2VyIHRocm91Z2ggYSBtaW5pbWFsIGxvY2FsIFdlYlNvY2tldCBzZXJ2ZXIgKFJGQzY0NTUsIHRleHQgZnJhbWVzIG9ubHksXG4vLyB6ZXJvIGRlcGVuZGVuY2llcykuXG5pbXBvcnQgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0ICogYXMgY3J5cHRvIGZyb20gJ2NyeXB0byc7XG5pbXBvcnQgdHlwZSB7IFNvY2tldCB9IGZyb20gJ25ldCc7XG5pbXBvcnQgdHlwZSB7IFdlYkNvbnRlbnRzIH0gZnJvbSAnZWxlY3Ryb24nO1xuXG5jb25zdCBXU19BQ0NFUFRfR1VJRCA9ICcyNThFQUZBNS1FOTE0LTQ3REEtOTVDQS1DNUFCMERDODVCMTEnO1xuY29uc3QgT1BDT0RFX0NPTlRJTlVBVElPTiA9IDB4MDtcbmNvbnN0IE9QQ09ERV9URVhUID0gMHgxO1xuY29uc3QgT1BDT0RFX0NMT1NFID0gMHg4O1xuY29uc3QgT1BDT0RFX1BJTkcgPSAweDk7XG5jb25zdCBQT05HX0hFQURFUiA9IDB4OGE7XG5cbmludGVyZmFjZSBDZHBSZXF1ZXN0IHtcbiAgICBpZDogbnVtYmVyO1xuICAgIG1ldGhvZDogc3RyaW5nO1xuICAgIHBhcmFtcz86IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgIC8qKiBTZXQgd2hlbiB0aGUgY29tbWFuZCB0YXJnZXRzIGEgY2hpbGQgdGFyZ2V0IChlLmcuIGFuIG91dC1vZi1wcm9jZXNzIGlmcmFtZSkgdW5kZXIgZmxhdHRlbiBhdXRvLWF0dGFjaC4gKi9cbiAgICBzZXNzaW9uSWQ/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBCcmlkZ2Uge1xuICAgIHNlcnZlcjogaHR0cC5TZXJ2ZXI7XG4gICAgcG9ydDogbnVtYmVyO1xuICAgIGFjdGl2ZVNvY2tldDogU29ja2V0IHwgbnVsbDtcbn1cblxudHlwZSBMb2dGdW5jdGlvbiA9ICggLi4ucGFydHM6IHVua25vd25bXSApID0+IHZvaWQ7XG5cbmNvbnN0IGJyaWRnZXMgPSBuZXcgTWFwPG51bWJlciwgQnJpZGdlPigpO1xuXG5mdW5jdGlvbiBlbmNvZGVUZXh0RnJhbWUoIHBheWxvYWQ6IHN0cmluZyApOiBCdWZmZXIge1xuICAgIGNvbnN0IGRhdGEgPSBCdWZmZXIuZnJvbSggcGF5bG9hZCwgJ3V0ZjgnICk7XG4gICAgbGV0IGhlYWRlcjogQnVmZmVyO1xuICAgIGlmICggZGF0YS5sZW5ndGggPCAxMjYgKSB7XG4gICAgICAgIGhlYWRlciA9IEJ1ZmZlci5mcm9tKCBbIDB4ODAgfCBPUENPREVfVEVYVCwgZGF0YS5sZW5ndGggXSApO1xuICAgIH0gZWxzZSBpZiAoIGRhdGEubGVuZ3RoIDwgNjU1MzYgKSB7XG4gICAgICAgIGhlYWRlciA9IEJ1ZmZlci5hbGxvYyggNCApO1xuICAgICAgICBoZWFkZXJbIDAgXSA9IDB4ODAgfCBPUENPREVfVEVYVDtcbiAgICAgICAgaGVhZGVyWyAxIF0gPSAxMjY7XG4gICAgICAgIGhlYWRlci53cml0ZVVJbnQxNkJFKCBkYXRhLmxlbmd0aCwgMiApO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGhlYWRlciA9IEJ1ZmZlci5hbGxvYyggMTAgKTtcbiAgICAgICAgaGVhZGVyWyAwIF0gPSAweDgwIHwgT1BDT0RFX1RFWFQ7XG4gICAgICAgIGhlYWRlclsgMSBdID0gMTI3O1xuICAgICAgICBoZWFkZXIud3JpdGVCaWdVSW50NjRCRSggQmlnSW50KCBkYXRhLmxlbmd0aCApLCAyICk7XG4gICAgfVxuICAgIHJldHVybiBCdWZmZXIuY29uY2F0KCBbIGhlYWRlciwgZGF0YSBdICk7XG59XG5cbi8qKiBGZWVkcyBzb2NrZXQgYnl0ZXMgdGhyb3VnaCBhIHdlYnNvY2tldCBmcmFtZSBwYXJzZXI7IG9uTWVzc2FnZSBmaXJlcyBwZXIgY29tcGxldGUgdGV4dCBtZXNzYWdlLiAqL1xuZnVuY3Rpb24gYXR0YWNoRnJhbWVSZWNlaXZlciggc29ja2V0OiBTb2NrZXQsIG9uTWVzc2FnZTogKCB0ZXh0OiBzdHJpbmcgKSA9PiB2b2lkLCBvbkNsb3NlOiAoKSA9PiB2b2lkICk6IHZvaWQge1xuICAgIGxldCBidWZmZXIgPSBCdWZmZXIuYWxsb2MoIDAgKTtcbiAgICBsZXQgZnJhZ21lbnRzOiBCdWZmZXJbXSA9IFtdO1xuICAgIHNvY2tldC5vbiggJ2RhdGEnLCAoIGNodW5rOiBCdWZmZXIgKSA9PiB7XG4gICAgICAgIGJ1ZmZlciA9IEJ1ZmZlci5jb25jYXQoIFsgYnVmZmVyLCBjaHVuayBdICk7XG4gICAgICAgIHdoaWxlICggdHJ1ZSApIHtcbiAgICAgICAgICAgIGlmICggYnVmZmVyLmxlbmd0aCA8IDIgKSByZXR1cm47XG4gICAgICAgICAgICBjb25zdCBmaW4gPSAoIGJ1ZmZlclsgMCBdICYgMHg4MCApICE9PSAwO1xuICAgICAgICAgICAgY29uc3Qgb3Bjb2RlID0gYnVmZmVyWyAwIF0gJiAweDBmO1xuICAgICAgICAgICAgY29uc3QgbWFza2VkID0gKCBidWZmZXJbIDEgXSAmIDB4ODAgKSAhPT0gMDtcbiAgICAgICAgICAgIGxldCBsZW5ndGggPSBidWZmZXJbIDEgXSAmIDB4N2Y7XG4gICAgICAgICAgICBsZXQgb2Zmc2V0ID0gMjtcbiAgICAgICAgICAgIGlmICggbGVuZ3RoID09PSAxMjYgKSB7XG4gICAgICAgICAgICAgICAgaWYgKCBidWZmZXIubGVuZ3RoIDwgNCApIHJldHVybjtcbiAgICAgICAgICAgICAgICBsZW5ndGggPSBidWZmZXIucmVhZFVJbnQxNkJFKCAyICk7XG4gICAgICAgICAgICAgICAgb2Zmc2V0ID0gNDtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIGxlbmd0aCA9PT0gMTI3ICkge1xuICAgICAgICAgICAgICAgIGlmICggYnVmZmVyLmxlbmd0aCA8IDEwICkgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGxlbmd0aCA9IE51bWJlciggYnVmZmVyLnJlYWRCaWdVSW50NjRCRSggMiApICk7XG4gICAgICAgICAgICAgICAgb2Zmc2V0ID0gMTA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBtYXNrTGVuZ3RoID0gbWFza2VkID8gNCA6IDA7XG4gICAgICAgICAgICBpZiAoIGJ1ZmZlci5sZW5ndGggPCBvZmZzZXQgKyBtYXNrTGVuZ3RoICsgbGVuZ3RoICkgcmV0dXJuO1xuICAgICAgICAgICAgbGV0IHBheWxvYWQgPSBidWZmZXIuc2xpY2UoIG9mZnNldCArIG1hc2tMZW5ndGgsIG9mZnNldCArIG1hc2tMZW5ndGggKyBsZW5ndGggKTtcbiAgICAgICAgICAgIGlmICggbWFza2VkICkge1xuICAgICAgICAgICAgICAgIGNvbnN0IG1hc2sgPSBidWZmZXIuc2xpY2UoIG9mZnNldCwgb2Zmc2V0ICsgNCApO1xuICAgICAgICAgICAgICAgIHBheWxvYWQgPSBCdWZmZXIuZnJvbSggcGF5bG9hZCApO1xuICAgICAgICAgICAgICAgIGZvciAoIGxldCBpID0gMDsgaSA8IHBheWxvYWQubGVuZ3RoOyBpKysgKSBwYXlsb2FkWyBpIF0gXj0gbWFza1sgaSAmIDMgXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJ1ZmZlciA9IGJ1ZmZlci5zbGljZSggb2Zmc2V0ICsgbWFza0xlbmd0aCArIGxlbmd0aCApO1xuICAgICAgICAgICAgaWYgKCBvcGNvZGUgPT09IE9QQ09ERV9DTE9TRSApIHtcbiAgICAgICAgICAgICAgICBvbkNsb3NlKCk7XG4gICAgICAgICAgICAgICAgc29ja2V0LmVuZCgpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICggb3Bjb2RlID09PSBPUENPREVfUElORyApIHtcbiAgICAgICAgICAgICAgICBzb2NrZXQud3JpdGUoIEJ1ZmZlci5jb25jYXQoIFsgQnVmZmVyLmZyb20oIFsgUE9OR19IRUFERVIsIHBheWxvYWQubGVuZ3RoIF0gKSwgcGF5bG9hZCBdICkgKTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICggb3Bjb2RlID09PSBPUENPREVfVEVYVCB8fCBvcGNvZGUgPT09IE9QQ09ERV9DT05USU5VQVRJT04gKSB7XG4gICAgICAgICAgICAgICAgZnJhZ21lbnRzLnB1c2goIHBheWxvYWQgKTtcbiAgICAgICAgICAgICAgICBpZiAoIGZpbiApIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbWVzc2FnZSA9IEJ1ZmZlci5jb25jYXQoIGZyYWdtZW50cyApLnRvU3RyaW5nKCAndXRmOCcgKTtcbiAgICAgICAgICAgICAgICAgICAgZnJhZ21lbnRzID0gW107XG4gICAgICAgICAgICAgICAgICAgIG9uTWVzc2FnZSggbWVzc2FnZSApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gKTtcbiAgICBzb2NrZXQub24oICdlcnJvcicsIG9uQ2xvc2UgKTtcbiAgICBzb2NrZXQub24oICdjbG9zZScsIG9uQ2xvc2UgKTtcbn1cblxuZnVuY3Rpb24gaGFuZGxlQ29ubmVjdGlvbiggYnJpZGdlOiBCcmlkZ2UsIGdhbWU6IFdlYkNvbnRlbnRzLCBzb2NrZXQ6IFNvY2tldCwgbG9nOiBMb2dGdW5jdGlvbiApOiB2b2lkIHtcbiAgICBzb2NrZXQuc2V0Tm9EZWxheSggdHJ1ZSApO1xuICAgIGlmICggYnJpZGdlLmFjdGl2ZVNvY2tldCApIHtcbiAgICAgICAgdHJ5IHsgYnJpZGdlLmFjdGl2ZVNvY2tldC5kZXN0cm95KCk7IH0gY2F0Y2ggeyAvKiByZXBsYWNlZCBieSB0aGUgbmV3IGZyb250ZW5kIGNvbm5lY3Rpb24gKi8gfVxuICAgIH1cbiAgICBicmlkZ2UuYWN0aXZlU29ja2V0ID0gc29ja2V0O1xuICAgIGxvZyggJ2JyaWRnZTogZGV2dG9vbHMgZnJvbnRlbmQgY29ubmVjdGVkJywgeyBnYW1lV2NJZDogZ2FtZS5pZCB9ICk7XG5cbiAgICBsZXQgY2xvc2VkID0gZmFsc2U7XG4gICAgY29uc3QgY2xvc2UgPSAoKTogdm9pZCA9PiB7XG4gICAgICAgIGlmICggY2xvc2VkICkgcmV0dXJuO1xuICAgICAgICBjbG9zZWQgPSB0cnVlO1xuICAgICAgICBpZiAoIGJyaWRnZS5hY3RpdmVTb2NrZXQgPT09IHNvY2tldCApIGJyaWRnZS5hY3RpdmVTb2NrZXQgPSBudWxsO1xuICAgIH07XG4gICAgY29uc3Qgc2VuZCA9ICggbWVzc2FnZTogb2JqZWN0ICk6IHZvaWQgPT4ge1xuICAgICAgICBpZiAoIGNsb3NlZCB8fCBicmlkZ2UuYWN0aXZlU29ja2V0ICE9PSBzb2NrZXQgKSByZXR1cm47XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBzb2NrZXQud3JpdGUoIGVuY29kZVRleHRGcmFtZSggSlNPTi5zdHJpbmdpZnkoIG1lc3NhZ2UgKSApICk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgY2xvc2UoKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgLy8gc2Vzc2lvbklkIG11c3Qgcm91bmQtdHJpcDogRGV2VG9vbHMgYXV0by1hdHRhY2hlcyBjaGlsZCB0YXJnZXRzIChPT1BJRnMpIHdpdGggd2FpdEZvckRlYnVnZ2VyT25TdGFydCxcbiAgICAvLyBhbmQgYSBjaGlsZCBvbmx5IHJlc3VtZXMgd2hlbiBSdW50aW1lLnJ1bklmV2FpdGluZ0ZvckRlYnVnZ2VyIHJlYWNoZXMgaXRzIG93biBzZXNzaW9uLlxuICAgIGNvbnN0IG9uRGVidWdnZXJNZXNzYWdlID0gKCBfZXZlbnQ6IHVua25vd24sIG1ldGhvZDogc3RyaW5nLCBwYXJhbXM6IHVua25vd24sIHNlc3Npb25JZD86IHN0cmluZyApOiB2b2lkID0+XG4gICAgICAgIHNlbmQoIHNlc3Npb25JZCA/IHsgbWV0aG9kLCBwYXJhbXMsIHNlc3Npb25JZCB9IDogeyBtZXRob2QsIHBhcmFtcyB9ICk7XG4gICAgY29uc3Qgb25EZWJ1Z2dlckRldGFjaCA9ICgpOiB2b2lkID0+IHtcbiAgICAgICAgY2xvc2UoKTtcbiAgICAgICAgdHJ5IHsgc29ja2V0LmVuZCgpOyB9IGNhdGNoIHsgLyogYWxyZWFkeSBnb25lICovIH1cbiAgICB9O1xuXG4gICAgdHJ5IHtcbiAgICAgICAgaWYgKCAhZ2FtZS5kZWJ1Z2dlci5pc0F0dGFjaGVkKCkgKSBnYW1lLmRlYnVnZ2VyLmF0dGFjaCgpO1xuICAgIH0gY2F0Y2ggKCBlcnJvciApIHtcbiAgICAgICAgbG9nKCAnYnJpZGdlOiBkZWJ1Z2dlciBhdHRhY2ggZmFpbGVkJywgU3RyaW5nKCBlcnJvciApICk7XG4gICAgfVxuICAgIGdhbWUuZGVidWdnZXIub24oICdtZXNzYWdlJywgb25EZWJ1Z2dlck1lc3NhZ2UgKTtcbiAgICBnYW1lLmRlYnVnZ2VyLm9uY2UoICdkZXRhY2gnLCBvbkRlYnVnZ2VyRGV0YWNoICk7XG4gICAgc29ja2V0Lm9uY2UoICdjbG9zZScsICgpID0+IHtcbiAgICAgICAgZ2FtZS5kZWJ1Z2dlci5yZW1vdmVMaXN0ZW5lciggJ21lc3NhZ2UnLCBvbkRlYnVnZ2VyTWVzc2FnZSApO1xuICAgICAgICBnYW1lLmRlYnVnZ2VyLnJlbW92ZUxpc3RlbmVyKCAnZGV0YWNoJywgb25EZWJ1Z2dlckRldGFjaCApO1xuICAgICAgICBjbG9zZSgpO1xuICAgIH0gKTtcblxuICAgIGF0dGFjaEZyYW1lUmVjZWl2ZXIoIHNvY2tldCwgKCB0ZXh0ICkgPT4ge1xuICAgICAgICBsZXQgcmVxdWVzdDogQ2RwUmVxdWVzdDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHJlcXVlc3QgPSBKU09OLnBhcnNlKCB0ZXh0ICkgYXMgQ2RwUmVxdWVzdDtcbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgc2Vzc2lvbklkID0gcmVxdWVzdC5zZXNzaW9uSWQ7XG4gICAgICAgIGdhbWUuZGVidWdnZXIuc2VuZENvbW1hbmQoIHJlcXVlc3QubWV0aG9kLCByZXF1ZXN0LnBhcmFtcyA/PyB7fSwgc2Vzc2lvbklkICkudGhlbihcbiAgICAgICAgICAgICggcmVzdWx0ICkgPT4gc2VuZCggeyBpZDogcmVxdWVzdC5pZCwgcmVzdWx0OiByZXN1bHQgPz8ge30sIHNlc3Npb25JZCB9ICksXG4gICAgICAgICAgICAoIGVycm9yOiB1bmtub3duICkgPT4gc2VuZCgge1xuICAgICAgICAgICAgICAgIGlkOiByZXF1ZXN0LmlkLFxuICAgICAgICAgICAgICAgIGVycm9yOiB7IGNvZGU6IC0zMjAwMCwgbWVzc2FnZTogU3RyaW5nKCAoIGVycm9yIGFzIEVycm9yICk/Lm1lc3NhZ2UgPz8gZXJyb3IgKSB9LFxuICAgICAgICAgICAgICAgIHNlc3Npb25JZCxcbiAgICAgICAgICAgIH0gKVxuICAgICAgICApO1xuICAgIH0sIGNsb3NlICk7XG59XG5cbi8qKiBTdGFydHMgKG9yIHJldXNlcykgdGhlIGJyaWRnZSBzZXJ2ZXIgZm9yIG9uZSBnYW1lIHdlYkNvbnRlbnRzOyByZXNvbHZlcyB3aXRoIGl0cyBwb3J0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN0YXJ0RGV2dG9vbHNCcmlkZ2UoIGdhbWU6IFdlYkNvbnRlbnRzLCBsb2c6IExvZ0Z1bmN0aW9uICk6IFByb21pc2U8bnVtYmVyPiB7XG4gICAgY29uc3QgZXhpc3RpbmcgPSBicmlkZ2VzLmdldCggZ2FtZS5pZCApO1xuICAgIGlmICggZXhpc3RpbmcgKSByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCBleGlzdGluZy5wb3J0ICk7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKCAoIHJlc29sdmUsIHJlamVjdCApID0+IHtcbiAgICAgICAgY29uc3Qgc2VydmVyID0gaHR0cC5jcmVhdGVTZXJ2ZXIoICggX3JlcSwgcmVzICkgPT4ge1xuICAgICAgICAgICAgcmVzLndyaXRlSGVhZCggNDA0ICk7XG4gICAgICAgICAgICByZXMuZW5kKCk7XG4gICAgICAgIH0gKTtcbiAgICAgICAgY29uc3QgYnJpZGdlOiBCcmlkZ2UgPSB7IHNlcnZlciwgcG9ydDogMCwgYWN0aXZlU29ja2V0OiBudWxsIH07XG4gICAgICAgIHNlcnZlci5vbiggJ3VwZ3JhZGUnLCAoIHJlcXVlc3QsIHNvY2tldCApID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IHJlcXVlc3QuaGVhZGVyc1sgJ3NlYy13ZWJzb2NrZXQta2V5JyBdO1xuICAgICAgICAgICAgaWYgKCAha2V5ICkge1xuICAgICAgICAgICAgICAgIHNvY2tldC5kZXN0cm95KCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYWNjZXB0ID0gY3J5cHRvLmNyZWF0ZUhhc2goICdzaGExJyApLnVwZGF0ZSgga2V5ICsgV1NfQUNDRVBUX0dVSUQgKS5kaWdlc3QoICdiYXNlNjQnICk7XG4gICAgICAgICAgICBzb2NrZXQud3JpdGUoXG4gICAgICAgICAgICAgICAgJ0hUVFAvMS4xIDEwMSBTd2l0Y2hpbmcgUHJvdG9jb2xzXFxyXFxuJyArXG4gICAgICAgICAgICAgICAgJ1VwZ3JhZGU6IHdlYnNvY2tldFxcclxcbkNvbm5lY3Rpb246IFVwZ3JhZGVcXHJcXG4nICtcbiAgICAgICAgICAgICAgICBgU2VjLVdlYlNvY2tldC1BY2NlcHQ6ICR7IGFjY2VwdCB9XFxyXFxuXFxyXFxuYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGhhbmRsZUNvbm5lY3Rpb24oIGJyaWRnZSwgZ2FtZSwgc29ja2V0IGFzIFNvY2tldCwgbG9nICk7XG4gICAgICAgIH0gKTtcbiAgICAgICAgc2VydmVyLm9uKCAnZXJyb3InLCByZWplY3QgKTtcbiAgICAgICAgc2VydmVyLmxpc3RlbiggMCwgJzEyNy4wLjAuMScsICgpID0+IHtcbiAgICAgICAgICAgIGJyaWRnZS5wb3J0ID0gKCBzZXJ2ZXIuYWRkcmVzcygpIGFzIHsgcG9ydDogbnVtYmVyIH0gKS5wb3J0O1xuICAgICAgICAgICAgYnJpZGdlcy5zZXQoIGdhbWUuaWQsIGJyaWRnZSApO1xuICAgICAgICAgICAgZ2FtZS5vbmNlKCAnZGVzdHJveWVkJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRyeSB7IHNlcnZlci5jbG9zZSgpOyB9IGNhdGNoIHsgLyogc2h1dHRpbmcgZG93biAqLyB9XG4gICAgICAgICAgICAgICAgYnJpZGdlcy5kZWxldGUoIGdhbWUuaWQgKTtcbiAgICAgICAgICAgIH0gKTtcbiAgICAgICAgICAgIGxvZyggJ2JyaWRnZTogbGlzdGVuaW5nJywgeyBnYW1lV2NJZDogZ2FtZS5pZCwgcG9ydDogYnJpZGdlLnBvcnQgfSApO1xuICAgICAgICAgICAgcmVzb2x2ZSggYnJpZGdlLnBvcnQgKTtcbiAgICAgICAgfSApO1xuICAgIH0gKTtcbn1cblxuLyoqIFRoZSBkZXZ0b29scyBmcm9udGVuZCBVUkwgdGhhdCB0YWxrcyB0byB0aGUgYnJpZGdlIG9uIHRoZSBnaXZlbiBwb3J0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJyaWRnZUZyb250ZW5kVXJsKCBwb3J0OiBudW1iZXIgKTogc3RyaW5nIHtcbiAgICByZXR1cm4gYGRldnRvb2xzOi8vZGV2dG9vbHMvYnVuZGxlZC9pbnNwZWN0b3IuaHRtbD93cz0xMjcuMC4wLjE6JHsgcG9ydCB9L2dhbWVgO1xufVxuIiwgIi8vIExvZ2dpbmcgZm9yIHRoZSBleHRlbnNpb24gbWFpbiBwcm9jZXNzLiBDb25zb2xlIGFsd2F5czsgb3B0aW9uYWwgZmlsZSBsb2cgZm9yIGRpYWdub3Npbmdcbi8vIGlzc3VlcyBpbnNpZGUgQ3JlYXRvciAoZW5hYmxlIGJ5IHNldHRpbmcgQ09DT1NfSU5TUEVDVE9SX0RFQlVHX0xPRz0xIGJlZm9yZSBsYXVuY2hpbmcgQ3JlYXRvcikuXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuXG5kZWNsYXJlIGNvbnN0IEVkaXRvcjogeyBQcm9qZWN0PzogeyB0bXBEaXI6IHN0cmluZyB9IH0gfCB1bmRlZmluZWQ7XG5cbmNvbnN0IEZJTEVfTE9HX0VOQUJMRUQgPSBwcm9jZXNzLmVudi5DT0NPU19JTlNQRUNUT1JfREVCVUdfTE9HID09PSAnMSc7XG5jb25zdCBMT0dfRklMRV9OQU1FID0gJ2luc3BlY3Rvci1kZWJ1Zy5sb2cnO1xuXG5mdW5jdGlvbiByZXNvbHZlTG9nUGF0aCgpOiBzdHJpbmcge1xuICAgIC8vIHByb2plY3QgdGVtcCBkaXIgd2hlbiBydW5uaW5nIGluc2lkZSBDcmVhdG9yOyBleHRlbnNpb24gZm9sZGVyIG90aGVyd2lzZVxuICAgIGNvbnN0IGJhc2UgPSAoIHR5cGVvZiBFZGl0b3IgIT09ICd1bmRlZmluZWQnICYmIEVkaXRvcj8uUHJvamVjdD8udG1wRGlyICkgPyBFZGl0b3IuUHJvamVjdC50bXBEaXIgOiBwYXRoLmpvaW4oIF9fZGlybmFtZSwgJy4uJyApO1xuICAgIHJldHVybiBwYXRoLmpvaW4oIGJhc2UsIExPR19GSUxFX05BTUUgKTtcbn1cbmNvbnN0IExPR19QQVRIID0gcmVzb2x2ZUxvZ1BhdGgoKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlc2V0TG9nRmlsZSgpOiB2b2lkIHtcbiAgICBpZiAoICFGSUxFX0xPR19FTkFCTEVEICkgcmV0dXJuO1xuICAgIHRyeSB7IGZzLndyaXRlRmlsZVN5bmMoIExPR19QQVRILCAnJyApOyB9IGNhdGNoIHsgLyogbG9nZ2luZyBtdXN0IG5ldmVyIGJyZWFrIHRoZSB0b29sICovIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxvZyggLi4ucGFydHM6IHVua25vd25bXSApOiB2b2lkIHtcbiAgICBjb25zb2xlLmxvZyggJ1tjb2Nvcy1pbnNwZWN0b3JdJywgLi4ucGFydHMgKTtcbiAgICBpZiAoICFGSUxFX0xPR19FTkFCTEVEICkgcmV0dXJuO1xuICAgIGNvbnN0IGxpbmUgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkgKyAnICcgKyBwYXJ0cy5tYXAoXG4gICAgICAgICggcGFydCApID0+ICggdHlwZW9mIHBhcnQgPT09ICdzdHJpbmcnID8gcGFydCA6IEpTT04uc3RyaW5naWZ5KCBwYXJ0ICkgKVxuICAgICkuam9pbiggJyAnICk7XG4gICAgdHJ5IHsgZnMuYXBwZW5kRmlsZVN5bmMoIExPR19QQVRILCBsaW5lICsgJ1xcbicgKTsgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG59XG4iLCAiLy8gSW5zcGVjdG9yIEJyb3dzZXJXaW5kb3cgKyB0cmF5IGxpZmVjeWNsZS5cbmltcG9ydCB7IEJyb3dzZXJXaW5kb3csIE1lbnUsIE1lbnVJdGVtLCBUcmF5LCBuYXRpdmVJbWFnZSB9IGZyb20gJ2VsZWN0cm9uJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyByZWFkQ29uZmlnLCBnZXRQcm9qZWN0Q29uZmlnUGF0aCwgcmVhZFByb2plY3REZXNpZ25TaXplLCBDT05GSUdfUEFUSF9BUkcsIERFU0lHTl9TSVpFX0FSRyB9IGZyb20gJy4vY29uZmlnJztcbmltcG9ydCB7IEluc3BlY3Rvck1vZGUsIHR5cGUgSW5zcGVjdG9yQ29uZmlnIH0gZnJvbSAnQHNoYXJlZC9wcm90b2NvbCc7XG5pbXBvcnQgeyBsb2cgfSBmcm9tICcuL2xvZyc7XG5pbXBvcnQgeyB0cmFja0hvc3RXaW5kb3csIHNldFByZXZpZXdQb3J0LCB3YWl0Rm9yR2FtZVJlYWR5IH0gZnJvbSAnLi9ydW50aW1lLWFwaSc7XG5cbi8vIEVkaXRvciBpcyBDb2NvcyBDcmVhdG9yJ3MgZ2xvYmFsIGluIHRoZSBleHRlbnNpb24gaG9zdCBwcm9jZXNzLlxuZGVjbGFyZSBjb25zdCBFZGl0b3I6IHtcbiAgICBNZXNzYWdlOiB7IHJlcXVlc3Q6ICggdGFyZ2V0OiBzdHJpbmcsIG1lc3NhZ2U6IHN0cmluZyApID0+IFByb21pc2U8bnVtYmVyPiB9O1xufTtcblxuY29uc3QgRVhURU5TSU9OX1JPT1QgPSBwYXRoLmpvaW4oIF9fZGlybmFtZSwgJy4uJyApO1xuY29uc3QgUEtHX1ZFUlNJT046IHN0cmluZyA9IF9fUEtHX1ZFUlNJT05fXztcblxuY29uc3QgREVGQVVMVF9XSURUSCA9IDg3ODtcbmNvbnN0IERFRkFVTFRfSEVJR0hUID0gNjAwO1xuY29uc3QgU0lNUExFX01PREVfVE9PTEJBUl9IRUlHSFQgPSA1MTtcbmNvbnN0IFRSQVlfSUNPTl9TSVpFID0gMTY7XG5jb25zdCBPUEVOX1RJTUVPVVRfTVMgPSAxNTAwMDtcblxubGV0IHdpbjogQnJvd3NlcldpbmRvdyB8IG51bGwgPSBudWxsO1xubGV0IHRyYXk6IFRyYXkgfCBudWxsID0gbnVsbDtcbmxldCBtb2RlOiBJbnNwZWN0b3JNb2RlID0gSW5zcGVjdG9yTW9kZS5QcmV2aWV3O1xubGV0IGNvbmZpZzogSW5zcGVjdG9yQ29uZmlnID0gcmVhZENvbmZpZygpO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0SW5zcGVjdG9yV2luZG93KCk6IEJyb3dzZXJXaW5kb3cgfCBudWxsIHtcbiAgICByZXR1cm4gd2luO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbm90aWZ5UmVuZGVyZXIoIGNoYW5uZWw6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdICk6IHZvaWQge1xuICAgIGlmICggd2luICYmICF3aW4uaXNEZXN0cm95ZWQoKSApIHdpbi53ZWJDb250ZW50cy5zZW5kKCBjaGFubmVsLCAuLi5hcmdzICk7XG59XG5cbmZ1bmN0aW9uIGRlc2lyZWRDb250ZW50U2l6ZSgpOiBbIG51bWJlciwgbnVtYmVyIF0ge1xuICAgIGlmICggY29uZmlnLnNpbXBsZU1vZGUgKSB7XG4gICAgICAgIGNvbnN0IHdpZHRoID0gY29uZmlnLmlzUG9ydHJhaXQgPyBjb25maWcuc2l6ZVsgMCBdIDogY29uZmlnLnNpemVbIDEgXTtcbiAgICAgICAgY29uc3QgaGVpZ2h0ID0gKCBjb25maWcuaXNQb3J0cmFpdCA/IGNvbmZpZy5zaXplWyAxIF0gOiBjb25maWcuc2l6ZVsgMCBdICkgKyBTSU1QTEVfTU9ERV9UT09MQkFSX0hFSUdIVDtcbiAgICAgICAgcmV0dXJuIFsgd2lkdGgsIGhlaWdodCBdO1xuICAgIH1cbiAgICByZXR1cm4gWyBERUZBVUxUX1dJRFRILCBERUZBVUxUX0hFSUdIVCBdO1xufVxuXG4vKiogSW4gc2ltcGxlIG1vZGUgdGhlIHdpbmRvdyBzaXplIGlzIGxvY2tlZCB0byB0aGUgY29uZmlndXJlZCBnYW1lIHJlc29sdXRpb24uICovXG5mdW5jdGlvbiBlbmZvcmNlU2ltcGxlTW9kZVNpemUoKTogdm9pZCB7XG4gICAgaWYgKCAhd2luICkgcmV0dXJuO1xuICAgIHdpbi53ZWJDb250ZW50cy5leGVjdXRlSmF2YVNjcmlwdCggJ3NldHRpbmcuY29uZmlnRGF0YUZvck1haW4nICkudGhlbiggKCBsYXRlc3RDb25maWc6IEluc3BlY3RvckNvbmZpZyB8IG51bGwgKSA9PiB7XG4gICAgICAgIGlmICggbGF0ZXN0Q29uZmlnICkgY29uZmlnID0gbGF0ZXN0Q29uZmlnO1xuICAgICAgICBpZiAoICFjb25maWcuc2ltcGxlTW9kZSB8fCAhd2luICkgcmV0dXJuO1xuICAgICAgICBjb25zdCBbIHdpZHRoLCBoZWlnaHQgXSA9IGRlc2lyZWRDb250ZW50U2l6ZSgpO1xuICAgICAgICBjb25zdCBjdXJyZW50ID0gd2luLmdldENvbnRlbnRTaXplKCk7XG4gICAgICAgIGlmICggd2lkdGggIT09IGN1cnJlbnRbIDAgXSB8fCBoZWlnaHQgIT09IGN1cnJlbnRbIDEgXSApIHdpbi5zZXRDb250ZW50U2l6ZSggd2lkdGgsIGhlaWdodCApO1xuICAgIH0gKS5jYXRjaCggKCBlcnJvcjogRXJyb3IgKSA9PiBsb2coICdyZXNpemUgc3luYyBmYWlsZWQnLCBTdHJpbmcoIGVycm9yPy5tZXNzYWdlID8/IGVycm9yICkgKSApO1xufVxuXG5mdW5jdGlvbiByZW5kZXJlckFyZ3VtZW50cygpOiBzdHJpbmdbXSB7XG4gICAgY29uc3QgYXJnczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBjb25maWdQYXRoID0gZ2V0UHJvamVjdENvbmZpZ1BhdGgoKTtcbiAgICBpZiAoIGNvbmZpZ1BhdGggKSBhcmdzLnB1c2goIENPTkZJR19QQVRIX0FSRyArIGNvbmZpZ1BhdGggKTtcbiAgICBjb25zdCBkZXNpZ25TaXplID0gcmVhZFByb2plY3REZXNpZ25TaXplKCk7XG4gICAgaWYgKCBkZXNpZ25TaXplICkgYXJncy5wdXNoKCBERVNJR05fU0laRV9BUkcgKyBkZXNpZ25TaXplLmpvaW4oICd4JyApICk7XG4gICAgcmV0dXJuIGFyZ3M7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHNob3dXaW5kb3coKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCB3aW4gKSB7XG4gICAgICAgIHdpbi5zaG93KCk7XG4gICAgICAgIHdpbi53ZWJDb250ZW50cy5leGVjdXRlSmF2YVNjcmlwdCggYHYuc3dpdGNoTW9kZSgkeyBtb2RlIH0pYCApO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IFsgd2lkdGgsIGhlaWdodCBdID0gZGVzaXJlZENvbnRlbnRTaXplKCk7XG4gICAgd2luID0gbmV3IEJyb3dzZXJXaW5kb3coIHtcbiAgICAgICAgd2lkdGgsXG4gICAgICAgIGhlaWdodCxcbiAgICAgICAgdGl0bGU6IGBDb2NvcyBJbnNwZWN0b3IgdiR7IFBLR19WRVJTSU9OIH1gLFxuICAgICAgICBiYWNrZ3JvdW5kQ29sb3I6ICcjMmUyYzI5JyxcbiAgICAgICAgYXV0b0hpZGVNZW51QmFyOiB0cnVlLFxuICAgICAgICB3ZWJQcmVmZXJlbmNlczoge1xuICAgICAgICAgICAgLy8gbWF0Y2hlcyB0aGUgaGlzdG9yaWNhbCBydW50aW1lIGVudmlyb25tZW50IG9mIHRoZSBwbHVnaW4gKEVsZWN0cm9uIDEzKVxuICAgICAgICAgICAgd2Vidmlld1RhZzogdHJ1ZSxcbiAgICAgICAgICAgIG5vZGVJbnRlZ3JhdGlvbjogdHJ1ZSxcbiAgICAgICAgICAgIG5vZGVJbnRlZ3JhdGlvbkluU3ViRnJhbWVzOiB0cnVlLFxuICAgICAgICAgICAgZW5hYmxlUmVtb3RlTW9kdWxlOiB0cnVlLFxuICAgICAgICAgICAgc2FuZGJveDogZmFsc2UsXG4gICAgICAgICAgICBkZXZUb29sczogdHJ1ZSxcbiAgICAgICAgICAgIGNvbnRleHRJc29sYXRpb246IGZhbHNlLFxuICAgICAgICAgICAgd2ViU2VjdXJpdHk6ICFjb25maWcuZGlzYWJsZVdlYlNlYyxcbiAgICAgICAgICAgIHByZWxvYWQ6IHBhdGguam9pbiggX19kaXJuYW1lLCAnbWFpblByZWxvYWQuanMnICksXG4gICAgICAgICAgICAvLyB0aGUgcmVuZGVyZXIgaGFzIG5vIEVkaXRvciBnbG9iYWw7IGhhbmQgaXQgdGhlIHByb2plY3QtbGV2ZWwgY29uZmlnIHBhdGggYW5kIGRlc2lnbiByZXNvbHV0aW9uXG4gICAgICAgICAgICBhZGRpdGlvbmFsQXJndW1lbnRzOiByZW5kZXJlckFyZ3VtZW50cygpLFxuICAgICAgICB9LFxuICAgICAgICByZXNpemFibGU6ICFjb25maWcuc2ltcGxlTW9kZSxcbiAgICAgICAgbWluaW1pemFibGU6ICFjb25maWcuc2ltcGxlTW9kZSxcbiAgICAgICAgbWF4aW1pemFibGU6ICFjb25maWcuc2ltcGxlTW9kZSxcbiAgICAgICAgdXNlQ29udGVudFNpemU6IHRydWUsXG4gICAgfSApO1xuICAgIHRyeSB7XG4gICAgICAgIC8vIHRoZSBpbnNwZWN0b3Igd2luZG93IG1hbmFnZXMgaXRzIG93biBVSTsgYmxvY2sgdGhlIGRlZmF1bHQgbWVudSBiYXIgcGVybWFuZW50bHlcbiAgICAgICAgd2luLnNldE1lbnUoIG51bGwgKTtcbiAgICAgICAgd2luLnNldE1lbnVCYXJWaXNpYmlsaXR5KCBmYWxzZSApO1xuICAgICAgICAoIHdpbiBhcyB1bmtub3duIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+ICkuc2V0TWVudUJhclZpc2liaWxpdHkgPSAoKSA9PiB1bmRlZmluZWQ7XG4gICAgICAgICggd2luIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gKS5zZXRNZW51ID0gKCkgPT4gdW5kZWZpbmVkO1xuICAgIH0gY2F0Y2gge1xuICAgICAgICAvLyBzb21lIGVsZWN0cm9uIHZlcnNpb25zIHJlc3RyaWN0IG92ZXJyaWRpbmcgdGhlc2UgbWV0aG9kc1xuICAgIH1cbiAgICB0cmFja0hvc3RXaW5kb3coIHdpbiApO1xuICAgIHdpbi5vbiggJ3Jlc2l6ZScsIGVuZm9yY2VTaW1wbGVNb2RlU2l6ZSApO1xuICAgIHdpbi5vbiggJ3JlYWR5LXRvLXNob3cnLCAoKSA9PiB3aW4/LnNob3coKSApO1xuICAgIHdpbi5vbiggJ2Nsb3NlZCcsICgpID0+IHtcbiAgICAgICAgd2luID0gbnVsbDtcbiAgICAgICAgaWYgKCB0cmF5ICkgdHJheS5kZXN0cm95KCk7XG4gICAgICAgIHRyYXkgPSBudWxsO1xuICAgIH0gKTtcblxuICAgIGNvbnN0IHBvcnQgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCAnc2VydmVyJywgJ3F1ZXJ5LXBvcnQnICk7XG4gICAgc2V0UHJldmlld1BvcnQoIHBvcnQgKTtcbiAgICBjb25zdCBwYWdlVXJsID0gcGF0aC5qb2luKCBFWFRFTlNJT05fUk9PVCwgYGluZGV4Lmh0bWw/cG9ydD0keyBwb3J0IH0mbW9kZT0keyBtb2RlIH1gICk7XG4gICAgbG9nKCAnaW5zcGVjdG9yIHdpbmRvdyBjcmVhdGVkJywgeyBtb2RlLCBzaW1wbGVNb2RlOiBCb29sZWFuKCBjb25maWcuc2ltcGxlTW9kZSApIH0gKTtcbiAgICB3aW4ubG9hZFVSTCggYGZpbGU6Ly8keyBwYWdlVXJsIH1gICk7XG59XG5cbmZ1bmN0aW9uIGVuc3VyZVRyYXkoKTogdm9pZCB7XG4gICAgdHJ5IHtcbiAgICAgICAgbGV0IGljb24gPSBuYXRpdmVJbWFnZS5jcmVhdGVGcm9tUGF0aCggcGF0aC5qb2luKCBFWFRFTlNJT05fUk9PVCwgJ2ljb24ucG5nJyApICk7XG4gICAgICAgIGljb24gPSBpY29uLnJlc2l6ZSggeyB3aWR0aDogVFJBWV9JQ09OX1NJWkUsIGhlaWdodDogVFJBWV9JQ09OX1NJWkUgfSApO1xuICAgICAgICBpZiAoIHRyYXkgKSB7XG4gICAgICAgICAgICB0cmF5LnNldEltYWdlKCBpY29uICk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdHJheSA9IG5ldyBUcmF5KCBpY29uICk7XG4gICAgICAgIHRyYXkub24oICdjbGljaycsICgpID0+IHdpbj8uc2hvdygpICk7XG4gICAgICAgIGNvbnN0IHRyYXlNZW51ID0gbmV3IE1lbnUoKTtcbiAgICAgICAgdHJheU1lbnUuYXBwZW5kKCBuZXcgTWVudUl0ZW0oIHtcbiAgICAgICAgICAgIGxhYmVsOiAnVG9nZ2xlIE1pbmkgTW9kZScsXG4gICAgICAgICAgICBjbGljazogKCkgPT4gd2luPy53ZWJDb250ZW50cy5leGVjdXRlSmF2YVNjcmlwdCggJ3NldHRpbmcudG9nZ2xlU2ltcGxlTW9kZSgpJyApLFxuICAgICAgICB9ICkgKTtcbiAgICAgICAgdHJheU1lbnUuYXBwZW5kKCBuZXcgTWVudUl0ZW0oIHtcbiAgICAgICAgICAgIGxhYmVsOiAnT3BlbkRldlRvb2xzJyxcbiAgICAgICAgICAgIGNsaWNrOiAoKSA9PiB3aW4/LndlYkNvbnRlbnRzLm9wZW5EZXZUb29scygpLFxuICAgICAgICB9ICkgKTtcbiAgICAgICAgdHJheS5zZXRDb250ZXh0TWVudSggdHJheU1lbnUgKTtcbiAgICB9IGNhdGNoICggZXJyb3IgKSB7XG4gICAgICAgIGxvZyggJ3RyYXkgc2V0dXAgZmFpbGVkJywgU3RyaW5nKCBlcnJvciApICk7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdHJ5U2hvd1dpbmRvdyggbmV4dE1vZGU6IEluc3BlY3Rvck1vZGUgKTogdm9pZCB7XG4gICAgb3Blbkluc3BlY3RvciggbmV4dE1vZGUgKS5jYXRjaCggKCBlcnJvcjogRXJyb3IgKSA9PiBsb2coICdzaG93V2luZG93IGZhaWxlZCcsIFN0cmluZyggZXJyb3I/LnN0YWNrID8/IGVycm9yICkgKSApO1xufVxuXG4vKiogQXdhaXRhYmxlIHZhcmlhbnQgZm9yIHRoZSBydW50aW1lIEFQSTogcmVzb2x2ZXMgdHJ1ZSBvbmNlIHRoZSBnYW1lIHBhZ2UgaGFzIGxvYWRlZC4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBvcGVuSW5zcGVjdG9yKCBuZXh0TW9kZTogSW5zcGVjdG9yTW9kZSApOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBlbnN1cmVUcmF5KCk7XG4gICAgbW9kZSA9IG5leHRNb2RlO1xuICAgIGF3YWl0IHNob3dXaW5kb3coKTtcbiAgICByZXR1cm4gd2FpdEZvckdhbWVSZWFkeSggT1BFTl9USU1FT1VUX01TICk7XG59XG4iLCAiLy8gSW5zcGVjdG9yIHNldHRpbmdzIHBlcnNpc3RlbmNlLCBzaGFyZWQgd2l0aCB0aGUgcmVuZGVyZXIgcHJlbG9hZC5cbi8vIFJlc29sdXRpb24gb3JkZXI6IHRoZSBwYXRoIGhhbmRlZCBvdmVyIGJ5IHRoZSBtYWluIHByb2Nlc3MgKHByb2plY3Qgc2V0dGluZ3MgZGlyKSxcbi8vIHRoZW4gdGhlIGxlZ2FjeSBleHRlbnNpb25zL2NvY29zLWluc3BlY3Rvci1jb25maWcuanNvbiwgdGhlbiB0aGUgYnVuZGxlZCBkZWZhdWx0IGNvbmZpZy5qc29uLlxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB0eXBlIHsgSW5zcGVjdG9yQ29uZmlnIH0gZnJvbSAnQHNoYXJlZC9wcm90b2NvbCc7XG5cbi8qKiBDTEkgc3dpdGNoZXMgdXNlZCB0byBoYW5kIHByb2plY3QgZmFjdHMgdG8gdGhlIGluc3BlY3RvciByZW5kZXJlciAod2ViUHJlZmVyZW5jZXMuYWRkaXRpb25hbEFyZ3VtZW50cykuICovXG5leHBvcnQgY29uc3QgQ09ORklHX1BBVEhfQVJHID0gJy0taW5zcGVjdG9yLWNvbmZpZz0nO1xuZXhwb3J0IGNvbnN0IERFU0lHTl9TSVpFX0FSRyA9ICctLWRlc2lnbi1zaXplPSc7XG5leHBvcnQgY29uc3QgQ09ORklHX0ZJTEVfTkFNRSA9ICdjb2Nvcy1pbnNwZWN0b3IuanNvbic7XG5jb25zdCBQUk9KRUNUX1NFVFRJTkdTX1JFTEFUSVZFID0gWyAnc2V0dGluZ3MnLCAndjInLCAncGFja2FnZXMnLCAncHJvamVjdC5qc29uJyBdO1xuXG4vLyBfX2Rpcm5hbWUgaXMgaW5zcGVjdG9yL2Rpc3QgYXQgcnVudGltZTsgdGhlIGJ1bmRsZWQgZGVmYXVsdCBsaXZlcyBpbiB0aGUgaW5zcGVjdG9yIHJvb3QuXG5jb25zdCBJTlNQRUNUT1JfUk9PVCA9IHBhdGguam9pbiggX19kaXJuYW1lLCAnLi4nICk7XG5jb25zdCBMT0NBTF9DT05GSUdfUEFUSCA9IHBhdGguam9pbiggSU5TUEVDVE9SX1JPT1QsICdjb25maWcuanNvbicgKTtcbi8vIHByZS1tZXJnZSBsb2NhdGlvbiAoQ29jb3NJbnNwZWN0b3Igd2FzIGEgc2libGluZyBleHRlbnNpb24sIGNvbmZpZyBzYXQgbmV4dCB0byBpdClcbmNvbnN0IExFR0FDWV9DT05GSUdfUEFUSCA9IHBhdGguam9pbiggSU5TUEVDVE9SX1JPT1QsICcuLi8uLi9jb2Nvcy1pbnNwZWN0b3ItY29uZmlnLmpzb24nICk7XG5cbmRlY2xhcmUgY29uc3QgRWRpdG9yOiB7IFByb2plY3Q/OiB7IHBhdGg6IHN0cmluZyB9IH0gfCB1bmRlZmluZWQ7XG5cbi8qKiBQcm9qZWN0LWxldmVsIGNvbmZpZyBwYXRoOiBmcm9tIGFyZ3YgaW4gdGhlIHJlbmRlcmVyLCBmcm9tIEVkaXRvciBpbiB0aGUgbWFpbiBwcm9jZXNzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldFByb2plY3RDb25maWdQYXRoKCk6IHN0cmluZyB8IG51bGwge1xuICAgIGNvbnN0IGZyb21Bcmd2ID0gcHJvY2Vzcy5hcmd2LmZpbmQoICggYXJnICkgPT4gYXJnLnN0YXJ0c1dpdGgoIENPTkZJR19QQVRIX0FSRyApICk7XG4gICAgaWYgKCBmcm9tQXJndiApIHJldHVybiBmcm9tQXJndi5zbGljZSggQ09ORklHX1BBVEhfQVJHLmxlbmd0aCApO1xuICAgIGlmICggdHlwZW9mIEVkaXRvciAhPT0gJ3VuZGVmaW5lZCcgJiYgRWRpdG9yPy5Qcm9qZWN0Py5wYXRoICkge1xuICAgICAgICByZXR1cm4gcGF0aC5qb2luKCBFZGl0b3IuUHJvamVjdC5wYXRoLCAnc2V0dGluZ3MnLCBDT05GSUdfRklMRV9OQU1FICk7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG4vKiogUHJvamVjdCBkZXNpZ24gcmVzb2x1dGlvbiBbd2lkdGgsIGhlaWdodF0gZnJvbSBzZXR0aW5ncy92Mi9wYWNrYWdlcy9wcm9qZWN0Lmpzb24gKG1haW4gcHJvY2VzcyBvbmx5KS4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWFkUHJvamVjdERlc2lnblNpemUoKTogWyBudW1iZXIsIG51bWJlciBdIHwgbnVsbCB7XG4gICAgaWYgKCB0eXBlb2YgRWRpdG9yID09PSAndW5kZWZpbmVkJyB8fCAhRWRpdG9yPy5Qcm9qZWN0Py5wYXRoICkgcmV0dXJuIG51bGw7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmF3ID0gZnMucmVhZEZpbGVTeW5jKCBwYXRoLmpvaW4oIEVkaXRvci5Qcm9qZWN0LnBhdGgsIC4uLlBST0pFQ1RfU0VUVElOR1NfUkVMQVRJVkUgKSwgeyBlbmNvZGluZzogJ3V0Zi04JyB9ICk7XG4gICAgICAgIGNvbnN0IHJlc29sdXRpb24gPSBKU09OLnBhcnNlKCByYXcgKT8uZ2VuZXJhbD8uZGVzaWduUmVzb2x1dGlvbjtcbiAgICAgICAgaWYgKCB0eXBlb2YgcmVzb2x1dGlvbj8ud2lkdGggPT09ICdudW1iZXInICYmIHR5cGVvZiByZXNvbHV0aW9uPy5oZWlnaHQgPT09ICdudW1iZXInICkge1xuICAgICAgICAgICAgcmV0dXJuIFsgcmVzb2x1dGlvbi53aWR0aCwgcmVzb2x1dGlvbi5oZWlnaHQgXTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggeyAvKiBwcm9qZWN0IGhhcyBubyBleHBsaWNpdCBkZXNpZ24gcmVzb2x1dGlvbiAqLyB9XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbi8qKiBEZXNpZ24gcmVzb2x1dGlvbiBoYW5kZWQgb3ZlciBieSB0aGUgbWFpbiBwcm9jZXNzIChyZW5kZXJlciBzaWRlKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXREZXNpZ25TaXplKCk6IFsgbnVtYmVyLCBudW1iZXIgXSB8IG51bGwge1xuICAgIGNvbnN0IGZyb21Bcmd2ID0gcHJvY2Vzcy5hcmd2LmZpbmQoICggYXJnICkgPT4gYXJnLnN0YXJ0c1dpdGgoIERFU0lHTl9TSVpFX0FSRyApICk7XG4gICAgaWYgKCAhZnJvbUFyZ3YgKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBbIHdpZHRoLCBoZWlnaHQgXSA9IGZyb21Bcmd2LnNsaWNlKCBERVNJR05fU0laRV9BUkcubGVuZ3RoICkuc3BsaXQoICd4JyApLm1hcCggTnVtYmVyICk7XG4gICAgcmV0dXJuIHdpZHRoID4gMCAmJiBoZWlnaHQgPiAwID8gWyB3aWR0aCwgaGVpZ2h0IF0gOiBudWxsO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVhZENvbmZpZygpOiBJbnNwZWN0b3JDb25maWcge1xuICAgIGNvbnN0IHByb2plY3RQYXRoID0gZ2V0UHJvamVjdENvbmZpZ1BhdGgoKTtcbiAgICBjb25zdCBjYW5kaWRhdGVzID0gWyBwcm9qZWN0UGF0aCwgTEVHQUNZX0NPTkZJR19QQVRILCBMT0NBTF9DT05GSUdfUEFUSCBdLmZpbHRlciggKCBwICk6IHAgaXMgc3RyaW5nID0+IEJvb2xlYW4oIHAgKSApO1xuICAgIGNvbnN0IGNvbmZpZ1BhdGggPSBjYW5kaWRhdGVzLmZpbmQoICggcCApID0+IGZzLmV4aXN0c1N5bmMoIHAgKSApID8/IExPQ0FMX0NPTkZJR19QQVRIO1xuICAgIHJldHVybiBKU09OLnBhcnNlKCBmcy5yZWFkRmlsZVN5bmMoIGNvbmZpZ1BhdGgsIHsgZW5jb2Rpbmc6ICd1dGYtOCcgfSApICkgYXMgSW5zcGVjdG9yQ29uZmlnO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2F2ZUNvbmZpZyggY29uZmlnOiBJbnNwZWN0b3JDb25maWcgKTogdm9pZCB7XG4gICAgY29uc3QgdGFyZ2V0ID0gZ2V0UHJvamVjdENvbmZpZ1BhdGgoKSA/PyBMRUdBQ1lfQ09ORklHX1BBVEg7XG4gICAgZnMubWtkaXJTeW5jKCBwYXRoLmRpcm5hbWUoIHRhcmdldCApLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9ICk7XG4gICAgZnMud3JpdGVGaWxlU3luYyggdGFyZ2V0LCBKU09OLnN0cmluZ2lmeSggY29uZmlnICksIHsgZW5jb2Rpbmc6ICd1dGYtOCcgfSApO1xufVxuIiwgIi8vIE1haW4tcHJvY2VzcyBhY2Nlc3MgdG8gdGhlIGdhbWUgd2VidmlldyBmb3IgdGhlIHJ1bnRpbWUgQVBJIChFZGl0b3IuTWVzc2FnZSBcInJ1bnRpbWUtKlwiKS5cbi8vIFRyYWNrcyB0aGUgZ2FtZSBndWVzdCB3ZWJDb250ZW50cyBvZiB0aGUgaW5zcGVjdG9yIHdpbmRvdywgbWlycm9ycyBpdHMgY29uc29sZSBvdXRwdXQgaW50byBhXG4vLyByaW5nIGJ1ZmZlciwgYW5kIG9mZmVycyBldmFsIC8gY2FwdHVyZSBwcmltaXRpdmVzLiBOZXZlciB0aHJvd3M6IGNhbGxlcnMgZ2V0IHsgb2s6IGZhbHNlIH0uXG5pbXBvcnQgeyB3ZWJDb250ZW50cyB9IGZyb20gJ2VsZWN0cm9uJztcbmltcG9ydCB0eXBlIHsgQnJvd3NlcldpbmRvdywgV2ViQ29udGVudHMgfSBmcm9tICdlbGVjdHJvbic7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHR5cGUge1xuICAgIFJ1bnRpbWVDYXB0dXJlUmVzdWx0LFxuICAgIFJ1bnRpbWVDb25zb2xlRW50cnksXG4gICAgUnVudGltZUNvbnNvbGVMZXZlbCxcbiAgICBSdW50aW1lQ29uc29sZVJlc3VsdCxcbiAgICBSdW50aW1lRXZhbFJlc3VsdCxcbiAgICBSdW50aW1lU3RhdHVzLFxufSBmcm9tICdAc2hhcmVkL3Byb3RvY29sJztcbmltcG9ydCB7IGxvZyB9IGZyb20gJy4vbG9nJztcblxuY29uc3QgQ09OU09MRV9SSU5HX0NBUEFDSVRZID0gNTAwO1xuY29uc3QgR0FNRV9SRUFEWV9QT0xMX01TID0gMTAwO1xuY29uc3QgR0FNRV9VUkxfUEFUVEVSTiA9IC9eaHR0cHM/Oi87XG5jb25zdCBMRVZFTF9OQU1FUzogUnVudGltZUNvbnNvbGVMZXZlbFtdID0gWyAndmVyYm9zZScsICdpbmZvJywgJ3dhcm5pbmcnLCAnZXJyb3InIF07XG5jb25zdCBFUlJPUl9XSU5ET1dfTk9UX09QRU4gPSAnaW5zcGVjdG9yIHdpbmRvdyBub3Qgb3Blbic7XG5jb25zdCBFUlJPUl9HQU1FX05PVF9SRUFEWSA9ICdnYW1lIHBhZ2Ugbm90IGxvYWRlZCB5ZXQnO1xuXG5sZXQgaG9zdFdpbmRvdzogQnJvd3NlcldpbmRvdyB8IG51bGwgPSBudWxsO1xubGV0IGdhbWVHdWVzdDogV2ViQ29udGVudHMgfCBudWxsID0gbnVsbDtcbmxldCBwcmV2aWV3UG9ydDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5sZXQgY29uc29sZVNlcSA9IDA7XG5jb25zdCBjb25zb2xlUmluZzogUnVudGltZUNvbnNvbGVFbnRyeVtdID0gW107XG5cbmZ1bmN0aW9uIGlzR2FtZUd1ZXN0KCBndWVzdDogV2ViQ29udGVudHMgKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIEdBTUVfVVJMX1BBVFRFUk4udGVzdCggU3RyaW5nKCBndWVzdC5nZXRVUkwoKSApICk7XG59XG5cbmZ1bmN0aW9uIHB1c2hDb25zb2xlRW50cnkoIGxldmVsOiBudW1iZXIsIG1lc3NhZ2U6IHN0cmluZywgbGluZTogbnVtYmVyLCBzb3VyY2VJZDogc3RyaW5nICk6IHZvaWQge1xuICAgIGNvbnNvbGVTZXEgKz0gMTtcbiAgICBjb25zb2xlUmluZy5wdXNoKCB7XG4gICAgICAgIHNlcTogY29uc29sZVNlcSxcbiAgICAgICAgdDogRGF0ZS5ub3coKSxcbiAgICAgICAgbGV2ZWw6IExFVkVMX05BTUVTWyBsZXZlbCBdID8/ICdpbmZvJyxcbiAgICAgICAgbWVzc2FnZSxcbiAgICAgICAgbGluZSxcbiAgICAgICAgc291cmNlSWQsXG4gICAgfSApO1xuICAgIGlmICggY29uc29sZVJpbmcubGVuZ3RoID4gQ09OU09MRV9SSU5HX0NBUEFDSVRZICkgY29uc29sZVJpbmcuc2hpZnQoKTtcbn1cblxuZnVuY3Rpb24gYXR0YWNoR3Vlc3QoIGd1ZXN0OiBXZWJDb250ZW50cyApOiB2b2lkIHtcbiAgICBpZiAoIGdhbWVHdWVzdCA9PT0gZ3Vlc3QgKSByZXR1cm47XG4gICAgZ2FtZUd1ZXN0ID0gZ3Vlc3Q7XG4gICAgbG9nKCAncnVudGltZS1hcGk6IGdhbWUgZ3Vlc3QgYXR0YWNoZWQnLCB7IGlkOiBndWVzdC5pZCB9ICk7XG4gICAgZ3Vlc3Qub24oICdjb25zb2xlLW1lc3NhZ2UnLCAoIF9ldmVudCwgbGV2ZWwsIG1lc3NhZ2UsIGxpbmUsIHNvdXJjZUlkICkgPT4ge1xuICAgICAgICBwdXNoQ29uc29sZUVudHJ5KCBsZXZlbCwgbWVzc2FnZSwgbGluZSwgc291cmNlSWQgKTtcbiAgICB9ICk7XG4gICAgZ3Vlc3Qub24oICdkZXN0cm95ZWQnLCAoKSA9PiB7XG4gICAgICAgIGlmICggZ2FtZUd1ZXN0ID09PSBndWVzdCApIGdhbWVHdWVzdCA9IG51bGw7XG4gICAgfSApO1xufVxuXG4vKiogRmFsbGJhY2sgd2hlbiBkaWQtYXR0YWNoLXdlYnZpZXcgd2FzIG1pc3NlZCAoZS5nLiB3aW5kb3cgb3BlbmVkIGJlZm9yZSB0aGlzIG1vZHVsZSBsb2FkZWQpLiAqL1xuZnVuY3Rpb24gZmluZEdhbWVHdWVzdCgpOiBXZWJDb250ZW50cyB8IG51bGwge1xuICAgIGlmICggIWhvc3RXaW5kb3cgfHwgaG9zdFdpbmRvdy5pc0Rlc3Ryb3llZCgpICkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgaG9zdElkID0gaG9zdFdpbmRvdy53ZWJDb250ZW50cy5pZDtcbiAgICBjb25zdCBndWVzdCA9IHdlYkNvbnRlbnRzLmdldEFsbFdlYkNvbnRlbnRzKCkuZmluZCggKCBjYW5kaWRhdGUgKSA9PlxuICAgICAgICBjYW5kaWRhdGUuZ2V0VHlwZSgpID09PSAnd2VidmlldydcbiAgICAgICAgJiYgY2FuZGlkYXRlLmhvc3RXZWJDb250ZW50cz8uaWQgPT09IGhvc3RJZFxuICAgICAgICAmJiBpc0dhbWVHdWVzdCggY2FuZGlkYXRlIClcbiAgICApO1xuICAgIHJldHVybiBndWVzdCA/PyBudWxsO1xufVxuXG5mdW5jdGlvbiByZXNvbHZlR2FtZUd1ZXN0KCk6IFdlYkNvbnRlbnRzIHwgbnVsbCB7XG4gICAgaWYgKCBnYW1lR3Vlc3QgJiYgIWdhbWVHdWVzdC5pc0Rlc3Ryb3llZCgpICkgcmV0dXJuIGdhbWVHdWVzdDtcbiAgICBjb25zdCBmb3VuZCA9IGZpbmRHYW1lR3Vlc3QoKTtcbiAgICBpZiAoIGZvdW5kICkgYXR0YWNoR3Vlc3QoIGZvdW5kICk7XG4gICAgcmV0dXJuIGZvdW5kO1xufVxuXG5mdW5jdGlvbiBpc1dpbmRvd09wZW4oKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIEJvb2xlYW4oIGhvc3RXaW5kb3cgJiYgIWhvc3RXaW5kb3cuaXNEZXN0cm95ZWQoKSApO1xufVxuXG4vKiogSG9va3MgdGhlIGluc3BlY3RvciB3aW5kb3cgc28gZXZlcnkgYXR0YWNoZWQgPHdlYnZpZXc+IHdob3NlIFVSTCBpcyB0aGUgZ2FtZSBnZXRzIHRyYWNrZWQuICovXG5leHBvcnQgZnVuY3Rpb24gdHJhY2tIb3N0V2luZG93KCB3aW46IEJyb3dzZXJXaW5kb3cgKTogdm9pZCB7XG4gICAgaG9zdFdpbmRvdyA9IHdpbjtcbiAgICB3aW4ud2ViQ29udGVudHMub24oICdkaWQtYXR0YWNoLXdlYnZpZXcnLCAoIF9ldmVudCwgZ3Vlc3QgKSA9PiB7XG4gICAgICAgIC8vIHRoZSBkZXZ0b29scyB3ZWJ2aWV3IGF0dGFjaGVzIHdpdGggYWJvdXQ6YmxhbmsgLyBkZXZ0b29sczovLzsgd2FpdCBmb3IgdGhlIGdhbWUgVVJMXG4gICAgICAgIGlmICggaXNHYW1lR3Vlc3QoIGd1ZXN0ICkgKSB7XG4gICAgICAgICAgICBhdHRhY2hHdWVzdCggZ3Vlc3QgKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBndWVzdC5vbmNlKCAnZGlkLWZpbmlzaC1sb2FkJywgKCkgPT4ge1xuICAgICAgICAgICAgaWYgKCBpc0dhbWVHdWVzdCggZ3Vlc3QgKSApIGF0dGFjaEd1ZXN0KCBndWVzdCApO1xuICAgICAgICB9ICk7XG4gICAgfSApO1xuICAgIHdpbi5vbiggJ2Nsb3NlZCcsICgpID0+IHtcbiAgICAgICAgaWYgKCBob3N0V2luZG93ID09PSB3aW4gKSBob3N0V2luZG93ID0gbnVsbDtcbiAgICAgICAgZ2FtZUd1ZXN0ID0gbnVsbDtcbiAgICB9ICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXRQcmV2aWV3UG9ydCggcG9ydDogbnVtYmVyICk6IHZvaWQge1xuICAgIHByZXZpZXdQb3J0ID0gcG9ydDtcbn1cblxuLyoqIFJlc29sdmVzIG9uY2UgdGhlIGdhbWUgcGFnZSBoYXMgZmluaXNoZWQgbG9hZGluZyAob3IgaW1tZWRpYXRlbHkgaWYgaXQgYWxyZWFkeSBoYXMpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdhaXRGb3JHYW1lUmVhZHkoIHRpbWVvdXRNczogbnVtYmVyICk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGNvbnN0IGd1ZXN0ID0gcmVzb2x2ZUdhbWVHdWVzdCgpO1xuICAgIGlmICggZ3Vlc3QgJiYgIWd1ZXN0LmlzTG9hZGluZygpICkgcmV0dXJuIFByb21pc2UucmVzb2x2ZSggdHJ1ZSApO1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSggKCByZXNvbHZlICkgPT4ge1xuICAgICAgICBjb25zdCBzdGFydGVkQXQgPSBEYXRlLm5vdygpO1xuICAgICAgICBjb25zdCB0aW1lciA9IHNldEludGVydmFsKCAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50ID0gcmVzb2x2ZUdhbWVHdWVzdCgpO1xuICAgICAgICAgICAgaWYgKCBjdXJyZW50ICYmICFjdXJyZW50LmlzTG9hZGluZygpICkge1xuICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwoIHRpbWVyICk7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSggdHJ1ZSApO1xuICAgICAgICAgICAgfSBlbHNlIGlmICggRGF0ZS5ub3coKSAtIHN0YXJ0ZWRBdCA+PSB0aW1lb3V0TXMgKSB7XG4gICAgICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCggdGltZXIgKTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKCBmYWxzZSApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LCBHQU1FX1JFQURZX1BPTExfTVMgKTtcbiAgICB9ICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRTdGF0dXMoKTogUnVudGltZVN0YXR1cyB7XG4gICAgY29uc3Qgd2luZG93T3BlbiA9IGlzV2luZG93T3BlbigpO1xuICAgIGNvbnN0IGd1ZXN0ID0gd2luZG93T3BlbiA/IHJlc29sdmVHYW1lR3Vlc3QoKSA6IG51bGw7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgd2luZG93T3BlbixcbiAgICAgICAgZ2FtZVJlYWR5OiBCb29sZWFuKCBndWVzdCAmJiAhZ3Vlc3QuaXNMb2FkaW5nKCkgKSxcbiAgICAgICAgZ2FtZVVybDogZ3Vlc3QgPyBTdHJpbmcoIGd1ZXN0LmdldFVSTCgpICkgOiBudWxsLFxuICAgICAgICBwcmV2aWV3UG9ydCxcbiAgICAgICAgY29uc29sZVNlcSxcbiAgICB9O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZXZhbEluR2FtZSggY29kZTogc3RyaW5nICk6IFByb21pc2U8UnVudGltZUV2YWxSZXN1bHQ+IHtcbiAgICBpZiAoICFpc1dpbmRvd09wZW4oKSApIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IEVSUk9SX1dJTkRPV19OT1RfT1BFTiB9O1xuICAgIGNvbnN0IGd1ZXN0ID0gcmVzb2x2ZUdhbWVHdWVzdCgpO1xuICAgIGlmICggIWd1ZXN0ICkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogRVJST1JfR0FNRV9OT1RfUkVBRFkgfTtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGF3YWl0IGd1ZXN0LmV4ZWN1dGVKYXZhU2NyaXB0KCBTdHJpbmcoIGNvZGUgKSwgdHJ1ZSApO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWUgfTtcbiAgICB9IGNhdGNoICggZXJyb3IgKSB7XG4gICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFN0cmluZyggKCBlcnJvciBhcyBFcnJvciApPy5zdGFjayA/PyAoIGVycm9yIGFzIEVycm9yICk/Lm1lc3NhZ2UgPz8gZXJyb3IgKSB9O1xuICAgIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNhcHR1cmUoIG91dFBhdGg6IHN0cmluZyApOiBQcm9taXNlPFJ1bnRpbWVDYXB0dXJlUmVzdWx0PiB7XG4gICAgaWYgKCAhaXNXaW5kb3dPcGVuKCkgKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBFUlJPUl9XSU5ET1dfTk9UX09QRU4gfTtcbiAgICBjb25zdCBndWVzdCA9IHJlc29sdmVHYW1lR3Vlc3QoKTtcbiAgICBpZiAoICFndWVzdCApIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IEVSUk9SX0dBTUVfTk9UX1JFQURZIH07XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gYSBtaW5pbWl6ZWQgLyBoaWRkZW4gd2luZG93IHlpZWxkcyBhIGJsYW5rIGNhcHR1cmVcbiAgICAgICAgaWYgKCBob3N0V2luZG93IS5pc01pbmltaXplZCgpICkgaG9zdFdpbmRvdyEucmVzdG9yZSgpO1xuICAgICAgICBpZiAoICFob3N0V2luZG93IS5pc1Zpc2libGUoKSApIGhvc3RXaW5kb3chLnNob3coKTtcbiAgICAgICAgY29uc3QgaW1hZ2UgPSBhd2FpdCBndWVzdC5jYXB0dXJlUGFnZSgpO1xuICAgICAgICBjb25zdCBzaXplID0gaW1hZ2UuZ2V0U2l6ZSgpO1xuICAgICAgICBjb25zdCBwbmcgPSBpbWFnZS50b1BORygpO1xuICAgICAgICBmcy5ta2RpclN5bmMoIHBhdGguZGlybmFtZSggb3V0UGF0aCApLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9ICk7XG4gICAgICAgIGZzLndyaXRlRmlsZVN5bmMoIG91dFBhdGgsIHBuZyApO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgcGF0aDogb3V0UGF0aCwgd2lkdGg6IHNpemUud2lkdGgsIGhlaWdodDogc2l6ZS5oZWlnaHQsIGJ5dGVzOiBwbmcubGVuZ3RoIH07XG4gICAgfSBjYXRjaCAoIGVycm9yICkge1xuICAgICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBTdHJpbmcoICggZXJyb3IgYXMgRXJyb3IgKT8ubWVzc2FnZSA/PyBlcnJvciApIH07XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVhZENvbnNvbGUoIHNpbmNlU2VxOiBudW1iZXIsIGxldmVsPzogUnVudGltZUNvbnNvbGVMZXZlbCB8ICdhbGwnICk6IFJ1bnRpbWVDb25zb2xlUmVzdWx0IHtcbiAgICBjb25zdCB3YW50TGV2ZWwgPSBsZXZlbCAmJiBsZXZlbCAhPT0gJ2FsbCcgPyBsZXZlbCA6IG51bGw7XG4gICAgY29uc3QgZW50cmllcyA9IGNvbnNvbGVSaW5nLmZpbHRlciggKCBlbnRyeSApID0+XG4gICAgICAgIGVudHJ5LnNlcSA+IHNpbmNlU2VxICYmICggIXdhbnRMZXZlbCB8fCBlbnRyeS5sZXZlbCA9PT0gd2FudExldmVsIClcbiAgICApO1xuICAgIHJldHVybiB7IG9rOiB0cnVlLCBlbnRyaWVzLCBsYXRlc3RTZXE6IGNvbnNvbGVTZXEgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsZWFyQ29uc29sZSgpOiBSdW50aW1lQ29uc29sZVJlc3VsdCB7XG4gICAgY29uc29sZVJpbmcubGVuZ3RoID0gMDtcbiAgICByZXR1cm4geyBvazogdHJ1ZSwgZW50cmllczogW10sIGxhdGVzdFNlcTogY29uc29sZVNlcSB9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUVBLElBQUFBLG1CQUFxRDs7O0FDRTlDLElBQU0sV0FBVztBQVdqQixJQUFNLFVBQVU7QUFBQSxFQUNuQixXQUFXLEdBQUksUUFBUztBQUFBLEVBQ3hCLFlBQVks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
