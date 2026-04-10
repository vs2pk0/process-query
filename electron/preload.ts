import { contextBridge, ipcRenderer } from 'electron';

import type {
  KillSignal,
  NetworkAction,
  ProcessToolApi,
  RunNetworkActionOptions,
  ScanNodeModulesOptions,
  ThemeMode,
} from '../shared/process';

const api: ProcessToolApi = {
  lookupPort: (port) => ipcRenderer.invoke('process:lookup', port),
  killProcess: (pid, signal: KillSignal = 'SIGKILL') =>
    ipcRenderer.invoke('process:kill', pid, signal),
  selectApplicationPath: () => ipcRenderer.invoke('tools:select-application'),
  selectDirectoryPath: () => ipcRenderer.invoke('tools:select-directory'),
  repairAppSignature: (targetPath: string) =>
    ipcRenderer.invoke('tools:repair-app-signature', targetPath),
  runNetworkAction: (action: NetworkAction, options?: RunNetworkActionOptions) =>
    ipcRenderer.invoke('tools:run-network-action', action, options),
  scanNodeModulesUsage: (options: ScanNodeModulesOptions) =>
    ipcRenderer.invoke('tools:scan-node-modules', options),
  openInFinder: (targetPath: string) =>
    ipcRenderer.invoke('tools:open-in-finder', targetPath),
  deleteNodeModulesDirectory: (targetPath: string) =>
    ipcRenderer.invoke('tools:delete-node-modules', targetPath),
  setWindowTheme: (themeMode: ThemeMode) => ipcRenderer.invoke('window:set-theme', themeMode),
};

contextBridge.exposeInMainWorld('processQuery', api);
