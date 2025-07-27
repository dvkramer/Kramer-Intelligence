const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');

ipcMain.handle('run-powershell', async (event, command) => {
  return new Promise((resolve) => {
    exec(command, { 'shell': 'powershell.exe' }, (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        return resolve(stderr);
      }
      return resolve(stdout);
    });
  });
});

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  // This line will load your web app's HTML file
  mainWindow.loadFile('public/index.html');
  mainWindow.maximize();
  mainWindow.setMenu(null);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});