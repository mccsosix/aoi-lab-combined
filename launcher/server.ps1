$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$WebRoot = [IO.Path]::GetFullPath((Join-Path $Root "web"))
if (-not $WebRoot.EndsWith([IO.Path]::DirectorySeparatorChar)) { $WebRoot += [IO.Path]::DirectorySeparatorChar }

$Listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$Listener.Start()
$Port = ([Net.IPEndPoint]$Listener.LocalEndpoint).Port
$Address = "http://127.0.0.1:$Port/"
Write-Host "AOI LAB 已启动：$Address"
Write-Host "关闭此窗口即可停止工具。"
Start-Process $Address

function Get-ContentType([string]$Path) {
  switch ([IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    ".html" { "text/html; charset=utf-8" }
    ".js" { "text/javascript; charset=utf-8" }
    ".css" { "text/css; charset=utf-8" }
    ".json" { "application/json; charset=utf-8" }
    ".svg" { "image/svg+xml" }
    ".png" { "image/png" }
    ".jpg" { "image/jpeg" }
    ".jpeg" { "image/jpeg" }
    ".woff2" { "font/woff2" }
    default { "application/octet-stream" }
  }
}

try {
  while ($true) {
    $Client = $Listener.AcceptTcpClient()
    try {
      $Stream = $Client.GetStream()
      $Reader = [IO.StreamReader]::new($Stream, [Text.Encoding]::ASCII, $false, 1024, $true)
      $RequestLine = $Reader.ReadLine()
      while (($Header = $Reader.ReadLine()) -ne "" -and $null -ne $Header) { }
      $Parts = $RequestLine -split " "
      $Method = if ($Parts.Count -gt 0) { $Parts[0] } else { "" }
      $RawPath = if ($Parts.Count -gt 1) { ($Parts[1] -split "\?")[0] } else { "/" }
      $Status = "200 OK"
      $Body = [byte[]]@()
      $ContentType = "text/plain; charset=utf-8"
      if ($Method -notin @("GET", "HEAD")) {
        $Status = "405 Method Not Allowed"
        $Body = [Text.Encoding]::UTF8.GetBytes("Method not allowed")
      } else {
        $Relative = [Uri]::UnescapeDataString($RawPath).TrimStart("/").Replace("/", [IO.Path]::DirectorySeparatorChar)
        if ([string]::IsNullOrWhiteSpace($Relative)) { $Relative = "index.html" }
        $Candidate = [IO.Path]::GetFullPath((Join-Path $WebRoot $Relative))
        if (-not $Candidate.StartsWith($WebRoot, [StringComparison]::OrdinalIgnoreCase)) {
          $Status = "403 Forbidden"; $Body = [Text.Encoding]::UTF8.GetBytes("Forbidden")
        } elseif (Test-Path -LiteralPath $Candidate -PathType Leaf) {
          $Body = [IO.File]::ReadAllBytes($Candidate); $ContentType = Get-ContentType $Candidate
        } elseif (-not [IO.Path]::GetExtension($Relative)) {
          $Index = Join-Path $WebRoot "index.html"; $Body = [IO.File]::ReadAllBytes($Index); $ContentType = "text/html; charset=utf-8"
        } else {
          $Status = "404 Not Found"; $Body = [Text.Encoding]::UTF8.GetBytes("Not found")
        }
      }
      $Head = "HTTP/1.1 $Status`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
      $HeadBytes = [Text.Encoding]::ASCII.GetBytes($Head)
      $Stream.Write($HeadBytes, 0, $HeadBytes.Length)
      if ($Method -ne "HEAD" -and $Body.Length) { $Stream.Write($Body, 0, $Body.Length) }
      $Stream.Flush()
    } catch { Write-Warning $_.Exception.Message } finally { $Client.Close() }
  }
} finally { $Listener.Stop() }
