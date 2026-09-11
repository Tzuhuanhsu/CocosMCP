// Help panel (bilingual). External links now go through shell.openExternal via a method
// instead of the legacy global `remote`.
import { getLocaleIpc, openExternal } from './../ipc';

const VIDEO_PLUGIN_URL = 'https://www.bilibili.com/video/BV1Nh411h72h';
const VIDEO_MAC_URL = 'https://www.bilibili.com/video/BV1KK4y1R7L1';

export function registerHelpComponent(): void {
    Vue.component( 'MyHelp', {
        data() {
            return { show: false, lang: 'en' };
        },
        created() {
            getLocaleIpc().then( ( locale ) => {
                this.lang = locale === 'zh-CN' ? 'cn' : 'en';
            } );
        },
        computed: {
            isCN(): boolean {
                return this.lang === 'cn';
            },
        },
        methods: {
            openExternal( url: string ) {
                openExternal( url );
            },
        },
        template: `
    <div class="helpPanel setting" v-show="show">
    <div class="settingHeader">
        <span class="iconfont icon-shanchu" @click="show=false" style="font-size: 1.5em;"></span>
        <div class="settingTitle" v-show="!isCN">Help</div>
        <div class="settingTitle" v-show="isCN">帮助</div>
        <a @click="lang='cn'" v-show="!isCN">Chinese</a>
        <a @click="lang='en'" v-show="isCN">English</a>
    </div>
    <div v-show="lang=='en'">
        <h1>DrawCall</h1>
        <ul>
            <li>
                <div class="helpTitle">How to open</div>
                right click scene name Tab
            </li>
            <li>
                <div class="helpTitle">Why not accurate?</div>
                number + mk + gh + ot is total drawcall, not only number;
                <br>
                and now is beta, only calculate Sprite and label, in AutoAtlas, DynamicAtlas,Static Atlas.
                <br>
                Shader and Material still not calculate;
            </li>
            <li>
                <div class="helpTitle">What's the means of: mk, gh, ot?</div>
                mk is Mask, gh is Graphics, ot is other RenderComponents;
                <br>
                they have many different cases about DrawCall, so now only mark them in node Tree
            </li>
        </ul>
        <hr>
        <h1>Video Tutorial</h1>
        <ul>
            <li>
                <div class="helpTitle">Plugin Version</div>
                In Recording
                <a @click="openExternal('${ VIDEO_PLUGIN_URL }')" >${ VIDEO_PLUGIN_URL }</a>
            </li>
            <li>
                <div class="helpTitle">Mac Native Version</div>
                not same as Plugin Version
                <a @click="openExternal('${ VIDEO_MAC_URL }')" >${ VIDEO_PLUGIN_URL }</a>
            </li>
        </ul>
        </div>
        <div v-show="lang=='cn'">
        <h1>DrawCall分析</h1>
        <ul>
            <li>
                <div class="helpTitle">怎么打开DrawCall分析</div>
                在场景名称上右键
            </li>
            <li>
                <div class="helpTitle">为什么有时不太准确?</div>
                drawcall包含 数字 + mk + gh + ot， 不仅仅是数字;
                <br>
                目前仅计算了Sprite和Label(包含自动图集，动态图集，静态图集等因素)
                <br>
                Shader，Meterial产生的DrawCall暂时并未包含
            </li>
            <li>
                <div class="helpTitle">mk, gh, ot是什么意思?</div>
                mk 是 Mask, gh 是 Graphics, ot is 其他渲染组件;
                <br>
                他们有很多因素来影响DrawCall，暂时不方便计算，所以现在仅仅在节点树标记出来，方便知道影响DrawCall的可能因素
            </li>
        </ul>
        <hr>
        <h1>FGUI支持</h1>
        <ul>
            <li>
                <div class="helpTitle">为什么节点没有显示成FGUI结构</div>
                首先要在设置开启fairyGUI，其次，ccc3.x版本要保证window["fgui"]可以访问
            </li>
        </ul>
        <hr>
        <h1>视频教程</h1>
        <ul>
            <li>
                <div class="helpTitle">插件版</div>
                录制中...
                <a @click="openExternal('${ VIDEO_PLUGIN_URL }')" >${ VIDEO_PLUGIN_URL }</a>
            </li>
            <li>
                <div class="helpTitle">Mac原生版本</div>
                跟插件版不一样，仅供参考
                <a @click="openExternal('${ VIDEO_MAC_URL }')" >${ VIDEO_PLUGIN_URL }</a>
            </li>
        </ul>
        </div>
    </div>
    `,
    } );
}
