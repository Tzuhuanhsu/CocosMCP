// Cocos tab: engine/system flags + game localStorage viewer (+ legacy statistic panel).
import { context, execInGame } from './../context';

/** flags rendered by dedicated (currently commented-out) controls, not the generic list */
const FILTERED_VARS = new Set( [ 'CollisionManager', 'Collision_DebugDraw', 'isDynamicAtlasDebugShow' ] );

const COLLECT_VARS_SCRIPT = `
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

const COLLECT_LOCAL_STORAGE_SCRIPT = `
        var o2 = {}
        Object.keys(cc.sys.localStorage).forEach(function(k){
            o2[k] = cc.sys.localStorage[k]
        })
        o2
        `;

export function registerCocosPanels(): void {
    Vue.component( 'LocalStoragePanel', {
        data() {
            return { lcStorage: {} };
        },
        computed: {
            keys(): string[] {
                return Object.keys( this.lcStorage );
            },
        },
        created() {
            execInGame( COLLECT_LOCAL_STORAGE_SCRIPT ).then( ( storage: Record<string, unknown> ) => {
                this.lcStorage = storage;
            } );
        },
        methods: {
            del( key: string ) {
                execInGame( `cc.sys.localStorage.removeItem('${ key }')` );
                Vue.delete( this.lcStorage, key );
            },
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
    </div>`,
    } );

    Vue.component( 'StatisticPanel', {
        methods: {
            toggle() {
                context.vueApp.toggleStatistic();
            },
        },
        computed: {
            btnLabel(): string {
                return context.vueApp.statisticing ? 'Stop' : 'Start';
            },
        },
        template: `
    <div class="cocosPanel">
        <button @click="toggle">{{btnLabel}}</button>
    </div>
    `,
    } );

    Vue.component( 'CocosPanel', {
        data() {
            return { ccVars: {}, lcStorage: {} };
        },
        computed: {
            keys(): string[] {
                return Object.keys( this.ccVars ).sort().filter( ( key: string ) => !FILTERED_VARS.has( key ) );
            },
        },
        created() {
            this.refreshVars();
        },
        methods: {
            refreshVars() {
                execInGame( COLLECT_VARS_SCRIPT ).then( ( vars: Record<string, unknown> ) => {
                    this.ccVars = vars;
                } );
            },
            getStyle( key: string ): string {
                return this.ccVars[ key ] ? 'color:white;' : 'color:grey;';
            },
            syncColEnable() {
                execInGame( `cc.director.getCollisionManager().enabled = ${ this.ccVars.CollisionManager }` );
            },
            syncColDebugDraw() {
                execInGame( `cc.director.getCollisionManager().enabledDebugDraw = ${ this.ccVars.Collision_DebugDraw }` );
            },
            toggleDynamicAtlasShow() {
                execInGame( `cc.dynamicAtlasManager.showDebug(${ this.ccVars.isDynamicAtlasDebugShow });${ this.ccVars.isDynamicAtlasDebugShow }` );
            },
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
    `,
    } );
}
