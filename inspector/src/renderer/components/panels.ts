// Search panel, extension panel, spacer.
import * as fs from 'fs';
import * as path from 'path';
import { context, execInGame } from './../context';
import { showOpenDialogIpc } from './../ipc';

const ESC_KEY = 27;

export function registerPanels(): void {
    Vue.component( 'SearchPanel', {
        data() {
            return { searchStr: '', list: [], includeInvisible: true, kd: null };
        },
        created() {
            this.kd = ( event: KeyboardEvent ) => {
                if ( ( event.key === String( ESC_KEY ) || event.keyCode === ESC_KEY ) && this.searchStr.trim() !== '' ) {
                    this.clearSearch();
                    event.stopImmediatePropagation();
                    event.stopPropagation();
                }
            };
            document.addEventListener( 'keydown', this.kd );
        },
        beforeDestroy() {
            document.removeEventListener( 'keydown', this.kd );
        },
        methods: {
            onChange() {
                if ( this.searchStr.trim() === '' ) {
                    this.list = [];
                    return;
                }
                execInGame( `__searchComs('${ this.searchStr }')` ).then( ( list: unknown[] ) => {
                    this.list = list || [];
                } );
            },
            locate( uuidPath: string[] ) {
                context.vueApp.locateNode( uuidPath );
            },
            clearSearch() {
                this.searchStr = '';
                this.list.length = 0;
            },
        },
        computed: {
            filteredList(): unknown[] {
                return this.includeInvisible ? this.list : this.list.filter( ( entry: any ) => entry.visible );
            },
        },
        template: `
    <div class="searchPanel">
        <div class="searchTitle" v-show="list.length>0" style="display:flex">
            <label>Result:{{filteredList.length}}/{{list.length}}</label>
            <div style="flex:1"></div>
            <label><input type="checkbox" v-model="includeInvisible" />Includes Invisible   </label>
            <span class="iconfont icon-shanchu" @click="clearSearch"></span>
        </div>
        <div class="searchList" v-show="list.length>0">
            <div class="searcItem" v-for="(c,i) in filteredList" >
                <hr>
                <span>{{c.name}}</span>
                <a @click="locate(c.uuidPath)">
                <span class="iconfont icon-dingwei"></span>
                </a>
                <span v-if="!c.visible" >invisible</span>
                <br>
                <div class="itemPath">{{c.path}}</div>
            </div>
        </div>
        <div class="searchBox">
            <span class="iconfont icon-sousuo"></span><input @input="onChange" type="search" placeholder="search component" v-model="searchStr" />
        </div>
    </div>
    `,
    } );

    Vue.component( 'ExtensionPanel', {
        data() {
            return { example: '' };
        },
        methods: {
            onSelectedFile() { /* kept for template compatibility */ },
            async chooseFile() {
                const files = await showOpenDialogIpc( [ 'json' ] );
                if ( !files ) return;
                const file = files[ 0 ];
                if ( file && file.trim() !== '' ) {
                    context.settingApp.extensionFile = file;
                    context.settingApp.saveToStorage();
                }
            },
        },
        created() {
            const example = fs.readFileSync( path.join( __dirname, 'plugins.json' ), { encoding: 'utf-8' } );
            this.example = JSON.stringify( JSON.parse( example ), null, '\t' );
        },
        template: `
    <div class="extensionPanel">
        <label>
            <input @change="setting.saveToStorage" type="checkbox" v-model="setting.enableExtension">
            Enable Extension
        </label>
        <hr>
        <div>Current Extension File:<br>{{setting.extensionFile}}</div>
        <button @click="chooseFile">Choose File</button>
        <hr>
        <div>Example:</div>
        <textarea readonly>{{example}}</textarea>
    </div>
    `,
    } );

    Vue.component( 'Spacer', { template: `
    <div class="flex1"></div>
    ` } );
}
