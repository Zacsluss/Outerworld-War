@echo off
title Brood War Remake server
cd /d "%~dp0"
echo Starting Brood War Remake on http://localhost:8765
echo Keep this window open while playing. Close it to stop the server.
start "" "http://localhost:8765"
node test\serve.js 8765
pause
