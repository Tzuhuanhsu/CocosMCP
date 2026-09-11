// Resolution simulation: drag-resizer overlay and the preset-size selector popup.
import { context, execInGame } from './../context';

interface SizePreset {
    name: string;
    /** [shorterEdge, longerEdge] */
    s: number[];
    /** project design resolution entry: selecting it re-enables matchDesign */
    design?: boolean;
    portrait?: boolean;
}

const PRESET_SIZES: SizePreset[] = [
    { name: 'iPhone 4', s: [ 320, 480 ] },
    { name: 'iPhone 5', s: [ 320, 568 ] },
    { name: 'iPhone 7', s: [ 375, 667 ] },
    { name: 'iPhone 7 Plus', s: [ 414, 736 ] },
    { name: 'iPhone X', s: [ 375, 812 ] },
    { name: 'iPad', s: [ 768, 1024 ] },
    { name: 'HW P9', s: [ 540, 960 ] },
    { name: 'HW Mate9 Pro', s: [ 720, 1280 ] },
];

export function registerResolutionComponents(): void {
    Vue.component( 'ResolutionResizer', {
        // top offset of the fixed overlay (below the toolbar); the game view starts at (0, RESIZER_TOP)
        data() {
            return { RESIZER_TOP: 31 };
        },
        computed: {
            // read the live setting values directly so the overlay + handle track the cursor
            // during a drag (a local copy only synced on save would lag until mouseup)
            w(): number {
                const s = context.settingApp;
                return s.isPortrait ? s.size[ 0 ] : s.size[ 1 ];
            },
            h(): number {
                const s = context.settingApp;
                return s.isPortrait ? s.size[ 1 ] : s.size[ 0 ];
            },
            whStyle(): string {
                return `width:${ this.w }px;height:${ this.h }px;`;
            },
        },
        methods: {
            /** Applies a new game-view size (px) live. size is stored as [shorterEdge, longerEdge]. */
            setSize( size: number[] ) {
                if ( size[ 0 ] === 0 || size[ 1 ] === 0 ) return;
                size.sort( ( a, b ) => a - b );
                if ( size.join( ',' ) === context.settingApp.size.join( ',' ) ) return;
                // replace the array (not mutate) so Vue reactivity fires for every drag step
                context.settingApp.size = size;
                context.settingApp.matchDesign = false;
                execInGame( '__resizeCvn && __resizeCvn()' );
            },
            /** Starts a corner drag-resize of the game view. */
            startResize( event: MouseEvent ) {
                event.preventDefault();
                // let the drag own the mouse: stop the game/devtools webviews from swallowing moves
                context.wv!.style.pointerEvents = 'none';
                if ( context.dwv ) context.dwv.style.pointerEvents = 'none';
                this._onMove = ( e: MouseEvent ) => this.onResizeMove( e );
                this._onUp = () => this.endResize();
                window.addEventListener( 'mousemove', this._onMove, true );
                window.addEventListener( 'mouseup', this._onUp, true );
            },
            onResizeMove( event: MouseEvent ) {
                // game view size = distance from the fixed top-left corner (0, RESIZER_TOP) to the cursor
                const w = Math.max( 50, Math.round( event.clientX ) );
                const h = Math.max( 50, Math.round( event.clientY - this.RESIZER_TOP ) );
                context.settingApp.isPortrait = w < h;
                this.setSize( [ w, h ] );
            },
            endResize() {
                context.wv!.style.pointerEvents = 'unset';
                if ( context.dwv ) context.dwv.style.pointerEvents = 'unset';
                window.removeEventListener( 'mousemove', this._onMove, true );
                window.removeEventListener( 'mouseup', this._onUp, true );
                context.settingApp.saveToStorage();
            },
        },
        template: `
    <div class="ResolutionResizer" :style="whStyle">
        <div class="resizeHandle" @mousedown.stop.prevent="startResize" title="drag to resize the game view"></div>
    </div>
    `,
    } );

    Vue.component( 'ResolutionSelector', {
        data() {
            const design = readDesignSize();
            const designPreset: SizePreset[] = design
                ? [ { name: `Design ${ design[ 0 ] }x${ design[ 1 ] }`, s: [ Math.min( ...design ), Math.max( ...design ) ], portrait: design[ 1 ] > design[ 0 ], design: true } ]
                : [];
            return {
                sizes: designPreset.concat( PRESET_SIZES ),
                showCustom: false,
                costomSize: { name: 'custom', s: [ 640, 960 ] },
            };
        },
        created() {
            // legacy configs stored raw arrays here; drop them
            context.settingApp.extraSizes = context.settingApp.extraSizes.filter( ( entry: unknown ) => !Array.isArray( entry ) );
        },
        methods: {
            isCurrSize( size: number[] ): boolean {
                return context.settingApp.size.join( ',' ) === size.join( ',' );
            },
            setSize( size: number[], preset?: { design?: boolean; portrait?: boolean } ) {
                context.settingApp.size = size;
                context.settingApp.matchDesign = Boolean( preset?.design );
                if ( preset?.design ) context.settingApp.isPortrait = Boolean( preset.portrait );
                context.settingApp.saveToStorage();
                this.$nextTick().then( () => execInGame( 'setTimeout(__resizeCvn,100)' ) );
                context.vueApp.showResolutionSelector = false;
            },
            addCustom() {
                const size = this.costomSize.s.concat();
                size.sort( ( a: number, b: number ) => a - b );
                context.settingApp.extraSizes.push( { name: this.costomSize.name, s: size } );
                context.settingApp.saveToStorage();
                this.showCustom = false;
            },
            delSize( index: number ) {
                context.settingApp.extraSizes.splice( index, 1 );
                context.settingApp.saveToStorage();
            },
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
    </div>`,
    } );
}
