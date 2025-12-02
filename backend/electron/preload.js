// Preload script for Electron
// This runs before the renderer process loads, with access to both Node.js and DOM APIs
const { contextBridge, ipcMain } = require('electron');

// Expose safe APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Placeholder for future secure IPC methods
  // Example: sendMessage: (channel, data) => ipcMain.send(channel, data)
});
