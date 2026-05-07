# Stop all OpenKot development processes
Write-Host "Stopping OpenKot development servers..." -ForegroundColor Yellow

# Load .env file to get ports
$envFile = Get-Content .env -ErrorAction SilentlyContinue
$ports = @()
$vitePort = 5173
$serverPort = 3006
$opencodePort = 3358

foreach ($line in $envFile) {
    if ($line -match '^VITE_PORT=(\d+)') { $vitePort = $matches[1] }
    if ($line -match '^PORT=(\d+)') { $serverPort = $matches[1] }
    if ($line -match '^OPENCODE_PORT=(\d+)') { $opencodePort = $matches[1] }
}

$ports = @($vitePort, $serverPort, $opencodePort)

Write-Host "Checking ports: $($ports -join ', ')" -ForegroundColor Cyan

foreach ($port in $ports) {
    Write-Host "`nChecking port $port..." -ForegroundColor Yellow
    
    $connections = netstat -ano | Select-String ":$port\s" | Select-String "LISTENING"
    
    if ($connections) {
        $connections | ForEach-Object {
            $line = $_.Line
            if ($line -match '\s+(\d+)\s*$') {
                $processId = $matches[1]
                try {
                    $process = Get-Process -Id $processId -ErrorAction Stop
                    Write-Host "  Found: $($process.ProcessName) (PID: $processId)" -ForegroundColor Cyan
                    Stop-Process -Id $processId -Force -ErrorAction Stop
                    Write-Host "  Killed process $processId" -ForegroundColor Green
                }
                catch {
                    Write-Host "  Failed to kill process $processId" -ForegroundColor Red
                }
            }
        }
    }
    else {
        Write-Host "  No process found on port $port" -ForegroundColor Gray
    }
}

# Also kill any bun/opencode processes
Write-Host "`nKilling any remaining bun/opencode processes..." -ForegroundColor Yellow
Get-Process | Where-Object { $_.ProcessName -match "^(bun|opencode)$" } | ForEach-Object {
    Write-Host "  Killing $($_.ProcessName) (PID: $($_.Id))" -ForegroundColor Cyan
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}

Write-Host "`nAll development servers stopped!" -ForegroundColor Green
Write-Host "You can now run 'bun run dev' again." -ForegroundColor Yellow
