# 进程查杀

一个使用 Electron + React + TypeScript 编写的 macOS 桌面小工具，用来查询端口占用并结束对应进程。

## 功能

- 查询监听某个端口的 TCP / UDP 进程
- 展示 PID、命令名、所属用户、监听地址
- 一键发送 `kill -9 <PID>` 结束进程

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

- 查询依赖 macOS 自带的 `lsof`
- 默认只显示真正监听端口的 TCP / UDP 进程，尽量减少普通连接带来的干扰
- 如果遇到权限错误，需要使用具备足够权限的账户运行应用
