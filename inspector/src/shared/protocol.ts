// Message protocol shared between the extension main process, the inspector renderer,
// the game-webview preload, and the injected probe script.

/** Host extension package name (the inspector ships inside cocos-mcp-server); every IPC channel is prefixed with it. */
export const PKG_NAME = 'cocos-mcp-server';

/** Window open modes triggered from the Creator extension menu. */
export enum InspectorMode {
    Preview = 0,
    BuildMobile = 1,
    CustomPage = 2,
    BuildDesktop = 3,
}

/** renderer -> main (ipcRenderer.send). */
export const IpcSend = {
    focusNode: `${ PKG_NAME }:focusNode`,
    focusAsset: `${ PKG_NAME }:focusAsset`,
} as const;

/** renderer -> main (ipcRenderer.invoke). */
export const IpcInvoke = {
    wireDevtools: `${ PKG_NAME }:wire-devtools`,
    setAudioMuted: `${ PKG_NAME }:set-audio-muted`,
    showMenu: `${ PKG_NAME }:show-menu`,
    showOpenDialog: `${ PKG_NAME }:show-open-dialog`,
    getLocale: `${ PKG_NAME }:get-locale`,
    syncWindowMode: `${ PKG_NAME }:sync-window-mode`,
    openAppDevtools: `${ PKG_NAME }:open-app-devtools`,
} as const;

/** main -> renderer (webContents.send). */
export const IpcEvent = {
    debuggerPaused: `${ PKG_NAME }:debugger-paused`,
    menuClicked: `${ PKG_NAME }:menu-clicked`,
} as const;

export interface WireDevtoolsResult {
    ok: boolean;
    error?: string;
    muted?: boolean;
}

/** One entry of a context menu requested by the renderer. */
export interface MenuItemSpec {
    id?: string;
    label?: string;
    type?: 'normal' | 'separator' | 'checkbox';
    checked?: boolean;
    enabled?: boolean;
    submenu?: MenuItemSpec[];
}

/**
 * Channels used by the game-webview preload: the injected probe calls the matching global
 * function, the preload forwards it to the inspector renderer via ipcRenderer.sendToHost.
 */
export const HostChannel = {
    gameState: 'gameState',
    locateNode: 'locateNode',
    consoleLog: 'consoleLog',
    consoleError: 'consoleError',
    consoleWarn: 'consoleWarn',
    updateTree: 'updateTree',
    showNodeDetail: 'showNodeDetail',
    sendStatistic: 'sendStatistic',
    canUpdateTree: 'canUpdateTree',
} as const;

/** Persisted inspector settings (extensions/cocos-inspector-config.json). */
export interface InspectorConfig {
    logCount: number | string;
    retinaEnable: boolean;
    autoUpdateTree: boolean;
    displayAsFairyTree?: boolean;
    hideFairyComContainer?: boolean;
    syncNodeDetail?: boolean;
    disableWebSec?: boolean;
    showDevToolInTab?: boolean;
    size: [ number, number ];
    extraSizes?: unknown[];
    isPortrait: boolean;
    show: boolean;
    urlParams?: string;
    customUrl?: string;
    clearLogAfterRefresh?: boolean;
    extensionFile?: string;
    enableExtension?: boolean;
    statisticing?: boolean;
    statistics?: unknown;
    sortCompProperties?: Record<string, boolean>;
    simpleMode?: boolean;
    /** true (default): game view follows the project design resolution; false: user-picked size */
    matchDesign?: boolean;
}

// ---------------------------------------------------------------------------------------------
// Runtime API exposed to other extensions through Editor.Message (package.json "runtime-*").
// Payloads must stay JSON-serializable: they cross the Creator IPC boundary.

export type RuntimeConsoleLevel = 'verbose' | 'info' | 'warning' | 'error';

export interface RuntimeStatus {
    windowOpen: boolean;
    gameReady: boolean;
    gameUrl: string | null;
    previewPort: number | null;
    consoleSeq: number;
}

export interface RuntimeEvalResult {
    ok: boolean;
    value?: unknown;
    error?: string;
}

export interface RuntimeConsoleEntry {
    seq: number;
    t: number;
    level: RuntimeConsoleLevel;
    message: string;
    line: number;
    sourceId: string;
}

export interface RuntimeConsoleResult {
    ok: boolean;
    entries: RuntimeConsoleEntry[];
    latestSeq: number;
    error?: string;
}

export interface RuntimeCaptureResult {
    ok: boolean;
    path?: string;
    width?: number;
    height?: number;
    bytes?: number;
    error?: string;
}
