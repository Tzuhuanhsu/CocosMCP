<#
.SYNOPSIS
  把 agentic-kit 打包成不依賴來源專案的 zip，解壓後執行 install.cmd 即可佈署到其他 Cocos 專案。

.DESCRIPTION
  依 AgenticKit.Manifest.ps1 從 tools\ 所在的 Cocos 專案收集檔案，照目標專案的目錄結構放進 payload\，
  連同安裝腳本、範本、install.cmd、README.md 與 kit.json（建置時間、來源 commit、Creator 版本）壓成一個 zip。
  zip 內頂層資料夾為 agentic-kit\。

.EXAMPLE
  .\tools\agentic-kit\Build-AgenticKitPackage.ps1
  .\tools\agentic-kit\Build-AgenticKitPackage.ps1 -OutputDir D:\share
  .\tools\agentic-kit\Build-AgenticKitPackage.ps1 -ExtensionSource D:\CocosMCP
#>
param(
	# zip 輸出位置；預設是本專案的 local\agentic-kit\（不進版控）
	[string] $OutputDir,

	# cocos-mcp 擴充的來源資料夾（須已 npm install）；預設是本專案的 extensions\cocos-mcp-server
	[string] $ExtensionSource
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$KIT_DIR = $PSScriptRoot
. ( Join-Path $KIT_DIR 'AgenticKit.Manifest.ps1' )

$PACKAGE_ROOT_NAME = 'agentic-kit'
$KIT_SCRIPTS = @( 'Install-AgenticKit.ps1', 'AgenticKit.Manifest.ps1' )
# 安裝包要帶的範本；package-README.md 另外改名成安裝包的 README.md
$PACKAGE_TEMPLATES = @( 'CLAUDE.md', 'library-README.md' )
$SHORT_SHA_LENGTH = 8
# install.cmd 以 cmd 執行，訊息用英文，避免主控台字碼頁把中文印成亂碼
$INSTALL_CMD = @'
@echo off
where pwsh >nul 2>nul || (echo PowerShell 7 ^(pwsh^) is required: https://aka.ms/powershell & pause & exit /b 1)
if "%~1"=="" (
	set /p TARGET=Target Cocos project folder:
) else (
	set TARGET=%~1
)
pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-AgenticKit.ps1" -TargetProject "%TARGET%" %2 %3
pause
'@

$sourceProject = ( Resolve-Path ( Join-Path $KIT_DIR '..\..' ) ).Path
if ( -not $OutputDir ) {
	$OutputDir = Join-Path $sourceProject 'local\agentic-kit'
}
$creatorVersion = ( Get-Content ( Join-Path $sourceProject 'package.json' ) -Raw | ConvertFrom-Json ).creator.version
$useProjectExtension = -not $ExtensionSource
if ( $useProjectExtension ) {
	$ExtensionSource = Join-Path $sourceProject $Script:KitExtensionPath
}
$ExtensionSource = ( Resolve-Path $ExtensionSource ).Path
if ( -not ( Test-Path ( Join-Path $ExtensionSource $Script:KitExtensionRequiredFile ) ) ) {
	throw "cocos-mcp 擴充不是自動選埠的新版（缺 $Script:KitExtensionRequiredFile）：$ExtensionSource"
}

$repoRoot = git -C $sourceProject rev-parse --show-toplevel
$commit = ( git -C $sourceProject rev-parse HEAD ).Substring( 0, $SHORT_SHA_LENGTH )
$fileList = @( Get-KitFileList $sourceProject )
# 打包的檔案有未提交改動時標明，免得以為 zip 內容等於那個 commit
$packagedPaths = @( $fileList ) + @( $KIT_SCRIPTS | ForEach-Object { "tools\agentic-kit\$_" } )
if ( $useProjectExtension ) {
	$packagedPaths += $Script:KitExtensionPath
}
if ( git -C $sourceProject status --porcelain -- @packagedPaths ) {
	$commit += '+未提交改動'
}
$extensionCommit = ( git -C $ExtensionSource rev-parse HEAD ).Substring( 0, $SHORT_SHA_LENGTH )
# 擴充的 node_modules 不進版控，只檢查有追蹤的檔
if ( git -C $ExtensionSource status --porcelain --untracked-files=no -- . ) {
	$extensionCommit += '+未提交改動'
}

$stagingDir = Join-Path $OutputDir $PACKAGE_ROOT_NAME
if ( Test-Path $stagingDir ) {
	Remove-Item $stagingDir -Recurse -Force
}
$payloadDir = Join-Path $stagingDir 'payload'

Write-Host "收集 $( $fileList.Count ) 個檔案與 cocos-mcp 擴充"
foreach ( $relativePath in $fileList ) {
	$dest = Join-Path $payloadDir $relativePath
	New-Item -ItemType Directory -Force ( Split-Path $dest ) | Out-Null
	Copy-Item ( Join-Path $sourceProject $relativePath ) $dest
}
Copy-KitExtensionDirectory $ExtensionSource ( Join-Path $payloadDir $Script:KitExtensionPath )

foreach ( $script in $KIT_SCRIPTS ) {
	Copy-Item ( Join-Path $KIT_DIR $script ) $stagingDir
}
New-Item -ItemType Directory -Force ( Join-Path $stagingDir 'templates' ) | Out-Null
foreach ( $template in $PACKAGE_TEMPLATES ) {
	Copy-Item ( Join-Path $KIT_DIR "templates\$template" ) ( Join-Path $stagingDir 'templates' )
}
Copy-Item ( Join-Path $KIT_DIR 'templates\package-README.md' ) ( Join-Path $stagingDir 'README.md' )
# cmd 要 CRLF 換行才能正確解析多行的 if 區塊
Set-Content ( Join-Path $stagingDir 'install.cmd' ) ( $INSTALL_CMD -replace "`r?`n", "`r`n" ) -Encoding ascii -NoNewline

$builtAt = Get-Date
$kitInfo = [ordered]@{
	name           = $PACKAGE_ROOT_NAME
	builtAt        = $builtAt.ToString( 'yyyy-MM-dd HH:mm' )
	creatorVersion = $creatorVersion
	sourceRepo     = Split-Path $repoRoot -Leaf
	sourceCommit   = $commit
	mcpCommit      = $extensionCommit
}
Set-Content ( Join-Path $stagingDir 'kit.json' ) ( $kitInfo | ConvertTo-Json ) -Encoding utf8NoBOM

$zipPath = Join-Path $OutputDir ( '{0}-{1}-{2}.zip' -f $PACKAGE_ROOT_NAME, $builtAt.ToString( 'yyyyMMdd' ), $commit.Substring( 0, $SHORT_SHA_LENGTH ) )
if ( Test-Path $zipPath ) {
	Remove-Item $zipPath
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory( $stagingDir, $zipPath, [IO.Compression.CompressionLevel]::Optimal, $true )
Remove-Item $stagingDir -Recurse -Force

$zipSizeMegabytes = ( Get-Item $zipPath ).Length / 1MB
Write-Host ( '已打包：{0}（{1:N1} MB，Creator {2}，來源 {3} @ {4}，cocos-mcp @ {5}）' -f $zipPath, $zipSizeMegabytes, $creatorVersion, $kitInfo.sourceRepo, $commit, $extensionCommit )
