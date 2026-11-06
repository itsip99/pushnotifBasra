@echo off
setlocal
:: Build + restart PM2 di server.
:: Script ini TIDAK melakukan git pull: workflow (atau operator) pull dulu,
:: karena cmd membaca .cmd baris per baris dan file ini bisa berubah saat pull.
::
:: Manual di server:
::   git pull --ff-only
::   scripts\deploy.cmd
::
:: Hanya restart app yang sudah ada di PM2. Kalau env / ecosystem.config.js
:: berubah, tetap perlu pm2 delete <id> lalu pm2 start ecosystem.config.js --only <name>.

cd /d "%~dp0.."
echo [deploy] folder: %CD%
git log -1 --oneline

:: ---- dependency ----
:: npm ci menghapus node_modules; app yang sedang jalan bisa gagal require modul
:: selama jeda itu, jadi hanya dijalankan kalau package-lock.json berubah.
set "LOCKHASH="
for /f "skip=1 delims=" %%h in ('certutil -hashfile package-lock.json SHA256 ^| findstr /v /c:"CertUtil"') do if not defined LOCKHASH set "LOCKHASH=%%h"
set "OLDHASH="
if exist node_modules\.deploy-lock-hash set /p OLDHASH=<node_modules\.deploy-lock-hash
if not exist node_modules goto :install
if not "%LOCKHASH%"=="%OLDHASH%" goto :install
echo [deploy] package-lock tidak berubah, npm ci dilewati
goto :build

:install
echo [deploy] npm ci
call npm ci --no-audit --no-fund
if errorlevel 1 goto :gagal
>node_modules\.deploy-lock-hash echo %LOCKHASH%

:: ---- build ----
:build
echo [deploy] npx tsc
call npx tsc
if errorlevel 1 goto :gagal

:: tsc tidak menyalin .json -> credential disalin dari src\services ke dist\services
robocopy src\services dist\services *.json /S /NJH /NJS /NDL /NFL /NP >nul
if errorlevel 8 goto :gagal

:: Cegah restart kalau file penting tidak ada (worker akan crash loop)
for %%f in (dist\index.js dist\worker.hris.js dist\worker.fixupmoto.js) do (
  if not exist %%f (
    echo [deploy] %%f tidak ada
    goto :gagal
  )
)
dir /s /b dist\services\*.json >nul 2>&1
if errorlevel 1 (
  echo [deploy] credential *.json tidak ada di src\services - salin manual dulu
  goto :gagal
)

:: ---- restart PM2 ----
:: Nama lama dan nama ecosystem sama-sama dicoba; yang tidak ada di PM2 dilewati.
set "RESTART_GAGAL="
for %%a in (hris-api hris-worker yamaha-worker wellness-worker lsa-worker worker.lsa javayoga-worker fixupmoto-worker) do call :restart %%a

call pm2 save >nul
if defined RESTART_GAGAL goto :gagal

echo [deploy] DEPLOY OK
exit /b 0

:gagal
echo [deploy] DEPLOY GAGAL
exit /b 1

:: ---- subrutin ----
:restart
call pm2 id %1 | findstr /r "[0-9]" >nul
if errorlevel 1 (
  echo [deploy] lewati %1 - tidak ada di PM2
  exit /b 0
)
echo [deploy] restart %1
call pm2 restart %1 >nul
if errorlevel 1 (
  echo [deploy] restart %1 GAGAL
  set "RESTART_GAGAL=1"
)
exit /b 0
