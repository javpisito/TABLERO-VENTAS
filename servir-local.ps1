# Servidor local para el televisor de la oficina.
#
# Por qué existe: las canciones de las vendedoras viven en audio/, que está fuera
# del repositorio a propósito (es público y Pages las serviría a internet). Así
# que el TV no abre la versión de GitHub Pages, abre esta copia local.
#
# Se lanza con doble clic en tablero.bat. No necesita Node, ni Python, ni nada
# instalado: PowerShell viene con Windows.
#
# Abrir index.html con doble clic (file://) puede funcionar, pero el navegador
# trata ese origen distinto y no está probado. Este servidor deja el tablero en
# http://localhost:8765, que es un origen normal y se comporta como la web.

$ErrorActionPreference = 'Continue'
$raiz = $PSScriptRoot
$puerto = 8765

# Se intenta escuchar en todas las interfaces, para que el televisor y los
# celulares del equipo puedan entrar desde la misma red. Windows exige un
# permiso para eso (ver README); si no está dado, esto falla y se cae a servir
# solo en esta máquina, que es mejor que no arrancar.
$enRed = $true
$lis = New-Object System.Net.HttpListener
$lis.Prefixes.Add("http://+:$puerto/")
try {
  $lis.Start()
} catch {
  $enRed = $false
  $lis = New-Object System.Net.HttpListener
  $lis.Prefixes.Add("http://localhost:$puerto/")
  try {
    $lis.Start()
  } catch {
    Write-Host "No se pudo abrir el puerto $puerto. Puede que ya haya un tablero corriendo."
    Write-Host $_.Exception.Message
    Read-Host "Enter para cerrar"
    exit 1
  }
}

Write-Host ""
Write-Host "  Tablero sirviendose desde: $raiz"
Write-Host "  En esta maquina:           http://localhost:$puerto/"

if ($enRed) {
  $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
         Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
         Select-Object -ExpandProperty IPAddress
  foreach ($ip in $ips) {
    Write-Host "  Desde otro aparato:        http://${ip}:$puerto/"
  }
  Write-Host ""
  Write-Host "  Esas direcciones sirven solo dentro de tu misma red."
} else {
  Write-Host ""
  Write-Host "  Solo esta maquina puede verlo: falta el permiso de red."
  Write-Host "  Para abrirlo al resto de la red, mira la seccion 'Verlo desde otro"
  Write-Host "  aparato' del README. Son dos comandos, una sola vez."
}

Write-Host ""
Write-Host "  Deja esta ventana abierta. Cerrarla apaga el tablero."
Write-Host ""

Start-Process "http://localhost:$puerto/"

$tipos = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.mp3'  = 'audio/mpeg'
  '.wav'  = 'audio/wav'
  '.ogg'  = 'audio/ogg'
  '.m4a'  = 'audio/mp4'
}

while ($lis.IsListening) {
  try {
    $ctx = $lis.GetContext()
    $metodo = $ctx.Request.HttpMethod
    $ruta = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($ruta -eq '') { $ruta = 'index.html' }
    $archivo = Join-Path $raiz $ruta

    # Nadie debería poder pedir archivos de fuera de la carpeta con ../
    $completo = [System.IO.Path]::GetFullPath($archivo)
    if (-not $completo.StartsWith([System.IO.Path]::GetFullPath($raiz))) {
      $ctx.Response.StatusCode = 403
      $ctx.Response.OutputStream.Close()
      continue
    }

    if (Test-Path $completo -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($completo)
      $ext = [System.IO.Path]::GetExtension($completo).ToLower()
      if ($tipos.ContainsKey($ext)) { $ctx.Response.ContentType = $tipos[$ext] }
      else { $ctx.Response.ContentType = 'application/octet-stream' }
      $ctx.Response.ContentLength64 = $bytes.Length
      # HEAD lleva encabezados pero no cuerpo: escribirlo revienta el listener
      if ($metodo -ne 'HEAD') { $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length) }
    } else {
      $ctx.Response.StatusCode = 404
      $b = [System.Text.Encoding]::UTF8.GetBytes("no existe: $ruta")
      $ctx.Response.ContentLength64 = $b.Length
      if ($metodo -ne 'HEAD') { $ctx.Response.OutputStream.Write($b, 0, $b.Length) }
    }
    $ctx.Response.OutputStream.Close()
  } catch {
    # Una petición mala no debe tumbar el tablero de la oficina
    Write-Host "error atendiendo: $($_.Exception.Message)"
  }
}
