// Ambient declarations for the inspector-window renderer.

/** Vue 2 global (vue.min.js is loaded by index.html before this bundle). Typed loosely:
 *  the UI is a direct transcription of the recovered options-API code; `ThisType<any>` keeps
 *  the options-API `this` usable without pulling in full vue type definitions. */
type VueOptions = Record<string, unknown> & ThisType<any>;
declare const Vue: {
    new ( options: VueOptions ): any;
    component( name: string, options: VueOptions ): void;
    delete( target: object, key: string ): void;
};

// provided by the window preload (mainPreload.ts)
declare function readConfig(): import( '@shared/protocol' ).InspectorConfig;
declare function saveConfig( config: unknown ): void;
declare function readDesignSize(): [ number, number ] | null;

interface HTMLWebViewElement extends HTMLElement {
    src: string;
    style: CSSStyleDeclaration;
    executeJavaScript( code: string ): Promise<any>;
    getWebContentsId(): number;
    openDevTools(): void;
    reloadIgnoringCache(): void;
    addEventListener( type: string, listener: ( event: any ) => void ): void;
}
