/* eslint-disable vue/one-component-per-file */

import { readFileSync } from 'fs-extra';
import { join } from 'path';
import { createApp, App, defineComponent, ref, computed, onMounted, onUnmounted, watch } from 'vue';

const panelDataMap = new WeakMap<any, App>();

const STATUS_POLL_INTERVAL_MS = 2000;
const DEFAULT_MAX_CONNECTIONS = 10;

// Mirrors MCPServerSettings; `port` null = automatic (project-hash port)
interface ServerSettings {
    port: number | null;
    autoStart: boolean;
    enableDebugLog: boolean;
    maxConnections: number;
}

module.exports = Editor.Panel.define({
    listeners: {
        show() {
            console.log('[MCP Panel] Panel shown');
        },
        hide() {
            console.log('[MCP Panel] Panel hidden');
        },
    },
    template: readFileSync(join(__dirname, '../../../static/template/default/index.html'), 'utf-8'),
    style: readFileSync(join(__dirname, '../../../static/style/default/index.css'), 'utf-8'),
    $: {
        app: '#app',
        panelTitle: '#panelTitle',
    },
    ready() {
        if (this.$.app) {
            const app = createApp({});
            app.config.compilerOptions.isCustomElement = (tag) => tag.startsWith('ui-');

            app.component('McpServerApp', defineComponent({
                setup() {
                    const serverRunning = ref(false);
                    const serverStatus = ref('已停止');
                    const boundPort = ref<number | null>(null);
                    const httpUrl = ref('');
                    const isProcessing = ref(false);
                    const settingsChanged = ref(false);

                    const settings = ref<ServerSettings>({
                        port: null,
                        autoStart: true,
                        enableDebugLog: false,
                        maxConnections: DEFAULT_MAX_CONNECTIONS
                    });

                    const statusClass = computed(() => ({
                        'status-running': serverRunning.value,
                        'status-stopped': !serverRunning.value
                    }));

                    /** Plain object copy: Vue reactive proxies cannot cross the Editor IPC boundary. */
                    const plainSettings = () => ({
                        port: settings.value.port === null || settings.value.port === 0 ? null : Number(settings.value.port),
                        autoStart: Boolean(settings.value.autoStart),
                        enableDebugLog: Boolean(settings.value.enableDebugLog),
                        maxConnections: Number(settings.value.maxConnections) || DEFAULT_MAX_CONNECTIONS
                    });

                    const refreshStatus = async () => {
                        try {
                            const result = await Editor.Message.request('cocos-mcp-server', 'get-server-status');
                            if (!result) return;
                            serverRunning.value = result.running;
                            serverStatus.value = result.running ? '运行中' : '已停止';
                            boundPort.value = result.running ? result.port : null;
                            httpUrl.value = result.running ? `http://127.0.0.1:${result.port}/mcp` : '';
                            isProcessing.value = false;
                        } catch (error) {
                            console.error('[Vue App] Failed to get server status:', error);
                        }
                    };

                    const toggleServer = async () => {
                        isProcessing.value = true;
                        try {
                            if (serverRunning.value) {
                                await Editor.Message.request('cocos-mcp-server', 'stop-server');
                            } else {
                                await Editor.Message.request('cocos-mcp-server', 'update-settings', plainSettings());
                                await Editor.Message.request('cocos-mcp-server', 'start-server');
                            }
                        } catch (error) {
                            console.error('[Vue App] Failed to toggle server:', error);
                        }
                        await refreshStatus();
                    };

                    const saveSettings = async () => {
                        try {
                            await Editor.Message.request('cocos-mcp-server', 'update-settings', plainSettings());
                            settingsChanged.value = false;
                        } catch (error) {
                            console.error('[Vue App] Failed to save settings:', error);
                        }
                        await refreshStatus();
                    };

                    const copyUrl = async () => {
                        try {
                            await navigator.clipboard.writeText(httpUrl.value);
                        } catch (error) {
                            console.error('[Vue App] Failed to copy URL:', error);
                        }
                    };

                    watch(settings, () => {
                        settingsChanged.value = true;
                    }, { deep: true });

                    let pollTimer: ReturnType<typeof setInterval> | null = null;

                    onMounted(async () => {
                        try {
                            const status = await Editor.Message.request('cocos-mcp-server', 'get-server-status');
                            if (status && status.settings) {
                                settings.value = {
                                    port: status.settings.port ?? null,
                                    autoStart: Boolean(status.settings.autoStart),
                                    enableDebugLog: Boolean(status.settings.enableDebugLog),
                                    maxConnections: status.settings.maxConnections || DEFAULT_MAX_CONNECTIONS
                                };
                                settingsChanged.value = false;
                            }
                        } catch (error) {
                            console.error('[Vue App] Failed to load server settings:', error);
                        }
                        await refreshStatus();
                        pollTimer = setInterval(refreshStatus, STATUS_POLL_INTERVAL_MS);
                    });

                    onUnmounted(() => {
                        if (pollTimer) clearInterval(pollTimer);
                    });

                    return {
                        serverRunning,
                        serverStatus,
                        boundPort,
                        httpUrl,
                        isProcessing,
                        settings,
                        settingsChanged,
                        statusClass,
                        toggleServer,
                        saveSettings,
                        copyUrl
                    };
                },
                template: readFileSync(join(__dirname, '../../../static/template/vue/mcp-server-app.html'), 'utf-8'),
            }));

            app.mount(this.$.app);
            panelDataMap.set(this, app);
        }
    },
    beforeClose() { },
    close() {
        const app = panelDataMap.get(this);
        if (app) {
            app.unmount();
        }
    },
});
