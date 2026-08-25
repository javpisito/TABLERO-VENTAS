@echo off
REM Doble clic aqui para abrir el tablero en el televisor.
REM Sirve la copia local, que es la que tiene las canciones en audio/.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servir-local.ps1"
