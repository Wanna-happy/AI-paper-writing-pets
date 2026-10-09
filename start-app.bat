@echo off
setlocal
set ELECTRON_RUN_AS_NODE=
pushd "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo Electron is missing. Install project dependencies with npm ci first.
  pause
  popd
  exit /b 1
)
start "" "%~dp0node_modules\electron\dist\electron.exe" "."
popd
endlocal
