export type PortProtocol = 'TCP' | 'UDP';
export type PortOccupancyProtocol = PortProtocol | 'OTHER';
export type KillSignal = 'SIGTERM' | 'SIGKILL';
export type ThemeMode = 'light' | 'dark';
export type NetworkAction = 'flushDns' | 'renewDhcp' | 'restartWifi' | 'deepResetNetwork';

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
  repairAppSignature: (targetPath: string) => Promise<RepairAppSignatureResult>;
  runNetworkAction: (
    action: NetworkAction,
    options?: RunNetworkActionOptions,
  ) => Promise<NetworkActionResult>;
  setWindowTheme: (themeMode: ThemeMode) => Promise<void>;
}

export const QUICK_PORTS = [3000, 5173, 7001, 8080, 9000] as const;
