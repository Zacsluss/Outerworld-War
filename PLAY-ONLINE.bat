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
echo  3. Send your friends THE HTTPS LINK. Everyone opens it and presses MULTIPLAYER
echo     (the game asks each player's name the first time it opens). You press
echo     HOST GAME; they see your game in the list and click it. Then you press START.
echo.
echo     A HOSTED GAME IS LISTED FOR EVERYONE WHO OPENS THE LINK, and the link is
echo     not a secret once you have sent it. For a game strangers must not see,
echo     do not host from the list: agree a ROOM CODE out of band and everyone
echo     types it into JOIN BY CODE. A code-joined room is never listed, and
echo     anyone who guesses wrong lands in an empty room of their own.
echo.
echo  A SERVER PASSWORD keeps anyone who finds the link out of this server
echo  altogether: no game list, no rooms. Players are asked for it once, and
echo  their browser remembers it. The tunnel's https link is what keeps it
echo  private on the way (wss://), so send the link and the password separately.
echo  The tunnel company can read it, like everything else in the game: use a
echo  password made up for this, never one you use anywhere else.
echo.
set /p BW_PASSWORD= Password for this server (press Enter for none): 
echo.
if defined BW_PASSWORD (echo  Password on.) else (echo  No password: anyone with the link can see the game list.)
echo.
echo  Cheats are off in network games. Room codes are at least four characters.
echo  One address may hold 24 connections, and a connection that floods the
echo  server with messages is dropped.
echo  Keep this window open while playing. Close it to stop the server.
echo.

node test\serve.js %PORT% %DELAY%
pause
