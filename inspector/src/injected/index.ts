// Injected probe entry point. The inspector renderer calls the exposed window globals through
// webview.executeJavaScript, so every name here is part of the renderer <-> probe contract.
import { w } from './state';
import { isEngine3_4OrNewer } from './engine-compat';
import {
    toggleDC, locateNodeByPath, syncOpen, syncOpenFcom, readyUpdateTree, updateTree,
} from './tree';
import { setBreakPoint, removeBreakPoint, removeAllBreakPoints, toggleAutoUpdateSuppression } from './breakpoints';
import { initLogListeners } from './console-hooks';
import { setHover, toggleDesignMode, checkHover } from './hover';
import { drawRect, clearRect } from './draw-rect';
import {
    getNodeDetail, setComAttr, execCompMethod, toggleComp, removeComp,
    syncNode, syncNodeColor, readyGetNodeDetail,
} from './node-detail';
import { codeTip } from './code-tip';
import {
    getPath, getPathById, getUuidPathByPath, printPath,
    storeInGlobal, storeCompInGlobal, getComp, searchComs,
} from './node-path';
import {
    toggleNodeActive, removeNode, lockDragNode, swapPos, toggleFps,
    startStatistic, updateResize, resizeCanvas, removePreviewPageChrome, reCompile,
} from './misc';
import { initEngineHooks } from './init';

if ( !w.__initLogListeners ) {
    Object.assign( w, {
        // lifecycle
        __initLogListeners: initLogListeners,
        __initSf: initEngineHooks,
        // tree
        __updateTree: updateTree,
        __readyUpdateTree: readyUpdateTree,
        __locateNode: locateNodeByPath,
        __syncOpen: syncOpen,
        __syncOpenFcom: syncOpenFcom,
        __toggleDC: toggleDC,
        __toggleNode: toggleNodeActive,
        __removeNode: removeNode,
        __swapPos: swapPos,
        __donotAutoUpdate: toggleAutoUpdateSuppression,
        // breakpoints
        __setBreakPoint: setBreakPoint,
        __removeBreakPoint: removeBreakPoint,
        __removeAllBreakPoint: removeAllBreakPoints,
        // hover / design mode
        __setHover: setHover,
        __toggleDesignMode: toggleDesignMode,
        __toggleDrag: lockDragNode,
        __checkHover: checkHover,
        __drawRect: drawRect,
        __clearRect: clearRect,
        // node detail
        __getNodeDetail: getNodeDetail,
        __readyGetNodeDetail: readyGetNodeDetail,
        __setComAttr: setComAttr,
        __execCompMethod: execCompMethod,
        __toggleComp: toggleComp,
        __removeComp: removeComp,
        __syncNode: syncNode,
        __syncNodeColor: syncNodeColor,
        // console helpers / search
        __codeTip: codeTip,
        __searchComs: searchComs,
        __printPath: printPath,
        __getPath: getPath,
        __getPathByid: getPathById,
        __getUuidPathByPath: getUuidPathByPath,
        __storeInGlobal: storeInGlobal,
        __storeCompInGlobal: storeCompInGlobal,
        __getComp: getComp,
        // misc
        __toggleFps: toggleFps,
        __startStatistic: startStatistic,
        __updateResize: updateResize,
        __resizeCvn: resizeCanvas,
        __removeOtherNodes: removePreviewPageChrome,
        __reCompile: reCompile,
        __moreThen3_4_0: isEngine3_4OrNewer,
    } );

    // fgui support in preview mode: the module lives in the preview server's module registry
    if ( !w.fgui && typeof System !== 'undefined' ) {
        System.import( 'fairygui-cc', location.origin + '/scripting/x/mods/' )
            .then( ( fguiModule ) => { w.fgui = fguiModule; } )
            .catch( () => { /* project does not use fgui */ } );
    }

    initLogListeners();
    initEngineHooks();
}
