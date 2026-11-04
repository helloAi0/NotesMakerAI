const { contextBridge, ipcRenderer } = require('electron');
// Tiny, explicit surface: the page can ask for a native notification and for the autostart setting. Nothing else.
contextBridge.exposeInMainWorld('nmDesktop', {
  isDesktop: true,
  notify: (title, body) => ipcRenderer.invoke('nm:notify', String(title).slice(0, 80), String(body).slice(0, 300)),
  getAutostart: () => ipcRenderer.invoke('nm:autostart:get'),
  setAutostart: v => ipcRenderer.invoke('nm:autostart:set', !!v),
});
if (process.argv.includes('--nm-test')) contextBridge.exposeInMainWorld('nmDesktopTest', { closeWindow: () => ipcRenderer.invoke('nm:test:close'), state: () => ipcRenderer.invoke('nm:test:state') });
