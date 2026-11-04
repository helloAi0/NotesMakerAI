# Notes Maker AI — desktop app

Electron shell around the web app. It keeps running in the **system tray** when you close the window, so reminders and study nudges still reach you
(native notifications). Your notes, memory and flashcards live in the app's own browser storage on this computer.

    cd frontend && npm install          # once
    cd ../desktop && npm install        # once
    npm start                           # builds the web app and opens the desktop app
    npm run pack                        # unpacked app for this OS in desktop/dist
    npm run dist                        # installer for this OS (Windows .exe, macOS .dmg, Linux AppImage/deb)

Build all three installers without owning all three machines: run the "Desktop installers" GitHub Action (Actions tab → Run workflow).

Honest limits: there is no server, so reminders fire only while the app's tray process is running. Quitting asks first and offers “Start with system”; the first run offers it too. A computer that is off cannot notify you; after sleep, everything that became due fires on wake. 
Tray menu → “Start with system” launches it hidden at login. The YouTube-caption server is bundled (`yt.cjs`), so Lecture to Notes fetches captions here too. Installers are unsigned, so Windows SmartScreen / macOS Gatekeeper will warn on first run.
