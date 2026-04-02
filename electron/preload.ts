import { contextBridge, ipcRenderer } from 'electron';

import type { KillSignal, ProcessToolApi, ThemeMode } from '../shared/process';

const api: ProcessToolApi = {
  lookupPort: (port) => ipcRenderer.invoke('process:lookup', port),
  killProcess: (pid, signal: KillSignal = 'SIGKILL') =>
    ipcRenderer.invoke('process:kill', pid, signal),
  setWindowTheme: (themeMode: ThemeMode) => ipcRenderer.invoke('window:set-theme', themeMode),
};

contextBridge.exposeInMainWorld('processQuery', api);
