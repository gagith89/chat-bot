@echo off
echo.
echo  VoiceChat - Multilingual AI Voice Assistant
echo  ============================================

:: Check Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Python not found. Install it from https://python.org and try again.
    pause
    exit /b 1
)

:: Check .env exists
if not exist .env (
    echo.
    echo  ERROR: .env file not found.
    echo  Run this first:
    echo    copy .env.example .env
    echo  Then open .env and add your ANTHROPIC_API_KEY.
    echo.
    pause
    exit /b 1
)

echo.
echo  Installing dependencies...
pip install -r requirements.txt --quiet

echo.
echo  Starting server at http://localhost:5000
echo  Press Ctrl+C to stop.
echo.
python app.py
