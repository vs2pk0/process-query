import type { FormEvent } from 'react';
import { startTransition, useEffect, useState } from 'react';

import type {
  KillSignal,
  LookupPortResult,
  NetworkAction,
  NetworkActionResult,
  PortOccupancyDetail,
  PortProcess,
  RepairAppSignatureResult,
  ThemeMode,
} from '../shared/process';
import { QUICK_PORTS } from '../shared/process';
import brandMark from './assets/brand-mark.svg';

type BannerTone = 'neutral' | 'success' | 'error';
type ViewMode = 'home' | 'settings';
type ToolId = 'process-killer' | 'signature-fix' | 'network-repair';
type AccentPreset = 'iceblue' | 'emerald' | 'sunset' | 'violet';
type ScanHistoryStatus = 'occupied' | 'clear';

interface BannerState {
  tone: BannerTone;
  text: string;
}

interface AppPreferences {
  themeMode: ThemeMode;
  accentPreset: AccentPreset;
}

interface ScanHistoryEntry {
  port: number;
  queriedAt: string;
  processCount: number;
  status: ScanHistoryStatus;
}

interface ToolMeta {
  id: ToolId;
  label: string;
  kicker: string;
  summary: string;
  description: string;
  command: string;
}

interface HeroStat {
  label: string;
  value: string;
}

interface NetworkActionMeta {
  id: NetworkAction;
  label: string;
  description: string;
  command: string;
  tone: 'primary' | 'secondary' | 'danger';
}

const PREFERENCES_STORAGE_KEY = 'process-query.preferences.v1';
const SCAN_HISTORY_STORAGE_KEY = 'process-query.scan-history.v1';
const MAX_SCAN_HISTORY = 8;

const initialProcessBanner: BannerState = {
  tone: 'neutral',
  text: '输入一个端口号，工具会使用 lsof 查询监听进程，并把该端口的相关占用明细一起列出来。',
};

const initialRepairBanner: BannerState = {
  tone: 'neutral',
  text: '选择应用程序，或者手动输入完整路径。执行时会弹出系统管理员授权窗口，用来移除隔离属性。',
};

const initialNetworkBanner: BannerState = {
  tone: 'neutral',
  text: '网络修复动作会弹出系统管理员授权窗口。你可以按顺序尝试清 DNS、更新 DHCP、重启 Wi‑Fi，最后再考虑深度重置。',
};

const DEFAULT_PREFERENCES: AppPreferences = {
  themeMode: 'dark',
  accentPreset: 'iceblue',
};

const VIEW_OPTIONS: Array<{ value: ViewMode; label: string }> = [
  { value: 'home', label: '首页' },
  { value: 'settings', label: '设置' },
];

const TOOL_OPTIONS: ToolMeta[] = [
  {
    id: 'process-killer',
    label: '进程查杀',
    kicker: '端口工具',
    summary: '查询监听端口、查看占用明细，并直接结束对应进程。',
    description: '适合处理开发时常见的端口冲突问题，兼顾监听进程和 lsof 连接明细。',
    command: 'lsof -nP -iTCP:<port> -sTCP:LISTEN',
  },
  {
    id: 'signature-fix',
    label: '签名损坏修复',
    kicker: '应用修复',
    summary: '移除应用的 quarantine 隔离属性，修复“已损坏”或“无法验证来源”的提示。',
    description: '支持选择应用程序，也支持手动粘贴路径，适合处理下载后的 macOS 安全拦截问题。',
    command: 'sudo xattr -rd com.apple.quarantine "<应用路径>"',
  },
  {
    id: 'network-repair',
    label: '网络修复',
    kicker: '网络工具',
    summary: '清理 DNS 缓存、更新 DHCP、重启 Wi‑Fi，并在需要时重置系统网络配置。',
    description: '适合处理能连上网络但无法访问、DNS 异常、Wi‑Fi 卡住或系统网络配置损坏等问题。',
    command: [
      'sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder',
      'sudo ipconfig set en0 DHCP',
    ].join('\n'),
  },
];

const NETWORK_ACTION_OPTIONS: NetworkActionMeta[] = [
  {
    id: 'flushDns',
    label: '清除 DNS 缓存',
    description: '刷新 DNS 缓存并重载 mDNSResponder，适合域名解析异常时先尝试。',
    command: 'sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder',
    tone: 'primary',
  },
  {
    id: 'renewDhcp',
    label: '更新 DHCP 租约',
    description: '让指定网络接口重新获取 IP 地址，适合“已连上但无法上网”的情况。',
    command: 'sudo ipconfig set en0 DHCP',
    tone: 'secondary',
  },
  {
    id: 'restartWifi',
    label: '重启 Wi‑Fi 模块',
    description: '关闭再开启指定 Wi‑Fi 服务，适合无线网络卡住或状态不同步时使用。',
    command: 'networksetup -setnetworkserviceenabled "Wi-Fi" off\nnetworksetup -setnetworkserviceenabled "Wi-Fi" on',
    tone: 'secondary',
  },
  {
    id: 'deepResetNetwork',
    label: '深度重置网络',
    description: '删除系统网络配置文件，适合常规修复都无效时最后使用，执行后需要重启 Mac。',
    command: [
      'sudo rm /Library/Preferences/SystemConfiguration/NetworkInterfaces.plist',
      'sudo rm /Library/Preferences/SystemConfiguration/preferences.plist',
    ].join('\n'),
    tone: 'danger',
  },
];

const THEME_OPTIONS: Array<{
  value: ThemeMode;
  label: string;
  description: string;
}> = [
  {
    value: 'dark',
    label: '深色模式',
    description: '更偏科技感，也更适合长时间盯着开发工具。',
  },
  {
    value: 'light',
    label: '浅色模式',
    description: '更轻盈、更通透，适合白天或高亮环境下使用。',
  },
];

const ACCENT_OPTIONS: Array<{
  value: AccentPreset;
  label: string;
  description: string;
  swatch: string;
}> = [
  {
    value: 'iceblue',
    label: '冰蓝',
    description: '冷静、清晰，适合默认科技风。',
    swatch: 'linear-gradient(135deg, #67deff 0%, #4b81ff 100%)',
  },
  {
    value: 'emerald',
    label: '青绿',
    description: '更偏运维监控感，显得稳一点。',
    swatch: 'linear-gradient(135deg, #5ef0bf 0%, #0ea57d 100%)',
  },
  {
    value: 'sunset',
    label: '日落',
    description: '更有提醒感，适合强调操作反馈。',
    swatch: 'linear-gradient(135deg, #ffbe6b 0%, #ff6d6d 100%)',
  },
  {
    value: 'violet',
    label: '星紫',
    description: '更偏未来感，层次会稍微柔一点。',
    swatch: 'linear-gradient(135deg, #c0a5ff 0%, #746cff 100%)',
  },
];

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

function isAccentPreset(value: unknown): value is AccentPreset {
  return value === 'iceblue' || value === 'emerald' || value === 'sunset' || value === 'violet';
}

function isScanHistoryEntry(value: unknown): value is ScanHistoryEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ScanHistoryEntry>;

  return (
    typeof candidate.port === 'number' &&
    Number.isInteger(candidate.port) &&
    typeof candidate.queriedAt === 'string' &&
    typeof candidate.processCount === 'number' &&
    Number.isInteger(candidate.processCount) &&
    (candidate.status === 'occupied' || candidate.status === 'clear')
  );
}

function loadPreferences(): AppPreferences {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_PREFERENCES };
  }

  try {
    const rawValue = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);

    if (!rawValue) {
      return { ...DEFAULT_PREFERENCES };
    }

    const parsed = JSON.parse(rawValue) as {
      themeMode?: unknown;
      accentPreset?: unknown;
    };

    return {
      themeMode: isThemeMode(parsed.themeMode) ? parsed.themeMode : DEFAULT_PREFERENCES.themeMode,
      accentPreset: isAccentPreset(parsed.accentPreset)
        ? parsed.accentPreset
        : DEFAULT_PREFERENCES.accentPreset,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

function loadScanHistory(): ScanHistoryEntry[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(SCAN_HISTORY_STORAGE_KEY);

    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isScanHistoryEntry).slice(0, MAX_SCAN_HISTORY);
  } catch {
    return [];
  }
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleString('zh-CN', {
    hour12: false,
  });
}

function extractFileName(targetPath: string): string {
  const segments = targetPath.split('/').filter(Boolean);
  return segments.at(-1) ?? targetPath;
}

function getNetworkActionMeta(action: NetworkAction): NetworkActionMeta {
  return NETWORK_ACTION_OPTIONS.find((item) => item.id === action) ?? NETWORK_ACTION_OPTIONS[0];
}

function getActionButtonClassName(tone: NetworkActionMeta['tone']): string {
  if (tone === 'danger') {
    return 'danger-button';
  }

  return tone === 'primary' ? 'primary-button' : 'ghost-button';
}

function App() {
  const [activeView, setActiveView] = useState<ViewMode>('home');
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  const [preferences, setPreferences] = useState<AppPreferences>(loadPreferences);
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>(loadScanHistory);
  const [portInput, setPortInput] = useState('3000');
  const [result, setResult] = useState<LookupPortResult | null>(null);
  const [processBanner, setProcessBanner] = useState<BannerState>(initialProcessBanner);
  const [repairBanner, setRepairBanner] = useState<BannerState>(initialRepairBanner);
  const [networkBanner, setNetworkBanner] = useState<BannerState>(initialNetworkBanner);
  const [repairPath, setRepairPath] = useState('');
  const [networkInterfaceName, setNetworkInterfaceName] = useState('en0');
  const [wifiServiceName, setWifiServiceName] = useState('Wi-Fi');
  const [lastRepairResult, setLastRepairResult] = useState<RepairAppSignatureResult | null>(null);
  const [lastNetworkResult, setLastNetworkResult] = useState<NetworkActionResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [killingPid, setKillingPid] = useState<number | null>(null);
  const [isSelectingApplication, setIsSelectingApplication] = useState(false);
  const [isRepairingSignature, setIsRepairingSignature] = useState(false);
  const [runningNetworkAction, setRunningNetworkAction] = useState<NetworkAction | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = preferences.themeMode;
    document.documentElement.dataset.accent = preferences.accentPreset;

    try {
      window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Ignore persistence failures and keep the app usable.
    }

    void window.processQuery?.setWindowTheme(preferences.themeMode);
  }, [preferences]);

  useEffect(() => {
    try {
      if (scanHistory.length === 0) {
        window.localStorage.removeItem(SCAN_HISTORY_STORAGE_KEY);
        return;
      }

      window.localStorage.setItem(SCAN_HISTORY_STORAGE_KEY, JSON.stringify(scanHistory));
    } catch {
      // Ignore persistence failures and keep the app usable.
    }
  }, [scanHistory]);

  function handleViewChange(viewMode: ViewMode) {
    setActiveView(viewMode);

    if (viewMode === 'home') {
      setActiveTool(null);
    }
  }

  function openTool(toolId: ToolId) {
    setActiveView('home');
    setActiveTool(toolId);
  }

  function recordScan(nextResult: LookupPortResult) {
    const entry: ScanHistoryEntry = {
      port: nextResult.port,
      queriedAt: nextResult.queriedAt,
      processCount: nextResult.processes.length,
      status: nextResult.processes.length > 0 ? 'occupied' : 'clear',
    };

    setScanHistory((current) => {
      const withoutSamePort = current.filter((item) => item.port !== entry.port);
      return [entry, ...withoutSamePort].slice(0, MAX_SCAN_HISTORY);
    });
  }

  async function lookup(portValue?: string | number) {
    const rawValue = String(portValue ?? portInput).trim();
    const parsedPort = Number(rawValue);

    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      setProcessBanner({
        tone: 'error',
        text: '端口号必须是 1 到 65535 之间的整数。',
      });
      return;
    }

    if (!window.processQuery) {
      setProcessBanner({
        tone: 'error',
        text: '没有检测到桌面桥接能力，请确认当前环境通过 Electron 启动。',
      });
      return;
    }

    setPortInput(String(parsedPort));
    setIsLoading(true);
    setProcessBanner({
      tone: 'neutral',
      text: `正在扫描端口 ${parsedPort} ...`,
    });

    try {
      const nextResult = await window.processQuery.lookupPort(parsedPort);

      startTransition(() => {
        setResult(nextResult);
      });

      recordScan(nextResult);

      if (nextResult.processes.length > 0) {
        setProcessBanner({
          tone: 'success',
          text: `端口 ${parsedPort} 已找到 ${nextResult.processes.length} 个监听进程，并返回 ${nextResult.details.length} 条 lsof 明细。`,
        });
      } else if (nextResult.details.length > 0) {
        setProcessBanner({
          tone: 'neutral',
          text: `端口 ${parsedPort} 当前没有监听进程，但找到 ${nextResult.details.length} 条相关占用记录。`,
        });
      } else {
        setProcessBanner({
          tone: 'neutral',
          text: `没有发现监听端口 ${parsedPort} 的 TCP / UDP 进程，也没有相关占用记录。`,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '查询失败，请稍后重试。';
      setProcessBanner({
        tone: 'error',
        text: message,
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleProcessSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await lookup();
  }

  async function handleKill(processItem: PortProcess, signal: KillSignal = 'SIGKILL') {
    if (!window.processQuery) {
      setProcessBanner({
        tone: 'error',
        text: '没有检测到桌面桥接能力，请确认当前环境通过 Electron 启动。',
      });
      return;
    }

    setKillingPid(processItem.pid);
    setProcessBanner({
      tone: 'neutral',
      text: `正在向 PID ${processItem.pid} 发送 ${signal === 'SIGKILL' ? 'kill -9' : 'SIGTERM'} ...`,
    });

    try {
      await window.processQuery.killProcess(processItem.pid, signal);

      setProcessBanner({
        tone: 'success',
        text: `PID ${processItem.pid} 已发送结束信号，正在重新扫描端口 ${result?.port ?? portInput}。`,
      });

      await lookup(result?.port ?? portInput);
    } catch (error) {
      const message = error instanceof Error ? error.message : '结束进程失败，请稍后重试。';
      setProcessBanner({
        tone: 'error',
        text: message,
      });
    } finally {
      setKillingPid(null);
    }
  }

  async function handleSelectApplication() {
    if (!window.processQuery) {
      setRepairBanner({
        tone: 'error',
        text: '没有检测到桌面桥接能力，请确认当前环境通过 Electron 启动。',
      });
      return;
    }

    setIsSelectingApplication(true);

    try {
      const selectedPath = await window.processQuery.selectApplicationPath();

      if (!selectedPath) {
        setRepairBanner({
          tone: 'neutral',
          text: '已取消选择，你也可以直接在下面手动输入应用程序路径。',
        });
        return;
      }

      setRepairPath(selectedPath);
      setRepairBanner({
        tone: 'success',
        text: `已选择应用：${selectedPath}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '打开文件选择器失败，请稍后重试。';
      setRepairBanner({
        tone: 'error',
        text: message,
      });
    } finally {
      setIsSelectingApplication(false);
    }
  }

  async function handleRepairSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!window.processQuery) {
      setRepairBanner({
        tone: 'error',
        text: '没有检测到桌面桥接能力，请确认当前环境通过 Electron 启动。',
      });
      return;
    }

    if (!repairPath.trim()) {
      setRepairBanner({
        tone: 'error',
        text: '请先选择应用程序，或者手动输入需要修复的路径。',
      });
      return;
    }

    setIsRepairingSignature(true);
    setRepairBanner({
      tone: 'neutral',
      text: '正在请求管理员权限并执行隔离属性修复...',
    });

    try {
      const repairResult = await window.processQuery.repairAppSignature(repairPath);

      setLastRepairResult(repairResult);
      setRepairPath(repairResult.path);
      setRepairBanner({
        tone: 'success',
        text: `修复完成：${repairResult.path} 的 quarantine 隔离属性已移除。`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '签名修复失败，请稍后重试。';
      setRepairBanner({
        tone: 'error',
        text: message,
      });
    } finally {
      setIsRepairingSignature(false);
    }
  }

  async function handleRunNetworkAction(action: NetworkAction) {
    if (!window.processQuery) {
      setNetworkBanner({
        tone: 'error',
        text: '没有检测到桌面桥接能力，请确认当前环境通过 Electron 启动。',
      });
      return;
    }

    if (action === 'deepResetNetwork') {
      const confirmed = window.confirm(
        '深度重置网络会删除系统网络配置文件，并且需要你在执行后立即重启 Mac。确定现在继续吗？',
      );

      if (!confirmed) {
        setNetworkBanner({
          tone: 'neutral',
          text: '已取消深度重置网络，你可以先尝试清除 DNS 缓存或重启 Wi‑Fi。',
        });
        return;
      }
    }

    const actionMeta = getNetworkActionMeta(action);

    setRunningNetworkAction(action);
    setNetworkBanner({
      tone: 'neutral',
      text: `正在执行“${actionMeta.label}”，系统可能会弹出管理员授权窗口...`,
    });

    try {
      const nextResult = await window.processQuery.runNetworkAction(action, {
        interfaceName: networkInterfaceName,
        serviceName: wifiServiceName,
      });

      setLastNetworkResult(nextResult);
      setNetworkBanner({
        tone: 'success',
        text: nextResult.restartRecommended
          ? `${nextResult.summary} 请在完成后立即重启 Mac。`
          : nextResult.summary,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '网络修复执行失败，请稍后重试。';
      setNetworkBanner({
        tone: 'error',
        text: message,
      });
    } finally {
      setRunningNetworkAction(null);
    }
  }

  function updateThemeMode(themeMode: ThemeMode) {
    setPreferences((current) => ({
      ...current,
      themeMode,
    }));
  }

  function updateAccentPreset(accentPreset: AccentPreset) {
    setPreferences((current) => ({
      ...current,
      accentPreset,
    }));
  }

  function resetAppearance() {
    setPreferences({ ...DEFAULT_PREFERENCES });
    setProcessBanner({
      tone: 'neutral',
      text: '主题和配色已恢复为默认值。',
    });
  }

  function clearScanHistory() {
    setScanHistory([]);
    setProcessBanner({
      tone: 'success',
      text: '最近缓存记录已清除。',
    });
  }

  const themeMeta =
    THEME_OPTIONS.find((option) => option.value === preferences.themeMode) ?? THEME_OPTIONS[0];
  const accentMeta =
    ACCENT_OPTIONS.find((option) => option.value === preferences.accentPreset) ?? ACCENT_OPTIONS[0];
  const selectedToolMeta = activeTool
    ? TOOL_OPTIONS.find((tool) => tool.id === activeTool) ?? null
    : null;

  const processCount = result?.processes.length ?? 0;
  const detailCount = result?.details.length ?? 0;
  const lastUpdated = result?.queriedAt ? formatTime(result.queriedAt) : '尚未查询';
  const hasSearched = result !== null;
  const hasProcesses = processCount > 0;
  const hasDetails = detailCount > 0;
  const lastRepairTime = lastRepairResult?.repairedAt ? formatTime(lastRepairResult.repairedAt) : '尚未修复';
  const lastNetworkTime = lastNetworkResult?.executedAt
    ? formatTime(lastNetworkResult.executedAt)
    : '尚未执行';
  const lastNetworkActionMeta = lastNetworkResult
    ? getNetworkActionMeta(lastNetworkResult.action)
    : null;
  const cachedPreview = scanHistory.slice(0, 3);
  const emptyTitle = hasSearched ? `端口 ${result?.port} 当前没有监听进程` : '等待新的扫描指令';
  const emptyText = hasSearched
    ? hasDetails
      ? `当前没有检测到监听该端口的 TCP / UDP 进程，不过 lsof 仍返回了 ${detailCount} 条相关记录，例如已建立连接或已关闭连接。`
      : '当前没有检测到监听该端口的 TCP / UDP 进程。如果你刚刚结束过进程，这通常说明端口已经被释放。'
    : '输入一个常见开发端口，例如 3000、5173 或 7001，工具会立刻给出占用情况并支持直接查杀。';
  const resultsTitle = hasProcesses
    ? `已发现 ${processCount} 个监听进程`
    : hasDetails
      ? `端口 ${result?.port} 没有监听进程，但有 ${detailCount} 条相关记录`
      : emptyTitle;
  const resultsDescription = hasProcesses
    ? `当前结果来自端口 ${result?.port}，最近更新时间 ${lastUpdated}。下方同时列出了 lsof 返回的占用明细。`
    : hasDetails
      ? `端口 ${result?.port} 没有处于 LISTEN 状态的进程，但 lsof 仍返回了相关连接记录，你可以继续根据下方明细判断来源。`
      : emptyText;
  const repairResultTitle = lastRepairResult ? '签名损坏修复已完成' : '准备移除应用隔离属性';
  const repairResultText = lastRepairResult
    ? `已对 ${extractFileName(lastRepairResult.path)} 执行 quarantine 清理。如果系统之前提示“已损坏”或“无法验证开发者”，现在可以重新尝试打开。`
    : '当 macOS 拦截刚下载的应用时，这个工具会用管理员权限执行 xattr 修复命令。你可以选择应用程序，也可以直接粘贴完整路径。';
  const networkResultTitle = lastNetworkResult
    ? `${lastNetworkActionMeta?.label ?? '网络修复'} 已执行完成`
    : '常见网络修复动作已就位';
  const networkResultText = lastNetworkResult
    ? lastNetworkResult.restartRecommended
      ? `${lastNetworkResult.summary} 这次操作属于深度重置，执行完成后请立即重启 Mac。`
      : lastNetworkResult.summary
    : '这里把清 DNS、更新 DHCP、重启 Wi‑Fi 和深度重置网络收在一起。建议按从轻到重的顺序尝试，只有最后一项会删除系统网络配置文件。';

  const heroEyebrow =
    activeView === 'settings'
      ? '自定义外观'
      : selectedToolMeta
        ? selectedToolMeta.kicker
        : 'Mac 工具集';
  const heroTitle =
    activeView === 'settings' ? (
      <>
        主题配色，
        <br />
        自己决定。
      </>
    ) : selectedToolMeta ? (
      <>
        {selectedToolMeta.label}
        <br />
        直接开用。
      </>
    ) : (
      <>
        把常用 macOS 修复动作，
        <br />
        收进一个地方。
      </>
    );
  const heroDescription =
    activeView === 'settings'
      ? '你可以手动控制浅色或深色，也可以决定整个工具集的主色风格。设置会保存在当前设备，下次打开自动恢复。'
      : selectedToolMeta
        ? selectedToolMeta.description
        : '现在内置进程查杀、签名损坏修复和网络修复三项工具。查端口、清隔离属性、做网络恢复，都可以在同一个界面里直接完成。';
  const visualTitle =
    activeView === 'settings'
      ? '当前外观预览'
      : activeTool === 'network-repair'
        ? '网络恢复面板'
      : activeTool === 'signature-fix'
        ? '隔离属性修复'
        : activeTool === 'process-killer'
          ? '实时端口态势'
          : '内置三工具工作台';
  const visualDescription =
    activeView === 'settings'
      ? '立刻预览当前主题和配色，不需要重启应用。'
      : activeTool === 'network-repair'
        ? '把 DNS、DHCP、Wi‑Fi 和深度重置整合到一个入口里。'
      : activeTool === 'signature-fix'
        ? '让下载后的应用尽快回到可打开状态。'
        : activeTool === 'process-killer'
          ? '读取本机监听进程，保持轻量、直接、可控。'
          : '首页先介绍工具，再进入具体能力，不把常用动作埋太深。';

  const heroStats: HeroStat[] =
    activeView === 'settings'
      ? [
          { label: '当前主题', value: themeMeta.label },
          { label: '当前主色', value: accentMeta.label },
          { label: '缓存记录', value: `${scanHistory.length} 条` },
        ]
      : activeTool === 'process-killer'
        ? [
            { label: '最近扫描', value: lastUpdated },
            { label: '监听进程', value: `${processCount} 个` },
            { label: '缓存记录', value: `${scanHistory.length} 条` },
          ]
        : activeTool === 'network-repair'
          ? [
              { label: '最近执行', value: lastNetworkTime },
              { label: '网络接口', value: networkInterfaceName.trim() || 'en0' },
              { label: 'Wi‑Fi 服务', value: wifiServiceName.trim() || 'Wi-Fi' },
            ]
        : activeTool === 'signature-fix'
          ? [
              { label: '最近修复', value: lastRepairTime },
              {
                label: '修复目标',
                value: lastRepairResult ? extractFileName(lastRepairResult.path) : '尚未执行',
              },
              { label: '当前主题', value: `${themeMeta.label} · ${accentMeta.label}` },
            ]
          : [
              { label: '工具数量', value: `${TOOL_OPTIONS.length} 个内置工具` },
              { label: '最近扫描', value: lastUpdated },
              { label: '最近网络修复', value: lastNetworkTime },
            ];

  return (
    <div className="shell">
      <div className="backdrop backdrop-left" />
      <div className="backdrop backdrop-right" />
      <div className="grid-overlay" />

      <main className="app">
        <section className="hero card">
          <div className="brand-bar">
            <div className="brand-lockup">
              <img className="brand-mark" src={brandMark} alt="Mac小工具标识" />
              <div className="brand-copy">
                <span className="brand-name">Mac小工具</span>
                <span className="brand-subtitle">Mac Utility Kit for Everyday Fixes</span>
              </div>
            </div>

            <div className="brand-tools">
              <nav className="view-switch" aria-label="页面切换">
                {VIEW_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={`view-switch-button ${
                      activeView === option.value ? 'view-switch-button-active' : ''
                    }`}
                    type="button"
                    onClick={() => handleViewChange(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </nav>

              <div className="hero-pills">
                <span>{themeMeta.label}</span>
                <span>{accentMeta.label}配色</span>
                <span>内置 {TOOL_OPTIONS.length} 个工具</span>
              </div>
            </div>
          </div>

          <div className="hero-body">
            <div className="hero-copy">
              <span className="eyebrow">{heroEyebrow}</span>
              <h1>{heroTitle}</h1>
              <p>{heroDescription}</p>

              {activeView === 'home' && activeTool ? (
                <div className="tool-button-row">
                  <button className="ghost-button" type="button" onClick={() => setActiveTool(null)}>
                    返回工具首页
                  </button>
                </div>
              ) : null}
            </div>

            <div className="hero-visual" aria-hidden="true">
              <div
                className={`signal-orb ${
                  activeView === 'settings' || activeTool === 'signature-fix'
                    ? 'signal-orb-settings'
                    : ''
                }`}
              >
                <span />
                <span />
                <span />
                <i />
              </div>
              <div className="visual-caption">
                <strong>{visualTitle}</strong>
                <span>{visualDescription}</span>
              </div>
            </div>
          </div>

          <div className="stats-grid">
            {heroStats.map((item) => (
              <article className="stat-tile" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>
        </section>

        {activeView === 'home' && activeTool === null ? (
          <section className="tool-grid">
            {TOOL_OPTIONS.map((tool) => (
              <article className="tool-card card" key={tool.id}>
                <div className="tool-card-head">
                  <span className="section-label">{tool.kicker}</span>
                  <h2>{tool.label}</h2>
                  <p>{tool.summary}</p>
                </div>

                <div className="tool-card-command">
                  <span>核心命令</span>
                  <code>{tool.command}</code>
                </div>

                <div className="tool-card-note">
                  {tool.id === 'process-killer'
                    ? scanHistory.length > 0
                      ? `最近扫描端口 ${scanHistory[0]?.port}，当前共保留 ${scanHistory.length} 条缓存记录。`
                      : '还没有端口扫描记录，第一次查询后这里会显示最近缓存。'
                    : tool.id === 'signature-fix'
                      ? lastRepairResult
                        ? `最近一次修复目标是 ${extractFileName(lastRepairResult.path)}，执行时间 ${lastRepairTime}。`
                        : '还没有执行过签名修复，适合处理刚下载应用的“已损坏”提示。'
                      : lastNetworkResult
                        ? `最近执行的是“${lastNetworkActionMeta?.label ?? '网络修复'}”，完成时间 ${lastNetworkTime}。`
                        : '网络异常时可以先清 DNS，再逐步尝试 DHCP、Wi‑Fi 和深度重置。'}
                </div>

                <div className="tool-card-footer">
                  <button className="primary-button" type="button" onClick={() => openTool(tool.id)}>
                    打开工具
                  </button>
                </div>
              </article>
            ))}
          </section>
        ) : null}

        {activeView === 'home' && activeTool === 'process-killer' ? (
          <section className="workspace workspace-process">
            <section className="panel card">
              <div className="panel-heading">
                <div className="section-topline">
                  <span className="section-label">进程查杀</span>
                  <button className="ghost-button" type="button" onClick={() => setActiveTool(null)}>
                    返回首页
                  </button>
                </div>
                <h2>输入端口，立即扫描</h2>
                <p>针对常见开发端口优化，支持快速复查和一键强制结束进程。</p>
              </div>

              <form className="search-form" onSubmit={handleProcessSubmit}>
                <label className="field">
                  <span>端口号</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="例如 3000 / 5173 / 7001"
                    value={portInput}
                    onChange={(event) => setPortInput(event.target.value)}
                  />
                </label>

                <button className="primary-button" type="submit" disabled={isLoading}>
                  {isLoading ? '扫描中...' : '查询占用'}
                </button>
              </form>

              <div className="quick-actions">
                {QUICK_PORTS.map((port) => (
                  <button
                    key={port}
                    className="ghost-button"
                    type="button"
                    onClick={() => {
                      setPortInput(String(port));
                      void lookup(port);
                    }}
                  >
                    扫描 {port}
                  </button>
                ))}
              </div>

              <div className={`banner banner-${processBanner.tone}`}>{processBanner.text}</div>

            </section>

            <section className="results">
              <div className="results-head">
                <span className="section-label">{hasProcesses || hasDetails ? '扫描结果' : '待命区'}</span>
                <h2>{resultsTitle}</h2>
                <p>{resultsDescription}</p>
              </div>

              {hasProcesses ? (
                <div className="results-grid">
                  {result?.processes.map((processItem) => (
                    <article
                      className="process-card card"
                      key={`${processItem.protocol}-${processItem.pid}-${processItem.endpoints.join('|')}`}
                    >
                      <div className="process-header">
                        <div className="process-heading">
                          <span className="protocol-chip">{processItem.protocol}</span>
                          <h3>{processItem.command}</h3>
                          <p>检测到该进程正在占用目标端口，可立即执行强制查杀。</p>
                        </div>

                        <button
                          className="danger-button"
                          type="button"
                          disabled={killingPid === processItem.pid}
                          onClick={() => void handleKill(processItem)}
                        >
                          {killingPid === processItem.pid ? '处理中...' : '立即查杀'}
                        </button>
                      </div>

                      <dl className="process-meta">
                        <div>
                          <dt>PID</dt>
                          <dd>{processItem.pid}</dd>
                        </div>
                        <div>
                          <dt>用户</dt>
                          <dd>{processItem.user}</dd>
                        </div>
                      </dl>

                      <div className="endpoint-block">
                        <span>监听地址</span>
                        <ul className="endpoint-list">
                          {processItem.endpoints.map((endpoint) => (
                            <li key={endpoint}>{endpoint}</li>
                          ))}
                        </ul>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <section className="empty-state card">
                  <div className="empty-mark">
                    <img src={brandMark} alt="" />
                  </div>
                  <span className="empty-eyebrow">{hasDetails ? 'DETAILS' : hasSearched ? 'CLEAR' : 'STANDBY'}</span>
                  <h2>{emptyTitle}</h2>
                  <p>{emptyText}</p>
                </section>
              )}
            </section>

            {hasDetails ? (
              <section className="detail-card detail-card-wide card">
                <div className="detail-head">
                  <div className="detail-heading">
                    <span className="section-label">占用明细</span>
                    <h3>lsof 返回的相关记录</h3>
                    <p>这里会保留端口监听、已建立连接和已关闭连接等信息，方便你对照终端输出继续排查。</p>
                  </div>
                  <div className="detail-summary">
                    <strong>{detailCount} 条记录</strong>
                    <span>来自端口 {result?.port}</span>
                  </div>
                </div>

                <div className="detail-table-wrap">
                  <table className="detail-table">
                    <thead>
                      <tr>
                        <th scope="col">COMMAND</th>
                        <th scope="col">PID</th>
                        <th scope="col">USER</th>
                        <th scope="col">FD</th>
                        <th scope="col">TYPE</th>
                        <th scope="col">NAME</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result?.details.map((detail) => (
                        <tr key={buildDetailRowKey(detail)}>
                          <td>
                            <div className="detail-command-inline">
                              <strong>{detail.command}</strong>
                              {detail.state ? <span className="detail-state">{detail.state}</span> : null}
                            </div>
                          </td>
                          <td>{detail.pid}</td>
                          <td>{detail.user}</td>
                          <td>{detail.fd}</td>
                          <td>
                            <div className="detail-type-inline">
                              <span>{detail.type}</span>
                              <span>{detail.protocol}</span>
                            </div>
                          </td>
                          <td className="detail-name-cell">
                            <code title={detail.name}>{detail.name}</code>
                            <span className="detail-meta-inline">
                              DEVICE {detail.device} · NODE {detail.node} · SIZE/OFF {detail.sizeOff}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            <section className="wide-info-card card">
              <div className="detail-heading">
                <span className="section-label">常用命令</span>
                <h3>查询与查杀速查</h3>
                <p>把查询监听、查看明细和结束进程的常用命令单独放到全宽区域，方便对照工具结果继续手动排查。</p>
              </div>

              <div className="command-hints command-hints-wide">
                <div className="hint-card">
                  <span>查询命令</span>
                  <code>lsof -nP -iTCP:&lt;port&gt; -sTCP:LISTEN</code>
                </div>
                <div className="hint-card">
                  <span>明细命令</span>
                  <code>lsof -nP -i :&lt;port&gt;</code>
                </div>
                <div className="hint-card">
                  <span>结束命令</span>
                  <code>kill -9 &lt;PID&gt;</code>
                </div>
              </div>
            </section>
          </section>
        ) : null}

        {activeView === 'home' && activeTool === 'signature-fix' ? (
          <section className="workspace">
            <section className="panel card">
              <div className="panel-heading">
                <div className="section-topline">
                  <span className="section-label">签名损坏修复</span>
                  <button className="ghost-button" type="button" onClick={() => setActiveTool(null)}>
                    返回首页
                  </button>
                </div>
                <h2>选择应用，执行修复</h2>
                <p>等价于执行 `sudo xattr -rd com.apple.quarantine 应用路径`，适合处理 macOS 拦截下载应用时的“签名损坏”提示。</p>
              </div>

              <form className="search-form" onSubmit={handleRepairSubmit}>
                <label className="field">
                  <span>应用程序路径</span>
                  <input
                    type="text"
                    placeholder="例如 /Applications/YourApp.app"
                    value={repairPath}
                    onChange={(event) => setRepairPath(event.target.value)}
                  />
                </label>

                <div className="tool-button-row">
                  <button
                    className="ghost-button"
                    type="button"
                    disabled={isSelectingApplication}
                    onClick={() => void handleSelectApplication()}
                  >
                    {isSelectingApplication ? '打开中...' : '选择应用程序'}
                  </button>
                  <button className="primary-button" type="submit" disabled={isRepairingSignature}>
                    {isRepairingSignature ? '修复中...' : '执行修复'}
                  </button>
                </div>
              </form>

              <div className={`banner banner-${repairBanner.tone}`}>{repairBanner.text}</div>

              <div className="command-hints">
                <div className="hint-card">
                  <span>修复命令</span>
                  <code>sudo xattr -rd com.apple.quarantine "&lt;应用路径&gt;"</code>
                </div>
                <div className="hint-card">
                  <span>选择方式</span>
                  <code>支持选择应用程序，也支持手动输入路径</code>
                </div>
                <div className="hint-card">
                  <span>权限说明</span>
                  <code>执行时会弹出系统管理员授权窗口</code>
                </div>
              </div>
            </section>

            <section className="results">
              <div className="results-head">
                <span className="section-label">{lastRepairResult ? '修复结果' : '工具说明'}</span>
                <h2>{repairResultTitle}</h2>
                <p>{repairResultText}</p>
              </div>

              {lastRepairResult ? (
                <article className="repair-card card">
                  <div className="process-header">
                    <div className="process-heading">
                      <span className="protocol-chip">REPAIRED</span>
                      <h3>{extractFileName(lastRepairResult.path)}</h3>
                      <p>系统隔离属性已经清理完成，现在可以重新尝试打开应用程序。</p>
                    </div>
                  </div>

                  <dl className="repair-meta">
                    <div>
                      <dt>修复时间</dt>
                      <dd>{formatTime(lastRepairResult.repairedAt)}</dd>
                    </div>
                    <div>
                      <dt>目标路径</dt>
                      <dd className="repair-path">{lastRepairResult.path}</dd>
                    </div>
                  </dl>

                  <div className="endpoint-block">
                    <span>实际执行命令</span>
                    <div className="repair-command">
                      <code>{lastRepairResult.command}</code>
                    </div>
                  </div>
                </article>
              ) : (
                <section className="empty-state card">
                  <div className="empty-mark">
                    <img src={brandMark} alt="" />
                  </div>
                  <span className="empty-eyebrow">REPAIR</span>
                  <h2>先选中一个应用试试看</h2>
                  <p>如果 macOS 提示应用“已损坏”或“无法验证开发者”，通常是因为应用带着 quarantine 隔离属性。这个工具会在你确认管理员权限后帮你移除它。</p>
                </section>
              )}
            </section>
          </section>
        ) : null}

        {activeView === 'home' && activeTool === 'network-repair' ? (
          <section className="workspace">
            <section className="panel card">
              <div className="panel-heading">
                <div className="section-topline">
                  <span className="section-label">网络修复</span>
                  <button className="ghost-button" type="button" onClick={() => setActiveTool(null)}>
                    返回首页
                  </button>
                </div>
                <h2>从轻到重，逐步恢复网络</h2>
                <p>把清理 DNS、更新 DHCP、重启 Wi‑Fi 和深度重置网络收在一起。建议优先执行前面三项，只有最后一项会删除系统网络配置文件。</p>
              </div>

              <div className="search-form">
                <label className="field">
                  <span>网络接口名称</span>
                  <input
                    type="text"
                    placeholder="例如 en0 / en1"
                    value={networkInterfaceName}
                    onChange={(event) => setNetworkInterfaceName(event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Wi‑Fi 服务名称</span>
                  <input
                    type="text"
                    placeholder="例如 Wi-Fi"
                    value={wifiServiceName}
                    onChange={(event) => setWifiServiceName(event.target.value)}
                  />
                </label>
              </div>

              <div className="action-grid">
                {NETWORK_ACTION_OPTIONS.map((actionOption) => (
                  <button
                    key={actionOption.id}
                    className={`${getActionButtonClassName(actionOption.tone)} action-button`}
                    type="button"
                    disabled={runningNetworkAction !== null}
                    onClick={() => void handleRunNetworkAction(actionOption.id)}
                  >
                    {runningNetworkAction === actionOption.id ? '执行中...' : actionOption.label}
                  </button>
                ))}
              </div>

              <div className={`banner banner-${networkBanner.tone}`}>{networkBanner.text}</div>

              <div className="command-hints">
                {NETWORK_ACTION_OPTIONS.map((actionOption) => (
                  <div className="hint-card" key={actionOption.id}>
                    <span>{actionOption.label}</span>
                    <code>{actionOption.command}</code>
                  </div>
                ))}
              </div>

              <div className="notice-card">
                <span>深度重置提醒</span>
                <p>“深度重置网络”会删除系统网络配置文件，执行完成后必须重启 Mac。重启后如果你使用的是 Wi‑Fi，可能需要重新选择网络并输入密码。</p>
              </div>
            </section>

            <section className="results">
              <div className="results-head">
                <span className="section-label">{lastNetworkResult ? '执行结果' : '工具说明'}</span>
                <h2>{networkResultTitle}</h2>
                <p>{networkResultText}</p>
              </div>

              {lastNetworkResult ? (
                <article className="repair-card card">
                  <div className="process-header">
                    <div className="process-heading">
                      <span className="protocol-chip">NETWORK</span>
                      <h3>{lastNetworkActionMeta?.label ?? '网络修复'}</h3>
                      <p>{lastNetworkResult.summary}</p>
                    </div>
                  </div>

                  <dl className="repair-meta network-meta">
                    <div>
                      <dt>执行时间</dt>
                      <dd>{formatTime(lastNetworkResult.executedAt)}</dd>
                    </div>
                    <div>
                      <dt>网络接口</dt>
                      <dd>{lastNetworkResult.interfaceName ?? '本次操作未使用'}</dd>
                    </div>
                    <div>
                      <dt>Wi‑Fi 服务</dt>
                      <dd>{lastNetworkResult.serviceName ?? '本次操作未使用'}</dd>
                    </div>
                    <div>
                      <dt>重启要求</dt>
                      <dd>{lastNetworkResult.restartRecommended ? '需要立即重启 Mac' : '无需重启'}</dd>
                    </div>
                  </dl>

                  <div className="endpoint-block">
                    <span>实际执行命令</span>
                    <div className="repair-command">
                      <code>{lastNetworkResult.command}</code>
                    </div>
                  </div>

                  {lastNetworkResult.restartRecommended ? (
                    <div className="banner banner-neutral">
                      这次执行的是深度重置网络。为了让系统重新生成网络配置文件，请现在保存好手头工作，然后尽快重启这台 Mac。
                    </div>
                  ) : null}
                </article>
              ) : (
                <section className="empty-state card">
                  <div className="empty-mark">
                    <img src={brandMark} alt="" />
                  </div>
                  <span className="empty-eyebrow">NETWORK</span>
                  <h2>先执行一个网络修复动作</h2>
                  <p>推荐先从“清除 DNS 缓存”开始；如果仍然无法恢复访问，再尝试 DHCP 和 Wi‑Fi 重启。只有在网络配置明显损坏时，才建议使用深度重置网络。</p>
                </section>
              )}
            </section>
          </section>
        ) : null}

        {activeView === 'settings' ? (
          <section className="settings-layout">
            <section className="settings-panel card">
              <div className="panel-heading">
                <span className="section-label">外观设置</span>
                <h2>主题与颜色</h2>
                <p>所有设置都会自动保存到当前设备，同时可以在这里清理最近端口扫描缓存。</p>
              </div>

              <section className="settings-group">
                <div className="settings-group-head">
                  <h3>界面模式</h3>
                  <p>手动控制浅色或深色，决定整个工具集的背景、卡片和文本层级。</p>
                </div>

                <div className="option-grid option-grid-two">
                  {THEME_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      className={`option-card ${
                        preferences.themeMode === option.value ? 'option-card-selected' : ''
                      }`}
                      type="button"
                      aria-pressed={preferences.themeMode === option.value}
                      onClick={() => updateThemeMode(option.value)}
                    >
                      <span className="option-kicker">{option.value === 'dark' ? 'DARK' : 'LIGHT'}</span>
                      <strong>{option.label}</strong>
                      <span>{option.description}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="settings-group">
                <div className="settings-group-head">
                  <h3>主色风格</h3>
                  <p>控制按钮、徽标、高亮边框和背景辉光的主色倾向。</p>
                </div>

                <div className="option-grid">
                  {ACCENT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      className={`option-card ${
                        preferences.accentPreset === option.value ? 'option-card-selected' : ''
                      }`}
                      type="button"
                      aria-pressed={preferences.accentPreset === option.value}
                      onClick={() => updateAccentPreset(option.value)}
                    >
                      <span className="swatch-strip" style={{ background: option.swatch }} />
                      <strong>{option.label}</strong>
                      <span>{option.description}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="settings-group">
                <div className="settings-group-head">
                  <h3>最近缓存记录</h3>
                  <p>这里只保存“进程查杀”工具的最近端口扫描记录，点击下面的按钮可以一键清空。</p>
                </div>

                {scanHistory.length > 0 ? (
                  <div className="cache-summary">
                    <ul className="cache-list">
                      {cachedPreview.map((entry) => (
                        <li key={`${entry.port}-${entry.queriedAt}`} className="cache-entry">
                          <div className="cache-entry-header">
                            <strong>端口 {entry.port}</strong>
                            <span>{formatTime(entry.queriedAt)}</span>
                          </div>
                          <span
                            className={`cache-state ${
                              entry.status === 'occupied' ? 'cache-state-occupied' : 'cache-state-clear'
                            }`}
                          >
                            {entry.status === 'occupied' ? `${entry.processCount} 个进程` : '已释放'}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <button className="ghost-button ghost-button-warning" type="button" onClick={clearScanHistory}>
                      清除最近缓存
                    </button>
                  </div>
                ) : (
                  <div className="cache-summary cache-summary-empty">
                    <span>目前没有缓存记录，使用过进程查杀之后这里才会显示内容。</span>
                    <button className="ghost-button ghost-button-warning" type="button" onClick={clearScanHistory}>
                      清除最近缓存
                    </button>
                  </div>
                )}
              </section>

              <div className="settings-footer">
                <button className="ghost-button" type="button" onClick={resetAppearance}>
                  恢复默认
                </button>
                <span>当前配置已自动保存到本机。</span>
              </div>
            </section>

            <section className="preview-panel card">
              <div className="panel-heading">
                <span className="section-label">效果预览</span>
                <h2>当前外观快照</h2>
                <p>切换后立即生效，下面的预览会同步显示按钮、标签和卡片层级效果。</p>
              </div>

              <div className="preview-window">
                <div className="preview-window-bar">
                  <span className="preview-dot preview-dot-red" />
                  <span className="preview-dot preview-dot-yellow" />
                  <span className="preview-dot preview-dot-green" />
                </div>

                <div className="preview-content">
                  <section className="preview-block">
                    <span className="section-label">状态标签</span>
                    <div className="preview-chip-row">
                      <span className="protocol-chip">TCP</span>
                      <span className="protocol-chip">{accentMeta.label}</span>
                    </div>
                  </section>

                  <section className="preview-block">
                    <span className="section-label">按钮样式</span>
                    <div className="preview-button-row">
                      <button className="primary-button preview-button" type="button">
                        查询占用
                      </button>
                      <button className="danger-button preview-button" type="button">
                        执行修复
                      </button>
                    </div>
                  </section>

                  <section className="preview-block preview-card-block">
                    <span className="section-label">信息层级</span>
                    <div className="preview-card-sample">
                      <strong>{themeMeta.label}</strong>
                      <span>当前主色：{accentMeta.label}</span>
                      <p>“Mac小工具”里的所有工具卡片、边框和背景辉光都会跟着这里的设置切换。</p>
                    </div>
                  </section>
                </div>
              </div>
            </section>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function buildDetailRowKey(detail: PortOccupancyDetail): string {
  return [
    detail.command,
    detail.pid,
    detail.fd,
    detail.type,
    detail.name,
    detail.device,
    detail.node,
  ].join(':');
}

export default App;
