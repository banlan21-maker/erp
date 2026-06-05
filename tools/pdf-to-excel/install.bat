@echo off
setlocal enabledelayedexpansion
title PDF Extractor - Install
cd /d "%~dp0"

echo ============================================================
echo  PDF Extractor - Dependency Installer
echo ============================================================
echo.

REM --- 1. Check Python ---
where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in PATH.
    echo.
    echo Please install Python 3.9+ from:
    echo   https://www.python.org/downloads/
    echo.
    echo IMPORTANT: Check "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)

for /f "tokens=2" %%v in ('python --version 2^>^&1') do set PYVER=%%v
echo [OK] Python !PYVER! found
echo.

REM --- 2. Upgrade pip ---
echo [STEP 1/2] Upgrading pip...
python -m pip install --upgrade pip
echo.

REM --- 3. Install packages ---
echo [STEP 2/2] Installing packages from requirements.txt
echo (This may take several minutes - paddlepaddle is large)
echo.
python -m pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo ============================================================
    echo [ERROR] Installation failed.
    echo ============================================================
    echo.
    echo Common cause: paddlepaddle requires Python 3.8 - 3.12 on Windows.
    echo If your Python is 3.13+, install Python 3.11 separately and try:
    echo.
    echo     py -3.11 -m venv venv
    echo     venv\Scripts\activate
    echo     install.bat
    echo.
    echo See README.md for more troubleshooting.
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  Installation completed successfully.
echo ============================================================
echo.
echo Next: Drag any PDF file onto run.bat
echo.
echo (First PDF run will download PaddleOCR models ~500MB once)
echo.
pause
