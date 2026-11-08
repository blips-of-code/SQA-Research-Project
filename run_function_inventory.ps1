$ErrorActionPreference = 'Stop'
$root = Join-Path $HOME 'Documents\SQA-Research'
Set-Location $root
$log = Join-Path $root 'function-inventory.log'
"=== Started $(Get-Date -Format o) ===" | Out-File -FilePath $log -Append -Encoding utf8
& python -u 'scripts/run_inventory.py' --batch-size 250 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
"=== Finished $(Get-Date -Format o) ===" | Out-File -FilePath $log -Append -Encoding utf8
