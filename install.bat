@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul 2>&1

set PLUGIN_NAME=cocos-mcp-server
set SCRIPT_DIR=%~dp0
set GLOBAL_EXT_DIR=%USERPROFILE%\.CocosCreator\extensions\%PLUGIN_NAME%

echo ============================================
echo   Cocos Creator MCP Server Installer
echo ============================================
echo.

:: ── 1. Check Node.js ──────────────────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js first.
    echo         https://nodejs.org/
    pause & exit /b 1
)
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm not found. Please install Node.js first.
    pause & exit /b 1
)
echo [OK] Node.js found.

:: ── 2. Install target ─────────────────────────────────────────────────
echo.
echo Install to:
echo   [1] Global  (all projects)   %GLOBAL_EXT_DIR%
echo   [2] Project (specify path)
echo.
set /p INSTALL_CHOICE="Choose [1/2] (default: 1): "
if "%INSTALL_CHOICE%"=="" set INSTALL_CHOICE=1

if "%INSTALL_CHOICE%"=="2" (
    echo.
    set /p PROJECT_PATH="Enter Cocos Creator project path: "
    if "!PROJECT_PATH!"=="" (
        echo [ERROR] Project path cannot be empty.
        pause & exit /b 1
    )
    if not exist "!PROJECT_PATH!" (
        echo [ERROR] Path not found: !PROJECT_PATH!
        pause & exit /b 1
    )
    set DEST_DIR=!PROJECT_PATH!\extensions\%PLUGIN_NAME%
) else (
    set DEST_DIR=%GLOBAL_EXT_DIR%
)

echo.
echo Target: !DEST_DIR!
echo.

:: ── 3. npm install ────────────────────────────────────────────────────
echo [1/3] Installing dependencies...
cd /d "%SCRIPT_DIR%"
call npm install --prefer-offline 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed.
    pause & exit /b 1
)
echo [OK] Dependencies installed.

:: ── 4. Build ──────────────────────────────────────────────────────────
echo.
echo [2/3] Building TypeScript...
call npm run build 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Build failed. Check TypeScript errors above.
    pause & exit /b 1
)
echo [OK] Build succeeded.

:: ── 5. Copy to extensions dir ─────────────────────────────────────────
echo.
echo [3/3] Installing plugin...

if exist "!DEST_DIR!" (
    echo   Removing old version...
    rmdir /s /q "!DEST_DIR!"
)
mkdir "!DEST_DIR!"

:: Copy required runtime files only (skip source / node_modules / docs)
xcopy "%SCRIPT_DIR%dist"         "!DEST_DIR!\dist\"        /e /i /q
xcopy "%SCRIPT_DIR%i18n"         "!DEST_DIR!\i18n\"        /e /i /q
xcopy "%SCRIPT_DIR%static"       "!DEST_DIR!\static\"      /e /i /q
xcopy "%SCRIPT_DIR%@types"       "!DEST_DIR!\@types\"      /e /i /q
copy  "%SCRIPT_DIR%package.json" "!DEST_DIR!\package.json" /y >nul

echo [OK] Plugin installed.

:: ── Done ──────────────────────────────────────────────────────────────
echo.
echo ============================================
echo   Installation complete!
echo   Path: !DEST_DIR!
echo ============================================
echo.
echo Next step: Restart Cocos Creator and enable
echo   Extension Manager ^> %PLUGIN_NAME%
echo.
pause
