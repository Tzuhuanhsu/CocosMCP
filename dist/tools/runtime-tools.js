"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuntimeTools = void 0;
const path = __importStar(require("path"));
const inspector_host_1 = require("../inspector-host");
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
const INSPECTOR_MODES = {
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
class RuntimeTools {
    getTools() {
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
    async execute(toolName, args) {
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
        }
        catch (err) {
            return { success: false, error: err.message || String(err) };
        }
    }
    // ------------------------------------------------------------------ transport
    runtime() {
        try {
            return (0, inspector_host_1.getInspector)().runtime;
        }
        catch (err) {
            throw new Error(`runtime inspector module not available: ${(err === null || err === void 0 ? void 0 : err.message) || err}`);
        }
    }
    asResponse(result) {
        if (result && result.ok === false) {
            return { success: false, error: result.error, data: result };
        }
        return { success: true, data: result };
    }
    async getStatus() {
        return this.asResponse(this.runtime().status());
    }
    async openInspector(mode = 'preview') {
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
            return { success: false, error: 'Game page loaded but no scene started in time', data: Object.assign(Object.assign({}, status), { sceneReady: false }) };
        }
        return { success: true, data: Object.assign(Object.assign({}, status), { sceneReady: true }), message: `Preview game running at ${status.gameUrl}` };
    }
    /** Wraps user code so throws and cyclic return values never break the IPC round-trip. */
    async evalScript(code) {
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
        const outer = await this.runtime().eval(wrapped);
        if (!outer.ok) {
            return { success: false, error: outer.error };
        }
        const inner = outer.value;
        if (!inner || inner.ok === false) {
            return { success: false, error: inner ? inner.error : 'no result from game page' };
        }
        return { success: true, data: inner.value };
    }
    /** A single expression is returned implicitly; code containing `return` or several statements is used as-is. */
    toReturningBody(code) {
        const trimmed = code.trim();
        const startsWithStatement = /^(return|throw|const|let|var|if|for|while|try|switch|function|class)\b/.test(trimmed);
        const hasReturn = /\breturn\b/.test(trimmed);
        const hasMultipleStatements = /[;\n]/.test(trimmed.replace(/;\s*$/, ''));
        return startsWithStatement || hasReturn || hasMultipleStatements ? trimmed : `return (${trimmed.replace(/;\s*$/, '')});`;
    }
    async getConsoleLogs(sinceSeq = 0, level = 'all') {
        return this.asResponse(this.runtime().console(Number(sinceSeq) || 0, level));
    }
    async captureScreenshot(outPath) {
        const targetPath = outPath || path.join(Editor.Project.path, ...SCREENSHOT_DIR_SEGMENTS, `${Date.now()}.png`);
        const result = await this.runtime().capture(targetPath);
        if (!result.ok) {
            return { success: false, error: result.error };
        }
        // `imagePath` is picked up by MCPServer to attach the PNG as image content
        return { success: true, data: { imagePath: result.path, width: result.width, height: result.height, bytes: result.bytes } };
    }
    /** Polls `script` until it yields a truthy value; the value itself is returned on success. */
    async waitFor(script, timeoutMs = DEFAULT_WAIT_TIMEOUT_MS) {
        const startedAt = Date.now();
        let lastError;
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
    buildConditionScript(expression) {
        if (typeof expression !== 'string' || !expression.trim()) {
            throw new Error('expression is required');
        }
        return `return Boolean(${expression});`;
    }
    buildEventsScript(sinceSeq = 0, name, firstMatchOnly = false) {
        const since = Number(sinceSeq) || 0;
        const nameLiteral = name ? JSON.stringify(name) : 'null';
        return `
            var events = (window.${EVENTS_GLOBAL_KEY} || []).filter(function (e) {
                return e.seq > ${since} && (${nameLiteral} === null || e.name === ${nameLiteral});
            });
            ${firstMatchOnly ? 'return events.length ? events[0] : null;' : `return { events: events, latestSeq: (window.${EVENTS_GLOBAL_KEY} || []).reduce(function (m, e) { return Math.max(m, e.seq); }, 0) };`}
        `;
    }
    buildSnapshotScript(target, includePrivate) {
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
exports.RuntimeTools = RuntimeTools;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicnVudGltZS10b29scy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NvdXJjZS90b29scy9ydW50aW1lLXRvb2xzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDJDQUE2QjtBQUU3QixzREFBaUQ7QUFHakQ7Ozs7Ozs7R0FPRztBQUVILE1BQU0scUJBQXFCLEdBQUcsR0FBRyxDQUFDO0FBQ2xDLE1BQU0sdUJBQXVCLEdBQUcsS0FBSyxDQUFDO0FBQ3RDLCtGQUErRjtBQUMvRixNQUFNLG1CQUFtQixHQUFHLENBQUMsQ0FBQztBQUM5QixNQUFNLHNCQUFzQixHQUFHLEtBQUssQ0FBQztBQUNyQyxNQUFNLGtCQUFrQixHQUFHLGdGQUFnRixDQUFDO0FBQzVHLE1BQU0sbUJBQW1CLEdBQUcsR0FBRyxDQUFDO0FBQ2hDLE1BQU0sdUJBQXVCLEdBQUcsQ0FBQyxNQUFNLEVBQUUsYUFBYSxDQUFDLENBQUM7QUFDeEQsK0ZBQStGO0FBQy9GLE1BQU0saUJBQWlCLEdBQUcsYUFBYSxDQUFDO0FBRXhDLE1BQU0sZUFBZSxHQUEyQjtJQUM1QyxPQUFPLEVBQUUsQ0FBQztJQUNWLFdBQVcsRUFBRSxDQUFDO0lBQ2QsTUFBTSxFQUFFLENBQUM7SUFDVCxZQUFZLEVBQUUsQ0FBQztDQUNsQixDQUFDO0FBR0YsOEZBQThGO0FBQzlGLE1BQU0sc0JBQXNCLEdBQUc7Ozs7Ozs7Ozs7Z0NBVUMsbUJBQW1COzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztFQW9CakQsQ0FBQztBQUVILE1BQWEsWUFBWTtJQUNyQixRQUFRO1FBQ0osT0FBTztZQUNIO2dCQUNJLElBQUksRUFBRSxZQUFZO2dCQUNsQixXQUFXLEVBQUUsK0dBQStHO2dCQUM1SCxXQUFXLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxFQUFFLEVBQUU7YUFDbEQ7WUFDRDtnQkFDSSxJQUFJLEVBQUUsZ0JBQWdC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QyxDQUFDO1FBQzlDLENBQUM7UUFDRCxPQUFPLGtCQUFrQixVQUFVLElBQUksQ0FBQztJQUM1QyxDQUFDO0lBRU8saUJBQWlCLENBQUMsV0FBbUIsQ0FBQyxFQUFFLElBQWEsRUFBRSxpQkFBMEIsS0FBSztRQUMxRixNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3BDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO1FBQ3pELE9BQU87bUNBQ29CLGlCQUFpQjtpQ0FDbkIsS0FBSyxRQUFRLFdBQVcsMkJBQTJCLFdBQVc7O2NBRWpGLGNBQWMsQ0FBQyxDQUFDLENBQUMsMENBQTBDLENBQUMsQ0FBQyxDQUFDLCtDQUErQyxpQkFBaUIsc0VBQXNFO1NBQ3pNLENBQUM7SUFDTixDQUFDO0lBRU8sbUJBQW1CLENBQUMsTUFBYyxFQUFFLGNBQXVCO1FBQy9ELElBQUksT0FBTyxNQUFNLEtBQUssUUFBUSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxFQUFFLENBQUM7WUFDL0MsTUFBTSxJQUFJLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBQzFDLENBQUM7UUFDRCxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzdDLE9BQU87OztpQ0FHa0IsYUFBYTs7Ozs7MkNBS0gsYUFBYTs7OzhEQUdNLGFBQWE7Ozs7Ozs7b0RBT3ZCLGNBQWM7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7U0FtQnpELENBQUM7SUFDTixDQUFDO0NBQ0o7QUFwVEQsb0NBb1RDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IFRvb2xEZWZpbml0aW9uLCBUb29sUmVzcG9uc2UsIFRvb2xFeGVjdXRvciB9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCB7IGdldEluc3BlY3RvciB9IGZyb20gJy4uL2luc3BlY3Rvci1ob3N0JztcbmltcG9ydCB7IEluc3BlY3RvclJ1bnRpbWVBcGksIFJ1bnRpbWVFdmFsUmVzdWx0IH0gZnJvbSAnLi4vdHlwZXMvaW5zcGVjdG9yJztcblxuLyoqXG4gKiBQbGF5LW1vZGUgKHByZXZpZXcpIHJ1bnRpbWUgdG9vbHMuXG4gKlxuICogVGhlIGVkaXRvciBpdHNlbGYgaGFzIG5vIGhhbmRsZSBvbiB0aGUgcnVubmluZyBnYW1lLCBzbyBldmVyeSB0b29sIGhlcmUgZ29lcyB0aHJvdWdoIHRoZVxuICogYnVuZGxlZCBydW50aW1lIGluc3BlY3RvciAoaW5zcGVjdG9yLyksIHdoaWNoIGhvc3RzIHRoZSBwcmV2aWV3IHBhZ2UgaW4gYW4gRWxlY3Ryb24gPHdlYnZpZXc+XG4gKiBhbmQgZXhwb3NlcyBhbiBpbi1wcm9jZXNzIEFQSSAoc3RhdHVzIC8gb3BlbiAvIGV2YWwgLyBjYXB0dXJlIC8gY29uc29sZSkuIFRoaXMgY2xhc3Mgb3ducyB0aGVcbiAqIHRvb2wgc2VtYW50aWNzIChzbmFwc2hvdHMsIHdhaXRpbmcsIGV2ZW50IGJ1ZmZlciBjb250cmFjdCk7IHRoZSBpbnNwZWN0b3IgaXMgdHJhbnNwb3J0IG9ubHkuXG4gKi9cblxuY29uc3QgV0FJVF9QT0xMX0lOVEVSVkFMX01TID0gMTAwO1xuY29uc3QgREVGQVVMVF9XQUlUX1RJTUVPVVRfTVMgPSAxMDAwMDtcbi8qKiBzbmFwc2hvdCA9IHJvb3Qg4oaSIGNvbXBvbmVudHNbXSDihpIgY29tcG9uZW50IOKGkiBwcm9wcyDihpIgdmFsdWU6IDYga2VlcHMgbGVhZiB2YWx1ZXMgcmVhZGFibGUgKi9cbmNvbnN0IE1BWF9TRVJJQUxJWkVfREVQVEggPSA2O1xuY29uc3QgU0NFTkVfUkVBRFlfVElNRU9VVF9NUyA9IDE1MDAwO1xuY29uc3QgU0NFTkVfUkVBRFlfU0NSSVBUID0gJ3JldHVybiB0eXBlb2YgY2MgIT09IFwidW5kZWZpbmVkXCIgJiYgISFjYy5kaXJlY3RvciAmJiAhIWNjLmRpcmVjdG9yLmdldFNjZW5lKCk7JztcbmNvbnN0IE1BWF9TRVJJQUxJWkVfQVJSQVkgPSAxMDA7XG5jb25zdCBTQ1JFRU5TSE9UX0RJUl9TRUdNRU5UUyA9IFsndGVtcCcsICdtY3AtcnVudGltZSddO1xuLyoqIEdhbWUgc2NyaXB0cyBwdXNoIGB7IHNlcSwgdCwgbmFtZSwgcGF5bG9hZCB9YCByZWNvcmRzIGludG8gdGhpcyBnbG9iYWwgdG8gcmVwb3J0IGV2ZW50cy4gKi9cbmNvbnN0IEVWRU5UU19HTE9CQUxfS0VZID0gJ19fbWNwRXZlbnRzJztcblxuY29uc3QgSU5TUEVDVE9SX01PREVTOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge1xuICAgIHByZXZpZXc6IDAsXG4gICAgYnVpbGRNb2JpbGU6IDEsXG4gICAgY3VzdG9tOiAyLFxuICAgIGJ1aWxkRGVza3RvcDogM1xufTtcblxuXG4vKiogUnVucyBpbnNpZGUgdGhlIGdhbWUgcGFnZTogZGVwdGgtbGltaXRlZCBzZXJpYWxpemVyIHNvIGNjLk5vZGUgZ3JhcGhzIGJlY29tZSBjbG9uZWFibGUuICovXG5jb25zdCBTQUZFX1NFUklBTElaRVJfU09VUkNFID0gYFxuZnVuY3Rpb24gX19tY3BTYWZlKHZhbHVlLCBkZXB0aCwgc2Vlbikge1xuICAgIGlmICh2YWx1ZSA9PT0gbnVsbCB8fCB2YWx1ZSA9PT0gdW5kZWZpbmVkKSByZXR1cm4gdmFsdWU7XG4gICAgdmFyIHR5cGUgPSB0eXBlb2YgdmFsdWU7XG4gICAgaWYgKHR5cGUgPT09ICdmdW5jdGlvbicpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgaWYgKHR5cGUgIT09ICdvYmplY3QnKSByZXR1cm4gdHlwZSA9PT0gJ251bWJlcicgJiYgIWlzRmluaXRlKHZhbHVlKSA/IFN0cmluZyh2YWx1ZSkgOiB2YWx1ZTtcbiAgICBpZiAoZGVwdGggPD0gMCkgcmV0dXJuICdbZGVwdGhdJztcbiAgICBpZiAoc2Vlbi5pbmRleE9mKHZhbHVlKSA+PSAwKSByZXR1cm4gJ1tjeWNsZV0nO1xuICAgIHNlZW4ucHVzaCh2YWx1ZSk7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB2YWx1ZS5zbGljZSgwLCAke01BWF9TRVJJQUxJWkVfQVJSQVl9KS5tYXAoZnVuY3Rpb24gKGl0ZW0pIHsgcmV0dXJuIF9fbWNwU2FmZShpdGVtLCBkZXB0aCAtIDEsIHNlZW4pOyB9KTtcbiAgICB9XG4gICAgaWYgKCd4JyBpbiB2YWx1ZSAmJiAneScgaW4gdmFsdWUgJiYgdHlwZW9mIHZhbHVlLnggPT09ICdudW1iZXInKSB7XG4gICAgICAgIHZhciB2ZWMgPSB7IHg6IHZhbHVlLngsIHk6IHZhbHVlLnkgfTtcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZS56ID09PSAnbnVtYmVyJykgdmVjLnogPSB2YWx1ZS56O1xuICAgICAgICBpZiAodHlwZW9mIHZhbHVlLncgPT09ICdudW1iZXInKSB2ZWMudyA9IHZhbHVlLnc7XG4gICAgICAgIHJldHVybiB2ZWM7XG4gICAgfVxuICAgIHZhciBlbmdpbmUgPSB3aW5kb3cuY2M7XG4gICAgaWYgKGVuZ2luZSAmJiAodmFsdWUgaW5zdGFuY2VvZiBlbmdpbmUuTm9kZSB8fCB2YWx1ZSBpbnN0YW5jZW9mIGVuZ2luZS5Db21wb25lbnQgfHwgdmFsdWUgaW5zdGFuY2VvZiBlbmdpbmUuQXNzZXQpKSB7XG4gICAgICAgIC8vIGVuZ2luZSBvYmplY3RzIGFyZSBjeWNsaWMgZ3JhcGhzOiBpZGVudGlmeSBpbnN0ZWFkIG9mIGV4cGFuZGluZ1xuICAgICAgICByZXR1cm4geyBfX3R5cGU6IGVuZ2luZS5qcy5nZXRDbGFzc05hbWUodmFsdWUpLCBuYW1lOiB2YWx1ZS5uYW1lLCB1dWlkOiB2YWx1ZS51dWlkIH07XG4gICAgfVxuICAgIHZhciBvdXQgPSB7fTtcbiAgICBmb3IgKHZhciBrZXkgaW4gdmFsdWUpIHtcbiAgICAgICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodmFsdWUsIGtleSkpIGNvbnRpbnVlO1xuICAgICAgICB2YXIgc2FmZSA9IF9fbWNwU2FmZSh2YWx1ZVtrZXldLCBkZXB0aCAtIDEsIHNlZW4pO1xuICAgICAgICBpZiAoc2FmZSAhPT0gdW5kZWZpbmVkKSBvdXRba2V5XSA9IHNhZmU7XG4gICAgfVxuICAgIHJldHVybiBvdXQ7XG59YDtcblxuZXhwb3J0IGNsYXNzIFJ1bnRpbWVUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XG4gICAgZ2V0VG9vbHMoKTogVG9vbERlZmluaXRpb25bXSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2dldF9zdGF0dXMnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnR2V0IHBsYXktbW9kZSBydW50aW1lIHN0YXR1czogd2hldGhlciB0aGUgcnVudGltZSBpbnNwZWN0b3Igd2luZG93IGlzIG9wZW4gYW5kIHRoZSBwcmV2aWV3IGdhbWUgcGFnZSBpcyByZWFkeScsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ29wZW5faW5zcGVjdG9yJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ09wZW4gdGhlIHJ1bnRpbWUgaW5zcGVjdG9yIHdpbmRvdywgd2hpY2ggbG9hZHMgYW5kIHBsYXlzIHRoZSBwcmV2aWV3IGdhbWUuIFdhaXRzIHVudGlsIHRoZSBnYW1lIHNjZW5lIGlzIHJ1bm5pbmcuJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYToge1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiAnb2JqZWN0JyxcbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydGllczoge1xuICAgICAgICAgICAgICAgICAgICAgICAgbW9kZToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdzdHJpbmcnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnV2hpY2ggcGFnZSB0byBsb2FkJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbnVtOiBPYmplY3Qua2V5cyhJTlNQRUNUT1JfTU9ERVMpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6ICdwcmV2aWV3J1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZXZhbCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdFeGVjdXRlIEphdmFTY3JpcHQgaW5zaWRlIHRoZSBydW5uaW5nIHByZXZpZXcgZ2FtZSBwYWdlIChwbGF5IG1vZGUpLiBgY2NgIGlzIGF2YWlsYWJsZSBhcyB3aW5kb3cuY2MuIFJldHVybiB2YWx1ZSBpcyBzZXJpYWxpemVkIHdpdGggZGVwdGggbGltaXQ7IGNjLk5vZGUvQ29tcG9uZW50IGFyZSByZWR1Y2VkIHRvIHtfX3R5cGUsbmFtZSx1dWlkfS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6ICdvYmplY3QnLFxuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiB7IHR5cGU6ICdzdHJpbmcnLCBkZXNjcmlwdGlvbjogJ0phdmFTY3JpcHQgZXhwcmVzc2lvbiBvciBzdGF0ZW1lbnRzOyBtYXkgdXNlIGF3YWl0OyB1c2UgYHJldHVybmAgdG8gcmV0dXJuIGEgdmFsdWUnIH1cbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgcmVxdWlyZWQ6IFsnY29kZSddXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X25vZGVfc25hcHNob3QnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnU25hcHNob3QgYSBub2RlIGluIHRoZSBydW5uaW5nIGdhbWU6IHRyYW5zZm9ybSwgYWN0aXZlIHN0YXRlLCBjaGlsZHJlbiBuYW1lcyBhbmQgY29tcG9uZW50IHByb3BlcnRpZXMnLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6ICdvYmplY3QnLFxuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXQ6IHsgdHlwZTogJ3N0cmluZycsIGRlc2NyaXB0aW9uOiAnTm9kZSBwYXRoIGZvciBjYy5maW5kIChlLmcuIFwiQ2FudmFzL1Nsb3RNYWNoaW5lL1JlZWxfMVwiKSwgb3IgYSBub2RlIG5hbWUgdG8gc2VhcmNoIGJ5IGJyZWFkdGgtZmlyc3QnIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICBpbmNsdWRlUHJpdmF0ZTogeyB0eXBlOiAnYm9vbGVhbicsIGRlc2NyaXB0aW9uOiAnSW5jbHVkZSB1bmRlcnNjb3JlLXByZWZpeGVkIGNvbXBvbmVudCBmaWVsZHMnLCBkZWZhdWx0OiBmYWxzZSB9XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIHJlcXVpcmVkOiBbJ3RhcmdldCddXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X2NvbnNvbGVfbG9ncycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdHZXQgY29uc29sZSBvdXRwdXQgKGxvZy93YXJuL2Vycm9yLCBpbmNsLiBjYy5sb2cpIGNhcHR1cmVkIGZyb20gdGhlIHJ1bm5pbmcgcHJldmlldyBnYW1lJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYToge1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiAnb2JqZWN0JyxcbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydGllczoge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2luY2VTZXE6IHsgdHlwZTogJ251bWJlcicsIGRlc2NyaXB0aW9uOiAnT25seSBlbnRyaWVzIHdpdGggc2VxIGdyZWF0ZXIgdGhhbiB0aGlzICh1c2UgbGF0ZXN0U2VxIGZyb20gYSBwcmV2aW91cyBjYWxsKScsIGRlZmF1bHQ6IDAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldmVsOiB7IHR5cGU6ICdzdHJpbmcnLCBlbnVtOiBbJ2FsbCcsICd2ZXJib3NlJywgJ2luZm8nLCAnd2FybmluZycsICdlcnJvciddLCBkZWZhdWx0OiAnYWxsJyB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdjbGVhcl9jb25zb2xlX2xvZ3MnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQ2xlYXIgdGhlIGNhcHR1cmVkIHByZXZpZXcgZ2FtZSBjb25zb2xlIGJ1ZmZlcicsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2NhcHR1cmVfc2NyZWVuc2hvdCcsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdDYXB0dXJlIGEgUE5HIHNjcmVlbnNob3Qgb2YgdGhlIHJ1bm5pbmcgcHJldmlldyBnYW1lLiBSZXR1cm5zIHRoZSBmaWxlIHBhdGg7IHRoZSBpbWFnZSBpcyBhbHNvIGF0dGFjaGVkIHRvIHRoZSByZXNwb25zZS4nLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6ICdvYmplY3QnLFxuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBvdXRQYXRoOiB7IHR5cGU6ICdzdHJpbmcnLCBkZXNjcmlwdGlvbjogJ0Fic29sdXRlIG91dHB1dCBwYXRoOyBkZWZhdWx0cyB0byA8cHJvamVjdD4vdGVtcC9tY3AtcnVudGltZS88dGltZXN0YW1wPi5wbmcnIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ3dhaXRfZm9yX2NvbmRpdGlvbicsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdQb2xsIGEgSmF2YVNjcmlwdCBleHByZXNzaW9uIGluc2lkZSB0aGUgcnVubmluZyBnYW1lIHVudGlsIGl0IGlzIHRydXRoeSBvciB0aGUgdGltZW91dCBlbGFwc2VzJyxcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYToge1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiAnb2JqZWN0JyxcbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydGllczoge1xuICAgICAgICAgICAgICAgICAgICAgICAgZXhwcmVzc2lvbjogeyB0eXBlOiAnc3RyaW5nJywgZGVzY3JpcHRpb246ICdFeHByZXNzaW9uIGV2YWx1YXRlZCBpbiB0aGUgZ2FtZSBwYWdlLCBlLmcuIFwiY2MuZmluZChcXCdDYW52YXMvU2xvdE1hY2hpbmVcXCcpLmdldENvbXBvbmVudChcXCdHYW1lQ29udHJvbGxlclxcJykuX3JlZWxzLmV2ZXJ5KHIgPT4gci5pc0lkbGUoKSlcIicgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRpbWVvdXRNczogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogREVGQVVMVF9XQUlUX1RJTUVPVVRfTVMgfVxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICByZXF1aXJlZDogWydleHByZXNzaW9uJ11cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdnZXRfZXZlbnRzJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogYFJlYWQgc3RydWN0dXJlZCBldmVudHMgcmVwb3J0ZWQgYnkgZ2FtZSBzY3JpcHRzIHZpYSB3aW5kb3cuJHtFVkVOVFNfR0xPQkFMX0tFWX0gKHJlY29yZHMgb2YgeyBzZXEsIHQsIG5hbWUsIHBheWxvYWQgfSlgLFxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6ICdvYmplY3QnLFxuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzaW5jZVNlcTogeyB0eXBlOiAnbnVtYmVyJywgZGVmYXVsdDogMCB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogeyB0eXBlOiAnc3RyaW5nJywgZGVzY3JpcHRpb246ICdPbmx5IGV2ZW50cyB3aXRoIHRoaXMgbmFtZScgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnd2FpdF9mb3JfZXZlbnQnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgV2FpdCB1bnRpbCBhIGdhbWUgc2NyaXB0IHJlcG9ydHMgYW4gZXZlbnQgd2l0aCB0aGUgZ2l2ZW4gbmFtZSBpbnRvIHdpbmRvdy4ke0VWRU5UU19HTE9CQUxfS0VZfWAsXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogJ29iamVjdCcsXG4gICAgICAgICAgICAgICAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IHsgdHlwZTogJ3N0cmluZycgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHNpbmNlU2VxOiB7IHR5cGU6ICdudW1iZXInLCBkZWZhdWx0OiAwIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICB0aW1lb3V0TXM6IHsgdHlwZTogJ251bWJlcicsIGRlZmF1bHQ6IERFRkFVTFRfV0FJVF9USU1FT1VUX01TIH1cbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgcmVxdWlyZWQ6IFsnbmFtZSddXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICBdO1xuICAgIH1cblxuICAgIGFzeW5jIGV4ZWN1dGUodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcbiAgICAgICAgYXJncyA9IGFyZ3MgfHwge307XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBzd2l0Y2ggKHRvb2xOYW1lKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAnZ2V0X3N0YXR1cyc6XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmdldFN0YXR1cygpO1xuICAgICAgICAgICAgICAgIGNhc2UgJ29wZW5faW5zcGVjdG9yJzpcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMub3Blbkluc3BlY3RvcihhcmdzLm1vZGUpO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2V2YWwnOlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5ldmFsU2NyaXB0KGFyZ3MuY29kZSk7XG4gICAgICAgICAgICAgICAgY2FzZSAnZ2V0X25vZGVfc25hcHNob3QnOlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5ldmFsU2NyaXB0KHRoaXMuYnVpbGRTbmFwc2hvdFNjcmlwdChhcmdzLnRhcmdldCwgQm9vbGVhbihhcmdzLmluY2x1ZGVQcml2YXRlKSkpO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2dldF9jb25zb2xlX2xvZ3MnOlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5nZXRDb25zb2xlTG9ncyhhcmdzLnNpbmNlU2VxLCBhcmdzLmxldmVsKTtcbiAgICAgICAgICAgICAgICBjYXNlICdjbGVhcl9jb25zb2xlX2xvZ3MnOlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hc1Jlc3BvbnNlKHRoaXMucnVudGltZSgpLmNsZWFyQ29uc29sZSgpKTtcbiAgICAgICAgICAgICAgICBjYXNlICdjYXB0dXJlX3NjcmVlbnNob3QnOlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5jYXB0dXJlU2NyZWVuc2hvdChhcmdzLm91dFBhdGgpO1xuICAgICAgICAgICAgICAgIGNhc2UgJ3dhaXRfZm9yX2NvbmRpdGlvbic6XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLndhaXRGb3IodGhpcy5idWlsZENvbmRpdGlvblNjcmlwdChhcmdzLmV4cHJlc3Npb24pLCBhcmdzLnRpbWVvdXRNcyk7XG4gICAgICAgICAgICAgICAgY2FzZSAnZ2V0X2V2ZW50cyc6XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmV2YWxTY3JpcHQodGhpcy5idWlsZEV2ZW50c1NjcmlwdChhcmdzLnNpbmNlU2VxLCBhcmdzLm5hbWUpKTtcbiAgICAgICAgICAgICAgICBjYXNlICd3YWl0X2Zvcl9ldmVudCc6XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLndhaXRGb3IodGhpcy5idWlsZEV2ZW50c1NjcmlwdChhcmdzLnNpbmNlU2VxLCBhcmdzLm5hbWUsIHRydWUpLCBhcmdzLnRpbWVvdXRNcyk7XG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHRvb2w6ICR7dG9vbE5hbWV9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIHx8IFN0cmluZyhlcnIpIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gdHJhbnNwb3J0XG5cbiAgICBwcml2YXRlIHJ1bnRpbWUoKTogSW5zcGVjdG9yUnVudGltZUFwaSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICByZXR1cm4gZ2V0SW5zcGVjdG9yKCkucnVudGltZTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgcnVudGltZSBpbnNwZWN0b3IgbW9kdWxlIG5vdCBhdmFpbGFibGU6ICR7ZXJyPy5tZXNzYWdlIHx8IGVycn1gKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYXNSZXNwb25zZShyZXN1bHQ6IGFueSk6IFRvb2xSZXNwb25zZSB7XG4gICAgICAgIGlmIChyZXN1bHQgJiYgcmVzdWx0Lm9rID09PSBmYWxzZSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiByZXN1bHQuZXJyb3IsIGRhdGE6IHJlc3VsdCB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHJlc3VsdCB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0U3RhdHVzKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmFzUmVzcG9uc2UodGhpcy5ydW50aW1lKCkuc3RhdHVzKCkpO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgb3Blbkluc3BlY3Rvcihtb2RlOiBzdHJpbmcgPSAncHJldmlldycpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xuICAgICAgICBjb25zdCBtb2RlVmFsdWUgPSBJTlNQRUNUT1JfTU9ERVNbbW9kZV07XG4gICAgICAgIGlmIChtb2RlVmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgVW5rbm93biBtb2RlICcke21vZGV9Jy4gVXNlIG9uZSBvZjogJHtPYmplY3Qua2V5cyhJTlNQRUNUT1JfTU9ERVMpLmpvaW4oJywgJyl9YCB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHN0YXR1cyA9IGF3YWl0IHRoaXMucnVudGltZSgpLm9wZW4obW9kZVZhbHVlKTtcbiAgICAgICAgaWYgKCFzdGF0dXMuZ2FtZVJlYWR5KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdJbnNwZWN0b3Igd2luZG93IG9wZW5lZCBidXQgdGhlIGdhbWUgcGFnZSBkaWQgbm90IGZpbmlzaCBsb2FkaW5nIGluIHRpbWUnLCBkYXRhOiBzdGF0dXMgfTtcbiAgICAgICAgfVxuICAgICAgICAvLyBwYWdlIGxvYWQgcHJlY2VkZXMgZW5naW5lIGJvb3Q7IHdhaXQgdW50aWwgYSBzY2VuZSBpcyBhY3R1YWxseSBydW5uaW5nXG4gICAgICAgIGNvbnN0IHNjZW5lUmVhZHkgPSBhd2FpdCB0aGlzLndhaXRGb3IoU0NFTkVfUkVBRFlfU0NSSVBULCBTQ0VORV9SRUFEWV9USU1FT1VUX01TKTtcbiAgICAgICAgaWYgKCFzY2VuZVJlYWR5LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ0dhbWUgcGFnZSBsb2FkZWQgYnV0IG5vIHNjZW5lIHN0YXJ0ZWQgaW4gdGltZScsIGRhdGE6IHsgLi4uc3RhdHVzLCBzY2VuZVJlYWR5OiBmYWxzZSB9IH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyAuLi5zdGF0dXMsIHNjZW5lUmVhZHk6IHRydWUgfSwgbWVzc2FnZTogYFByZXZpZXcgZ2FtZSBydW5uaW5nIGF0ICR7c3RhdHVzLmdhbWVVcmx9YCB9O1xuICAgIH1cblxuICAgIC8qKiBXcmFwcyB1c2VyIGNvZGUgc28gdGhyb3dzIGFuZCBjeWNsaWMgcmV0dXJuIHZhbHVlcyBuZXZlciBicmVhayB0aGUgSVBDIHJvdW5kLXRyaXAuICovXG4gICAgcHJpdmF0ZSBhc3luYyBldmFsU2NyaXB0KGNvZGU6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGlmICh0eXBlb2YgY29kZSAhPT0gJ3N0cmluZycgfHwgIWNvZGUudHJpbSgpKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdjb2RlIGlzIHJlcXVpcmVkJyB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHdyYXBwZWQgPSBgKGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICR7U0FGRV9TRVJJQUxJWkVSX1NPVVJDRX1cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdmFyIF9fbWNwUmVzdWx0ID0gYXdhaXQgKGFzeW5jIGZ1bmN0aW9uICgpIHsgJHt0aGlzLnRvUmV0dXJuaW5nQm9keShjb2RlKX0gfSkoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgdmFsdWU6IF9fbWNwU2FmZShfX21jcFJlc3VsdCwgJHtNQVhfU0VSSUFMSVpFX0RFUFRIfSwgW10pIH07XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGUgJiYgZS5zdGFjayB8fCBlKSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICB9KSgpYDtcbiAgICAgICAgY29uc3Qgb3V0ZXI6IFJ1bnRpbWVFdmFsUmVzdWx0ID0gYXdhaXQgdGhpcy5ydW50aW1lKCkuZXZhbCh3cmFwcGVkKTtcbiAgICAgICAgaWYgKCFvdXRlci5vaykge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBvdXRlci5lcnJvciB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGlubmVyOiBSdW50aW1lRXZhbFJlc3VsdCA9IG91dGVyLnZhbHVlO1xuICAgICAgICBpZiAoIWlubmVyIHx8IGlubmVyLm9rID09PSBmYWxzZSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBpbm5lciA/IGlubmVyLmVycm9yIDogJ25vIHJlc3VsdCBmcm9tIGdhbWUgcGFnZScgfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiBpbm5lci52YWx1ZSB9O1xuICAgIH1cblxuICAgIC8qKiBBIHNpbmdsZSBleHByZXNzaW9uIGlzIHJldHVybmVkIGltcGxpY2l0bHk7IGNvZGUgY29udGFpbmluZyBgcmV0dXJuYCBvciBzZXZlcmFsIHN0YXRlbWVudHMgaXMgdXNlZCBhcy1pcy4gKi9cbiAgICBwcml2YXRlIHRvUmV0dXJuaW5nQm9keShjb2RlOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgICAgICBjb25zdCB0cmltbWVkID0gY29kZS50cmltKCk7XG4gICAgICAgIGNvbnN0IHN0YXJ0c1dpdGhTdGF0ZW1lbnQgPSAvXihyZXR1cm58dGhyb3d8Y29uc3R8bGV0fHZhcnxpZnxmb3J8d2hpbGV8dHJ5fHN3aXRjaHxmdW5jdGlvbnxjbGFzcylcXGIvLnRlc3QodHJpbW1lZCk7XG4gICAgICAgIGNvbnN0IGhhc1JldHVybiA9IC9cXGJyZXR1cm5cXGIvLnRlc3QodHJpbW1lZCk7XG4gICAgICAgIGNvbnN0IGhhc011bHRpcGxlU3RhdGVtZW50cyA9IC9bO1xcbl0vLnRlc3QodHJpbW1lZC5yZXBsYWNlKC87XFxzKiQvLCAnJykpO1xuICAgICAgICByZXR1cm4gc3RhcnRzV2l0aFN0YXRlbWVudCB8fCBoYXNSZXR1cm4gfHwgaGFzTXVsdGlwbGVTdGF0ZW1lbnRzID8gdHJpbW1lZCA6IGByZXR1cm4gKCR7dHJpbW1lZC5yZXBsYWNlKC87XFxzKiQvLCAnJyl9KTtgO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0Q29uc29sZUxvZ3Moc2luY2VTZXE6IG51bWJlciA9IDAsIGxldmVsOiBzdHJpbmcgPSAnYWxsJyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmFzUmVzcG9uc2UodGhpcy5ydW50aW1lKCkuY29uc29sZShOdW1iZXIoc2luY2VTZXEpIHx8IDAsIGxldmVsIGFzIGFueSkpO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgY2FwdHVyZVNjcmVlbnNob3Qob3V0UGF0aD86IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHRhcmdldFBhdGggPSBvdXRQYXRoIHx8IHBhdGguam9pbihFZGl0b3IuUHJvamVjdC5wYXRoLCAuLi5TQ1JFRU5TSE9UX0RJUl9TRUdNRU5UUywgYCR7RGF0ZS5ub3coKX0ucG5nYCk7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucnVudGltZSgpLmNhcHR1cmUodGFyZ2V0UGF0aCk7XG4gICAgICAgIGlmICghcmVzdWx0Lm9rKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHJlc3VsdC5lcnJvciB9O1xuICAgICAgICB9XG4gICAgICAgIC8vIGBpbWFnZVBhdGhgIGlzIHBpY2tlZCB1cCBieSBNQ1BTZXJ2ZXIgdG8gYXR0YWNoIHRoZSBQTkcgYXMgaW1hZ2UgY29udGVudFxuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB7IGltYWdlUGF0aDogcmVzdWx0LnBhdGgsIHdpZHRoOiByZXN1bHQud2lkdGgsIGhlaWdodDogcmVzdWx0LmhlaWdodCwgYnl0ZXM6IHJlc3VsdC5ieXRlcyB9IH07XG4gICAgfVxuXG4gICAgLyoqIFBvbGxzIGBzY3JpcHRgIHVudGlsIGl0IHlpZWxkcyBhIHRydXRoeSB2YWx1ZTsgdGhlIHZhbHVlIGl0c2VsZiBpcyByZXR1cm5lZCBvbiBzdWNjZXNzLiAqL1xuICAgIHByaXZhdGUgYXN5bmMgd2FpdEZvcihzY3JpcHQ6IHN0cmluZywgdGltZW91dE1zOiBudW1iZXIgPSBERUZBVUxUX1dBSVRfVElNRU9VVF9NUyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XG4gICAgICAgIGNvbnN0IHN0YXJ0ZWRBdCA9IERhdGUubm93KCk7XG4gICAgICAgIGxldCBsYXN0RXJyb3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgICAgd2hpbGUgKERhdGUubm93KCkgLSBzdGFydGVkQXQgPCB0aW1lb3V0TXMpIHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXZhbFNjcmlwdChzY3JpcHQpO1xuICAgICAgICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzICYmIHJlc3VsdC5kYXRhKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyBmb3VuZDogdHJ1ZSwgZWxhcHNlZE1zOiBEYXRlLm5vdygpIC0gc3RhcnRlZEF0LCB2YWx1ZTogcmVzdWx0LmRhdGEgfSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGFzdEVycm9yID0gcmVzdWx0LnN1Y2Nlc3MgPyB1bmRlZmluZWQgOiByZXN1bHQuZXJyb3I7XG4gICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4gc2V0VGltZW91dChyZXNvbHZlLCBXQUlUX1BPTExfSU5URVJWQUxfTVMpKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBUaW1lZCBvdXQgYWZ0ZXIgJHt0aW1lb3V0TXN9bXNgLCBkYXRhOiB7IGZvdW5kOiBmYWxzZSwgZWxhcHNlZE1zOiBEYXRlLm5vdygpIC0gc3RhcnRlZEF0LCBsYXN0RXJyb3IgfSB9O1xuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSBpbi1nYW1lIHNjcmlwdCB0ZW1wbGF0ZXNcblxuICAgIHByaXZhdGUgYnVpbGRDb25kaXRpb25TY3JpcHQoZXhwcmVzc2lvbjogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAgICAgaWYgKHR5cGVvZiBleHByZXNzaW9uICE9PSAnc3RyaW5nJyB8fCAhZXhwcmVzc2lvbi50cmltKCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignZXhwcmVzc2lvbiBpcyByZXF1aXJlZCcpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBgcmV0dXJuIEJvb2xlYW4oJHtleHByZXNzaW9ufSk7YDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGJ1aWxkRXZlbnRzU2NyaXB0KHNpbmNlU2VxOiBudW1iZXIgPSAwLCBuYW1lPzogc3RyaW5nLCBmaXJzdE1hdGNoT25seTogYm9vbGVhbiA9IGZhbHNlKTogc3RyaW5nIHtcbiAgICAgICAgY29uc3Qgc2luY2UgPSBOdW1iZXIoc2luY2VTZXEpIHx8IDA7XG4gICAgICAgIGNvbnN0IG5hbWVMaXRlcmFsID0gbmFtZSA/IEpTT04uc3RyaW5naWZ5KG5hbWUpIDogJ251bGwnO1xuICAgICAgICByZXR1cm4gYFxuICAgICAgICAgICAgdmFyIGV2ZW50cyA9ICh3aW5kb3cuJHtFVkVOVFNfR0xPQkFMX0tFWX0gfHwgW10pLmZpbHRlcihmdW5jdGlvbiAoZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBlLnNlcSA+ICR7c2luY2V9ICYmICgke25hbWVMaXRlcmFsfSA9PT0gbnVsbCB8fCBlLm5hbWUgPT09ICR7bmFtZUxpdGVyYWx9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgJHtmaXJzdE1hdGNoT25seSA/ICdyZXR1cm4gZXZlbnRzLmxlbmd0aCA/IGV2ZW50c1swXSA6IG51bGw7JyA6IGByZXR1cm4geyBldmVudHM6IGV2ZW50cywgbGF0ZXN0U2VxOiAod2luZG93LiR7RVZFTlRTX0dMT0JBTF9LRVl9IHx8IFtdKS5yZWR1Y2UoZnVuY3Rpb24gKG0sIGUpIHsgcmV0dXJuIE1hdGgubWF4KG0sIGUuc2VxKTsgfSwgMCkgfTtgfVxuICAgICAgICBgO1xuICAgIH1cblxuICAgIHByaXZhdGUgYnVpbGRTbmFwc2hvdFNjcmlwdCh0YXJnZXQ6IHN0cmluZywgaW5jbHVkZVByaXZhdGU6IGJvb2xlYW4pOiBzdHJpbmcge1xuICAgICAgICBpZiAodHlwZW9mIHRhcmdldCAhPT0gJ3N0cmluZycgfHwgIXRhcmdldC50cmltKCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcigndGFyZ2V0IGlzIHJlcXVpcmVkJyk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgdGFyZ2V0TGl0ZXJhbCA9IEpTT04uc3RyaW5naWZ5KHRhcmdldCk7XG4gICAgICAgIHJldHVybiBgXG4gICAgICAgICAgICB2YXIgc2NlbmUgPSBjYy5kaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkgdGhyb3cgbmV3IEVycm9yKCdubyBydW5uaW5nIHNjZW5lJyk7XG4gICAgICAgICAgICB2YXIgbm9kZSA9IGNjLmZpbmQoJHt0YXJnZXRMaXRlcmFsfSk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHtcbiAgICAgICAgICAgICAgICB2YXIgcXVldWUgPSBzY2VuZS5jaGlsZHJlbi5zbGljZSgpO1xuICAgICAgICAgICAgICAgIHdoaWxlIChxdWV1ZS5sZW5ndGggJiYgIW5vZGUpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGN1cnJlbnQgPSBxdWV1ZS5zaGlmdCgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoY3VycmVudC5uYW1lID09PSAke3RhcmdldExpdGVyYWx9KSBub2RlID0gY3VycmVudDsgZWxzZSBxdWV1ZS5wdXNoLmFwcGx5KHF1ZXVlLCBjdXJyZW50LmNoaWxkcmVuKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHRocm93IG5ldyBFcnJvcignbm9kZSBub3QgZm91bmQ6ICcgKyAke3RhcmdldExpdGVyYWx9KTtcbiAgICAgICAgICAgIHZhciBwYXRoUGFydHMgPSBbXTtcbiAgICAgICAgICAgIGZvciAodmFyIHdhbGtlciA9IG5vZGU7IHdhbGtlciAmJiB3YWxrZXIgIT09IHNjZW5lOyB3YWxrZXIgPSB3YWxrZXIucGFyZW50KSBwYXRoUGFydHMudW5zaGlmdCh3YWxrZXIubmFtZSk7XG4gICAgICAgICAgICB2YXIgY29tcG9uZW50cyA9IG5vZGUuY29tcG9uZW50cy5tYXAoZnVuY3Rpb24gKGNvbXApIHtcbiAgICAgICAgICAgICAgICB2YXIgcHJvcHMgPSB7fTtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBrZXkgaW4gY29tcCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChjb21wLCBrZXkpKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGtleS5jaGFyQXQoMCkgPT09ICdfJyAmJiAhJHtpbmNsdWRlUHJpdmF0ZX0pIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICBpZiAoa2V5ID09PSAnbm9kZScgfHwga2V5ID09PSAnX19zY3JpcHRBc3NldCcgfHwgdHlwZW9mIGNvbXBba2V5XSA9PT0gJ2Z1bmN0aW9uJykgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgIHByb3BzW2tleV0gPSBjb21wW2tleV07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB7IHR5cGU6IGNjLmpzLmdldENsYXNzTmFtZShjb21wKSwgZW5hYmxlZDogY29tcC5lbmFibGVkLCB1dWlkOiBjb21wLnV1aWQsIHByb3BzOiBwcm9wcyB9O1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHBhdGg6IHBhdGhQYXJ0cy5qb2luKCcvJyksXG4gICAgICAgICAgICAgICAgdXVpZDogbm9kZS51dWlkLFxuICAgICAgICAgICAgICAgIG5hbWU6IG5vZGUubmFtZSxcbiAgICAgICAgICAgICAgICBhY3RpdmU6IG5vZGUuYWN0aXZlLFxuICAgICAgICAgICAgICAgIGFjdGl2ZUluSGllcmFyY2h5OiBub2RlLmFjdGl2ZUluSGllcmFyY2h5LFxuICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBub2RlLnBvc2l0aW9uLFxuICAgICAgICAgICAgICAgIHdvcmxkUG9zaXRpb246IG5vZGUud29ybGRQb3NpdGlvbixcbiAgICAgICAgICAgICAgICBzY2FsZTogbm9kZS5zY2FsZSxcbiAgICAgICAgICAgICAgICBldWxlckFuZ2xlczogbm9kZS5ldWxlckFuZ2xlcyxcbiAgICAgICAgICAgICAgICBjaGlsZHJlbjogbm9kZS5jaGlsZHJlbi5tYXAoZnVuY3Rpb24gKGNoaWxkKSB7IHJldHVybiBjaGlsZC5uYW1lOyB9KSxcbiAgICAgICAgICAgICAgICBjb21wb25lbnRzOiBjb21wb25lbnRzXG4gICAgICAgICAgICB9O1xuICAgICAgICBgO1xuICAgIH1cbn1cbiJdfQ==