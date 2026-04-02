import type { FormEvent } from 'react';
import { startTransition, useEffect, useState } from 'react';

import type {
  KillSignal,
  LookupPortResult,
  PortOccupancyDetail,
  PortProcess,
  ThemeMode,
} from '../shared/process';
import { QUICK_PORTS } from '../shared/process';
import brandMark from './assets/brand-mark.svg';

type BannerTone = 'neutral' | 'success' | 'error';
type ViewMode = 'dashboard' | 'settings';
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

const PREFERENCES_STORAGE_KEY = 'process-query.preferences.v1';
const SCAN_HISTORY_STORAGE_KEY = 'process-query.scan-history.v1';
const MAX_SCAN_HISTORY = 8;

const initialBanner: BannerState = {
  tone: 'neutral',
  text: '输入一个端口号，工具会使用 lsof 查询监听进程，并把该端口的相关占用明细一起列出来。',
};

const DEFAULT_PREFERENCES: AppPreferences = {
  themeMode: 'dark',
  accentPreset: 'iceblue',
};

const VIEW_OPTIONS: Array<{ value: ViewMode; label: string }> = [
  { value: 'dashboard', label: '控制台' },
  { value: 'settings', label: '设置' },
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

function App() {
  const [activeView, setActiveView] = useState<ViewMode>('dashboard');
  const [preferences, setPreferences] = useState<AppPreferences>(loadPreferences);
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>(loadScanHistory);
  const [portInput, setPortInput] = useState('3000');
  const [result, setResult] = useState<LookupPortResult | null>(null);
  const [banner, setBanner] = useState<BannerState>(initialBanner);
  const [isLoading, setIsLoading] = useState(false);
  const [killingPid, setKillingPid] = useState<number | null>(null);

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
      setBanner({
        tone: 'error',
        text: '端口号必须是 1 到 65535 之间的整数。',
      });
      return;
    }

    if (!window.processQuery) {
      setBanner({
        tone: 'error',
        text: '没有检测到桌面桥接能力，请确认当前环境通过 Electron 启动。',
      });
      return;
    }

    setPortInput(String(parsedPort));
    setIsLoading(true);
    setBanner({
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
        setBanner({
          tone: 'success',
          text: `端口 ${parsedPort} 已找到 ${nextResult.processes.length} 个监听进程，并返回 ${nextResult.details.length} 条 lsof 明细。`,
        });
      } else if (nextResult.details.length > 0) {
        setBanner({
          tone: 'neutral',
          text: `端口 ${parsedPort} 当前没有监听进程，但找到 ${nextResult.details.length} 条相关占用记录。`,
        });
      } else {
        setBanner({
          tone: 'neutral',
          text: `没有发现监听端口 ${parsedPort} 的 TCP / UDP 进程，也没有相关占用记录。`,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '查询失败，请稍后重试。';
      setBanner({
        tone: 'error',
        text: message,
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await lookup();
  }

  async function handleKill(processItem: PortProcess, signal: KillSignal = 'SIGKILL') {
    if (!window.processQuery) {
      setBanner({
        tone: 'error',
        text: '没有检测到桌面桥接能力，请确认当前环境通过 Electron 启动。',
      });
      return;
    }

    setKillingPid(processItem.pid);
    setBanner({
      tone: 'neutral',
      text: `正在向 PID ${processItem.pid} 发送 ${signal === 'SIGKILL' ? 'kill -9' : 'SIGTERM'} ...`,
    });

    try {
      await window.processQuery.killProcess(processItem.pid, signal);

      setBanner({
        tone: 'success',
        text: `PID ${processItem.pid} 已发送结束信号，正在重新扫描端口 ${result?.port ?? portInput}。`,
      });

      await lookup(result?.port ?? portInput);
    } catch (error) {
      const message = error instanceof Error ? error.message : '结束进程失败，请稍后重试。';
      setBanner({
        tone: 'error',
        text: message,
      });
    } finally {
      setKillingPid(null);
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
    setBanner({
      tone: 'neutral',
      text: '主题和配色已恢复为默认值。',
    });
  }

  function clearScanHistory() {
    setScanHistory([]);
    setBanner({
      tone: 'success',
      text: '最近缓存记录已清除。',
    });
  }

  const themeMeta =
    THEME_OPTIONS.find((option) => option.value === preferences.themeMode) ?? THEME_OPTIONS[0];
  const accentMeta =
    ACCENT_OPTIONS.find((option) => option.value === preferences.accentPreset) ?? ACCENT_OPTIONS[0];
  const processCount = result?.processes.length ?? 0;
  const detailCount = result?.details.length ?? 0;
  const lastUpdated = result?.queriedAt ? formatTime(result.queriedAt) : '尚未查询';
  const hasSearched = result !== null;
  const hasProcesses = processCount > 0;
  const hasDetails = detailCount > 0;
  const emptyTitle = hasSearched ? `端口 ${result?.port} 当前没有监听进程` : '等待新的扫描指令';
  const emptyText = hasSearched
    ? hasDetails
      ? `当前没有检测到监听该端口的 TCP / UDP 进程，不过 lsof 仍返回了 ${detailCount} 条相关记录，例如已建立连接或已关闭连接。`
      : '当前没有检测到监听该端口的 TCP / UDP 进程。如果你刚刚结束过进程，这通常说明端口已经被释放。'
    : '输入一个常见开发端口，例如 3000、5173 或 7001，工具会立刻给出占用情况并支持直接查杀。';
  const cachedPreview = scanHistory.slice(0, 3);
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
  const emptyEyebrow = hasDetails ? 'DETAILS' : hasSearched ? 'CLEAR' : 'STANDBY';
  const heroTitle =
    activeView === 'dashboard' ? (
      <>
        端口占用，
        <br />
        快速处理。
      </>
    ) : (
      <>
        主题配色，
        <br />
        自己决定。
      </>
    );
  const heroDescription =
    activeView === 'dashboard'
      ? '面向 macOS 开发环境的轻量查杀面板。扫描本机监听端口，定位占用进程，再一键释放端口，把调试节奏重新拉回正轨。'
      : '不再跟着系统主题自动跳转，直接由你来决定浅色/深色和主色风格。设置会保存在当前设备，下次打开自动恢复。';
  const visualTitle = activeView === 'dashboard' ? '实时端口态势' : '当前外观预览';
  const visualDescription =
    activeView === 'dashboard'
      ? '读取本机监听进程，保持轻量、直接、可控。'
      : '立刻预览当前主题和配色，不需要重启应用。';

  return (
    <div className="shell">
      <div className="backdrop backdrop-left" />
      <div className="backdrop backdrop-right" />
      <div className="grid-overlay" />

      <main className="app">
        <section className="hero card">
          <div className="brand-bar">
            <div className="brand-lockup">
              <img className="brand-mark" src={brandMark} alt="进程查杀标识" />
              <div className="brand-copy">
                <span className="brand-name">进程查杀</span>
                <span className="brand-subtitle">Process Terminator for macOS</span>
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
                    onClick={() => setActiveView(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </nav>

              <div className="hero-pills">
                <span>{themeMeta.label}</span>
                <span>{accentMeta.label}配色</span>
                <span>缓存 {scanHistory.length} 条</span>
              </div>
            </div>
          </div>

          <div className="hero-body">
            <div className="hero-copy">
              <span className="eyebrow">
                {activeView === 'dashboard' ? '开发现场控制台' : '自定义外观'}
              </span>
              <h1>{heroTitle}</h1>
              <p>{heroDescription}</p>
            </div>

            <div className="hero-visual" aria-hidden="true">
              <div className={`signal-orb ${activeView === 'settings' ? 'signal-orb-settings' : ''}`}>
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
            <article className="stat-tile">
              <span>最近扫描</span>
              <strong>{lastUpdated}</strong>
            </article>
            <article className="stat-tile">
              <span>当前主题</span>
              <strong>
                {themeMeta.label} · {accentMeta.label}
              </strong>
            </article>
            <article className="stat-tile">
              <span>最近缓存</span>
              <strong>{scanHistory.length} 条记录</strong>
            </article>
          </div>
        </section>

        {activeView === 'dashboard' ? (
          <section className="workspace">
            <section className="panel card">
              <div className="panel-heading">
                <span className="section-label">端口雷达</span>
                <h2>输入端口，立即扫描</h2>
                <p>针对常见开发端口优化，支持快速复查和一键强制结束进程。</p>
              </div>

              <form className="search-form" onSubmit={handleSubmit}>
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

              <div className={`banner banner-${banner.tone}`}>{banner.text}</div>

              <div className="command-hints">
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
                  <span className="empty-eyebrow">{emptyEyebrow}</span>
                  <h2>{emptyTitle}</h2>
                  <p>{emptyText}</p>
                </section>
              )}

              {hasDetails ? (
                <section className="detail-card card">
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
                              <div className="detail-command">
                                <strong>{detail.command}</strong>
                                {detail.state ? (
                                  <span className="detail-state">{detail.state}</span>
                                ) : null}
                              </div>
                            </td>
                            <td>{detail.pid}</td>
                            <td>{detail.user}</td>
                            <td>{detail.fd}</td>
                            <td>
                              <div className="detail-type">
                                <span>{detail.type}</span>
                                <span>{detail.protocol}</span>
                              </div>
                            </td>
                            <td className="detail-name-cell">
                              <code>{detail.name}</code>
                              <span>
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
            </section>
          </section>
        ) : (
          <section className="settings-layout">
            <section className="settings-panel card">
              <div className="panel-heading">
                <span className="section-label">外观设置</span>
                <h2>主题与颜色</h2>
                <p>所有设置都会自动保存到当前设备，同时可以在这里清理最近扫描缓存。</p>
              </div>

              <section className="settings-group">
                <div className="settings-group-head">
                  <h3>界面模式</h3>
                  <p>手动控制浅色或深色，决定整个应用的背景、卡片和文本层级。</p>
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
                  <p>这里保存最近几次端口扫描结果，点击下面的按钮可以一键清空。</p>
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
                    <span>目前没有缓存记录，查询过端口之后这里才会显示内容。</span>
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
                        立即查杀
                      </button>
                    </div>
                  </section>

                  <section className="preview-block preview-card-block">
                    <span className="section-label">信息层级</span>
                    <div className="preview-card-sample">
                      <strong>{themeMeta.label}</strong>
                      <span>当前主色：{accentMeta.label}</span>
                      <p>卡片、边框和背景辉光都会跟着这里的设置切换。</p>
                    </div>
                  </section>
                </div>
              </div>
            </section>
          </section>
        )}
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
