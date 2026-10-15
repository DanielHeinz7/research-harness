'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('harnessHost', {
  pickFolder: () => ipcRenderer.invoke('host:pick-folder'),
  pickFile: (opts) => ipcRenderer.invoke('host:pick-file', opts),
  saveFile: (opts) => ipcRenderer.invoke('host:save-file', opts),
  reveal: (p) => ipcRenderer.invoke('host:reveal', p),
  openExternal: (url) => ipcRenderer.invoke('host:open-external', url),
});
