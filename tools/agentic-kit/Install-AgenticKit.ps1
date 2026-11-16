<#
.SYNOPSIS
  把 Claude 開發環境（agentic-kit）一鍵佈署到一個 Cocos Creator 專案。

.DESCRIPTION
  來源有兩種，依本腳本旁邊有沒有 payload\ 自動判斷：
    - 安裝包：Build-AgenticKitPackage.ps1 打包的 zip 解壓後，從 payload\ 安裝，不需要來源專案
    - 來源專案：在原專案的 tools\agentic-kit\ 直接執行，從 tools\ 所在的 Cocos 專案安裝

  佈署內容見 AgenticKit.Manifest.ps1：
    - .claude\skills\：agentic-cocos、cocos-develop、ts-review-skill（含 plugin 形式的 agent）
    - .claude\instruction\typescript-code-standards.md（ts-review 的審查依據）
    - .claude\library\：README、四個分類的 _TEMPLATE.md，以及與遊戲內容無關的通用筆記
    - tools\editor-worktree\：worktree 平行開發與 dashboard 腳本
    - extensions\cocos-mcp-server\：cocos-mcp 擴充（含 node_modules，免 npm install）
    - CLAUDE.md：目標沒有才建立；已有就略過並印出要補的知識庫索引
    - repo 的 .gitignore：補上 worktree、local\、settings.local.json 等尚未忽略的路徑

  目標已有的檔案一律略過並列出，加 -Force 才覆蓋。cocos-mcp 擴充視為一個整體：資料夾已存在就整個略過，
  避免新舊版本的檔案混在一起。不 commit、不改目標專案的其他檔案。

.EXAMPLE
  .\Install-AgenticKit.ps1 -TargetProject D:\otherGame\Model.Cocos -DryRun
  .\Install-AgenticKit.ps1 -TargetProject D:\otherGame\Model.Cocos
#>
param(
	# 目標 Cocos 專案目錄（含 package.json 的那層）
	[Parameter( Mandatory )]
	[string] $TargetProject,

	# 覆蓋目標已有的檔案（含整個 cocos-mcp 擴充）
	[switch] $Force,

	# 只列出會做什麼，不寫入任何檔案
	[switch] $DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$KIT_DIR = $PSScriptRoot
. ( Join-Path $KIT_DIR 'AgenticKit.Manifest.ps1' )

$PAYLOAD_DIR = Join-Path $KIT_DIR 'payload'
$KIT_INFO_PATH = Join-Path $KIT_DIR 'kit.json'

# 需要被 git 忽略的路徑（相對於目標專案）與對應的 .gitignore 規則；{0} 是專案相對於 repo 根的前綴
$IGNORE_RULES = @(
	@{ Sample = 'local\editor-worktree.json'; Rule = '{0}local/' }
	@{ Sample = '.claude\settings.local.json'; Rule = '{0}.claude/settings.local.json' }
	@{ Sample = 'extensions\cocos-mcp-server\node_modules\placeholder'; Rule = 'node_modules/' }
)
$WORKTREES_IGNORE_RULE = '.claude/worktrees/'

$Script:Copied = [System.Collections.Generic.List[string]]::new()
$Script:Skipped = [System.Collections.Generic.List[string]]::new()

function Get-CreatorVersion( [string] $ProjectPath, [string] $Role ) {
	$packagePath = Join-Path $ProjectPath 'package.json'
	if ( -not ( Test-Path $packagePath ) ) {
		throw "$Role 不是 Cocos 專案（找不到 package.json）：$ProjectPath"
	}
	$package = Get-Content $packagePath -Raw | ConvertFrom-Json
	if ( -not $package.PSObject.Properties[ 'creator' ] ) {
		throw "$Role 的 package.json 沒有 creator.version，不是 Cocos Creator 專案：$ProjectPath"
	}
	return $package.creator.version
}

function Copy-KitFile( [string] $RelativePath ) {
	$dest = Join-Path $TargetProject $RelativePath
	if ( ( Test-Path $dest ) -and -not $Force ) {
		$Script:Skipped.Add( $RelativePath )
		return
	}
	if ( -not $DryRun ) {
		New-Item -ItemType Directory -Force ( Split-Path $dest ) | Out-Null
		Copy-Item ( Join-Path $SourceRoot $RelativePath ) $dest -Force
	}
	$Script:Copied.Add( $RelativePath )
}

function Write-KitTemplate( [hashtable] $Item, [string] $CreatorVersion ) {
	$dest = Join-Path $TargetProject $Item.Dest
	if ( ( Test-Path $dest ) -and -not $Force ) {
		$Script:Skipped.Add( $Item.Dest )
		return
	}
	$content = ( Get-Content ( Join-Path $KIT_DIR "templates\$( $Item.Template )" ) -Raw ).Replace( '{{CREATOR_VERSION}}', $CreatorVersion )
	if ( -not $DryRun ) {
		New-Item -ItemType Directory -Force ( Split-Path $dest ) | Out-Null
		Set-Content $dest $content -Encoding utf8NoBOM -NoNewline
	}
	$Script:Copied.Add( $Item.Dest )
}

function Copy-McpExtension {
	$sourceDir = Join-Path $SourceRoot $Script:KitExtensionPath
	if ( -not ( Test-Path ( Join-Path $sourceDir $Script:KitExtensionRequiredFile ) ) ) {
		throw "來源的 cocos-mcp 擴充不是自動選埠的新版（缺 $Script:KitExtensionRequiredFile）：$sourceDir"
	}
	$label = "$Script:KitExtensionPath\（整個資料夾）"
	$destDir = Join-Path $TargetProject $Script:KitExtensionPath
	if ( ( Test-Path $destDir ) -and -not $Force ) {
		$Script:Skipped.Add( $label )
		return
	}
	if ( -not $DryRun ) {
		Copy-KitExtensionDirectory $sourceDir $destDir
	}
	$Script:Copied.Add( $label )
}

<#
  回傳尚未被 repo 自己的 .gitignore 忽略、需要補進去的規則。
  不算個人的全域 ignore（core.excludesFile）：那只在這台電腦生效，其他成員的電腦不一定有。
#>
function Get-MissingIgnoreRules( [string] $RepoRoot ) {
	$projectRelative = [IO.Path]::GetRelativePath( $RepoRoot, $TargetProject ).Replace( '\', '/' )
	$projectPrefix = if ( $projectRelative -eq '.' ) { '' } else { "$projectRelative/" }
	$missing = @()
	foreach ( $rule in $IGNORE_RULES ) {
		git -c core.excludesFile= -C $TargetProject check-ignore -q -- $rule.Sample.Replace( '\', '/' )
		if ( $LASTEXITCODE -ne 0 ) {
			$missing += $rule.Rule -f $projectPrefix
		}
	}
	git -c core.excludesFile= -C $RepoRoot check-ignore -q -- '.claude/worktrees/placeholder'
	if ( $LASTEXITCODE -ne 0 ) {
		$missing += $WORKTREES_IGNORE_RULE
	}
	$global:LASTEXITCODE = 0
	return $missing
}

function Add-IgnoreRules( [string] $RepoRoot, [string[]] $Rules ) {
	if ( $Rules.Count -eq 0 -or $DryRun ) {
		return
	}
	$gitignorePath = Join-Path $RepoRoot '.gitignore'
	$existing = if ( Test-Path $gitignorePath ) { Get-Content $gitignorePath -Raw } else { '' }
	# 沿用原檔的換行，不讓 CRLF 與 LF 混在同一個檔
	$newline = if ( $existing.Contains( "`r`n" ) ) { "`r`n" } else { "`n" }
	$block = @( '', '# Claude Code（agentic-kit）' ) + $Rules
	$prefix = if ( $existing -and -not $existing.EndsWith( "`n" ) ) { $newline } else { '' }
	Add-Content $gitignorePath ( $prefix + ( $block -join $newline ) + $newline ) -Encoding utf8NoBOM -NoNewline
}

$TargetProject = ( Resolve-Path $TargetProject ).Path
if ( Test-Path $PAYLOAD_DIR ) {
	$SourceRoot = $PAYLOAD_DIR
	$kitInfo = Get-Content $KIT_INFO_PATH -Raw | ConvertFrom-Json
	$sourceVersion = $kitInfo.creatorVersion
	$sourceLabel = "安裝包 $( $kitInfo.builtAt )（來源 $( $kitInfo.sourceRepo ) @ $( $kitInfo.sourceCommit )）"
} else {
	$SourceRoot = ( Resolve-Path ( Join-Path $KIT_DIR '..\..' ) ).Path
	if ( $TargetProject -eq $SourceRoot ) {
		throw '目標就是來源專案本身'
	}
	$sourceVersion = Get-CreatorVersion $SourceRoot '來源'
	$sourceLabel = $SourceRoot
}
$targetVersion = Get-CreatorVersion $TargetProject '目標'
$targetRepoRoot = git -C $TargetProject rev-parse --show-toplevel 2>$null
if ( $LASTEXITCODE -ne 0 ) {
	throw "目標不在 git repo 裡（worktree 平行開發需要 git）：$TargetProject"
}
$targetRepoRoot = $targetRepoRoot.Replace( '/', '\' )

if ( $DryRun ) {
	Write-Host '[DryRun] 只列出會做的事，不寫入任何檔案' -ForegroundColor Yellow
}
Write-Host "來源：$sourceLabel（Creator $sourceVersion）"
Write-Host "目標：$TargetProject（Creator $targetVersion）"
if ( $sourceVersion -ne $targetVersion ) {
	Write-Warning "Creator 版本不同（$sourceVersion → $targetVersion）：cocos-mcp 擴充與筆記是在 $sourceVersion 驗證過的"
}

foreach ( $relativePath in Get-KitFileList $SourceRoot ) {
	Copy-KitFile $relativePath
}
foreach ( $item in $Script:KitTemplateItems ) {
	Write-KitTemplate $item $targetVersion
}
Copy-McpExtension
$missingRules = @( Get-MissingIgnoreRules $targetRepoRoot )
Add-IgnoreRules $targetRepoRoot $missingRules

$verb = if ( $DryRun ) { '會' } else { '已' }
Write-Host ''
Write-Host "$( $verb )複製 $( $Script:Copied.Count ) 項" -ForegroundColor Green
if ( $Script:Skipped.Count -gt 0 ) {
	Write-Host "目標已存在而略過 $( $Script:Skipped.Count ) 項（加 -Force 覆蓋）：" -ForegroundColor Yellow
	$Script:Skipped | ForEach-Object { Write-Host "  $_" }
}
if ( $missingRules.Count -gt 0 ) {
	Write-Host "$( $verb )補進 $targetRepoRoot\.gitignore：" -ForegroundColor Green
	$missingRules | ForEach-Object { Write-Host "  $_" }
}
if ( $Script:Skipped -contains 'CLAUDE.md' ) {
	Write-Host ''
	Write-Host '目標已有 CLAUDE.md，沒有改它。請把下面這份的「知識庫索引」與「Claude 工具」兩節併進去：' -ForegroundColor Yellow
	Write-Host "  $( Join-Path $KIT_DIR 'templates\CLAUDE.md' )"
}

Write-Host ''
Write-Host '接下來：'
Write-Host '  1. 用 Cocos Creator 開啟目標專案一次：cocos-mcp 擴充會自動啟動並寫出 .mcp.json'
Write-Host '  2. 從目標專案目錄以互動模式啟動 claude，接受「信任這個資料夾」與 .mcp.json 的 cocos-mcp'
Write-Host '     （skill 附的 agent 只在從這個目錄啟動、且資料夾已信任時才註冊；沒信任時 skill 仍可用，agent 會無聲缺席）'
Write-Host '  3. 要一鍵開 dashboard：執行目標的 tools\editor-worktree\Install-DashboardProfile.ps1（每台電腦一次）'
Write-Host '  4. 檢查 git status，決定哪些要 commit（cocos-mcp 擴充含 node_modules，約 30 MB）'
