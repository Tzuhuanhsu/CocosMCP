// Ambient declarations for the injected probe environment (the inspected game page).

/** Cocos engine global (cclegacy in 3.x preview/build pages). Typed loosely on purpose:
 *  the probe must run across engine versions whose APIs drift. */
declare const cc: any;
declare const fgui: any;
declare const System: { import: ( name: string, parentUrl?: string ) => Promise<unknown> };

// engine-defined build flags (tryDefineGlobal in cc.env)
declare const CC_PREVIEW: boolean;
declare const CC_BUILD: boolean;

// bridge functions provided by the game-webview preload (gamePreload.ts)
declare function sendLog( text: string ): void;
declare function sendWarn( text: string ): void;
declare function sendError( text: string ): void;
declare function sendTree( tree: unknown ): void;
declare function sendGameState( paused: boolean ): void;
declare function sendStatistic( data: unknown ): void;
declare function showNodeDetail( detail: unknown ): void;
declare function locateNode( uuidPath: string[] ): void;
declare function canUpdateTree(): void;
