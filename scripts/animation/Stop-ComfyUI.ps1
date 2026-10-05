param([string]$ToolRoot = 'D:\CodexTools\assistant-animation')
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($ToolRoot)
$portable = Join-Path $root 'tools\comfy-v0.38.0\ComfyUI_windows_portable'
$python = Join-Path $portable 'python_embeded\python.exe'
$main = Join-Path $portable 'ComfyUI\main.py'
$state = Join-Path $root 'state\comfy-process.json'
if (!(Test-Path -LiteralPath $state)) { Write-Output 'No managed ComfyUI process.'; exit 0 }
$saved = Get-Content -LiteralPath $state -Raw | ConvertFrom-Json
$child = Get-CimInstance Win32_Process -Filter "ProcessId=$($saved.pid)"
if (!$child) { Write-Output 'ComfyUI is already stopped.'; exit 0 }
if ($child.ExecutablePath -ne $python -or !$child.CommandLine.Contains($main) -or
    !$child.CommandLine.Contains('--port 8188')) {
    throw 'Process identity does not match this installation; nothing was stopped.'
}
Stop-Process -Id $saved.pid
Write-Output 'Managed ComfyUI process stopped. Other Python programs were not touched.'
