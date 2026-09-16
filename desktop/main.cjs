/**
 * ==============================================================================
 * TriPro ERP - Desktop Standalone Runner (Electron Native Window)
 * ==============================================================================
 * يتيح هذا المشغل فتح TriPro ERP كتطبيق حاسوب مستقل بالكامل (Desktop .exe)
 * مع تخزين مؤقت محلي يعمل حتى لو انقطع الاتصال بالإنترنت تماماً.
 * ==============================================================================
 */

const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    title: 'TriPro ERP - نظام إدارة وتخطيط المؤسسات المتكامل',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  Menu.setApplicationMenu(null);

  const distIndexPath = path.join(__dirname, '../dist/index.html');
  const devServerUrl = 'http://localhost:5173';

  if (process.env.VITE_DEV === 'true') {
    mainWindow.loadURL(devServerUrl).catch(() => {
      mainWindow.loadFile(distIndexPath);
    });
  } else {
    mainWindow.loadFile(distIndexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
