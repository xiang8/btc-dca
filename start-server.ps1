# BTC DCA Dashboard - PowerShell HTTP Server (Windows built-in, no Python needed)
# Features: static files + /save (POST write JSON) + /load-history (GET read JSON)

$port = 8765
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Host.UI.RawUI.WindowTitle = "BTC DCA Server (Ctrl+C to stop)"
$jsonFile = Join-Path $root 'btc_dca_history.json'

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  BTC DCA Dashboard - Local Server" -ForegroundColor Cyan
Write-Host "  2026~2027 BTC Daily DCA" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Root: $root"
Write-Host "Port: $port"
Write-Host "JSON: $jsonFile"
Write-Host ""

# Create empty JSON on first run
if (-not (Test-Path $jsonFile)) {
    $empty = @{
        version = 1
        lastUpdated = (Get-Date).ToString('o')
        totalCapital = 100000
        history = @()
    }
    $empty | ConvertTo-Json -Depth 10 | Out-File -FilePath $jsonFile -Encoding UTF8
    Write-Host "[OK] Created empty btc_dca_history.json" -ForegroundColor Green
} else {
    Write-Host "[OK] Found existing btc_dca_history.json" -ForegroundColor Green
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
try {
    $listener.Start()
} catch {
    Write-Host "[ERROR] Cannot start server: $_" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "Server running on http://localhost:$port" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop." -ForegroundColor Yellow
Write-Host ""

Start-Sleep -Seconds 2
Start-Process "http://localhost:$port/main.html"

# === Heartbeat mechanism: auto-shutdown if HTML closed ===
$lastHeartbeat = Get-Date
$heartbeatTimeout = 60  # seconds without any request before auto-shutdown
$firstSkip = $true

while ($listener.IsListening) {
    # Async GetContext with 5s timeout (for heartbeat check)
    $asyncResult = $listener.BeginGetContext($null, $null)
    $ready = $asyncResult.AsyncWaitHandle.WaitOne(5000)

    if (-not $ready) {
        # No request in 5s, check heartbeat
        $elapsed = (Get-Date) - $lastHeartbeat
        if ($elapsed.TotalSeconds -gt $heartbeatTimeout) {
            Write-Host ""
            Write-Host "[STOP] No heartbeat for $([int]$elapsed.TotalSeconds)s (HTML closed?), shutting down..." -ForegroundColor Yellow
            break
        }
        if ($firstSkip) {
            Write-Host "[INFO] Heartbeat check active (auto-shutdown after ${heartbeatTimeout}s without ping)" -ForegroundColor DarkGray
            $firstSkip = $false
        }
        continue
    }

    $ctx = $listener.EndGetContext($asyncResult)
    $req = $ctx.Request
    $res = $ctx.Response
    $method = $req.HttpMethod
    $path = $req.Url.AbsolutePath

    # 任何请求都重置心跳（防止刷新页面时误判为关闭）
    $lastHeartbeat = Get-Date

    try {
        if ($method -eq 'GET' -and $path -eq '/heartbeat') {
            $res.ContentType = 'application/json; charset=utf-8'
            $msg = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true}')
            $res.ContentLength64 = $msg.Length
            $res.OutputStream.Write($msg, 0, $msg.Length)
        }
        elseif ($method -eq 'POST' -and $path -eq '/save') {
            $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            $reader.Close()

            [System.IO.File]::WriteAllText($jsonFile, $body, (New-Object System.Text.UTF8Encoding $false))
            Write-Host "[SAVE] btc_dca_history.json updated" -ForegroundColor Green

            $res.ContentType = 'application/json; charset=utf-8'
            $msg = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true}')
            $res.ContentLength64 = $msg.Length
            $res.OutputStream.Write($msg, 0, $msg.Length)
        }
        elseif ($method -eq 'GET' -and $path -eq '/load-history') {
            $content = [System.IO.File]::ReadAllText($jsonFile, [System.Text.Encoding]::UTF8)
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
            $res.ContentType = 'application/json; charset=utf-8'
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            Write-Host "[LOAD] history served" -ForegroundColor Cyan
        }
        else {
            $relPath = [Uri]::UnescapeDataString($path).TrimStart('/')
            $filePath = Join-Path $root $relPath

            if ($relPath -eq '' -or $relPath -eq '/') {
                $filePath = Join-Path $root 'main.html'
            }

            if (Test-Path $filePath -PathType Leaf) {
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                $mime = switch ($ext) {
                    '.html' { 'text/html; charset=utf-8' }
                    '.css'  { 'text/css; charset=utf-8' }
                    '.js'   { 'application/javascript; charset=utf-8' }
                    '.json' { 'application/json; charset=utf-8' }
                    '.svg'  { 'image/svg+xml' }
                    '.png'  { 'image/png' }
                    '.jpg'  { 'image/jpeg' }
                    '.ico'  { 'image/x-icon' }
                    default { 'application/octet-stream' }
                }
                $res.ContentType = $mime
                $res.ContentLength64 = $bytes.Length
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
                Write-Host "200 $relPath" -ForegroundColor Gray
            } else {
                $res.StatusCode = 404
                $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $relPath")
                $res.OutputStream.Write($msg, 0, $msg.Length)
                Write-Host "404 $relPath" -ForegroundColor Red
            }
        }
    } catch {
        Write-Host "[ERROR] $_" -ForegroundColor Red
        try {
            $res.StatusCode = 500
            $msg = [System.Text.Encoding]::UTF8.GetBytes("500 Internal Error")
            $res.OutputStream.Write($msg, 0, $msg.Length)
        } catch {}
    }
    $res.Close()
}
