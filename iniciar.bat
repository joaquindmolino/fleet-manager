@echo off
title Fleet Manager

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

echo.
echo [1/6] Verificando Docker...
docker info >nul 2>&1
if %errorlevel%==0 goto step2

echo Docker no corre. Abriendo Docker Desktop...
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
echo Esperando que Docker inicie...

:waitdocker
timeout /t 5 /nobreak >nul
docker info >nul 2>&1
if not %errorlevel%==0 goto waitdocker
echo Docker listo.

:step2
echo.
echo [2/6] Construyendo imagen del backend...
docker compose -f "%ROOT%\docker-compose.yml" build backend celery_worker
if not %errorlevel%==0 (
    echo ERROR al construir la imagen.
    pause
    exit /b 1
)
echo Imagen OK.

:step3
echo.
echo [3/6] Levantando servicios (postgres, redis, backend)...
docker compose -f "%ROOT%\docker-compose.yml" up -d
if not %errorlevel%==0 (
    echo ERROR al levantar servicios.
    pause
    exit /b 1
)
echo Servicios OK.

:step4
echo.
echo [4/6] Esperando que el backend este listo...
set RETRIES=0

:wait_backend
set /a RETRIES+=1
if %RETRIES% GTR 30 goto backend_timeout
curl --silent --max-time 2 http://localhost:8000/health >nul 2>&1
if %errorlevel%==0 goto backend_ok
timeout /t 3 /nobreak >nul
goto wait_backend

:backend_timeout
echo.
echo El backend no responde. Logs del contenedor:
echo.
docker compose -f "%ROOT%\docker-compose.yml" logs backend --tail=50
echo.
pause
exit /b 1

:backend_ok
echo Backend OK.

echo Aplicando migraciones...
docker compose -f "%ROOT%\docker-compose.yml" exec -T backend alembic upgrade head
if not %errorlevel%==0 (
    echo ERROR en migracion.
    docker compose -f "%ROOT%\docker-compose.yml" logs backend --tail=20
    pause
    exit /b 1
)

echo Cargando datos iniciales...
docker compose -f "%ROOT%\docker-compose.yml" exec -T backend python seed.py
echo Base de datos lista.

:step5
echo.
echo [5/6] Verificando dependencias del frontend...
if not exist "%ROOT%\frontend\node_modules" (
    echo Instalando dependencias...
    cd /d "%ROOT%\frontend"
    call npm install
    cd /d "%ROOT%"
)
echo Dependencias OK.

:step6
echo.
echo [6/6] Iniciando servidor de desarrollo...
start "" "%ROOT%\_frontend.bat"

echo Esperando que Vite levante...
timeout /t 5 /nobreak >nul
start "" "http://localhost:5173"

echo.
echo ======================================
echo  Listo en http://localhost:5173
echo.
echo  Usuario:    admin@fleetmanager.app
echo  Contrasena: Admin1234!
echo.
echo  Deja abierta la ventana del frontend.
echo  Para detener: docker compose down
echo ======================================
echo.
pause
