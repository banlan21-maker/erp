@echo off
setlocal enabledelayedexpansion
title PDF Extractor - Install (Python 3.11 + PaddleOCR venv)
cd /d "%~dp0"

echo ============================================================
echo  PDF Extractor - Dependency Installer
echo  (Python 3.11 venv + PaddleOCR)
echo ============================================================
echo.

REM --- 1. Check py -3.11 launcher ---
py -3.11 --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python 3.11 not found via "py -3.11" launcher.
    echo.
    echo This tool requires Python 3.11 because PaddleOCR does not
    echo support Python 3.13 or 3.14 on Windows.
    echo.
    echo Steps to fix:
    echo   1) Download Python 3.11 installer:
    echo      https://www.python.org/downloads/release/python-3119/
    echo      (scroll to "Files" - pick "Windows installer (64-bit)")
    echo.
    echo   2) During installation, check BOTH:
    echo      [v] Add python.exe to PATH
    echo      [v] py launcher
    echo.
    echo   3) Close this window and re-run install.bat
    echo.
    echo Alternative (no Python 3.11): use pytesseract instead.
    echo   See README.md "Troubleshooting" section.
    echo.
    pause
    exit /b 1
)

for /f "tokens=2" %%v in ('py -3.11 --version 2^>^&1') do set PYVER=%%v
echo [OK] Python 3.11 found: !PYVER!
echo.

REM --- 2. Create venv if not exists ---
if not exist "venv\Scripts\python.exe" (
    echo [STEP 1/3] Creating Python 3.11 virtual environment in .\venv ...
    py -3.11 -m venv venv
    if errorlevel 1 (
        echo [ERROR] venv creation failed.
        pause
        exit /b 1
    )
    echo [OK] venv created.
    echo.
) else (
    echo [INFO] Existing venv detected at .\venv (skipping creation)
    echo.
)

REM --- 3. Upgrade pip in venv ---
echo [STEP 2/3] Upgrading pip in venv...
"venv\Scripts\python.exe" -m pip install --upgrade pip
echo.

REM --- 4. Install packages in venv ---
echo [STEP 3/3] Installing packages from requirements.txt
echo (PaddleOCR + paddlepaddle is large, several minutes...)
echo.
"venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo ============================================================
    echo [ERROR] Package installation failed.
    echo ============================================================
    echo.
    echo Common causes:
    echo   1) paddlepaddle requires Visual C++ Redistributable:
    echo      https://aka.ms/vs/17/release/vc_redist.x64.exe
    echo.
    echo   2) Network/proxy issue - retry: install.bat
    echo.
    echo   3) Disk space - paddlepaddle is ~200 MB + paddleocr models
    echo.
    echo See README.md for more help.
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
echo (First PDF run will download PaddleOCR models ~10MB once)
echo.
pause
