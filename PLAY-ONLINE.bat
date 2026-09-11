@echo off
title Brood War Remake -- internet game
cd /d "%~dp0"
setlocal

rem ============================================================================
rem  Internet play. YOUR machine hosts; nothing is installed anywhere else and
rem  there is no server to pay for. A tunnel gives your local server a public
rem  https address, and the game's client already does the rest: it picks wss://
rem  automatically when the page is https, and the relay never looks at Host, so
rem  it works behind a proxy with no code changes at all.
rem
rem  DELAY 6, not the LAN default of 3. A command issued at frame F executes at
rem  F+DELAY on every client and the game waits for the slowest player's batch.
rem  At 24 ticks a second, 3 frames is a 125 ms budget -- fine on a LAN, less
rem  than one round trip through a tunnel. Nothing desyncs when you exceed it;
rem  every client just waits, constantly, which feels like stutter. 6 is 250 ms.
rem  Raise it to 8 or 10 if you are playing someone on another continent.
rem ============================================================================

set PORT=8765
set DELAY=6

echo.
echo  Brood War Remake -- internet game
echo  ---------------------------------
echo.
echo  1. This window starts the game server on port %PORT% with a %DELAY%-frame delay.
echo  2. In a SECOND window, run:
echo.
echo         cloudflared tunnel --url http://localhost:%PORT%
echo.
echo     It prints a https://....trycloudflare.com address. No account needed.
echo     Get cloudflared from https://github.com/cloudflare/cloudflared/releases
echo     (or use any tunnel you like -- ngrok, Tailscale Funnel, a port forward).
echo.
echo  3. Send your friends THE HTTPS LINK and A ROOM CODE you make up.
echo     Everyone opens the link, expands Multiplayer, types the SAME room code
echo     and their name, and presses CONNECT. Then you press START.
echo.
echo     THE ROOM CODE IS THE ONLY THING KEEPING STRANGERS OUT. The link is not
echo     a secret once you have sent it. Anyone who opens it and types a WRONG
echo     code lands in an empty room of their own and never sees your game.
echo     Anyone who types NO code lands in the shared room called LAN, with
echo     everyone else who typed nothing -- so the page insists on a code when
echo     it is served over https, and you should always use one.
echo.
echo  Keep this window open while playing. Close it to stop the server.
echo.

node test\serve.js %PORT% %DELAY%
pause
