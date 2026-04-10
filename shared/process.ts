export type PortProtocol = 'TCP' | 'UDP';
export type PortOccupancyProtocol = PortProtocol | 'OTHER';
export type KillSignal = 'SIGTERM' | 'SIGKILL';
export type ThemeMode = 'light' | 'dark';
export type NetworkAction = 'flushDns' | 'renewDhcp' | 'restartWifi' | 'deepResetNetwork';

export interface NodeModulesUsageEntry {
  path: string;
  relativePath: string;
  sizeBytes: number;
  lastModifiedAt: string;
}

export interface ScanNodeModulesOptions {
  rootPath: string;
  limit?: number;
}

export interface NodeModulesUsageResult {
  rootPath: string;
  scannedAt: string;
  elapsedMs: number;
  totalSizeBytes: number;
  totalMatches: number;
  entries: NodeModulesUsageEntry[];
}

export interface DeleteNodeModulesResult {
  path: string;
  success: boolean;
  deletedAt: string;
}

export interface OpenFinderResult {
  path: string;
  success: boolean;
  openedAt: string;
}

export interface PortProcess {
  pid: number;
  command: string;
  user: string;
  protocol: PortProtocol;
  endpoints: string[];
}

export interface PortOccupancyDetail {
  pid: number;
  command: string;
  user: string;
  fd: string;
  type: string;
  device: string;
  sizeOff: string;
  node: string;
  name: string;
  protocol: PortOccupancyProtocol;
  state: string | null;
}

export interface LookupPortResult {
  port: number;
  processes: PortProcess[];
  details: PortOccupancyDetail[];
  queriedAt: string;
}

export interface KillProcessResult {
  pid: number;
  signal: KillSignal;
  success: boolean;
}

export interface RepairAppSignatureResult {
  path: string;
  command: string;
  success: boolean;
  repairedAt: string;
}

export interface RunNetworkActionOptions {
  interfaceName?: string;
  serviceName?: string;
}

export interface NetworkActionResult {
  action: NetworkAction;
  command: string;
  success: boolean;
  executedAt: string;
  summary: string;
  restartRecommended: boolean;
  interfaceName?: string;
  serviceName?: string;
}

export interface ProcessToolApi {
  lookupPort: (port: number) => Promise<LookupPortResult>;
  killProcess: (pid: number, signal?: KillSignal) => Promise<KillProcessResult>;
  selectApplicationPath: () => Promise<string | null>;
  selectDirectoryPath: () => Promise<string | null>;
  repairAppSignature: (targetPath: string) => Promise<RepairAppSignatureResult>;
  runNetworkAction: (
    action: NetworkAction,
    options?: RunNetworkActionOptions,
  ) => Promise<NetworkActionResult>;
  scanNodeModulesUsage: (
    options: ScanNodeModulesOptions,
  ) => Promise<NodeModulesUsageResult>;
  openInFinder: (
    targetPath: string,
  ) => Promise<OpenFinderResult>;
  deleteNodeModulesDirectory: (
    targetPath: string,
  ) => Promise<DeleteNodeModulesResult>;
  setWindowTheme: (themeMode: ThemeMode) => Promise<void>;
}

export const QUICK_PORTS = [3000, 5173, 7001, 8080, 9000] as const;
