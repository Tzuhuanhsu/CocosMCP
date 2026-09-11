// Inspector-window preload: exposes config read/write to the renderer.
import { readConfig, saveConfig, getDesignSize } from '../main/config';

declare const global: Record<string, unknown>;

global.readConfig = readConfig;
global.saveConfig = saveConfig;
global.readDesignSize = getDesignSize;
