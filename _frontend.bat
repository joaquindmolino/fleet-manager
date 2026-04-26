@echo off
title Fleet Manager - Frontend
cd /d "%~dp0frontend"
echo Iniciando Vite en http://localhost:5173 ...
echo.
npm run dev
echo.
echo El servidor se detuvo. Presiona cualquier tecla para cerrar.
pause >nul
