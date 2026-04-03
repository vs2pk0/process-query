import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import type { BrowserWindow } from 'electron';
import { dialog } from 'electron';

import type {
  NetworkAction,
  NetworkActionResult,
  RepairAppSignatureResult,
  RunNetworkActionOptions,
} from '../shared/process';

const execFileAsync = promisify(execFile);
const DEFAULT_NETWORK_INTERFACE = 'en0';
const DEFAULT_WIFI_SERVICE = 'Wi-Fi';
const NETWORK_CONFIGURATION_FILES = [
  '/Library/Preferences/SystemConfiguration/NetworkInterfaces.plist',
  '/Library/Preferences/SystemConfiguration/preferences.plist',
] as const;

function trimWrappingQuotes(rawPath: string): string {
  const normalized = rawPath.trim();

  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    return normalized.slice(1, -1);
  }

  return normalized;
}

function normalizeTargetPath(rawPath: string): string {
  const strippedPath = trimWrappingQuotes(rawPath);

  if (!strippedPath) {
    throw new Error('请先选择应用程序，或者手动输入需要修复的路径。');
  }

  const expandedPath = strippedPath.startsWith('~/')
    ? path.join(os.homedir(), strippedPath.slice(2))
    : strippedPath;
  const resolvedPath = path.isAbsolute(expandedPath)
    ? path.normalize(expandedPath)
    : path.resolve(expandedPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`没有找到目标路径：${resolvedPath}`);
  }

  return resolvedPath;
}

function toAppleScriptString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function quoteForShell(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function runAppleScript(script: string, canceledMessage: string): Promise<void> {
  try {
    await execFileAsync('osascript', ['-e', script]);
  } catch (error) {
    const execError = error as NodeJS.ErrnoException & {
      stderr?: string;
      stdout?: string;
    };
    const stderr = typeof execError.stderr === 'string' ? execError.stderr.trim() : '';
    const message = stderr || execError.message || '执行修复命令失败';

    if (message.includes('User canceled')) {
      throw new Error(canceledMessage);
    }

    throw new Error(message);
  }
}

async function runCommandAsAdministrator(
  shellCommand: string,
  canceledMessage: string,
): Promise<void> {
  const script = `do shell script ${toAppleScriptString(shellCommand)} with administrator privileges`;
  await runAppleScript(script, canceledMessage);
}

export async function selectApplicationPath(window: BrowserWindow): Promise<string | null> {
  const result = await dialog.showOpenDialog(window, {
    title: '选择需要修复的应用程序',
    buttonLabel: '选择应用程序',
    properties: ['openFile'],
    filters: [{ name: '应用程序', extensions: ['app'] }],
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0] ?? null;
}

export async function repairAppSignature(targetPath: string): Promise<RepairAppSignatureResult> {
  const normalizedPath = normalizeTargetPath(targetPath);
  const command = `sudo xattr -rd com.apple.quarantine ${JSON.stringify(normalizedPath)}`;
  const shellCommand = `/usr/bin/xattr -rd com.apple.quarantine ${quoteForShell(normalizedPath)}`;

  await runCommandAsAdministrator(shellCommand, '你取消了管理员授权，签名修复没有执行。');

  return {
    path: normalizedPath,
    command,
    success: true,
    repairedAt: new Date().toISOString(),
  };
}

function buildNetworkAction(action: NetworkAction, options: RunNetworkActionOptions = {}) {
  const interfaceName = (options.interfaceName ?? DEFAULT_NETWORK_INTERFACE).trim();
  const serviceName = (options.serviceName ?? DEFAULT_WIFI_SERVICE).trim();

  switch (action) {
    case 'flushDns':
      return {
        command: 'sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder',
        shellCommand: '/usr/bin/dscacheutil -flushcache; /usr/bin/killall -HUP mDNSResponder',
        summary: 'DNS 缓存已清理，同时 mDNSResponder 已重新加载。',
        restartRecommended: false,
      };
    case 'renewDhcp':
      if (!interfaceName) {
        throw new Error('请先填写网络接口名称，例如 en0。');
      }

      return {
        command: `sudo ipconfig set ${interfaceName} DHCP`,
        shellCommand: `/usr/sbin/ipconfig set ${quoteForShell(interfaceName)} DHCP`,
        summary: `${interfaceName} 已请求重新获取 DHCP 租约。`,
        restartRecommended: false,
        interfaceName,
      };
    case 'restartWifi':
      if (!serviceName) {
        throw new Error('请先填写 Wi‑Fi 服务名称，例如 Wi-Fi。');
      }

      return {
        command: [
          `networksetup -setnetworkserviceenabled ${JSON.stringify(serviceName)} off`,
          `networksetup -setnetworkserviceenabled ${JSON.stringify(serviceName)} on`,
        ].join('\n'),
        shellCommand: [
          `/usr/sbin/networksetup -setnetworkserviceenabled ${quoteForShell(serviceName)} off`,
          `/usr/sbin/networksetup -setnetworkserviceenabled ${quoteForShell(serviceName)} on`,
        ].join(' && '),
        summary: `${serviceName} 已执行关闭再打开。`,
        restartRecommended: false,
        serviceName,
      };
    case 'deepResetNetwork':
      return {
        command: NETWORK_CONFIGURATION_FILES.map((filePath) => `sudo rm ${filePath}`).join('\n'),
        shellCommand: NETWORK_CONFIGURATION_FILES.map(
          (filePath) => `/bin/rm -f ${quoteForShell(filePath)}`,
        ).join(' && '),
        summary: '网络配置文件已移除，系统会在重启后自动重建网络配置。',
        restartRecommended: true,
      };
    default: {
      const exhaustiveCheck: never = action;
      throw new Error(`不支持的网络修复动作：${exhaustiveCheck}`);
    }
  }
}

export async function runNetworkAction(
  action: NetworkAction,
  options: RunNetworkActionOptions = {},
): Promise<NetworkActionResult> {
  const actionConfig = buildNetworkAction(action, options);

  await runCommandAsAdministrator(actionConfig.shellCommand, '你取消了管理员授权，网络修复没有执行。');

  return {
    action,
    command: actionConfig.command,
    success: true,
    executedAt: new Date().toISOString(),
    summary: actionConfig.summary,
    restartRecommended: actionConfig.restartRecommended,
    interfaceName: actionConfig.interfaceName,
    serviceName: actionConfig.serviceName,
  };
}
