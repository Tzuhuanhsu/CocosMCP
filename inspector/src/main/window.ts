// Inspector BrowserWindow + tray lifecycle.
import { BrowserWindow, Menu, MenuItem, Tray, nativeImage } from 'electron';
import * as path from 'path';
import { readConfig, getProjectConfigPath, readProjectDesignSize, CONFIG_PATH_ARG, DESIGN_SIZE_ARG } from './config';
import { InspectorMode, type InspectorConfig } from '@shared/protocol';
import { log } from './log';
import { trackHostWindow, setPreviewPort, waitForGameReady } from './runtime-api';

// Editor is Cocos Creator's global in the extension host process.
declare const Editor: {
    Message: { request: ( target: string, message: string ) => Promise<number> };
};

const EXTENSION_ROOT = path.join( __dirname, '..' );
const PKG_VERSION: string = __PKG_VERSION__;

const DEFAULT_WIDTH = 878;
const DEFAULT_HEIGHT = 600;
const SIMPLE_MODE_TOOLBAR_HEIGHT = 51;
const TRAY_ICON_SIZE = 16;
const OPEN_TIMEOUT_MS = 15000;

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let mode: InspectorMode = InspectorMode.Preview;
let config: InspectorConfig = readConfig();

export function getInspectorWindow(): BrowserWindow | null {
    return win;
}

export function notifyRenderer( channel: string, ...args: unknown[] ): void {
    if ( win && !win.isDestroyed() ) win.webContents.send( channel, ...args );
}

function desiredContentSize(): [ number, number ] {
    if ( config.simpleMode ) {
        const width = config.isPortrait ? config.size[ 0 ] : config.size[ 1 ];
        const height = ( config.isPortrait ? config.size[ 1 ] : config.size[ 0 ] ) + SIMPLE_MODE_TOOLBAR_HEIGHT;
        return [ width, height ];
    }
    return [ DEFAULT_WIDTH, DEFAULT_HEIGHT ];
}

/** In simple mode the window size is locked to the configured game resolution. */
function enforceSimpleModeSize(): void {
    if ( !win ) return;
    win.webContents.executeJavaScript( 'setting.configDataForMain' ).then( ( latestConfig: InspectorConfig | null ) => {
        if ( latestConfig ) config = latestConfig;
        if ( !config.simpleMode || !win ) return;
        const [ width, height ] = desiredContentSize();
        const current = win.getContentSize();
        if ( width !== current[ 0 ] || height !== current[ 1 ] ) win.setContentSize( width, height );
    } ).catch( ( error: Error ) => log( 'resize sync failed', String( error?.message ?? error ) ) );
}

function rendererArguments(): string[] {
    const args: string[] = [];
    const configPath = getProjectConfigPath();
    if ( configPath ) args.push( CONFIG_PATH_ARG + configPath );
    const designSize = readProjectDesignSize();
    if ( designSize ) args.push( DESIGN_SIZE_ARG + designSize.join( 'x' ) );
    return args;
}

async function showWindow(): Promise<void> {
    if ( win ) {
        win.show();
        win.webContents.executeJavaScript( `v.switchMode(${ mode })` );
        return;
    }
    const [ width, height ] = desiredContentSize();
    win = new BrowserWindow( {
        width,
        height,
        title: `Cocos Inspector v${ PKG_VERSION }`,
        backgroundColor: '#2e2c29',
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
            preload: path.join( __dirname, 'mainPreload.js' ),
            // the renderer has no Editor global; hand it the project-level config path and design resolution
            additionalArguments: rendererArguments(),
        },
        resizable: !config.simpleMode,
        minimizable: !config.simpleMode,
        maximizable: !config.simpleMode,
        useContentSize: true,
    } );
    try {
        // the inspector window manages its own UI; block the default menu bar permanently
        win.setMenu( null );
        win.setMenuBarVisibility( false );
        ( win as unknown as Record<string, unknown> ).setMenuBarVisibility = () => undefined;
        ( win as unknown as Record<string, unknown> ).setMenu = () => undefined;
    } catch {
        // some electron versions restrict overriding these methods
    }
    trackHostWindow( win );
    win.on( 'resize', enforceSimpleModeSize );
    win.on( 'ready-to-show', () => win?.show() );
    win.on( 'closed', () => {
        win = null;
        if ( tray ) tray.destroy();
        tray = null;
    } );

    const port = await Editor.Message.request( 'server', 'query-port' );
    setPreviewPort( port );
    const pageUrl = path.join( EXTENSION_ROOT, `index.html?port=${ port }&mode=${ mode }` );
    log( 'inspector window created', { mode, simpleMode: Boolean( config.simpleMode ) } );
    win.loadURL( `file://${ pageUrl }` );
}

function ensureTray(): void {
    try {
        let icon = nativeImage.createFromPath( path.join( EXTENSION_ROOT, 'icon.png' ) );
        icon = icon.resize( { width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE } );
        if ( tray ) {
            tray.setImage( icon );
            return;
        }
        tray = new Tray( icon );
        tray.on( 'click', () => win?.show() );
        const trayMenu = new Menu();
        trayMenu.append( new MenuItem( {
            label: 'Toggle Mini Mode',
            click: () => win?.webContents.executeJavaScript( 'setting.toggleSimpleMode()' ),
        } ) );
        trayMenu.append( new MenuItem( {
            label: 'OpenDevTools',
            click: () => win?.webContents.openDevTools(),
        } ) );
        tray.setContextMenu( trayMenu );
    } catch ( error ) {
        log( 'tray setup failed', String( error ) );
    }
}

export function tryShowWindow( nextMode: InspectorMode ): void {
    openInspector( nextMode ).catch( ( error: Error ) => log( 'showWindow failed', String( error?.stack ?? error ) ) );
}

/** Awaitable variant for the runtime API: resolves true once the game page has loaded. */
export async function openInspector( nextMode: InspectorMode ): Promise<boolean> {
    ensureTray();
    mode = nextMode;
    await showWindow();
    return waitForGameReady( OPEN_TIMEOUT_MS );
}
