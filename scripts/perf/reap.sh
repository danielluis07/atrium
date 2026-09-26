#!/bin/sh
# reap.sh: stops everything a measurement leaves behind, then clears the driver lock.
# When Claude Code reaps a background shell for low memory, only the shell dies: its driver loop, the
# headed Chromium and the server on :3100 keep running, and a restarted driver would run alongside them
# (#63, #65). Run this first, then check nothing is left.
root=$(cd "$(dirname "$0")/../.." && pwd)
powershell -NoProfile -Command '
  Get-CimInstance Win32_Process |
    Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match "pairs\.sh|perf[\\/](probe|frames|settle)\.ts|ms-playwright" } |
    ForEach-Object { Write-Output ("stopping " + $_.ProcessId + " " + $_.Name); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }'
sh "$root/scripts/perf/serve.sh" stop
rmdir "$root/scripts/perf/out/drive.lock" 2>/dev/null && echo "cleared drive.lock"
powershell -NoProfile -Command '"free memory: " + [int]((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1KB) + " MB"'
