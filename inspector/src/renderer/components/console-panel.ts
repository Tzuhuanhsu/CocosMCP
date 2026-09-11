// Console tab: filtered logs + code input with autocomplete tips.
import { context, execInGame } from './../context';
import { showConsoleMenu } from './../menus';
import { openExternal } from './../ipc';

const STORE_URL = 'https://store.cocos.com/app/detail/2940';
const SHORTCUTS_URL = 'https://forum.cocos.org/t/topic/116310';

export function registerConsolePanel(): void {
    Vue.component( 'ConsolePanel', {
        data() {
            return {
                type: 'All',
                types: [ 'All', 'Log', 'Error', 'Warn' ],
                filterStr: '',
                code: '',
                codeTip: [],
                tipIndex: 0,
                atBottom: true,
            };
        },
        computed: {
            logs(): unknown[] {
                const v = context.vueApp;
                if ( this.type === 'All' ) {
                    return v.bigLogs.filter( ( log: any ) => log.d.toLowerCase().includes( this.filterStr.toLowerCase() ) );
                }
                return v.bigLogs.filter( ( log: any ) => log.t.endsWith( this.type ) && log.d.includes( this.filterStr ) );
            },
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
                if ( !this.atBottom ) return;
                const el = this.$refs.logsMain;
                this.$nextTick( () => { el.scrollTop = el.scrollHeight; } );
            },
            gotoStore() { openExternal( STORE_URL ); },
            gotoScM() { openExternal( SHORTCUTS_URL ); },
            exec() {
                this.codeTip = [];
                if ( this.code.trim() === '' ) return;
                let code = this.code;
                context.vueApp.pushLog( new Date().toLocaleTimeString(), 'consoleLog', '> ' + code + ':' );
                if ( !code.startsWith( 'let ' ) && !code.startsWith( 'var ' ) && !code.startsWith( 'console.' ) && !code.startsWith( 'cc.log' ) ) {
                    code = `console.log(${ code })`;
                }
                execInGame( code ).then( ( result: unknown ) => {
                    if ( result !== null ) context.vueApp.pushLog( new Date().toLocaleTimeString(), 'consoleLog', `${ result }` );
                    this.code = '';
                } );
            },
            up() {
                this.tipIndex = this.tipIndex === 0 ? this.codeTip.length - 1 : this.tipIndex - 1;
                this.$nextTick().then( () => {
                    this.$refs.selected?.[ 0 ]?.scrollIntoViewIfNeeded( false );
                } );
            },
            down() {
                this.tipIndex = this.tipIndex === this.codeTip.length - 1 ? 0 : this.tipIndex + 1;
                this.$nextTick().then( () => {
                    this.$refs.selected?.[ 0 ]?.scrollIntoViewIfNeeded( false );
                } );
            },
            esc() {
                this.codeTip = [];
            },
            tab() {
                const chosen = this.codeTip[ this.tipIndex ][ 0 ];
                const parts = this.code.split( '.' );
                parts.pop();
                if ( !isNaN( chosen ) ) {
                    this.code = parts.join( '.' ) + '[' + chosen + ']';
                } else {
                    parts.push( chosen );
                    this.code = parts.join( '.' );
                }
                this.codeTip = [];
                return false;
            },
            getTip() {
                if ( this.code.trim() === '' ) {
                    this.codeTip = [];
                    return;
                }
                execInGame( `__codeTip('${ this.code }')` ).then( ( tips: unknown[] ) => {
                    this.tipIndex = 0;
                    this.codeTip = tips;
                } );
            },
            splitMsg( message: string ): string[] {
                return message.split( RegExp( `(${ this.filterStr })`, 'i' ) );
            },
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
    `,
    } );
}
