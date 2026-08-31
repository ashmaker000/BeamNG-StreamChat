# BeamNG Twitch Chat

Created and maintained by **Ashmaker000**.

BeamNG Twitch Chat displays the authenticated streamer's Twitch chat inside BeamNG.drive. Version 0.5.0 installs a secured background service automatically, so end users do not install Node.js or start a PowerShell window.

## Features

- Twitch Device Code login with no copied access token or Client Secret
- Chat locked to the Twitch account that authorized the application
- Twitch EventSub WebSocket connection managed by the background service
- Refresh tokens encrypted with Windows DPAPI for the current Windows account
- Authenticated loopback API bound only to `127.0.0.1`
- Username colors, safe text rendering, message deduplication and a configurable 1–100 message limit
- Automatic hidden startup and a Windows uninstaller

The UI follows BeamNG's official [UI app layout](https://documentation.beamng.com/modding/ui/app_creation/). Twitch integration follows the documented [installed-chatbot EventSub flow](https://dev.twitch.tv/docs/chat/authenticating/).

## User requirements

- Windows and BeamNG.drive
- A Twitch account
- A **Public** application registered in the [Twitch developer console](https://dev.twitch.tv/console/apps)
- The application's public Client ID

Never enter a Twitch Client Secret. This application does not use one.

## Install

1. Run `BeamNG-StreamChat-Setup.exe`.
2. The installer detects the normal current BeamNG user folder. If it cannot, select the active user folder when prompted.
3. Start BeamNG and add **Stream Chat** from UI Apps.
4. Open **Setup**, enter the application's Client ID and select **Connect Twitch**.
5. Approve the displayed code on Twitch.

The installer places the mod ZIP in the active BeamNG `mods` folder, installs the service under the current user's LocalAppData directory and starts it hidden. It does not require administrator access.

Uninstall **BeamNG Twitch Chat** through Windows Installed Apps. Previous mod ZIPs replaced during an upgrade are moved to `%LOCALAPPDATA%\BeamNGStreamChat\backup`.

## Security

BeamNG stores an installation key and a random Twitch pairing key, not Twitch tokens. Every loopback request requires the installation key and rejects browser origins. The service stores Twitch refresh credentials in `%LOCALAPPDATA%\BeamNGStreamChat\twitch-auth.dpapi`, encrypted for the current Windows user. Access tokens remain only in service memory.

Selecting **Forget login** deletes the encrypted Twitch credential and disconnects EventSub.

## Build from source

Development requires Node.js 22 or newer:

```powershell
npm install
npm run typecheck
npm test
npm run package:windows
```

Outputs:

- `artifacts\BeamNG-StreamChat.zip` — BeamNG mod
- `artifacts\BeamNG-StreamChat-Setup.exe` — one-click Windows installer

The development helper can still be run with `scripts\start-companion.ps1` after creating the local IPC key files used by the installed build.

## Current limitations

- Automatic secure credential storage and installation currently target Windows.
- Authenticated Twitch testing requires a real Public Client ID and Twitch account.
- YouTube and Kick remain disabled for this Twitch-focused release.
- The generated installer is unsigned until the project is supplied with a Windows code-signing certificate.

## Credits

BeamNG Twitch Chat was created and is maintained by **Ashmaker000**. See [CREDITS.md](CREDITS.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
