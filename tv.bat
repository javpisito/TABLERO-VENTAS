@echo off
REM ============================================================
REM  EL TABLERO EN EL TELEVISOR
REM
REM  Doble clic aqui y listo. Levanta el servidor local y abre
REM  Chrome en modo kiosco: sin pestanas, sin barra de direcciones
REM  y sin la barra del adblocker, que entre las tres se comian
REM  180px de alto y dejaban el tablero apretado.
REM
REM  Se abre la copia local, no la de GitHub Pages, porque es la
REM  unica que tiene las canciones de audio/ y las piezas de
REM  propaganda/.
REM
REM  Para salir del modo kiosco: Alt+F4.
REM ============================================================
setlocal

set "URL=http://localhost:8765/?auto"

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  echo.
  echo  No encontre Chrome en las rutas de siempre.
  echo  Abri el tablero a mano en:  %URL%
  echo.
  pause
  exit /b 1
)

echo  Levantando el servidor...
start "Tablero SC Ads" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servir-local.ps1" -SinNavegador

REM El servidor tarda un segundo en tomar el puerto. Sin esta espera
REM Chrome llega primero y muestra "no se puede acceder al sitio".
timeout /t 3 /nobreak >nul

echo  Abriendo el tablero...
REM --kiosk           pantalla completa de verdad, sin nada del navegador
REM --autoplay-policy con ?auto no hay clic, y sin clic el navegador no deja
REM                   sonar la campana. Esto levanta ese bloqueo.
start "" "%CHROME%" --kiosk --autoplay-policy=no-user-gesture-required "%URL%"
