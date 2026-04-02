export type PortProtocol = 'TCP' | 'UDP';
export type PortOccupancyProtocol = PortProtocol | 'OTHER';
export type KillSignal = 'SIGTERM' | 'SIGKILL';
export type ThemeMode = 'light' | 'dark';

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

export interface ProcessToolApi {
  lookupPort: (port: number) => Promise<LookupPortResult>;
  killProcess: (pid: number, signal?: KillSignal) => Promise<KillProcessResult>;
  setWindowTheme: (themeMode: ThemeMode) => Promise<void>;
}

export const QUICK_PORTS = [3000, 5173, 7001, 8080, 9000] as const;
