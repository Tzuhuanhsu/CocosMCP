// Cocos Inspector - runtime inspector module, hosted by the cocos-mcp-server extension (main process).
// The host's source/main.ts calls load()/unload() and re-exports `methods`; RuntimeTools uses `runtime`.
import { ipcMain, dialog, app, Menu, MenuItem } from 'electron';
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import {
    IpcSend, IpcInvoke, IpcEvent, InspectorMode,
    type MenuItemSpec, type RuntimeStatus, type RuntimeEvalResult, type RuntimeCaptureResult,
    type RuntimeConsoleResult, type RuntimeConsoleLevel,
} from '@shared/protocol';
import { wireDevtools, setGameAudioMuted } from './devtools-wiring';
import { tryShowWindow, openInspector, getInspectorWindow, notifyRenderer } from './window';
import * as runtime_api from './runtime-api';
import { log, resetLogFile } from './log';

// Editor is Cocos Creator's global in the extension host process.
declare const Editor: {
    Selection: {
        getSelected: ( type: string ) => string[];
        unselect: ( type: string, uuids: string[] ) => void;
        select: ( type: string, uuid: string ) => void;
    };
    Message: { broadcast: ( message: string, ...args: unknown[] ) => void };
};

const PKG_VERSION: string = __PKG_VERSION__;

let unloaded = false;

function focusNode( _event: IpcMainEvent, uuid: string ): void {
    const selected = Editor.Selection.getSelected( 'node' );
    Editor.Selection.unselect( 'node', selected );
    Editor.Selection.select( 'node', uuid );
}

function focusAsset( _event: IpcMainEvent, uuid: string ): void {
    Editor.Message.broadcast( 'ui-kit:touch-asset', uuid );
    const selected = Editor.Selection.getSelected( 'asset' );
    Editor.Selection.unselect( 'asset', selected );
    Editor.Selection.select( 'asset', uuid );
}

function buildMenu( items: MenuItemSpec[], onClick: ( id: string | null ) => void ): Electron.Menu {
    const menu = new Menu();
    for ( const item of items ) {
        menu.append( new MenuItem( {
            label: item.label ?? '',
            type: item.submenu ? 'submenu' : ( item.type ?? 'normal' ),
            checked: item.checked,
            enabled: item.enabled !== false,
            submenu: item.submenu ? buildMenu( item.submenu, onClick ) : undefined,
            click: item.submenu ? undefined : () => onClick( item.id ?? item.label ?? null ),
        } ) );
    }
    return menu;
}

/** Shows a native context menu on the inspector window; resolves with the clicked item id. */
function showContextMenu( _event: IpcMainInvokeEvent, items: MenuItemSpec[] ): Promise<string | null> {
    return new Promise( ( resolve ) => {
        const win = getInspectorWindow();
        if ( !win ) return resolve( null );
        let clickedId: string | null = null;
        const menu = buildMenu( items, ( id ) => { clickedId = id; } );
        menu.popup( { window: win, callback: () => resolve( clickedId ) } );
    } );
}

/** Applies window sizing/decoration rules when the inspector enters or leaves mini mode. */
function syncWindowMode( _event: IpcMainInvokeEvent, width: number, height: number, simpleMode: boolean, minHeightExtra: number ): void {
    const win = getInspectorWindow();
    if ( !win ) return;
    if ( simpleMode ) {
        if ( win.isMaximized() ) win.unmaximize();
        if ( win.isFullScreen() ) win.setFullScreen( false );
        win.setMinimumSize( width, height );
        win.setMinimizable( false );
        win.setResizable( false );
        win.setMaximizable( false );
        win.setContentSize( width, height );
    } else {
        win.setMinimizable( true );
        win.setResizable( true );
        win.setMaximizable( true );
        win.setMinimumSize( width, height + minHeightExtra );
        const current = win.getContentSize();
        win.setContentSize( Math.max( width, current[ 0 ] ), Math.max( height, current[ 1 ] ) );
    }
}

async function showOpenDialog( _event: IpcMainInvokeEvent, extensions: string[] ): Promise<string[] | null> {
    const win = getInspectorWindow();
    if ( !win ) return null;
    const result = await dialog.showOpenDialog( win, {
        properties: [ 'openFile' ],
        filters: [ { name: 'files', extensions } ],
    } );
    return result.canceled ? null : result.filePaths;
}

/**
 * In-process runtime API consumed by the MCP RuntimeTools (same extension, no IPC hop).
 * Every call returns plain data; failures come back as { ok: false, error }.
 */
const runtime = {
    status(): RuntimeStatus {
        return runtime_api.getStatus();
    },
    async open( mode: InspectorMode = InspectorMode.Preview ): Promise<RuntimeStatus> {
        if ( !unloaded ) await openInspector( mode );
        return runtime_api.getStatus();
    },
    eval( code: string ): Promise<RuntimeEvalResult> {
        return runtime_api.evalInGame( code );
    },
    capture( outPath: string ): Promise<RuntimeCaptureResult> {
        return runtime_api.capture( outPath );
    },
    console( sinceSeq = 0, level?: RuntimeConsoleLevel | 'all' ): RuntimeConsoleResult {
        return runtime_api.readConsole( Number( sinceSeq ) || 0, level );
    },
    clearConsole(): RuntimeConsoleResult {
        return runtime_api.clearConsole();
    },
};

module.exports = {
    runtime,
    async load(): Promise<void> {
        resetLogFile();
        log( `main loaded (v${ PKG_VERSION })`, { electron: process.versions.electron } );
        ipcMain.on( IpcSend.focusNode, focusNode );
        ipcMain.on( IpcSend.focusAsset, focusAsset );
        ipcMain.handle( IpcInvoke.wireDevtools, ( _event, gameWcId: number, devtoolsWcId: number ) =>
            wireDevtools( gameWcId, devtoolsWcId, () => notifyRenderer( IpcEvent.debuggerPaused ) ) );
        ipcMain.handle( IpcInvoke.setAudioMuted, ( _event, gameWcId: number, muted: boolean ) =>
            setGameAudioMuted( gameWcId, muted ) );
        ipcMain.handle( IpcInvoke.showMenu, showContextMenu );
        ipcMain.handle( IpcInvoke.showOpenDialog, showOpenDialog );
        ipcMain.handle( IpcInvoke.getLocale, () => app.getLocale() );
        ipcMain.handle( IpcInvoke.syncWindowMode, syncWindowMode );
        ipcMain.handle( IpcInvoke.openAppDevtools, () => getInspectorWindow()?.webContents.openDevTools() );
    },

    unload(): void {
        unloaded = true;
        ipcMain.removeAllListeners( IpcSend.focusNode );
        ipcMain.removeAllListeners( IpcSend.focusAsset );
        for ( const channel of [ IpcInvoke.wireDevtools, IpcInvoke.setAudioMuted, IpcInvoke.showMenu, IpcInvoke.showOpenDialog, IpcInvoke.getLocale, IpcInvoke.syncWindowMode, IpcInvoke.openAppDevtools ] ) {
            ipcMain.removeHandler( channel );
        }
    },

    methods: {
        previewMode(): void {
            if ( !unloaded ) tryShowWindow( InspectorMode.Preview );
        },
        buildMobileMode(): void {
            if ( !unloaded ) tryShowWindow( InspectorMode.BuildMobile );
        },
        buildDesktopMode(): void {
            if ( !unloaded ) tryShowWindow( InspectorMode.BuildDesktop );
        },
        openCustomPage(): void {
            if ( !unloaded ) tryShowWindow( InspectorMode.CustomPage );
        },

    },
};
