/**
 * Shape of `inspector/dist/main.js` (esbuild bundle, outside the tsc rootDir, loaded with a
 * dynamic require). Mirrors inspector/src/shared/protocol.ts and inspector/src/main/main.ts.
 */

export type RuntimeConsoleLevel = 'verbose' | 'info' | 'warning' | 'error';

export interface RuntimeStatus {
    windowOpen: boolean;
    gameReady: boolean;
    gameUrl: string | null;
    previewPort: number | null;
    consoleSeq: number;
}

export interface RuntimeEvalResult {
    ok: boolean;
    value?: any;
    error?: string;
}

export interface RuntimeConsoleEntry {
    seq: number;
    t: number;
    level: RuntimeConsoleLevel;
    message: string;
    line: number;
    sourceId: string;
}

export interface RuntimeConsoleResult {
    ok: boolean;
    entries: RuntimeConsoleEntry[];
    latestSeq: number;
    error?: string;
}

export interface RuntimeCaptureResult {
    ok: boolean;
    path?: string;
    width?: number;
    height?: number;
    bytes?: number;
    error?: string;
}

export interface InspectorRuntimeApi {
    status(): RuntimeStatus;
    open(mode?: number): Promise<RuntimeStatus>;
    eval(code: string): Promise<RuntimeEvalResult>;
    capture(outPath: string): Promise<RuntimeCaptureResult>;
    console(sinceSeq?: number, level?: RuntimeConsoleLevel | 'all'): RuntimeConsoleResult;
    clearConsole(): RuntimeConsoleResult;
}

export interface InspectorModule {
    load(): Promise<void>;
    unload(): void;
    methods: { [key: string]: (...args: any[]) => any };
    runtime: InspectorRuntimeApi;
}
