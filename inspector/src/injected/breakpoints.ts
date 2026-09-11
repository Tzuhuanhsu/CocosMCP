// Node breakpoints (pause in DevTools when a watched node event fires) and
// per-subtree auto-update suppression.
import { breakPoints, donotAutoUpdates } from './state';
import { readyUpdateTree } from './tree';

export function setBreakPoint( nodeId: string, eventName: string, transformBit?: string ): void {
    if ( !breakPoints[ nodeId ] ) breakPoints[ nodeId ] = {};
    breakPoints[ nodeId ][ transformBit || eventName ] = true;
    readyUpdateTree();
}

export function removeBreakPoint( nodeId: string ): void {
    delete breakPoints[ nodeId ];
    readyUpdateTree();
}

export function removeAllBreakPoints(): void {
    for ( const nodeId in breakPoints ) delete breakPoints[ nodeId ];
    readyUpdateTree();
}

export function toggleAutoUpdateSuppression( nodeId: string ): void {
    if ( donotAutoUpdates[ nodeId ] ) delete donotAutoUpdates[ nodeId ];
    else donotAutoUpdates[ nodeId ] = true;
    readyUpdateTree();
}
