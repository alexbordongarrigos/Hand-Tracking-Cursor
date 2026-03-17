import { app, BrowserWindow, ipcMain, systemPreferences } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let backendProcess: any = null;

const isDev = !app.isPackaged;

function createWindow() {
  const iconPath = isDev 
    ? path.join(__dirname, '../build/icon.png')
    : path.join(process.resourcesPath, 'build/icon.png');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    title: "Neural Cursor",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: '#000000',
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (backendProcess) backendProcess.kill();
  });
}

async function ensureDependencies(): Promise<boolean> {
  log('Checking Python dependencies...');
  try {
    return new Promise((resolve) => {
      // Check for both libraries in one go
      const check = spawn('python3', ['-c', 'import pyautogui, pynput; print("OK")']);
      check.on('close', (code) => {
        log(`Dependency check exited with code ${code}`);
        resolve(code === 0);
      });
      check.on('error', (err) => {
        log(`Dependency check error: ${err.message}`);
        resolve(false);
      });
    });
  } catch (err) {
    log(`Failed to ensure dependencies: ${err}`);
    return false;
  }
}

async function installDependencies(): Promise<boolean> {
  log('Installing missing Python dependencies...');
  return new Promise(async (resolve) => {
    try {
      // Step 1: Update pip (crucial for some builds to succeed)
      log('Updating pip...');
      await new Promise((res) => {
        const up = spawn('python3', ['-m', 'pip', 'install', '--upgrade', 'pip']);
        up.on('close', res);
      });

      // Step 2: Install pyobjc explicitly (pyautogui depends on it and it often fails if not pre-installed)
      log('Installing pyobjc components...');
      await new Promise((res) => {
        const objc = spawn('python3', ['-m', 'pip', 'install', 'pyobjc-core', 'pyobjc-framework-Quartz']);
        objc.on('close', res);
      });

      // Step 3: Install main dependencies
      const install = spawn('python3', ['-m', 'pip', 'install', 'pyautogui', 'pynput']);
      
      install.stdout?.on('data', (data) => log(`[Pip-Stdout] ${data}`));
      install.stderr?.on('data', (data) => log(`[Pip-Stderr] ${data}`));
      
      install.on('close', (code) => {
        log(`Installation finished with code ${code}`);
        resolve(code === 0);
      });
      
      install.on('error', (err) => {
        log(`Installation error: ${err.message}`);
        resolve(false);
      });
    } catch (e) {
      log(`Execution error during installation: ${e}`);
      resolve(false);
    }
  });
}

const logFile = '/tmp/neural_cursor.log';
function log(msg: string) {
  const line = `[${new Date().toISOString()}] [Main] ${msg}\n`;
  fs.appendFileSync(logFile, line);
  console.log(msg);
}

function startBackend() {
  if (backendProcess) {
    log('Backend already running, skipping start.');
    return;
  }

  const serverScript = isDev 
    ? path.join(__dirname, 'mouse_controller.py') 
    : path.join(process.resourcesPath, 'electron/mouse_controller.py');

  log(`Attempting to start backend: ${serverScript}`);

  if (!fs.existsSync(serverScript)) {
    log(`ERROR: Backend script not found at ${serverScript}`);
    return;
  }

  // Check for common Python locations or use the environment path
  const pythonBin = fs.existsSync('/usr/bin/python3') 
    ? '/usr/bin/python3' 
    : (fs.existsSync('/usr/local/bin/python3') ? '/usr/local/bin/python3' : 'python3');

  backendProcess = spawn(pythonBin, [serverScript], {
    cwd: path.dirname(serverScript),
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { 
      ...process.env, 
      PYTHONUNBUFFERED: '1',
      RESOURCES_PATH: process.resourcesPath
    }
  });

  backendProcess.stdout?.on('data', (data: any) => {
    log(`[Backend-Stdout] ${data.toString().trim()}`);
  });

  backendProcess.stderr?.on('data', (data: any) => {
    log(`[Backend-Stderr] ${data.toString().trim()}`);
  });

  backendProcess.on('exit', (code: number) => {
    log(`Backend process exited with code ${code}`);
    backendProcess = null;
  });

  backendProcess.on('error', (err: any) => {
    log(`ERROR: Failed to start backend process: ${err.message}`);
    backendProcess = null;
  });
}

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}

app.whenReady().then(async () => {
  createWindow();
  
  // Automate Permission Check & Installation
  const perms = {
    accessibility: systemPreferences.isTrustedAccessibilityClient(false),
    camera: systemPreferences.getMediaAccessStatus('camera')
  };
  
  // Proactively challenge for camera if not determined
  if (perms.camera === 'not-determined') {
    systemPreferences.askForMediaAccess('camera');
  }

  if (!perms.accessibility) {
    mainWindow?.webContents.on('did-finish-load', () => {
      mainWindow?.webContents.send('request-accessibility');
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('check-permissions', async () => {
  const accessibility = systemPreferences.isTrustedAccessibilityClient(false);
  const camera = systemPreferences.getMediaAccessStatus('camera');
  const deps = await ensureDependencies();
  log(`[Main] Status Check -> Accessibility: ${accessibility}, Camera: ${camera}, Deps: ${deps}`);
  return { accessibility, camera, dependencies: deps };
});

ipcMain.handle('request-permissions', async () => {
  console.log('[Main] Requesting Camera access...');
  const cameraStatus = await systemPreferences.askForMediaAccess('camera');
  
  const accessibilityStatus = systemPreferences.isTrustedAccessibilityClient(false);
  console.log(`[Main] Accessibility Status: ${accessibilityStatus ? 'GRANTED' : 'DENIED'}`);
  
  if (!accessibilityStatus) {
    console.log('[Main] Accessibility not granted, opening System Settings...');
    spawn('open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility']);
  }
  
  return { camera: cameraStatus, accessibility: accessibilityStatus };
});

ipcMain.handle('request-camera', async () => {
  return await systemPreferences.askForMediaAccess('camera');
});

ipcMain.handle('open-accessibility', () => {
  spawn('open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility']);
});

ipcMain.handle('reset-accessibility-permissions', async () => {
  console.log('[Main] Resetting Accessibility permissions via tccutil...');
  return new Promise((resolve) => {
    // com.neuralcursor.app is the appId in package.json
    const reset = spawn('tccutil', ['reset', 'Accessibility', 'com.neuralcursor.app']);
    
    reset.on('exit', (code) => {
      console.log(`[Main] tccutil reset exited with code ${code}`);
      resolve(code === 0);
    });
    
    reset.on('error', (err) => {
      console.error('[Main] Failed to run tccutil:', err);
      resolve(false);
    });
  });
});

ipcMain.handle('open-camera-settings', () => {
  spawn('open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_Camera']);
});

ipcMain.handle('start-installation', async () => {
  log('[Main] Starting automated dependency installation...');
  const success = await installDependencies();
  return success;
});

ipcMain.handle('toggle-system', async (_event, enabled) => {
  if (enabled) {
    startBackend();
    return true;
  } else {
    stopBackend();
    return true;
  }
});

ipcMain.on('sync-action', (_event, data) => {
  if (backendProcess && backendProcess.stdin) {
    backendProcess.stdin.write(JSON.stringify(data) + '\n');
  }
});

