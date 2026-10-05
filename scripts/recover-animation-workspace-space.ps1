param()
$ErrorActionPreference = 'Stop'

# Explicit, rebuildable caches only. No global Temp wipe or system changes.
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$expectedRepo = 'C:\Users\Administrator\Documents\Codex\2026-07-15\github-plugin-github-openai-curated-remote-4\work\personal-blog'
if ($repo -ne $expectedRepo) { throw 'This one-time recovery is bound to the inspected checkout' }
$targets = @(
    'C:\Users\Administrator\AppData\Local\npm-cache\_cacache',
    (Join-Path $repo '.next\cache')
)
$running = @(Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'node.exe' -and $_.CommandLine -match 'next[ /\\]|personal-blog'
})
$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object {
    $_.LocalPort -in 3000,3001,3100,8188
})
if ($running.Count -or $listeners.Count) { throw 'A possible preview/render process is active; nothing was removed' }
$tracked = & git -C $repo ls-files -- .next
if ($LASTEXITCODE -ne 0 -or $tracked) { throw 'Cannot establish that the build directory is untracked' }

function Assert-ExactCache([string] $Path) {
    $resolved = (Resolve-Path -LiteralPath $Path).Path
    if ($resolved -ne [IO.Path]::GetFullPath($Path) -or $resolved -notin $targets) {
        throw 'Unexpected cleanup target'
    }
    $ancestor = $resolved
    while ($ancestor) {
        $item = Get-Item -LiteralPath $ancestor -Force
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing to follow a reparse point' }
        $parent = [IO.Directory]::GetParent($ancestor)
        $ancestor = if ($parent) { $parent.FullName } else { $null }
    }
    $links = @(Get-ChildItem -LiteralPath $resolved -Recurse -Force -Attributes ReparsePoint)
    if ($links.Count) { throw 'A cache contains a link; nothing at that target was removed' }
    return $resolved
}

$before = (Get-PSDrive C).Free
$removed = @()
$safePaths = @($targets | Where-Object { Test-Path -LiteralPath $_ } | ForEach-Object { Assert-ExactCache $_ })
# Preflight every candidate before performing any deletion.
foreach ($safePath in $safePaths) {
    $files = Get-ChildItem -LiteralPath $safePath -File -Recurse -Force | Measure-Object Length -Sum
    # Absolute target has been verified against the exact allowlist above.
    Remove-Item -LiteralPath $safePath -Recurse -Force
    $removed += [pscustomobject]@{path=$safePath;files=$files.Count;bytes=$files.Sum}
}
$after = (Get-PSDrive C).Free
$report = [ordered]@{
    date=(Get-Date).ToString('o'); beforeFreeBytes=$before; afterFreeBytes=$after
    recoveredBytes=($after-$before); removed=$removed
    userFilesRemoved=$false; credentialsChanged=$false; systemSettingsChanged=$false
}
$reportRoot = 'D:\CodexTools\assistant-animation\reports'
New-Item -ItemType Directory -Force -Path $reportRoot | Out-Null
$reportPath = Join-Path $reportRoot ('disk-recovery-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $reportPath -Encoding UTF8
[pscustomobject]@{
    BeforeFreeGiB=[math]::Round($before/1GB,2)
    AfterFreeGiB=[math]::Round($after/1GB,2)
    RecoveredGiB=[math]::Round(($after-$before)/1GB,2)
    Report=$reportPath
} | Format-List
