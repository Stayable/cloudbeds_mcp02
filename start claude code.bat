@echo off
setlocal EnableDelayedExpansion

REM ============================================================
REM  Stayable / Cloudbeds MCP - local Claude Code launcher
REM
REM  What this does:
REM    1. Clones (or updates) the Cloudbeds MCP repo into your
REM       Git-Claude folder.
REM    2. Launches Claude Code CLI inside it.
REM
REM  Edit the four values below if you need a different repo,
REM  branch, or target folder.
REM ============================================================

REM ----- Config -------------------------------------------------
set "TARGET_DIR=C:\Users\Kyle Estocapio\Git-Claude"
set "REPO_URL=https://github.com/rbeyer999/Claude-Code.git"
set "BRANCH=claude/serene-clarke-S0kHP"
set "FOLDER=Claude-Code"
REM --------------------------------------------------------------

echo ============================================================
echo  Cloudbeds MCP - local setup
echo  Target : %TARGET_DIR%\%FOLDER%
echo  Branch : %BRANCH%
echo ============================================================
echo.

REM ----- Prerequisite checks -----------------------------------
where git >nul 2>nul
if errorlevel 1 (
  echo [ERROR] git is not installed or not on PATH.
  echo         Install Git for Windows: https://git-scm.com/download/win
  goto :fail
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not on PATH.
  echo         Install Node 18+ : https://nodejs.org
  goto :fail
)

where claude >nul 2>nul
if errorlevel 1 (
  echo [WARN] Claude Code CLI not found on PATH.
  echo        Install it with:  npm install -g @anthropic-ai/claude-code
  echo.
  set "NO_CLAUDE=1"
)

REM ----- Make sure the target directory exists -----------------
if not exist "%TARGET_DIR%" (
  echo Creating %TARGET_DIR% ...
  mkdir "%TARGET_DIR%"
)

REM ----- Clone or update ---------------------------------------
if exist "%TARGET_DIR%\%FOLDER%\.git" (
  echo Repo already present - updating...
  cd /d "%TARGET_DIR%\%FOLDER%" || goto :fail
  git fetch origin "%BRANCH%"
  if errorlevel 1 goto :fail
  git checkout "%BRANCH%"
  if errorlevel 1 goto :fail
  git pull origin "%BRANCH%"
) else (
  echo Cloning %REPO_URL% ...
  cd /d "%TARGET_DIR%" || goto :fail
  git clone --branch "%BRANCH%" "%REPO_URL%" "%FOLDER%"
  if errorlevel 1 goto :fail
  cd /d "%TARGET_DIR%\%FOLDER%" || goto :fail
)

echo.
echo Repo ready at: %CD%
echo.

REM ----- Launch Claude Code ------------------------------------
if defined NO_CLAUDE (
  echo Skipping Claude Code launch - CLI not installed.
  echo After installing, just re-run this file.
  goto :done
)

echo Launching Claude Code...
echo ------------------------------------------------------------
claude
goto :done

:fail
echo.
echo [FAILED] Something went wrong. See the message above.
:done
echo.
pause
endlocal
