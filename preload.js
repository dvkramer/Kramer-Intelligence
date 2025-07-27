const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('powershell', {
  run: (command) => ipcRenderer.invoke('run-powershell', command)
});
