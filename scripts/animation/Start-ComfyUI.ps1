param([string]$ToolRoot = 'D:\CodexTools\assistant-animation')
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($ToolRoot)
$portable = Join-Path $root 'tools\comfy-v0.38.0\ComfyUI_windows_portable'
$python = Join-Path $portable 'python_embeded\python.exe'
$main = Join-Path $portable 'ComfyUI\main.py'
$state = Join-Path $root 'state\comfy-process.json'
if (!(Test-Path -LiteralPath $python) -or !(Test-Path -LiteralPath $main)) {
    throw 'Verified ComfyUI portable installation is missing.'
}
if (Test-Path -LiteralPath $state) {
    $saved = Get-Content -LiteralPath $state -Raw | ConvertFrom-Json
    $existing = Get-CimInstance Win32_Process -Filter "ProcessId=$($saved.pid)"
    if ($existing -and $existing.ExecutablePath -eq $python -and
        $existing.CommandLine.Contains($main) -and $existing.CommandLine.Contains('--port 8188')) {
        Write-Output 'ComfyUI is already running at http://127.0.0.1:8188'
        exit 0
    }
}
if (Get-NetTCPConnection -LocalPort 8188 -State Listen -ErrorAction SilentlyContinue) {
    throw 'Port 8188 is occupied by another process; no process was stopped.'
}
$systemDrive = [IO.Path]::GetPathRoot($env:SystemRoot).Substring(0,1)
$freeSystem = (Get-PSDrive -Name $systemDrive).Free
$freeRam = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory * 1KB
if ($freeSystem -lt 8GB -or $freeRam -lt 4GB) {
    throw 'Start deferred: free at least 8 GiB on the system drive and 4 GiB RAM first. No files or system settings were changed.'
}
New-Item -ItemType Directory -Force (Join-Path $root 'state'), (Join-Path $root 'reports') | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stdout = Join-Path $root "reports\comfy-$stamp.stdout.log"
$stderr = Join-Path $root "reports\comfy-$stamp.stderr.log"
$arguments = @('-s', ('"' + $main + '"'), '--windows-standalone-build',
    '--listen', '127.0.0.1', '--port', '8188', '--disable-auto-launch',
    '--disable-api-nodes', '--disable-all-custom-nodes',
    '--whitelist-custom-nodes', 'ComfyUI_IPAdapter_plus',
    '--disable-dynamic-vram', '--lowvram', '--preview-method', 'none', '--disable-metadata')
# Strip credentials only from this launcher's process environment. User and
# machine settings remain unchanged. Custom nodes never inherit provider keys.
$secrets = @{}
Get-ChildItem Env: | Where-Object {
    $_.Name -match '(API_KEY|TOKEN|PASSWORD|SECRET)$' -or $_.Name -in @('GH_TOKEN', 'GITHUB_TOKEN')
} | ForEach-Object { $secrets[$_.Name] = $_.Value }
try {
    foreach ($name in $secrets.Keys) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
    $child = Start-Process -FilePath $python -ArgumentList $arguments -WorkingDirectory $portable `
        -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
} finally {
    foreach ($name in $secrets.Keys) { [Environment]::SetEnvironmentVariable($name, $secrets[$name], 'Process') }
}
@{ pid = $child.Id; executable = $python; main = $main; stdout = $stdout; stderr = $stderr } |
    ConvertTo-Json | Set-Content -LiteralPath $state -Encoding UTF8
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Seconds 2
    if ($child.HasExited) { throw "ComfyUI exited; inspect $stderr" }
    try {
        $response = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8188/system_stats' -TimeoutSec 2
        if ($response.StatusCode -eq 200) {
            Write-Output 'ComfyUI ready: http://127.0.0.1:8188 (local computer only)'
            Write-Output "Log: $stderr"
            exit 0
        }
    } catch { }
}
throw "ComfyUI is still starting; inspect $stderr before retrying."
