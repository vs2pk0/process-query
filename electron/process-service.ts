import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type {
  KillProcessResult,
  KillSignal,
  LookupPortResult,
  PortOccupancyDetail,
  PortProcess,
  PortProtocol,
} from '../shared/process';

const execFileAsync = promisify(execFile);

function validatePort(port: number): number {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('端口号必须是 1 到 65535 之间的整数');
  }

  return port;
}

function validatePid(pid: number): number {
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error('PID 必须是大于 0 的整数');
  }

  return pid;
}

async function runLsof(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('lsof', args);
    return stdout;
  } catch (error) {
    const execError = error as NodeJS.ErrnoException & {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    const stderr = typeof execError.stderr === 'string' ? execError.stderr.trim() : '';
    const stdout = typeof execError.stdout === 'string' ? execError.stdout : '';

    if (execError.code === 1 && !stderr) {
      return stdout;
    }

    throw new Error(stderr || execError.message || '执行 lsof 失败');
  }
}

function parseLsofOutput(stdout: string, protocol: PortProtocol): PortProcess[] {
  const processMap = new Map<string, PortProcess>();
  let currentKey = '';

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const prefix = line[0];
    const value = line.slice(1).trim();

    if (prefix === 'p') {
      const pid = Number(value);

      if (!Number.isInteger(pid)) {
        currentKey = '';
        continue;
      }

      currentKey = `${protocol}:${pid}`;

      if (!processMap.has(currentKey)) {
        processMap.set(currentKey, {
          pid,
          command: '未知进程',
          user: 'unknown',
          protocol,
          endpoints: [],
        });
      }

      continue;
    }

    const currentProcess = processMap.get(currentKey);

    if (!currentProcess) {
      continue;
    }

    if (prefix === 'c' && value) {
      currentProcess.command = value;
      continue;
    }

    if (prefix === 'L' && value) {
      currentProcess.user = value;
      continue;
    }

    if (prefix === 'n' && value && !currentProcess.endpoints.includes(value)) {
      currentProcess.endpoints.push(value);
    }
  }

  return Array.from(processMap.values());
}

function detectOccupancyProtocol(node: string, name: string): PortOccupancyDetail['protocol'] {
  if (node === 'TCP' || name.startsWith('TCP ')) {
    return 'TCP';
  }

  if (node === 'UDP' || name.startsWith('UDP ')) {
    return 'UDP';
  }

  return 'OTHER';
}

function parseLsofTable(stdout: string): PortOccupancyDetail[] {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  if (lines.length <= 1) {
    return [];
  }

  const details: PortOccupancyDetail[] = [];

  for (const rawLine of lines.slice(1)) {
    const columns = rawLine.trim().split(/\s+/);

    if (columns.length < 9) {
      continue;
    }

    const [command, pidValue, user, fd, type, device, sizeOff, node, ...nameParts] = columns;
    const pid = Number(pidValue);

    if (!Number.isInteger(pid) || nameParts.length === 0) {
      continue;
    }

    const name = nameParts.join(' ');
    const stateMatch = name.match(/\(([^()]+)\)\s*$/);

    details.push({
      pid,
      command,
      user,
      fd,
      type,
      device,
      sizeOff,
      node,
      name,
      protocol: detectOccupancyProtocol(node, name),
      state: stateMatch?.[1] ?? null,
    });
  }

  return details.sort(
    (left, right) =>
      left.pid - right.pid ||
      left.command.localeCompare(right.command) ||
      left.name.localeCompare(right.name),
  );
}

export async function findProcessesByPort(port: number): Promise<LookupPortResult> {
  const safePort = validatePort(port);
  const tcpArgs = ['-nP', `-iTCP:${safePort}`, '-sTCP:LISTEN', '-F', 'pcLn'];
  const udpArgs = ['-nP', `-iUDP:${safePort}`, '-F', 'pcLn'];
  const detailArgs = ['-nP', `-i:${safePort}`];

  const [tcpOutput, udpOutput, detailOutput] = await Promise.all([
    runLsof(tcpArgs),
    runLsof(udpArgs),
    runLsof(detailArgs),
  ]);
  const processes = [
    ...parseLsofOutput(tcpOutput, 'TCP'),
    ...parseLsofOutput(udpOutput, 'UDP'),
  ].sort((left, right) => left.pid - right.pid || left.protocol.localeCompare(right.protocol));
  const details = parseLsofTable(detailOutput);

  return {
    port: safePort,
    processes,
    details,
    queriedAt: new Date().toISOString(),
  };
}

export async function killProcessByPid(
  pid: number,
  signal: KillSignal = 'SIGKILL',
): Promise<KillProcessResult> {
  const safePid = validatePid(pid);
  const safeSignal = signal === 'SIGTERM' ? 'SIGTERM' : 'SIGKILL';

  try {
    process.kill(safePid, safeSignal);
  } catch (error) {
    const killError = error as NodeJS.ErrnoException;

    if (killError.code === 'ESRCH') {
      throw new Error(`PID ${safePid} 对应的进程不存在`);
    }

    if (killError.code === 'EPERM') {
      throw new Error(`没有权限结束 PID ${safePid}，请使用有足够权限的账户运行此工具`);
    }

    throw new Error(killError.message || `结束 PID ${safePid} 失败`);
  }

  return {
    pid: safePid,
    signal: safeSignal,
    success: true,
  };
}
