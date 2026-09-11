// Settings Vue instance (right-hand slide-in panel bound to #setting in index.html).
import * as fs from 'fs';
import * as os from 'os';
import { context, execInGame } from './context';
import { syncWindowModeIpc, openExternal } from './ipc';
import { extensionMenus } from './menus';

const isWindows = os.type().includes( 'Windows' );
const CHROME_EXTRA_WIDTH = 546;
const CHROME_EXTRA_HEIGHT = 45;
const WINDOWS_SCROLLBAR_WIDTH = 18;

export function createSettingApp(): any {
    const setting = new Vue( {
        el: '#setting',
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
            size: [ 480, 640 ],
            extraSizes: [],
            isPortrait: false,
            // game view follows the project design resolution until the user picks another size
            matchDesign: true,
            show: false,
            urlParams: '',
            customUrl: '',
            clearLogAfterRefresh: true,
            extensionFile: '',
            enableExtension: true,
            statisticing: false,
            statistics: null,
            sortCompProperties: {},
            simpleMode: false,
        },
        created() {
            const stored = readConfig();
            if ( stored ) {
                Object.assign( this, stored );
                this.show = false;
            }
            this.applyDesignSize();
            if ( this.enableExtension && this.extensionFile && this.extensionFile !== '' ) {
                try {
                    const raw = fs.readFileSync( this.extensionFile, { encoding: 'utf-8' } );
                    const { menu: { node, component } } = JSON.parse( raw );
                    if ( node?.length > 0 ) extensionMenus.node.push( ...node );
                    if ( component?.length > 0 ) extensionMenus.component.push( ...component );
                } catch ( error ) {
                    console.error( '[inspector] failed to load extension menu file', error );
                }
            }
        },
        computed: {
            w(): number {
                return this.isPortrait ? this.size[ 0 ] : this.size[ 1 ];
            },
            h(): number {
                return this.isPortrait ? this.size[ 1 ] : this.size[ 0 ];
            },
            webviewStyle(): string {
                let width = this.w + CHROME_EXTRA_WIDTH;
                const height = this.h + CHROME_EXTRA_HEIGHT;
                if ( this.simpleMode ) width = this.w;
                else if ( isWindows ) width += WINDOWS_SCROLLBAR_WIDTH;
                syncWindowModeIpc( width, height, this.simpleMode, isWindows ? 45 : 37 );
                return `width:${ this.w }px;height:${ this.h }px;min-width:${ this.w }px;min-height:${ this.h }px`;
            },
            gamePanelStyle(): string {
                return `max-width:${ this.w }px`;
            },
            configDataForMain(): object {
                return { simpleMode: this.simpleMode, isPortrait: this.isPortrait, size: this.size };
            },
        },
        methods: {
            openExternal( url: string ) {
                openExternal( url );
            },
            /** Sizes the game view to the project design resolution so nothing gets cropped by the fit policy. */
            applyDesignSize() {
                const design = readDesignSize();
                if ( this.matchDesign === false || !design ) return;
                this.isPortrait = design[ 1 ] > design[ 0 ];
                this.size = [ Math.min( ...design ), Math.max( ...design ) ];
            },
            togglePortrait() {
                this.isPortrait = !this.isPortrait;
                this.syncPortrait();
            },
            syncPortrait() {
                this.saveToStorage();
                this.$nextTick().then( () => execInGame( 'setTimeout(__resizeCvn,200)' ) );
                context.vueApp.showResolutionSelector = false;
            },
            toggleSimpleMode() {
                this.simpleMode = !this.simpleMode;
                this.saveToStorage();
            },
            toggleSortComp( comName: string ) {
                this.sortCompProperties[ comName ] = this.sortCompProperties[ comName ] ? 0 : 1;
                this.saveToStorage( 'toggleSortComp' );
            },
            toggleStatistic() {
                this.statisticing = !this.statisticing;
                execInGame( `__startStatistic(${ this.statisticing })` );
            },
            /** Pushes host-controlled flags + retina hook into a freshly loaded game page. */
            initMv( vars: Record<string, unknown> = {} ) {
                let script = `__autoUpdateTree=${ this.autoUpdateTree };__syncNodeDetail=${ this.syncNodeDetail };`;
                for ( const name in vars ) {
                    const value = vars[ name ];
                    script += typeof value === 'string' ? `${ name }='${ value }';` : `${ name }=${ value };`;
                }
                script += `var dectedCC = setInterval(function(){
                if(!window["cc"]){
                    return
                }
                clearInterval(dectedCC)
                cc.director.once(cc.Director.EVENT_BEFORE_SCENE_LAUNCH,function(){if(!__moreThen3_4_0())cc.view.enableRetina(${ this.retinaEnable })})
            }, 10)
                `;
                execInGame( script );
                return script;
            },
            changeSetting() {
                const v = context.vueApp;
                if ( this.autoUpdateTree && v.canUpdateTree ) v.forceUpdateTree();
                execInGame( `__autoUpdateTree=${ this.autoUpdateTree };__syncNodeDetail=${ this.syncNodeDetail };` );
            },
            saveToStorage( eventName?: string ) {
                this.changeSetting();
                saveConfig( this.$data );
                this.$emit( eventName || 'settingSize_change' );
            },
            close() {
                this.show = false;
            },
        },
    } );
    context.settingApp = setting;
    ( window as any ).setting = setting;
    return setting;
}
