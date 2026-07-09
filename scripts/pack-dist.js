/**
 * pack-dist.js — 打包 cocos-mcp-server 擴充套件供其他專案使用。
 *
 * 採「白名單」策略：只複製明確列出的執行期產物與資源，
 * 絕不含 TypeScript 原始碼（source/）與建置工具設定，避免原始碼外洩。
 *
 * 用法：
 *   node scripts/pack-dist.js            # 輸出到 <擴充套件>/output/cocos-mcp-server
 *   node scripts/pack-dist.js <目標目錄>  # 自訂輸出根目錄
 */

const fs = require('fs');
const path = require('path');

const PACKAGE_NAME = 'cocos-mcp-server';
const EXTENSION_ROOT = path.resolve(__dirname, '..');
const OUTPUT_ROOT = path.resolve(process.argv[2] || path.join(EXTENSION_ROOT, 'output'));
const OUTPUT_DIR = path.join(OUTPUT_ROOT, PACKAGE_NAME);

// 要複製的獨立檔案（執行期 manifest + 使用者文件 + 安裝腳本）
const INCLUDE_FILES = [
    'package.json',
    'package-lock.json',
    'install.bat',
    'README.md',
    'README.EN.md',
    'FEATURE_GUIDE_CN.md',
    'FEATURE_GUIDE_EN.md',
];

// 要遞迴複製的目錄（執行期程式碼與資源、依賴）
const INCLUDE_DIRS = [
    'dist',        // 編譯後 JS（實際執行的產物）
    'static',      // 圖示、樣式、樣板
    'i18n',        // 多語系
    'image',       // 文件圖片
    'scripts',     // preinstall.js（package.json 的 preinstall hook 需要）
    'node_modules', // 執行期依賴，做成免安裝整包
];

// 明確排除的目錄名稱（於任何層級比對）—— 保險用，白名單本已不含這些
const EXCLUDE_DIR_NAMES = new Set([
    'test',      // dist/test、node_modules/**/test 等測試碼
    'examples',  // dist/examples 範例碼
    '.git',
    '.claude',
]);

// 明確排除的副檔名（型別宣告與 sourcemap 非執行期必需，且屬「原始碼」性質）
const EXCLUDE_EXTENSIONS = ['.ts', '.map'];

// 明確排除的檔名（打包工具本身不屬於擴充套件執行內容）
const EXCLUDE_FILE_NAMES = new Set(['pack-dist.js']);

function shouldSkipEntry(name, fullPath) {
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
        return EXCLUDE_DIR_NAMES.has(name);
    }
    if (EXCLUDE_FILE_NAMES.has(name)) {
        return true;
    }
    // .d.ts 與 .js.map 一律排除；.ts 原始碼亦排除（node_modules 內偶有 .ts）
    return EXCLUDE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function copyRecursive(src, dest) {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const entry of fs.readdirSync(src)) {
            const srcChild = path.join(src, entry);
            if (shouldSkipEntry(entry, srcChild)) {
                continue;
            }
            copyRecursive(srcChild, path.join(dest, entry));
        }
        return;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
}

function main() {
    // 清空舊輸出，確保無殘留
    if (fs.existsSync(OUTPUT_DIR)) {
        fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    let fileCount = 0;
    const skipped = [];

    for (const file of INCLUDE_FILES) {
        const src = path.join(EXTENSION_ROOT, file);
        if (!fs.existsSync(src)) {
            skipped.push(file);
            continue;
        }
        copyRecursive(src, path.join(OUTPUT_DIR, file));
        fileCount++;
    }

    for (const dir of INCLUDE_DIRS) {
        const src = path.join(EXTENSION_ROOT, dir);
        if (!fs.existsSync(src)) {
            skipped.push(dir + '/');
            continue;
        }
        copyRecursive(src, path.join(OUTPUT_DIR, dir));
        fileCount++;
    }

    console.log('✅ 打包完成');
    console.log('   輸出目錄：' + OUTPUT_DIR);
    console.log('   已複製項目：' + fileCount + ' 個頂層項目');
    console.log('   已排除：source/（TS 原始碼）、@types/、tsconfig、bug 筆記、測試碼、*.ts/*.map');
    if (skipped.length > 0) {
        console.log('   ⚠️  找不到（略過）：' + skipped.join(', '));
    }
}

main();
