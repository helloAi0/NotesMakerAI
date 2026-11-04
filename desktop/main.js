/**
 * Desktop shell. It serves the built web app from a tiny local HTTP server (fixed port so IndexedDB / localStorage — your notes, memory, flashcards — stay
 * in the same place between launches), keeps running in the system tray when the window is closed, and lets the page raise native notifications,
 * so reminders and study nudges still fire while the window is hidden.
 */
const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, nativeImage, shell, session } = require('electron');
const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const PORT = Number(process.env.NM_PORT || 47831); const ROOT = fs.existsSync(path.join(__dirname, 'web')) ? path.join(__dirname, 'web') : path.join(__dirname, '..', 'frontend', 'dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm', '.gz': 'application/gzip', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain', '.mp3': 'audio/mpeg' };
const SHOWN = []; let win = null, tray = null, quitting = false, server = null;

function serve() {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      let p = decodeURIComponent((req.url || '/').split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      let f = path.normalize(path.join(ROOT, p)); if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(ROOT, 'index.html'); // single-page app fallback
      res.writeHead(200, { 'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' }); fs.createReadStream(f).pipe(res);
    });
    server.on('error', reject); server.listen(PORT, '127.0.0.1', () => resolve(PORT));
  });
}
function showWindow() { if (!win) createWindow(); else { win.show(); win.focus(); } }
function createWindow() {
  win = new BrowserWindow({ width: 1320, height: 900, show: !process.argv.includes('--hidden'), title: 'Notes Maker AI', icon: path.join(__dirname, 'icon.png'), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, additionalArguments: process.env.NM_TEST === '1' ? ['--nm-test'] : [] } }); // keep timers (reminders) running while hidden
  win.loadURL(`http://127.0.0.1:${PORT}/`);
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url) && !url.startsWith(`http://127.0.0.1:${PORT}`)) shell.openExternal(url); return { action: 'deny' }; });
  win.on('close', e => { if (!quitting) { e.preventDefault(); win.hide(); if (tray && Notification.isSupported() && !app.__toldTray) { app.__toldTray = true; new Notification({ title: 'Still running', body: 'Notes Maker AI keeps running in the tray so your reminders and study nudges can reach you. Right-click the tray icon to quit.' }).show(); } } });
  win.on('closed', () => { win = null; });
}
function createTray() {
  const img = fs.existsSync(path.join(__dirname, 'icon.png')) ? nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 16, height: 16 }) : nativeImage.createEmpty();
  tray = new Tray(img); tray.setToolTip('Notes Maker AI — FRIDAY');
  const menu = () => Menu.buildFromTemplate([{ label: 'Open Notes Maker AI', click: showWindow }, { label: 'Start with system', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: i => app.setLoginItemSettings({ openAtLogin: i.checked, args: ['--hidden'] }) }, { type: 'separator' }, { label: 'Quit (stops reminders)', click: () => { quitting = true; app.quit(); } }]);
  tray.setContextMenu(menu()); tray.on('click', showWindow);
}
const lock = app.requestSingleInstanceLock(); if (!lock) app.quit(); else {
  app.on('second-instance', showWindow);
  app.whenReady().then(async () => {
    ipcMain.handle('nm:notify', (_e, title, body) => { SHOWN.push({ title, body }); if (Notification.isSupported()) { const n = new Notification({ title, body }); n.on('click', showWindow); n.show(); return true; } return false; });
    if (process.env.NM_TEST === '1') { ipcMain.handle('nm:test:close', () => { if (win) win.close(); return true; }); ipcMain.handle('nm:test:state', () => ({ exists: !!win, visible: win ? win.isVisible() : null, notes: SHOWN })); }
    ipcMain.handle('nm:autostart:get', () => app.getLoginItemSettings().openAtLogin); ipcMain.handle('nm:autostart:set', (_e, v) => { app.setLoginItemSettings({ openAtLogin: !!v, args: ['--hidden'] }); return !!v; });
    session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(['media', 'microphone', 'notifications', 'clipboard-read', 'clipboard-sanitized-write', 'speech'].includes(perm) && wc.getURL().startsWith(`http://127.0.0.1:${PORT}`)));
    try { await serve(); } catch (e) { console.error('Could not start the local server on port', PORT, e.message); app.quit(); return; }
    createTray(); createWindow();
  });
  app.on('before-quit', () => { quitting = true; try { server && server.close(); } catch { /* closed */ } });
  app.on('window-all-closed', () => { /* stay alive in the tray */ });
  app.on('activate', showWindow);
}
