# Mac小工具

一个基于 `Electron + React + TypeScript` 的 macOS 桌面工具集，用来把开发中常见、但又总要回终端敲一遍的修复动作集中到一个界面里。

这套工具当前主要覆盖四类高频场景：

- 端口被占用，想快速查是谁在监听并结束进程
- 下载后的应用被 macOS 拦截，想移除隔离属性
- DNS、DHCP、Wi‑Fi 或系统网络配置异常，想做递进式网络修复
- 想像 `npkill` 一样找出磁盘里最占空间的 `node_modules`，并在可视化界面里决定是否清理

## 功能总览

| 工具 | 用途 | 关键能力 |
| --- | --- | --- |
| 进程查杀 | 处理端口冲突 | 查询监听端口、查看 `lsof` 占用明细、结束进程 |
| 签名损坏修复 | 处理“已损坏 / 无法验证来源” | 执行 `xattr -rd com.apple.quarantine` |
| 网络修复 | 处理 DNS / DHCP / Wi‑Fi / 系统网络异常 | 清缓存、更新租约、重启 Wi‑Fi、深度重置 |
| `node_modules` 占用图 | 处理前端项目磁盘膨胀 | 扫描目录、按体积排序、打开访达、二次确认后删除 |

## 界面特点

- 单应用集成 4 个工具，不需要来回切终端
- 支持浅色 / 深色主题和多套主色风格
- 首页按工具卡片展示，适合日常快速进入
- 风险操作尽量做成显式确认，降低误触成本

## 适用环境

- 操作系统：`macOS`
- 处理器：当前默认打包目标为 `Apple Silicon (arm64)`
- Node.js：建议使用较新的 LTS 版本，和 CI 保持一致时可使用 `Node.js 24`
- npm：需要支持 `package-lock.json` 的标准 `npm ci / npm install`

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

这个命令会：

1. 先编译 Electron 主进程代码
2. 启动 Vite 开发服务器
3. 等前端和 Electron 都就绪后，自动拉起桌面应用

### 本地构建

```bash
npm run build
```

构建结果会生成到：

- `dist/`：前端静态资源
- `dist-electron/`：Electron 主进程和共享类型编译结果

### 本地启动构建产物

```bash
npm run start
```

## 打包 macOS 应用

### 本地打包

```bash
npm run dist:mac
```

会生成：

- `release/*.dmg`
- `release/*.zip`

### CI 打包

```bash
npm run dist:mac:ci
```

这个命令和本地打包的区别是显式关闭自动发布，适合 GitHub Actions 使用，避免因为缺少 `GH_TOKEN` 而失败。

## 功能详解

### 1. 进程查杀

适合处理 Vite、Next.js、Node 服务、本地接口服务等端口冲突。

核心命令思路：

```bash
lsof -nP -iTCP:<port> -sTCP:LISTEN
lsof -nP -i :<port>
kill -9 <PID>
```

能力说明：

- 查询监听指定端口的 TCP / UDP 进程
- 展示 `lsof` 返回的占用明细
- 一键结束指定 PID
- 保留最近扫描记录，便于回看

### 2. 签名损坏修复

适合处理下载应用后出现的：

- “已损坏，无法打开”
- “无法验证开发者”
- “来自身份不明开发者”

核心命令：

```bash
sudo xattr -rd com.apple.quarantine "<应用路径>"
```

能力说明：

- 支持选择 `.app` 文件
- 支持手动输入完整路径
- 执行时会触发系统管理员授权弹窗

### 3. 网络修复

适合处理这些问题：

- 能连上 Wi‑Fi 但打不开网页
- 域名解析异常
- DHCP 租约错乱
- Wi‑Fi 服务卡住
- 网络配置损坏

内置动作：

- 清除 DNS 缓存
- 更新 DHCP 租约
- 重启 Wi‑Fi 服务
- 深度重置网络配置

对应命令示例：

```bash
sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
sudo ipconfig set en0 DHCP
networksetup -setnetworkserviceenabled "Wi-Fi" off
networksetup -setnetworkserviceenabled "Wi-Fi" on
sudo rm /Library/Preferences/SystemConfiguration/NetworkInterfaces.plist
sudo rm /Library/Preferences/SystemConfiguration/preferences.plist
```

说明：

- 深度重置网络属于最后手段
- 执行深度重置后需要立即重启 Mac

### 4. `node_modules` 占用图

这个工具的思路类似 `npkill`，但更偏桌面端可视化。

参考命令：

```bash
npx npkill
```

当前实现能力：

- 递归扫描指定目录下的 `node_modules`
- 统计总可释放空间
- 按目录体积从大到小排序
- 直接打开对应目录到访达
- 对单个 `node_modules` 做二次确认后删除

这一块的设计目标是“先看清楚，再决定是否清理”，而不是打开应用就自动删。

## `node_modules` 占用图的使用方式

1. 打开首页里的 `node_modules 占用图`
2. 输入要扫描的目录，或者点击“选择目录”
3. 点击“开始扫描”
4. 在结果列表里查看每个 `node_modules` 的体积、最后修改时间和绝对路径
5. 如需定位目录，点击“打开访达”
6. 如需删除，点击“删除”后再次确认

删除限制：

- 只允许删除名称刚好为 `node_modules` 的目录
- 检测到符号链接时会拒绝删除
- 删除完成后会更新当前结果列表

## 项目结构

```text
.
├─ electron/              # Electron 主进程、IPC、系统能力
├─ shared/                # 前后端共享类型
├─ src/                   # React 前端界面
├─ scripts/               # 构建辅助脚本
├─ build/                 # 图标等构建资源
├─ dist/                  # 前端构建输出
├─ dist-electron/         # Electron 构建输出
└─ release/               # 打包产物输出
```

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 开发模式启动 |
| `npm run build` | 构建前端和 Electron |
| `npm run start` | 运行构建后的应用 |
| `npm run build:icons` | 生成 macOS 图标资源 |
| `npm run dist:mac` | 本地打包 arm64 的 `.dmg` 和 `.zip` |
| `npm run dist:mac:ci` | CI 环境打包，不触发自动发布 |

## GitHub Actions 与下载产物

仓库已配置 GitHub Actions：

- 每次 `push` / `pull_request` 会自动构建
- macOS 打包产物会上传到对应 workflow run 的 `Artifacts`

如果你在仓库首页右侧没看到下载入口，这是正常的：

- `Artifacts` 属于 Actions 运行产物
- `Releases` 只有在显式创建 GitHub Release 后才会显示

## 安全与权限说明

- 进程查杀依赖 macOS 自带的 `lsof`
- 签名损坏修复会触发系统管理员授权
- 网络修复会触发系统管理员授权
- 深度重置网络会修改系统网络配置，执行后需要重启
- `node_modules` 删除功能带二次确认，且只允许删除目标目录名为 `node_modules`

## 常见问题

### 1. 为什么应用提示没有权限？

请确认当前账号具备管理员权限，并允许系统授权弹窗正常出现。

### 2. 为什么 GitHub Actions 成功了，但首页没有下载按钮？

因为下载产物在 `Actions -> 某次成功运行 -> Artifacts`，不是自动出现在仓库首页 `Releases`。

### 3. 为什么 `node_modules` 扫描结果不全？

当前界面会优先展示体积最大的部分结果，避免列表过长影响查看。你仍然可以重新扫描并从不同根目录分段查看。

## 技术栈

- Electron
- React
- TypeScript
- Vite
- electron-builder

## 说明

这个项目更偏“开发者自己的 macOS 故障处理工具箱”，优先解决高频、直接、值得做成按钮的动作，不追求面面俱到，但希望每个工具都足够明确、可控、能落地。
