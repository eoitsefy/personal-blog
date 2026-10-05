param(
    [ValidateSet('doctor', 'plan', 'smoke', 'constraint-smoke')][string]$Command = 'doctor',
    [ValidateSet('idle', 'wave', 'nod', 'thinking', 'bow', 'cheer', 'yawn')][string]$Action = 'wave',
    [switch]$DeepSeek,
    [string]$ToolRoot = 'D:\CodexTools\assistant-animation'
)
$ErrorActionPreference = 'Stop'
$configuration = Get-Content -LiteralPath (Join-Path $ToolRoot 'workbench.json') -Raw | ConvertFrom-Json
$node = $configuration.nodePath
$repo = $configuration.repository
if (!(Test-Path -LiteralPath $node) -or !(Test-Path -LiteralPath (Join-Path $repo 'scripts\animation-workbench.mjs'))) {
    throw 'Node or repository location is missing; check workbench.json.'
}
$oldRoot = $env:ANIMATION_TOOL_ROOT
try {
    $env:ANIMATION_TOOL_ROOT = $ToolRoot
    Push-Location -LiteralPath $repo
    $arguments = @('--import', 'tsx', 'scripts/animation-workbench.mjs', $Command)
    if ($Command -eq 'plan') {
        $arguments += $Action
        if ($DeepSeek) { $arguments += '--deepseek' }
    }
    & $node @arguments
    if ($LASTEXITCODE -ne 0) { throw 'Workbench command failed; no production change was made.' }
} finally {
    Pop-Location
    $env:ANIMATION_TOOL_ROOT = $oldRoot
}
