/**
 * ==============================================================================
 * TriPro ERP - Standalone Portable Desktop Builder
 * Packs complete Electron runtime + ERP bundle into a zero-dependency portable folder
 * ==============================================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const distDir = path.join(rootDir, 'dist');
const electronDistDir = path.join(rootDir, 'node_modules', 'electron', 'dist');
const releaseDir = path.join(rootDir, 'release', 'TriPro-ERP-Portable');

console.log('🚀 Starting TriPro ERP Standalone Desktop Packager...');

// 1. Verify build files exist
if (!fs.existsSync(distDir) || !fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error('❌ dist/index.html not found! Please run `npm run build` first.');
  process.exit(1);
}

if (!fs.existsSync(electronDistDir)) {
  console.error('❌ Electron dist binaries not found in node_modules/electron/dist!');
  process.exit(1);
}

// 2. Prepare release directory
console.log(`📁 Target directory: ${releaseDir}`);
if (fs.existsSync(releaseDir)) {
  console.log('🧹 Cleaning previous release directory...');
  fs.rmSync(releaseDir, { recursive: true, force: true });
}
fs.mkdirSync(releaseDir, { recursive: true });

// 3. Copy Electron binary runtime
console.log('📦 Copying Electron runtime binaries...');
fs.cpSync(electronDistDir, releaseDir, { recursive: true });

// 4. Rename executable to TriPro-ERP.exe
const srcExe = path.join(releaseDir, 'electron.exe');
const targetExe = path.join(releaseDir, 'TriPro-ERP.exe');
if (fs.existsSync(srcExe)) {
  fs.renameSync(srcExe, targetExe);
  console.log('✅ Renamed executable to TriPro-ERP.exe');
}

// 5. Remove default_app.asar to allow custom app loading
const defaultAsar = path.join(releaseDir, 'resources', 'default_app.asar');
if (fs.existsSync(defaultAsar)) {
  fs.unlinkSync(defaultAsar);
  console.log('✅ Removed default_app.asar template');
}

// 6. Create resources/app
const appDir = path.join(releaseDir, 'resources', 'app');
fs.mkdirSync(appDir, { recursive: true });

// 7. Copy desktop runner and dist bundle
console.log('📋 Copying desktop runner & ERP production build into resources/app...');
fs.cpSync(path.join(rootDir, 'desktop'), path.join(appDir, 'desktop'), { recursive: true });
fs.cpSync(distDir, path.join(appDir, 'dist'), { recursive: true });

// 8. Create app package.json
const appPackageJson = {
  name: "tripro-erp",
  productName: "TriPro ERP",
  version: "1.0.0",
  main: "desktop/main.cjs"
};
fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(appPackageJson, null, 2), 'utf8');

// 9. Create a convenient launcher script for the user
const launcherBat = `@echo off
start "" "%~dp0TriPro-ERP.exe"
`;
fs.writeFileSync(path.join(releaseDir, 'Launch-TriPro.bat'), launcherBat, 'utf8');

console.log('============================================================');
console.log('🎉 TriPro ERP Portable Desktop Build Completed Successfully!');
console.log(`📍 Location: ${releaseDir}`);
console.log('💡 You can copy this folder to any USB drive or Windows PC.');
console.log('   Simply run "TriPro-ERP.exe" to launch without needing Node.js!');
console.log('============================================================');
