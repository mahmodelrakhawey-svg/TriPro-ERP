/**
 * ==============================================================================
 * TriPro ERP - Desktop Standalone Runner (Electron Native Window)
 * ==============================================================================
 */

const { app, BrowserWindow, Menu, session } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const os = require('os');

// ✅ تحديد مجلد userData مخصص وقابل للكتابة أولاً قبل طلب القفل الأحادي
const userDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'TriProERP');
try { fs.mkdirSync(userDataPath, { recursive: true }); } catch (_) {}
app.setPath('userData', userDataPath);

// ✅ التأكد من تشغيل نسخة واحدة فقط من التطبيق لمنع تعارض الكاش والملفات
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[TriPro] نسخة أخرى من التطبيق تعمل بالفعل في الخلفية.');
  app.quit();
  process.exit(0);
}

// ✅ تعطيل GPU disk cache لمنع أخطاء Chromium
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// تعطيل تحذيرات بيئة التطوير
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

let mainWindow = null;
let localServer = null;
const { execSync } = require('child_process');

// ✅ يقتل أي عملية سابقة عالقة على المنفذ مع حماية العملية الحالية
function killPort(port) {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'ignore'] });
    out.trim().split('\n').forEach(line => {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid)) {
        const numPid = parseInt(pid, 10);
        // حماية العملية الحالية وعملية cmd الأب والنظام
        if (numPid > 4 && numPid !== process.pid && numPid !== process.ppid) {
          try { execSync(`taskkill /F /PID ${numPid}`, { stdio: 'ignore', timeout: 2000 }); } catch (_) {}
        }
      }
    });
  } catch (_) {}
}

function createHttpHandler() {
  const distPath = path.join(__dirname, '../dist');
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2'
  };

  return (req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/') reqPath = '/index.html';
    let filePath = path.join(distPath, reqPath);

    // إذا لم يكن الملف موجوداً:
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      // إذا كان الطلب لملف استاتيكي مفقود (ملف JS أو CSS أو صورة)، نرجع 404 لمنع إعادة توجيهه لـ index.html وانهيار الجافاسكربت
      const ext = path.extname(reqPath);
      if (reqPath.startsWith('/assets/') || ext) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end('Asset not found');
        return;
      }
      // للمسارات التوجيهية لـ SPA فقط، يتم توجيهها لـ index.html
      filePath = path.join(distPath, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    fs.readFile(filePath, (err, content) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
      res.end(content);
    });
  };
}

function startLocalDistServer() {
  const FIXED_PORT = 13731;

  // تنظيف أي عملية سابقة عالقة
  killPort(FIXED_PORT);

  return new Promise((resolve) => {
    let resolved = false;
    const safeResolve = (port) => {
      if (!resolved) {
        resolved = true;
        resolve(port);
      }
    };

    const handler = createHttpHandler();
    localServer = http.createServer(handler);

    localServer.on('error', (err) => {
      console.log(`[TriPro] Server notification (${err.code}), using available port...`);
      try { localServer.close(); } catch (_) {}
      const fallback = http.createServer(handler);
      fallback.listen(0, '127.0.0.1', () => {
        localServer = fallback;
        safeResolve(fallback.address().port);
      });
    });

    localServer.listen(FIXED_PORT, '127.0.0.1', () => {
      safeResolve(FIXED_PORT);
    });

    // صمام أمان زمني لضمان عدم تعليق التحميل
    setTimeout(() => {
      if (!resolved && localServer && localServer.address()) {
        safeResolve(localServer.address().port || FIXED_PORT);
      }
    }, 2500);
  });
}


async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: true,
    backgroundColor: '#0f172a',
    title: 'TriPro ERP - نظام إدارة وتخطيط المؤسسات المتكامل',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  Menu.setApplicationMenu(null);

  // زر F12 لفتح أدوات المطور عند الحاجة
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  // معالجة أخطاء فشل التحميل وإعادة المحاولة تلقائياً
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.warn(`[TriPro] فشل تحميل الصفحة (${errorCode}: ${errorDescription}) على ${validatedURL}، جاري إعادة المحاولة...`);
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(`http://127.0.0.1:${port}/index.html`).catch(() => {});
      }
    }, 1500);
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('[TriPro] توقفت عملية العرض:', details.reason);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.reload();
    }
  });

  const port = await startLocalDistServer();
  mainWindow.loadURL(`http://127.0.0.1:${port}/index.html`);

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (localServer) {
      try { localServer.close(); } catch (_) {}
    }
  });
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  // ✅ السماح بكل أذونات التخزين (IndexedDB, localStorage, etc.) في Electron
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(true);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (localServer) {
    try { localServer.close(); } catch (_) {}
  }
  if (process.platform !== 'darwin') app.quit();
});
