// Right-panel components: node header (NodeDetailView), one component card (NodeComponent),
// one property row (ComProperty). Templates are transcribed verbatim from the recovered UI.
import { context, execInGame } from './../context';
import { showComponentMenu } from './../menus';
import { focusAssetInEditor } from './../ipc';

/** widget-style property sort: compare by reversed strings so Left/Right/Top/Bottom group */
const widgetSort = ( a: string, b: string ): number =>
    b.split( '' ).reverse().join( '' ).localeCompare( a.split( '' ).reverse().join( '' ) );

/** meta keys of a serialized component that are not user properties */
const NON_PROPERTY_KEYS = new Set( [ 'uuid', 'name', 'enabled', 'isCC_COM', 'packageItem', 'node', '__methods___' ] );

export function registerNodeDetailComponents(): void {
    Vue.component( 'NodeComponent', {
        props: { com: Object },
        data() {
            return { filterStr: '', sort: false };
        },
        created() {
            const self = this;
            this.fupdate = function () {
                const setting = context.settingApp;
                if ( setting.sortCompProperties[ self.comName ] === undefined ) {
                    setting.sortCompProperties[ self.comName ] = self.sort = self.defaultSort;
                } else {
                    self.sort = Boolean( setting.sortCompProperties[ self.comName ] );
                }
            };
            context.settingApp.$on( 'toggleSortComp', this.fupdate );
            this.fupdate();
        },
        beforeDestroy() {
            context.settingApp.$off( 'toggleSortComp', this.fupdate );
        },
        computed: {
            comName(): string {
                const name = this.com.name;
                if ( !this.com.isCC_COM ) return name;
                return '<' + name.split( '<' )[ 1 ];
            },
            defaultSort(): boolean {
                return this.comName === '<Widget>' || this.comName === '<Button>' || this.comName === '<Label>';
            },
            afterFilters(): string[] {
                const sorter = this.sort ? widgetSort : undefined;
                const keys = Object.keys( this.com ).sort( sorter );
                if ( this.filterStr.trim() === '' ) return keys.filter( ( key: string ) => !NON_PROPERTY_KEYS.has( key ) );
                return keys.filter( ( key: string ) =>
                    !NON_PROPERTY_KEYS.has( key ) && key.toLowerCase().includes( this.filterStr.toLowerCase() ) );
            },
            showSearch(): boolean {
                return Object.keys( this.com ).length > 8;
            },
            checkVisible(): string {
                return this.com.isCC_COM ? 'visible' : 'hidden';
            },
        },
        methods: {
            showMenu2() {
                showComponentMenu( this.com.uuid, this.comName, this.com.__methods___ || [], ( methodName: string ) => this.execCompMethod( methodName ) );
            },
            execCompMethod( methodName: string ) {
                execInGame( `__execCompMethod('${ context.vueApp.selectedNode }','${ this.com.uuid }','${ methodName }')` );
            },
            toggleComp() {
                execInGame( `__toggleComp('${ context.vueApp.selectedNode }','${ this.com.uuid }')` );
            },
            setKV( key: string, value: unknown ) {
                this.com[ key ][ 0 ] = value;
                const encoded = typeof value === 'string' ? '`' + value + '`' : value;
                execInGame( `__setComAttr('${ context.vueApp.selectedNode }','${ this.com.uuid }','${ key }',${ encoded })` );
            },
        },
        template: `
    <div class="Component">
        <div style="height:1em;"></div>
        <div class="nodeName">
            <label>
                <input :style="{visibility:checkVisible}" @change="toggleComp" type="checkbox"  v-model="com.enabled" />
                {{comName}}
            </label>
            <span style="flex:1"></span>
            <span v-if="com.isCC_COM" @click.prevent="showMenu2" class="iconfont icon-menu"></span>
        </div>
        <input placeholder="filter properties" type="search" v-model="filterStr" v-if="showSearch"/>
        <com-property v-for="k in afterFilters" :param="com[k][2]" :setKV="setKV" :k="k" :val="com[k][0]" :t="com[k][1]" :isc="com.isCC_COM" :key="com+k"></com-property>
    </div>
    `,
    } );

    Vue.component( 'ComProperty', {
        props: [ 'k', 'val', 't', 'isc', 'setKV', 'param' ],
        created() {
            this.vl = this.val;
            if ( this.isEnum ) this.vl = this.param.find( ( entry: any ) => entry.value === this.val.value );
            this.link = this.canLink();
        },
        data() {
            return { link: null, vl: null, numberEdit: false };
        },
        methods: {
            canLink() {
                const value = this.vl;
                if ( typeof value !== 'string' ) return null;
                if ( !value.includes( ':@' ) || !value.includes( '|' ) ) return null;
                if ( value.includes( '||' ) ) {
                    const [ name, uuidPath ] = value.split( '||' );
                    return { name, uuidPath, type: 'asset' };
                }
                const [ rawName, rawPath ] = value.split( '|' );
                let name = rawName;
                const uuidPath = rawPath.split( '//' );
                if ( uuidPath.slice( -1 )[ 0 ] === context.vueApp.selectedNode ) {
                    const parts = name.split( ':@' );
                    parts.pop();
                    parts.push( '[self]' );
                    name = parts.join( ':@' );
                }
                return { name, uuidPath, type: 'node' };
            },
            locate() {
                if ( this.link.type === 'node' ) context.vueApp.locateNode( this.link.uuidPath );
                if ( this.link.type === 'asset' ) focusAssetInEditor( this.link.uuidPath );
            },
            clickBool() {
                if ( !this.isc ) return;
                this.vl = !this.vl;
                this.setKV( this.k, this.vl );
            },
            changeColor() { this.setKV( this.k, this.vl ); },
            changeEnum() { this.setKV( this.k, this.vl.value ); },
            changeNumber() { this.setKV( this.k, Number( this.vl ) ); },
            changeString() { this.setKV( this.k, this.vl ); },
            closeNumberEdit() { this.numberEdit = false; },
            openNumberEdit() {
                this.numberEdit = true;
                this.$nextTick().then( () => { this.$refs.numInput?.focus(); } );
            },
        },
        computed: {
            isColor(): boolean {
                if ( this.t === 'color' ) return true;
                if ( typeof this.vl !== 'string' ) return false;
                return this.vl.startsWith( 'Color:rgba(' );
            },
            isEnum(): boolean { return this.t === 'enum'; },
            color(): string { return 'background:' + this.vl; },
            isBool(): boolean { return typeof this.vl === 'boolean'; },
            isTrue(): boolean { return this.vl === true; },
            isFalse(): boolean { return this.vl === false; },
            isNumber(): boolean { return this.t === 'number'; },
            isString(): boolean { return this.t === 'string'; },
            transStr(): string { return this.vl.replace( /\n/g, '\\n' ); },
            isNormal(): boolean {
                return !this.isString && !this.isNumber && !this.isEnum && !this.isColor && !this.isBool && !this.link;
            },
            boolIcon(): string {
                return this.isTrue ? 'iconfont icon-right' : 'iconfont icon-wrong2';
            },
        },
        template: `
    <div class="comProperty">
        <div class="nodePropertyTitle">{{k}}:</div>

        <div v-if="isColor" class="nodePropertySubTitle">
            <span v-if="!isc" :style="color" class="colorRect"></span>
            <input v-if="isc" @input="changeColor" type="color" v-model="vl" />
            <span >{{vl}}</span>
        </div>
        <div v-if="isEnum && isc" class="nodePropertySubTitle">
            <select v-model="vl" @change="changeEnum">
                <option v-for="p in param" :value="p">{{p.name}}</option>
            </select>
        </div>
        <div v-if="isEnum && !isc" class="nodePropertySubTitle prewrap">{{vl.value}}</div>
        <div v-if="isNumber" class="nodePropertySubTitle" >
            <span v-if="!numberEdit" @click="openNumberEdit">{{vl}}</span>
            <input ref="numInput" @blur="closeNumberEdit" @keyup.esc.stop="closeNumberEdit" @keyup.enter.stop="closeNumberEdit" v-if="numberEdit" type="number" v-model="vl" @input="changeNumber" />
        </div>

        <div v-if="isString" class="nodePropertySubTitle" >
            <span v-if="!numberEdit" @click="openNumberEdit">{{ transStr }}</span>
            <textarea ref="numInput" @blur="closeNumberEdit" @keyup.esc.stop="closeNumberEdit" v-if="numberEdit" v-model="vl" @input="changeString" ></textarea>
        </div>

        <div v-if="isBool" class="nodePropertySubTitle" @click="clickBool">
            <span :class="boolIcon" ></span>
        </div>
        <div v-if="isNormal" class="nodePropertySubTitle prewrap">{{String(vl)}}</div>
        <a v-if="link" class="nodePropertySubTitle prewrap" @click="locate()">{{link.name}}</a>
    </div>
    `,
    } );

    Vue.component( 'NodeDetailView', {
        props: { detail: Object },
        data() {
            return { close: false };
        },
        computed: {
            iconTransform(): string {
                const rotate = this.close ? 'transform:rotate(90deg)' : 'transform:rotate(180deg)';
                return 'display: inline-block;' + rotate;
            },
        },
        methods: {
            toggleNode() { this.close = !this.close; },
            syncNode( propPath: string ) {
                const parts = propPath.split( '.' );
                let value = parts.length > 1 ? this.detail[ parts[ 0 ] ][ parts[ 1 ] ] : this.detail[ parts[ 0 ] ];
                if ( typeof value === 'string' ) value = `'${ value }'`;
                execInGame( `__syncNode('${ this.detail.id }','${ propPath }',${ value })` );
            },
        },
        template: `
    <div class="nodeDetail">
        <div class="nodeName">
            <label>
                <input @change="syncNode('active')" type="checkbox" value="detail.name" v-model="detail.active" />
                Node: {{detail.name}}
            </label>
            <span style="flex:1"></span>
            <span @click.stop="toggleNode()" :style="iconTransform"  class="nodearrow iconfont icon-shangsanjiao"></span>
        </div>

    <div v-show="!close" class="nodeProperties">
    <div class="nodeProperty">
        <div class="nodePropertyTitle">Position:</div>
        <div class="nodePropertySubTitle">X:</div>
        <input @input="syncNode('position.x')" step="0.02" type="number" v-model="detail.position.x" />
        <div class="nodePropertySubTitle">Y:</div>
        <input @input="syncNode('position.y')" step="0.02" type="number" v-model="detail.position.y" />
        <div class="nodePropertySubTitle">Z:</div>
        <input @input="syncNode('position.z')" step="0.02" type="number" v-model="detail.position.z" />
    </div>
    <div class="nodeProperty">
        <div class="nodePropertyTitle">Rotation:</div>
        <div class="nodePropertySubTitle">X:</div>
        <input @input="syncNode('eulerAngles.x')" step="5" type="number" v-model="detail.eulerAngles.x" />
        <div class="nodePropertySubTitle">Y:</div>
        <input @input="syncNode('eulerAngles.y')" step="5" type="number" v-model="detail.eulerAngles.y" />
        <div class="nodePropertySubTitle">Z:</div>
        <input @input="syncNode('eulerAngles.z')" step="5" type="number" v-model="detail.eulerAngles.z" />
    </div>
    <div class="nodeProperty">
        <div class="nodePropertyTitle">Scale:</div>
        <div class="nodePropertySubTitle">X:</div>
        <input @input="syncNode('scale.x')" step="0.02" type="number" v-model="detail.scale.x" />
        <div class="nodePropertySubTitle">Y:</div>
        <input @input="syncNode('scale.y')" step="0.02" type="number" v-model="detail.scale.y" />
        <div class="nodePropertySubTitle">Z:</div>
        <input @input="syncNode('scale.z')" step="0.02" type="number" v-model="detail.scale.z" />
    </div>

    <hr>

    <div class="nodeProperty">
        <div class="nodePropertyTitle">Layer:</div>
        <div class="nodePropertySubTitle">{{detail.layer}}</div>
    </div>
    </div>
    </div>
    `,
    } );
}
