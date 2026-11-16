<#
  agentic-kit 要佈署的檔案清單，Install-AgenticKit.ps1 與 Build-AgenticKitPackage.ps1 共用，以 dot-source 載入。
  路徑一律相對於 Cocos 專案目錄；安裝包的 payload\ 也照這個結構存放。
#>

# 逐檔複製的資料夾；Exclude 為相對於該資料夾的路徑
$Script:KitDirectoryItems = @(
	@{ Path = '.claude\skills\agentic-cocos' }
	@{ Path = '.claude\skills\cocos-develop'; Exclude = @( '.claude\settings.local.json' ) }
	@{ Path = '.claude\skills\ts-review-skill' }
	@{ Path = 'tools\editor-worktree' }
)

# 逐檔複製的單一檔案
$Script:KitFileItems = @(
	'.claude\instruction\typescript-code-standards.md'
	'.claude\library\decisions\_TEMPLATE.md'
	'.claude\library\guides\_TEMPLATE.md'
	'.claude\library\patterns\_TEMPLATE.md'
	'.claude\library\troubleshooting\_TEMPLATE.md'
	'.claude\library\guides\guide-editor-worktree.md'
	'.claude\library\patterns\pattern-private-helper-methods.md'
	'.claude\library\troubleshooting\ts-mcp-scene-lost-on-recompile.md'
	'.claude\library\troubleshooting\ts-mcp-edit-lost-during-preview.md'
	'.claude\library\troubleshooting\ts-editor-transpile-only-no-typecheck.md'
)

# 以 templates\ 範本產生的檔案：Template 相對於 templates\，Dest 相對於目標專案
$Script:KitTemplateItems = @(
	@{ Template = 'library-README.md'; Dest = '.claude\library\README.md' }
	@{ Template = 'CLAUDE.md'; Dest = 'CLAUDE.md' }
)

# cocos-mcp 擴充整個資料夾視為一個單位複製（含 node_modules）
$Script:KitExtensionPath = 'extensions\cocos-mcp-server'
# 新版擴充才有依專案 UUID 自動選埠；舊版會讓多個編輯器搶同一個埠
$Script:KitExtensionRequiredFile = 'dist\port.js'

<# $SourceRoot 底下要逐檔複製的檔案（不含擴充與範本），回傳相對路徑。 #>
function Get-KitFileList( [string] $SourceRoot ) {
	foreach ( $item in $Script:KitDirectoryItems ) {
		$sourceDir = Join-Path $SourceRoot $item.Path
		$excludes = if ( $item.ContainsKey( 'Exclude' ) ) { $item.Exclude } else { @() }
		foreach ( $file in Get-ChildItem $sourceDir -Recurse -File -Force ) {
			$relativeToDir = [IO.Path]::GetRelativePath( $sourceDir, $file.FullName )
			if ( $excludes -notcontains $relativeToDir ) {
				Join-Path $item.Path $relativeToDir
			}
		}
	}
	$Script:KitFileItems
}

<#
  複製整個擴充資料夾；/MIR 讓覆蓋時一併刪掉舊版多出來的檔，不留新舊混雜。
  不複製 .git（來源可能是擴充自己的 clone 或 worktree），目標原有的 .git 也不會被刪。
#>
function Copy-KitExtensionDirectory( [string] $Source, [string] $Destination ) {
	$ROBOCOPY_FAILURE_CODE = 8
	robocopy $Source $Destination /MIR /XD .git /XF .git /NFL /NDL /NJH /NJS /NP | Out-Null
	# robocopy 的 exit code 小於 8 都代表成功
	if ( $LASTEXITCODE -ge $ROBOCOPY_FAILURE_CODE ) {
		throw "robocopy 失敗（exit $LASTEXITCODE）：$Source -> $Destination"
	}
	$global:LASTEXITCODE = 0
}
