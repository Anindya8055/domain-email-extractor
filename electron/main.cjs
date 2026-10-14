const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow = null;
let backendProcess = null;

const API_PORT = 4000;
const API_HOST = '127.0.0.1';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttp(url, timeoutMs = 30000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await wait(1000);
  }

  return false;
}

function ensureConfigPath() {
  const configDir = path.join(app.getPath('appData'), 'domain-email-extractor', 'config');
  const configPath = path.join(configDir, 'settings.json');

  fs.mkdirSync(configDir, { recursive: true });

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, '{}', 'utf8');
  }

  return configPath;
}

async function ensureBackend() {
  const healthUrl = `http://${API_HOST}:${API_PORT}/api/health`;

  const alreadyRunning = await waitForHttp(healthUrl, 2000);
  if (alreadyRunning) {
    console.log('[electron] Backend already running, reusing existing process');
    return;
  }

  let serverRoot;
  if (app.isPackaged) {
    serverRoot = path.join(process.resourcesPath, 'server');
  } else {
    serverRoot = path.join(process.cwd(), 'server');
  }

  const serverEntry = path.join(serverRoot, 'index.js');
  const appConfigPath = ensureConfigPath();

  if (!fs.existsSync(serverEntry)) {
    throw new Error(`server/index.js not found: ${serverEntry}`);
  }

  console.log('Starting backend from:', serverEntry);
  console.log('Using app config file:', appConfigPath);

  backendProcess = spawn(process.execPath, [serverEntry], {
    cwd: serverRoot,
    env: {
      ...process.env,
      PATH: process.env.PATH,
      PORT: String(API_PORT),
      APP_CONFIG_PATH: appConfigPath,
      DATA_DIR: app.getPath('userData'),
      NODE_ENV: app.isPackaged ? 'production' : 'development',
      ELECTRON_RUN_AS_NODE: '1'
    },
    stdio: 'inherit',
    windowsHide: true
  });

  backendProcess.on('error', (err) => {
    console.error('Backend process error:', err);
  });

  backendProcess.on('exit', (code, signal) => {
    console.log(`Backend exited with code=${code} signal=${signal}`);
  });

  const backendReady = await waitForHttp(healthUrl, 30000);
  if (!backendReady) {
    throw new Error(`Backend did not become ready at ${healthUrl}`);
  }
}

function resolveFrontendIndex() {
  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, 'app.asar', 'client', 'dist', 'index.html'),
        path.join(process.resourcesPath, 'client', 'dist', 'index.html')
      ]
    : [
        path.join(process.cwd(), 'client', 'dist', 'index.html')
      ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error(`Frontend index not found. Tried:\n${candidates.join('\n')}`);
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    backgroundColor: '#07111f',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  const apiBase = `http://${API_HOST}:${API_PORT}/api`;
  const indexPath = resolveFrontendIndex();

  console.log('[electron] Loading file:', indexPath);

  await mainWindow.loadFile(indexPath, {
    query: { apiBase }
  });
}

app.whenReady().then(async () => {
  try {
    await ensureBackend();
    await createWindow();
  } catch (err) {
    console.error('Electron startup failed:', err);
    app.quit();
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
});