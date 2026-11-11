@echo off
rem Upload changes to GitHub Pages (phone app updates in 1-2 minutes)
cd /d "%~dp0"
git add -A
git commit -m "update" >nul 2>&1
git push
if errorlevel 1 (echo. & echo [FAILED] upload failed. & pause & exit /b 1)
echo.
echo [OK] Uploaded. https://ohjin1218.github.io/speak-review/
pause
