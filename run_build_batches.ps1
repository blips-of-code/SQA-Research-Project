$ErrorActionPreference = 'Stop'
$base = Join-Path $HOME 'Documents\SQA-Research'
$script = Join-Path $base 'scripts\check_builds.py'
$candidates = Join-Path $base 'qualifying-with-package.txt'
$results = Join-Path $base 'build-results.csv'
$log = Join-Path $base 'batch-run.log'
Set-Location $base

"=== Started $(Get-Date -Format s) ===" | Out-File -FilePath $log -Append -Encoding utf8

while ($true) {
    $names = @(Get-Content $candidates | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    $done = @()
    if (Test-Path $results) {
        $done = @(Import-Csv $results | ForEach-Object { $_.Repository } | Where-Object { $_ })
    }
    $remaining = @($names | Where-Object { $_ -notin $done }).Count
    if ($remaining -eq 0) {
        "=== All $($names.Count) candidates recorded. Finished $(Get-Date -Format s) ===" | Tee-Object -FilePath $log -Append
        break
    }

    "=== $(Get-Date -Format s): $remaining remaining; starting next batch of 10 ===" | Tee-Object -FilePath $log -Append
    & python -u $script --batch-size 10 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
    if ($LASTEXITCODE -ne 0) {
        "=== Checker exited with code $LASTEXITCODE; stopping to avoid repeated errors ===" | Tee-Object -FilePath $log -Append
        break
    }

    $updated = @()
    if (Test-Path $results) {
        $updated = @(Import-Csv $results | ForEach-Object { $_.Repository } | Where-Object { $_ })
    }
    $newRemaining = @($names | Where-Object { $_ -notin $updated }).Count
    if ($newRemaining -ge $remaining) {
        "=== No new repositories recorded; stopping to avoid an infinite loop ===" | Tee-Object -FilePath $log -Append
        break
    }
}
