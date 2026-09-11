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
exports.getInspector = getInspector;
const path = __importStar(require("path"));
/**
 * Loads the bundled runtime inspector (`inspector/dist/main.js`). It is built by esbuild outside
 * the tsc rootDir, so it is required dynamically and typed by hand (types/inspector.ts).
 */
const INSPECTOR_ENTRY = path.join(__dirname, '..', 'inspector', 'dist', 'main.js');
let inspector = null;
function getInspector() {
    if (!inspector) {
        inspector = require(INSPECTOR_ENTRY);
    }
    return inspector;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5zcGVjdG9yLWhvc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zb3VyY2UvaW5zcGVjdG9yLWhvc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFZQSxvQ0FLQztBQWpCRCwyQ0FBNkI7QUFHN0I7OztHQUdHO0FBRUgsTUFBTSxlQUFlLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7QUFFbkYsSUFBSSxTQUFTLEdBQTJCLElBQUksQ0FBQztBQUU3QyxTQUFnQixZQUFZO0lBQ3hCLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUNiLFNBQVMsR0FBRyxPQUFPLENBQUMsZUFBZSxDQUFvQixDQUFDO0lBQzVELENBQUM7SUFDRCxPQUFPLFNBQVMsQ0FBQztBQUNyQixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IEluc3BlY3Rvck1vZHVsZSB9IGZyb20gJy4vdHlwZXMvaW5zcGVjdG9yJztcblxuLyoqXG4gKiBMb2FkcyB0aGUgYnVuZGxlZCBydW50aW1lIGluc3BlY3RvciAoYGluc3BlY3Rvci9kaXN0L21haW4uanNgKS4gSXQgaXMgYnVpbHQgYnkgZXNidWlsZCBvdXRzaWRlXG4gKiB0aGUgdHNjIHJvb3REaXIsIHNvIGl0IGlzIHJlcXVpcmVkIGR5bmFtaWNhbGx5IGFuZCB0eXBlZCBieSBoYW5kICh0eXBlcy9pbnNwZWN0b3IudHMpLlxuICovXG5cbmNvbnN0IElOU1BFQ1RPUl9FTlRSWSA9IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLicsICdpbnNwZWN0b3InLCAnZGlzdCcsICdtYWluLmpzJyk7XG5cbmxldCBpbnNwZWN0b3I6IEluc3BlY3Rvck1vZHVsZSB8IG51bGwgPSBudWxsO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0SW5zcGVjdG9yKCk6IEluc3BlY3Rvck1vZHVsZSB7XG4gICAgaWYgKCFpbnNwZWN0b3IpIHtcbiAgICAgICAgaW5zcGVjdG9yID0gcmVxdWlyZShJTlNQRUNUT1JfRU5UUlkpIGFzIEluc3BlY3Rvck1vZHVsZTtcbiAgICB9XG4gICAgcmV0dXJuIGluc3BlY3Rvcjtcbn1cbiJdfQ==