// Tree components: NodeView (recursive) and NodeViewTitle (one row).
import { context, execInGame } from './../context';
import { showNodeMenu } from './../menus';

export function registerNodeTreeComponents(): void {
    Vue.component( 'NodeView', {
        props: { n: Object, deep: Number },
        data() {
            const v = context.vueApp;
            return {
                bold: false,
                close: !( this.n.name === 'Canvas' && this.deep === 1 ) && !v.openNodes.has( this.n.id ),
                selected: this.n.id === v.selectedNode,
            };
        },
        watch: {
            close( value: boolean ) {
                const setting = context.settingApp;
                if ( !value && this.n.isFairyCom && setting.displayAsFairyTree && setting.hideFairyComContainer ) {
                    context.vueApp.syncOpenFcom( this.n.id );
                }
            },
        },
        computed: {
            needUseChildChilren(): boolean {
                const setting = context.settingApp;
                const v = context.vueApp;
                return ( setting.displayAsFairyTree && setting.hideFairyComContainer && this.n.isFairyCom
                        && this.n.children.length === 1 && this.n.children[ 0 ].name === 'Container' )
                    || ( v.hide3dRootNode && this.n.children.length === 1 && this.n.children[ 0 ].name === 'RootNode'
                        && this.n.children[ 0 ].children[ 0 ]?.isMeshRender );
            },
            children(): unknown[] {
                return this.needUseChildChilren ? this.n.children[ 0 ].children : this.n.children;
            },
            realDeep(): number {
                return this.deep;
            },
            isShowLine(): boolean {
                return context.vueApp.dragingEN?.id === this.n.id;
            },
        },
        created() {
            const v = context.vueApp;
            v.$on( 'selectedNode_changed', this.updateSelected );
            v.$on( 'locateNode', this.onLocateNode );
            this.bold = v.openNodes.has( this.n.id );
            if ( this.n.name === 'Canvas' ) v.syncOpen( this.n.id, !this.close );
        },
        beforeDestroy() {
            const v = context.vueApp;
            v.$off( 'locateNode', this.onLocateNode );
            v.$off( 'selectedNode_changed', this.updateSelected );
        },
        methods: {
            onLocateNode( openSet: Set<string> ) {
                if ( openSet.has( this.n.id ) ) this.close = false;
                this.bold = openSet.has( this.n.id );
            },
            updateSelected() {
                this.selected = this.n.id === context.vueApp.selectedNode;
            },
            dragstart( node: unknown ) {
                context.vueApp.dragingSN = node;
            },
            dragenter( node: any ) {
                const v = context.vueApp;
                v.pushLog( new Date().toLocaleTimeString(), 'consoleLog', node.name );
                v.dragingEN = node;
            },
            dragend() {
                const v = context.vueApp;
                execInGame( `__swapPos('${ v.dragingSN.id }','${ v.dragingEN.id }')` );
                v.dragingEN = null;
                v.dragingSN = null;
            },
        },
        template: `
    <div class="node" draggable
        @dragstart.stop="dragstart(n)" @dragenter.stop="dragenter(n)" @dragend.stop="dragend">
        <hr v-if="isShowLine">
        <node-view-title :bold="bold" :selected="selected" :n="n" :childCount="n.childCount" v-model="close" :deep="deep"></node-view-title>
        <node-view v-if="!close"  v-for="sn in children" :n="sn" :deep="realDeep+1" :key="sn.id">
        </node-view>

    </div>`,
    } );

    Vue.component( 'NodeViewTitle', {
        props: [ 'n', 'bold', 'deep', 'close', 'selected', 'childCount' ],
        model: { prop: 'close', event: 'change' },
        template: `
        <div :id="refName" @mouseover="overNode" @mouseout="outNode" class="nodeTitle" @click="selectNode()" :style="nodePadding+selectedBg+isBold" @contextmenu.stop="onContextMenu">
            <span @click.stop="toggleNode()" :style="iconTransform" v-if="childCount>0" class="nodearrow iconfont icon-shangsanjiao"></span>
            <span :style="disable" >{{nodeName}}</span><span class="dcDesc" :style="selectedDc">{{dcDesc}}</span>
            <a v-if="!n.autoUpdate" @click.stop="forceUpdateTree" class="iconfont icon-shuaxin"></a>
            <span v-if="isLockedDragNode" class="iconfont icon-drag"></span>
        </div>
    `,
        watch: {
            childCount() {
                if ( this.deep === 1 ) this.$el.style = this.nodePadding + this.selectedBg + this.isBold;
            },
        },
        computed: {
            isLockedDragNode(): boolean {
                return context.vueApp.lockNode === this.n.id;
            },
            isBold(): string {
                return '';
            },
            nodeName(): string {
                if ( context.settingApp.displayAsFairyTree ) {
                    return this.pre + ( this.n.gobjName || this.n.name ) + this.childrenCount;
                }
                return this.pre + this.n.name + this.childrenCount;
            },
            childrenCount(): string {
                const count = this.n.childCount;
                return context.vueApp.showChildrenCount && count > 0 ? ` [${ count }]` : '';
            },
            pre(): string {
                return this.n.breaks ? '⭕️' : '';
            },
            iconTransform(): string {
                const rotate = this.close ? 'transform:rotate(90deg)' : 'transform:rotate(180deg)';
                return 'display: inline-block;' + rotate;
            },
            refName(): string {
                return this.selected ? 'selectedNode' : '';
            },
            nodePadding(): string {
                const arrowWidth = this.n.childCount > 0 ? 21 : 0;
                return `padding-left:${ this.deep * 20 - arrowWidth }px;`;
            },
            selectedBg(): string {
                return this.selected ? 'color:black;background-color:#cccccc;' : '';
            },
            selectedDc(): string {
                return this.selected ? 'color:rgb(14, 127, 233)' : '';
            },
            disable(): string {
                return this.n.activeInHierarchy && this.n.opacityInHierarchy ? '' : 'opacity:0.5';
            },
            dcDesc(): string {
                if ( this.n.dc === undefined ) return '';
                if ( this.n.rtype ) return ` ${ this.n.dc } + ${ this.n.rtype }`;
                if ( this.n.dc === 0 ) return '';
                return ` ${ this.n.dc }`;
            },
        },
        methods: {
            forceUpdateTree() {
                context.vueApp.forceUpdateTree();
            },
            toggleNode() {
                context.vueApp.syncOpen( this.n.id, this.close );
                this.$emit( 'change', !this.close );
            },
            selectNode() {
                context.vueApp.selectNode( this.n.id );
            },
            onContextMenu() {
                showNodeMenu( this.n.id );
            },
            overNode() {
                execInGame( `if(window["__drawRect"])__drawRect('${ this.n.id }')` );
            },
            outNode() {
                execInGame( 'if(window["__clearRect"])__clearRect()' );
            },
        },
    } );
}
