# Mac小工具

一个使用 Electron + React + TypeScript 编写的 macOS 桌面工具集，收纳常用的系统排障和修复动作。

## 功能

- 进程查杀：查询监听某个端口的 TCP / UDP 进程，展示占用明细并一键结束进程
- 签名损坏修复：执行 `sudo xattr -rd com.apple.quarantine 应用路径`，移除应用隔离属性
- 支持手动切换浅色 / 深色主题与主色风格

## 启动

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
npm run start
```

## 说明

- 进程查杀依赖 macOS 自带的 `lsof`
- 签名损坏修复会触发系统管理员授权弹窗
- 如果遇到权限错误，需要使用具备足够权限的账户运行应用
