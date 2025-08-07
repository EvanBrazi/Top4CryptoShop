@echo off
:: Batch script to setup SSH agent and test GitHub connection
:: Save this as ssh_github.bat

setlocal

:: Set paths
set SSH_DIR=C:\Users\DELL\AppData\Local\.ssh
set SSH_KEY=%SSH_DIR%\top4cryptoshop

:: Check if SSH Agent is running
ssh-add -l >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo SSH Agent is already running
) else (
    echo Starting SSH Agent...
    :: Start SSH Agent and set environment variables
    for /f "tokens=1,2 delims=;=" %%a in ('ssh-agent -s') do (
        if "%%a"=="SSH_AUTH_SOCK" set "SSH_AUTH_SOCK=%%b"
        if "%%a"=="SSH_AGENT_PID" set "SSH_AGENT_PID=%%b"
    )
    
    :: Export the variables (this only works in the current session)
    setx SSH_AUTH_SOCK "%SSH_AUTH_SOCK%" >nul
    setx SSH_AGENT_PID "%SSH_AGENT_PID%" >nul
    
    echo SSH Agent started successfully
)

:: Add the SSH key
echo Adding SSH key...
ssh-add "%SSH_KEY%"

:: Test GitHub connection
echo Testing GitHub connection...
ssh -T git@github.com

endlocal
pause
