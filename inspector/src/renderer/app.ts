// Inspector renderer entry point: registers components, creates the setting + main Vue
// instances, wires the game webview and the in-tab DevTools.
import * as fs from 'fs';
import * as path from 'path';
import { HostChannel } from '@shared/protocol';
import { context, execInGame } from './context';
import { wireDevtoolsIpc, setAudioMutedIpc, onDebuggerPaused } from './ipc';
import { showAppMenu, showTreeMenu } from './menus';
import { createSettingApp } from './setting';
import { registerNodeDetailComponents } from './components/node-detail';
import { registerNodeTreeComponents } from './components/node-tree';
import { registerConsolePanel } from './components/console-panel';
import { registerCocosPanels } from './components/cocos-panel';
import { registerPanels } from './components/panels';
import { registerResolutionComponents } from './components/resolution';
import { registerHelpComponent } from './components/help';

const injectedSource = fs.readFileSync( path.join( __dirname, 'dist/injected.js' ), { encoding: 'utf-8' } );

registerNodeDetailComponents();
registerNodeTreeComponents();
registerConsolePanel();
registerCocosPanels();
registerPanels();
registerResolutionComponents();
registerHelpComponent();

const setting = createSettingApp();

// staging buffers flushed once per animation frame (high-frequency updates from the game)
let tempNodeTree: unknown = null;
let lastNodeSet: Set<string> = new Set();
const tempLogs: Array<{ time: string; t: string; d: string }> = [];

onDebuggerPaused( () => {
    if ( context.vueApp ) context.vueApp.tab = 1;
} );

/**
 * Idempotent DevTools-in-tab wiring (runs in the extension main process via IPC).
 * Triggered on game-webview load AND when the DevTool tab is opened, so enabling
 * "Show DevTool In Tab" does not require an inspector restart.
 */
function wireDevtoolsInTab(): void {
    const v = context.vueApp;
    if ( !context.wv || !v || !setting.showDevToolInTab ) return;
    const devtoolsView = v.$refs.devtools as HTMLWebViewElement | undefined;
    if ( !devtoolsView ) return;
    context.dwv = devtoolsView;
    let gameId: number;
    let devtoolsId: number;
    try {
        gameId = context.wv.getWebContentsId();
        devtoolsId = devtoolsView.getWebContentsId();
    } catch {
        return; // webview not attached yet
    }
    wireDevtoolsIpc( gameId, devtoolsId ).then( ( result ) => {
        if ( result?.error === 'game page not loaded yet' ) return;
        if ( !result?.ok ) {
            const message = `[inspector] devtools wiring failed: ${ result?.error }`;
            console.error( message );
            v.pushLog( new Date().toLocaleTimeString(), HostChannel.consoleError, message );
            return;
        }
        if ( typeof result.muted === 'boolean' ) v.isMuted = result.muted;
    } ).catch( ( error: Error ) => {
        const message = `[inspector] devtools wiring failed (is main.js updated? restart CocosCreator): ${ error.message }`;
        console.error( message );
        v.pushLog( new Date().toLocaleTimeString(), HostChannel.consoleError, message );
    } );
}

const v = new Vue( {
    el: '#app',
    mounted() {
        this.$watch( 'tab', ( tab: number ) => {
            if ( tab === 1 ) wireDevtoolsInTab();
        } );
        document.addEventListener( 'keydown', ( event: KeyboardEvent ) => {
            if ( ( event.key === 'Escape' || event.keyCode === 27 ) && this.showResolutionSelector ) {
                this.showResolutionSelector = false;
            }
        } );
        const wv = this.$refs.wv as HTMLWebViewElement;
        context.wv = wv;
        // wire as early as possible so DevTools catches the game's boot-time console output
        wv.addEventListener( 'did-start-loading', () => setTimeout( wireDevtoolsInTab, 200 ) );
        wv.addEventListener( 'dom-ready', () => {
            execInGame( `var __logCount=${ setting.logCount };var __showDevToolInTab=${ setting.showDevToolInTab }` );
            execInGame( injectedSource );
            setting.initMv( {
                __lockDragNode: this.lockNode,
                __hover: this.hover,
                __designMode: this.designMode,
            } );
            wireDevtoolsInTab();
        } );
        wv.addEventListener( 'did-finish-load', () => v.clearTree() );
        wv.addEventListener( 'ipc-message', ( event: { channel: string; args: unknown[] } ) => {
            const { args, channel } = event;
            switch ( channel ) {
                case HostChannel.gameState:
                    this.gamePaused = args[ 0 ];
                    break;
                case HostChannel.locateNode:
                    if ( setting.simpleMode ) setting.toggleSimpleMode();
                    this.locateNode( args[ 0 ] );
                    break;
                case HostChannel.consoleLog:
                case HostChannel.consoleError:
                case HostChannel.consoleWarn:
                    this.pushLog( new Date().toLocaleTimeString(), channel, args[ 0 ] );
                    break;
                case HostChannel.canUpdateTree:
                    this.canUpdateTree = args[ 0 ];
                    break;
                case HostChannel.updateTree:
                    tempNodeTree = args[ 0 ];
                    this.treeUpdate = 0;
                    break;
                case HostChannel.sendStatistic:
                    this.statistics = args[ 0 ];
                    break;
                case HostChannel.showNodeDetail:
                    if ( this.nodeDetail ) Object.assign( this.nodeDetail, args[ 0 ] );
                    else this.nodeDetail = args[ 0 ];
                    break;
            }
        } );
    },
    data: {
        treeUpdate: 0,
        logUpdate: 0,
        gamePaused: false,
        canUpdateTree: false,
        logs: [],
        nodeTree: null,
        openNodes: new Set(),
        selectedNode: '',
        needScrollOneTime: false,
        nodeDetail: null,
        port: null,
        showResolutionSelector: false,
        designMode: false,
        tab: 0,
        mode: 0,
        urlParams: '',
        hover: 0,
        hide3dRootNode: false,
        dragingSN: null,
        dragingEN: null,
        lockNode: null,
        isMuted: false,
        showChildrenCount: false,
        // statistic feature state lived half on `setting` upstream; consolidated on `v`
        statistics: null,
        statisticing: false,
    },
    computed: {
        showDevToolInTab(): boolean {
            return setting.showDevToolInTab;
        },
        designBtnStyle(): string {
            return this.designMode ? 'position:relative;color:rgb(52, 146, 235);' : 'position:relative;';
        },
        hoverBtnStyle(): string {
            return this.hover ? 'position:relative;color:rgb(52, 146, 235);' : 'position:relative;';
        },
        resolutionBtnStyle(): string {
            return this.showResolutionSelector ? 'color:rgb(52, 146, 235);' : '';
        },
        hoverMark(): string {
            switch ( this.hover ) {
                case 1: return '2D';
                case 2: return '3D';
                default: return '';
            }
        },
        disableWebSec(): boolean {
            return setting.disableWebSec;
        },
        gameUrl(): string {
            if ( this.mode == 2 && setting.customUrl ) return setting.customUrl;
            let page = '';
            if ( this.mode > 0 ) {
                page = this.mode == 1 ? 'web-mobile/web-mobile/index.html' : 'web-desktop/web-desktop/index.html';
            }
            const params = this.urlParams.trim();
            if ( params !== '' ) page += params.startsWith( '?' ) ? params : '?' + params;
            return `http://localhost:${ this.port }/${ page }`;
        },
        pauseIcon(): string {
            return 'iconfont ' + ( this.gamePaused ? 'icon-bofangsanjiaoxing' : 'icon-iconfront-' );
        },
        showRefreshTreeBtn(): boolean {
            return this.canUpdateTree && !setting.autoUpdateTree;
        },
        sceneName(): string {
            return this.nodeTree ? this.nodeTree.name : '';
        },
        smallLogs(): unknown[] {
            if ( setting.logCount == 0 ) return [];
            return this.logs.slice( -setting.logCount );
        },
        bigLogs(): unknown[] {
            return this.logs.slice( -100 );
        },
        simpleMode(): boolean {
            return setting.simpleMode;
        },
    },
    created() {
        context.vueApp = this;
        ( window as any ).v = this;
        this.checkUrlParams();
        const query = location.search.slice( 1 ).split( '&' );
        this.port = query[ 0 ].split( '=' )[ 1 ];
        this.mode = query[ 1 ].split( '=' )[ 1 ];
        this.$nextTick().then( () => {
            this.$el.style.visibility = 'visible';
        } );
        requestAnimationFrame( this.everyFrame );
    },
    methods: {
        toggleDrag( nodeId: string ) {
            this.lockNode = this.lockNode !== nodeId ? nodeId : null;
            if ( this.lockNode && !this.designMode ) this.toggleDesignMode();
            execInGame( `__toggleDrag('${ this.lockNode }')` );
        },
        syncOpenFcom( nodeId: string ) {
            execInGame( `__syncOpenFcom('${ nodeId }')` );
        },
        syncOpen( nodeId: string, open: boolean, update = true ) {
            if ( open ) this.openNodes.add( nodeId );
            else this.openNodes.delete( nodeId );
            execInGame( `__syncOpen('${ nodeId }', ${ open }, ${ update })` );
        },
        toggleSnd() {
            this.isMuted = !this.isMuted;
            setAudioMutedIpc( context.wv!.getWebContentsId(), this.isMuted );
        },
        everyFrame() {
            if ( this.treeUpdate == 1 && tempNodeTree ) {
                this.nodeTree = tempNodeTree;
                if ( this.needScrollOneTime ) {
                    this.$nextTick().then( () => {
                        ( document.querySelector( '#selectedNode' )?.firstElementChild as any )?.scrollIntoViewIfNeeded();
                    } );
                    this.needScrollOneTime = false;
                }
                tempNodeTree = null;
            }
            if ( tempLogs.length > 0 ) {
                this.logs.push( ...tempLogs );
                this.scrollLogToBottom();
                tempLogs.length = 0;
            }
            requestAnimationFrame( this.everyFrame );
            if ( this.treeUpdate < 1 ) this.treeUpdate++;
            if ( this.logUpdate < 1 ) this.logUpdate++;
        },
        checkUrlParams(): boolean {
            if ( setting.urlParams !== this.urlParams ) {
                this.urlParams = setting.urlParams;
                return true;
            }
            return false;
        },
        showAppMenu( event: MouseEvent ) {
            if ( event.target instanceof HTMLInputElement ) return;
            if ( event.target instanceof HTMLButtonElement ) return;
            showAppMenu();
        },
        showMenu() {
            showTreeMenu();
        },
        switchMode( mode: number ) {
            this.mode = mode;
        },
        pushLog( time: string, type: string, data: string ) {
            tempLogs.push( { time, t: type, d: data } );
            this.logUpdate = 0;
        },
        scrollLogToBottom() {
            const el = this.$refs.logs;
            this.$nextTick( () => { el.scrollTop = el.scrollHeight; } );
        },
        forceUpdateTree() {
            this.canUpdateTree = false;
            execInGame( '__updateTree()' );
        },
        selectNode( nodeId: string, withDetail = true ) {
            this.selectedNode = nodeId;
            this.$emit( 'selectedNode_changed' );
            if ( !withDetail ) return;
            execInGame( `__getNodeDetail('${ nodeId }')` );
        },
        locateNode( uuidPath: string[] ) {
            this.tab = 0;
            const lastId = uuidPath.slice( -1 )[ 0 ];
            const openSet = new Set( uuidPath );
            openSet.delete( lastId );
            openSet.forEach( ( uuid ) => this.openNodes.add( uuid ) );
            this.needScrollOneTime = true;
            execInGame( `__locateNode([${ uuidPath.map( ( uuid ) => `"${ uuid }"` ) }])` );
            lastNodeSet = openSet;
            this.$emit( 'locateNode', openSet );
            this.selectNode( lastId, false );
        },
        toggleNode( nodeId: string ) {
            if ( this.openNodes.has( nodeId ) ) this.openNodes.delete( nodeId );
            else this.openNodes.add( nodeId );
        },
        logColor( type: string ): string | undefined {
            switch ( type ) {
                case HostChannel.consoleLog: return 'unset';
                case HostChannel.consoleError: return 'red';
                case HostChannel.consoleWarn: return '#cc9138';
            }
            return undefined;
        },
        playOrPause() {
            execInGame( this.gamePaused ? 'cc.game.resume()' : 'cc.game.pause()' );
        },
        refresh() {
            if ( !this.checkUrlParams() ) context.wv!.reloadIgnoringCache();
            this.clearTree();
        },
        clearTree() {
            this.nodeTree = null;
            this.selectedNode = null;
            this.nodeDetail = null;
            if ( setting.clearLogAfterRefresh ) this.logs = [];
            this.openNodes.clear();
            lastNodeSet?.clear();
        },
        toggleFps() {
            execInGame( '__toggleFps()' );
        },
        toggleDesignMode() {
            this.designMode = !this.designMode;
            execInGame( `__toggleDesignMode(${ this.designMode })` );
        },
        toggleHover() {
            this.hover = this.hover == 0 ? 1 : 0;
            execInGame( `__setHover(${ this.hover })` );
        },
        toggle3dHover() {
            this.hover = this.hover == 0 ? 2 : 0;
            execInGame( `__setHover(${ this.hover })` );
        },
        compile() {
            this.pushLog( new Date().toLocaleTimeString(), HostChannel.consoleLog, 'reCompiling...' );
            execInGame( '__reCompile()' );
        },
        openWvDevTool() {
            context.wv!.openDevTools();
        },
        showSetting() {
            setting.show = true;
        },
        showHelp() {
            v.$refs.help.show = true;
        },
        toggleStatistic() {
            this.statisticing = !this.statisticing;
            execInGame( `__startStatistic(${ this.statisticing })` );
        },
    },
} );
