/**
 * ==============================================================================
 * TriPro ERP - Desktop Preload Bridge
 * ==============================================================================
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  platform: process.platform,
  version: '2.0.0'
});
