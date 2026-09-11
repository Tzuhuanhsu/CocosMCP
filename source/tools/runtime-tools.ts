import * as path from 'path';
import { ToolDefinition, ToolResponse, ToolExecutor } from '../types';
import { getInspector } from '../inspector-host';
import { InspectorRuntimeApi, RuntimeEvalResult } from '../types/inspector';

/**
 * Play-mode (preview) runtime tools.
 *
 * The editor itself has no handle on the running game, so every tool here goes through the
 * bundled runtime inspector (inspector/), which hosts the preview page in an Electron <webview>
 * and exposes an in-process API (status / open / eval / capture / console). This class owns the
 * tool semantics (snapshots, waiting, event buffer contract); the inspector is transport only.
 */

const WAIT_POLL_INTERVAL_MS = 100;
const DEFAULT_WAIT_TIMEOUT_MS = 10000;
/** snapshot = root → components[] → component → props → value: 6 keeps leaf values readable */
const MAX_SERIALIZE_DEPTH = 6;
const SCENE_READY_TIMEOUT_MS = 15000;
const SCENE_READY_SCRIPT = 'return typeof cc !== "undefined" && !!cc.director && !!cc.director.getScene();';
const MAX_SERIALIZE_ARRAY = 100;
const SCREENSHOT_DIR_SEGMENTS = ['temp', 'mcp-runtime'];
/** Game scripts push `{ seq, t, name, payload }` records into this global to report events. */
const EVENTS_GLOBAL_KEY = '__mcpEvents';

const INSPECTOR_MODES: Record<string, number> = {
    preview: 0,
    buildMobile: 1,
    custom: 2,
    buildDesktop: 3
};


/** Runs inside the game page: depth-limited serializer so cc.Node graphs become cloneable. */
const SAFE_SERIALIZER_SOURCE = `
function __mcpSafe(value, depth, seen) {
    if (value === null || value === undefined) return value;
    var type = typeof value;
    if (type === 'function') return undefined;
    if (type !== 'object') return type === 'number' && !isFinite(value) ? String(value) : value;
    if (depth <= 0) return '[depth]';
    if (seen.indexOf(value) >= 0) return '[cycle]';
    seen.push(value);
    if (Array.isArray(value)) {
        return value.slice(0, ${MAX_SERIALIZE_ARRAY}).map(function (item) { return __mcpSafe(item, depth - 1, seen); });
    }
    if ('x' in value && 'y' in value && typeof value.x === 'number') {
        var vec = { x: value.x, y: value.y };
        if (typeof value.z === 'number') vec.z = value.z;
        if (typeof value.w === 'number') vec.w = value.w;
        return vec;
    }
    var engine = window.cc;
    if (engine && (value instanceof engine.Node || value instanceof engine.Component || value instanceof engine.Asset)) {
        // engine objects are cyclic graphs: identify instead of expanding
        return { __type: engine.js.getClassName(value), name: value.name, uuid: value.uuid };
    }
    var out = {};
    for (var key in value) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
        var safe = __mcpSafe(value[key], depth - 1, seen);
        if (safe !== undefined) out[key] = safe;
    }
    return out;
}`;

export class RuntimeTools implements ToolExecutor {
    getTools(): ToolDefinition[] {
        return [
            {
                name: 'get_status',
                description: 'Get play-mode runtime status: whether the runtime inspector window is open and the preview game page is ready',
                inputSchema: { type: 'object', properties: {} }
            },
            {
                name: 'open_inspector',
                description: 'Open the runtime inspector window, which loads and plays the preview game. Waits until the game scene is running.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        mode: {
                            type: 'string',
                            description: 'Which page to load',
                            enum: Object.keys(INSPECTOR_MODES),
                            default: 'preview'
                        }
                    }
                }
            },
            {
                name: 'eval',
                description: 'Execute JavaScript inside the running preview game page (play mode). `cc` is available as window.cc. Return value is serialized with depth limit; cc.Node/Component are reduced to {__type,name,uuid}.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        code: { type: 'string', description: 'JavaScript expression or statements; may use await; use `return` to return a value' }
                    },
                    required: ['code']
                }
            },
            {
                name: 'get_node_snapshot',
                description: 'Snapshot a node in the running game: transform, active state, children names and component properties',
                inputSchema: {
                    type: 'object',
                    properties: {
                        target: { type: 'string', description: 'Node path for cc.find (e.g. "Canvas/SlotMachine/Reel_1"), or a node name to search by breadth-first' },
                        includePrivate: { type: 'boolean', description: 'Include underscore-prefixed component fields', default: false }
                    },
                    required: ['target']
                }
            },
            {
                name: 'get_console_logs',
                description: 'Get console output (log/warn/error, incl. cc.log) captured from the running preview game',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sinceSeq: { type: 'number', description: 'Only entries with seq greater than this (use latestSeq from a previous call)', default: 0 },
                        level: { type: 'string', enum: ['all', 'verbose', 'info', 'warning', 'error'], default: 'all' }
                    }
                }
            },
            {
                name: 'clear_console_logs',
                description: 'Clear the captured preview game console buffer',
                inputSchema: { type: 'object', properties: {} }
            },
            {
                name: 'capture_screenshot',
                description: 'Capture a PNG screenshot of the running preview game. Returns the file path; the image is also attached to the response.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        outPath: { type: 'string', description: 'Absolute output path; defaults to <project>/temp/mcp-runtime/<timestamp>.png' }
                    }
                }
            },
            {
                name: 'wait_for_condition',
                description: 'Poll a JavaScript expression inside the running game until it is truthy or the timeout elapses',
                inputSchema: {
                    type: 'object',
                    properties: {
                        expression: { type: 'string', description: 'Expression evaluated in the game page, e.g. "cc.find(\'Canvas/SlotMachine\').getComponent(\'GameController\')._reels.every(r => r.isIdle())"' },
                        timeoutMs: { type: 'number', default: DEFAULT_WAIT_TIMEOUT_MS }
                    },
                    required: ['expression']
                }
            },
            {
                name: 'get_events',
                description: `Read structured events reported by game scripts via window.${EVENTS_GLOBAL_KEY} (records of { seq, t, name, payload })`,
                inputSchema: {
                    type: 'object',
                    properties: {
                        sinceSeq: { type: 'number', default: 0 },
                        name: { type: 'string', description: 'Only events with this name' }
                    }
                }
            },
            {
                name: 'wait_for_event',
                description: `Wait until a game script reports an event with the given name into window.${EVENTS_GLOBAL_KEY}`,
                inputSchema: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        sinceSeq: { type: 'number', default: 0 },
                        timeoutMs: { type: 'number', default: DEFAULT_WAIT_TIMEOUT_MS }
                    },
                    required: ['name']
                }
            }
        ];
    }

    async execute(toolName: string, args: any): Promise<ToolResponse> {
        args = args || {};
        try {
            switch (toolName) {
                case 'get_status':
                    return await this.getStatus();
                case 'open_inspector':
                    return await this.openInspector(args.mode);
                case 'eval':
                    return await this.evalScript(args.code);
                case 'get_node_snapshot':
                    return await this.evalScript(this.buildSnapshotScript(args.target, Boolean(args.includePrivate)));
                case 'get_console_logs':
                    return await this.getConsoleLogs(args.sinceSeq, args.level);
                case 'clear_console_logs':
                    return this.asResponse(this.runtime().clearConsole());
                case 'capture_screenshot':
                    return await this.captureScreenshot(args.outPath);
                case 'wait_for_condition':
                    return await this.waitFor(this.buildConditionScript(args.expression), args.timeoutMs);
                case 'get_events':
                    return await this.evalScript(this.buildEventsScript(args.sinceSeq, args.name));
                case 'wait_for_event':
                    return await this.waitFor(this.buildEventsScript(args.sinceSeq, args.name, true), args.timeoutMs);
                default:
                    throw new Error(`Unknown tool: ${toolName}`);
            }
        } catch (err: any) {
            return { success: false, error: err.message || String(err) };
        }
    }

    // ------------------------------------------------------------------ transport

    private runtime(): InspectorRuntimeApi {
        try {
            return getInspector().runtime;
        } catch (err: any) {
            throw new Error(`runtime inspector module not available: ${err?.message || err}`);
        }
    }

    private asResponse(result: any): ToolResponse {
        if (result && result.ok === false) {
            return { success: false, error: result.error, data: result };
        }
        return { success: true, data: result };
    }

    private async getStatus(): Promise<ToolResponse> {
        return this.asResponse(this.runtime().status());
    }

    private async openInspector(mode: string = 'preview'): Promise<ToolResponse> {
        const modeValue = INSPECTOR_MODES[mode];
        if (modeValue === undefined) {
            return { success: false, error: `Unknown mode '${mode}'. Use one of: ${Object.keys(INSPECTOR_MODES).join(', ')}` };
        }
        const status = await this.runtime().open(modeValue);
        if (!status.gameReady) {
            return { success: false, error: 'Inspector window opened but the game page did not finish loading in time', data: status };
        }
        // page load precedes engine boot; wait until a scene is actually running
        const sceneReady = await this.waitFor(SCENE_READY_SCRIPT, SCENE_READY_TIMEOUT_MS);
        if (!sceneReady.success) {
            return { success: false, error: 'Game page loaded but no scene started in time', data: { ...status, sceneReady: false } };
        }
        return { success: true, data: { ...status, sceneReady: true }, message: `Preview game running at ${status.gameUrl}` };
    }

    /** Wraps user code so throws and cyclic return values never break the IPC round-trip. */
    private async evalScript(code: string): Promise<ToolResponse> {
        if (typeof code !== 'string' || !code.trim()) {
            return { success: false, error: 'code is required' };
        }
        const wrapped = `(async function () {
            ${SAFE_SERIALIZER_SOURCE}
            try {
                var __mcpResult = await (async function () { ${this.toReturningBody(code)} })();
                return { ok: true, value: __mcpSafe(__mcpResult, ${MAX_SERIALIZE_DEPTH}, []) };
            } catch (e) {
                return { ok: false, error: String(e && e.stack || e) };
            }
        })()`;
        const outer: RuntimeEvalResult = await this.runtime().eval(wrapped);
        if (!outer.ok) {
            return { success: false, error: outer.error };
        }
        const inner: RuntimeEvalResult = outer.value;
        if (!inner || inner.ok === false) {
            return { success: false, error: inner ? inner.error : 'no result from game page' };
        }
        return { success: true, data: inner.value };
    }

    /** A single expression is returned implicitly; code containing `return` or several statements is used as-is. */
    private toReturningBody(code: string): string {
        const trimmed = code.trim();
        const startsWithStatement = /^(return|throw|const|let|var|if|for|while|try|switch|function|class)\b/.test(trimmed);
        const hasReturn = /\breturn\b/.test(trimmed);
        const hasMultipleStatements = /[;\n]/.test(trimmed.replace(/;\s*$/, ''));
        return startsWithStatement || hasReturn || hasMultipleStatements ? trimmed : `return (${trimmed.replace(/;\s*$/, '')});`;
    }

    private async getConsoleLogs(sinceSeq: number = 0, level: string = 'all'): Promise<ToolResponse> {
        return this.asResponse(this.runtime().console(Number(sinceSeq) || 0, level as any));
    }

    private async captureScreenshot(outPath?: string): Promise<ToolResponse> {
        const targetPath = outPath || path.join(Editor.Project.path, ...SCREENSHOT_DIR_SEGMENTS, `${Date.now()}.png`);
        const result = await this.runtime().capture(targetPath);
        if (!result.ok) {
            return { success: false, error: result.error };
        }
        // `imagePath` is picked up by MCPServer to attach the PNG as image content
        return { success: true, data: { imagePath: result.path, width: result.width, height: result.height, bytes: result.bytes } };
    }

    /** Polls `script` until it yields a truthy value; the value itself is returned on success. */
    private async waitFor(script: string, timeoutMs: number = DEFAULT_WAIT_TIMEOUT_MS): Promise<ToolResponse> {
        const startedAt = Date.now();
        let lastError: string | undefined;
        while (Date.now() - startedAt < timeoutMs) {
            const result = await this.evalScript(script);
            if (result.success && result.data) {
                return { success: true, data: { found: true, elapsedMs: Date.now() - startedAt, value: result.data } };
            }
            lastError = result.success ? undefined : result.error;
            await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_INTERVAL_MS));
        }
        return { success: false, error: `Timed out after ${timeoutMs}ms`, data: { found: false, elapsedMs: Date.now() - startedAt, lastError } };
    }

    // ------------------------------------------------------------------ in-game script templates

    private buildConditionScript(expression: string): string {
        if (typeof expression !== 'string' || !expression.trim()) {
            throw new Error('expression is required');
        }
        return `return Boolean(${expression});`;
    }

    private buildEventsScript(sinceSeq: number = 0, name?: string, firstMatchOnly: boolean = false): string {
        const since = Number(sinceSeq) || 0;
        const nameLiteral = name ? JSON.stringify(name) : 'null';
        return `
            var events = (window.${EVENTS_GLOBAL_KEY} || []).filter(function (e) {
                return e.seq > ${since} && (${nameLiteral} === null || e.name === ${nameLiteral});
            });
            ${firstMatchOnly ? 'return events.length ? events[0] : null;' : `return { events: events, latestSeq: (window.${EVENTS_GLOBAL_KEY} || []).reduce(function (m, e) { return Math.max(m, e.seq); }, 0) };`}
        `;
    }

    private buildSnapshotScript(target: string, includePrivate: boolean): string {
        if (typeof target !== 'string' || !target.trim()) {
            throw new Error('target is required');
        }
        const targetLiteral = JSON.stringify(target);
        return `
            var scene = cc.director.getScene();
            if (!scene) throw new Error('no running scene');
            var node = cc.find(${targetLiteral});
            if (!node) {
                var queue = scene.children.slice();
                while (queue.length && !node) {
                    var current = queue.shift();
                    if (current.name === ${targetLiteral}) node = current; else queue.push.apply(queue, current.children);
                }
            }
            if (!node) throw new Error('node not found: ' + ${targetLiteral});
            var pathParts = [];
            for (var walker = node; walker && walker !== scene; walker = walker.parent) pathParts.unshift(walker.name);
            var components = node.components.map(function (comp) {
                var props = {};
                for (var key in comp) {
                    if (!Object.prototype.hasOwnProperty.call(comp, key)) continue;
                    if (key.charAt(0) === '_' && !${includePrivate}) continue;
                    if (key === 'node' || key === '__scriptAsset' || typeof comp[key] === 'function') continue;
                    props[key] = comp[key];
                }
                return { type: cc.js.getClassName(comp), enabled: comp.enabled, uuid: comp.uuid, props: props };
            });
            return {
                path: pathParts.join('/'),
                uuid: node.uuid,
                name: node.name,
                active: node.active,
                activeInHierarchy: node.activeInHierarchy,
                position: node.position,
                worldPosition: node.worldPosition,
                scale: node.scale,
                eulerAngles: node.eulerAngles,
                children: node.children.map(function (child) { return child.name; }),
                components: components
            };
        `;
    }
}
