import { contextBridge, ipcRenderer } from 'electron';

import type {
  KillSignal,
  NetworkAction,
  ProcessToolApi,
  RunNetworkActionOptions,
  ThemeMode,
} from '../shared/process';

const api: ProcessToolApi = {
  lookupPort: (port) => ipcRenderer.invoke('process:lookup', port),
  killProcess: (pid, signal: KillSignal = 'SIGKILL') =>
    ipcRenderer.invoke('process:kill', pid, signal),
  selectApplicationPath: () => ipcRenderer.invoke('tools:select-application'),
  repairAppSignature: (targetPath: string) =>
    ipcRenderer.invoke('tools:repair-app-signature', targetPath),
  runNetworkAction: (action: NetworkAction, options?: RunNetworkActionOptions) =>
    ipcRenderer.invoke('tools:run-network-action', action, options),
  setWindowTheme: (themeMode: ThemeMode) => ipcRenderer.invoke('window:set-theme', themeMode),
};

contextBridge.exposeInMainWorld('processQuery', api);
