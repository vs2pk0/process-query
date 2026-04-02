import { app, BrowserWindow, ipcMain, nativeImage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

import type { KillSignal, ThemeMode } from '../shared/process';
import { findProcessesByPort, killProcessByPid } from './process-service';

const isMac = process.platform === 'darwin';
const appName = '进程查杀';
const DEFAULT_WINDOW_SIZE = {
  width: 1120,
  height: 760,
} as const;
const MIN_WINDOW_SIZE = {
  width: 1080,
  height: 760,
} as const;

function resolveIconPath(): string {
  return path.resolve(__dirname, '../../build/app-icon.png');
}

function getWindowBackgroundColor(themeMode: ThemeMode): string {
  return themeMode === 'light' ? '#eef3fb' : '#07111f';
}

function createMainWindow(): BrowserWindow {
  const iconPath = resolveIconPath();

  const window = new BrowserWindow({
    width: DEFAULT_WINDOW_SIZE.width,
    height: DEFAULT_WINDOW_SIZE.height,
    minWidth: MIN_WINDOW_SIZE.width,
    minHeight: MIN_WINDOW_SIZE.height,
    title: appName,
    backgroundColor: getWindowBackgroundColor('dark'),
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  const productionHtml = path.resolve(__dirname, '../../dist/index.html');

  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(productionHtml);
  }

  return window;
}

app.whenReady().then(() => {
  app.setName(appName);

  const iconPath = resolveIconPath();

  if (isMac && app.dock && fs.existsSync(iconPath)) {
    app.dock.setIcon(nativeImage.createFromPath(iconPath));
  }

  ipcMain.handle('process:lookup', async (_event, port: number) => findProcessesByPort(port));
  ipcMain.handle('process:kill', async (_event, pid: number, signal?: KillSignal) =>
    killProcessByPid(pid, signal),
  );
  ipcMain.handle('window:set-theme', async (event, themeMode: ThemeMode) => {
    const window = BrowserWindow.fromWebContents(event.sender);

    window?.setBackgroundColor(getWindowBackgroundColor(themeMode));
  });

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit();
  }
});
