<div align="center">

<img src="docs/screenshots/hero.webp" width="640" alt="Razzoozle" />

# Razzoozle

### 自托管、开源的实时测验平台 —— 采用简洁米色设计的 Kahoot 式主持人 + 手机游戏。

[English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · [Italiano](README.it.md) · 🌐 **中文**

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-CE422B?logo=rust&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-5FA04E?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![Tests](https://img.shields.io/badge/tests-592+-3DBFA0)

**[▶ 在线演示](https://razzoozle.joelduss.xyz)** · **[🌐 展示页](https://joehomeskillet.github.io/Razzoozle/)** · **[📚 文档](docs/)** · **[🖥️ 桌面应用](https://github.com/joehomeskillet/razzoozle-desktop)** · **[报告问题](https://github.com/joehomeskillet/Razzoozle/issues)** · *fork 自 [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## 这是什么？

Razzoozle 是一款自托管、实时的**测验游戏**，适用于教室、活动和游戏之夜。主持人在大屏幕上打开一局游戏，玩家用 PIN 码从手机加入，越快答对得分越高。它是 [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) 的友好分支，带有由管理员驱动的主题控制台、游戏化、团队与单人玩法、插件以及本地 AI 图像 —— 同时保留经典的彩色方块主持人 + 手机体验。

> 独立开源项目。与 Kahoot!® 或任何其他商业测验平台无关联、未获认可，亦无连接。

<img src="docs/screenshots/presenter.webp" width="640" alt="Presenter view" />

---

## 快速开始

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle

docker compose -f compose.node.yml up -d   # Node backend → http://127.0.0.1:3010
# or
docker compose -f compose.rust.yml up -d   # Rust backend → http://127.0.0.1:3011
```

每个文件都是自包含的（应用 + 各自的 Postgres）且相互独立，因此可以并行运行两者。打开应用，进入 `/manager`，并**修改默认的管理员密码**。在前面放置一个反向代理（Caddy/Traefik/nginx）以获得 TLS 和公共主机名。

不需要数据库？设置 `DATABASE_MODE=file` 即可在不使用 Postgres 的情况下运行。不使用 Docker：`pnpm install && pnpm build && pnpm start`（需要 Node 22+ 和 pnpm 11+）。

---

## 功能

- **主题控制台** —— 实时的"Design"标签页：颜色、各视图背景、徽标、圆角、Flat ⇄ Glass 切换以及预设。
- **忠于 Kahoot 的界面** —— 带形状的答案方块、圆形倒计时、已收答案计数器和动画领奖台。
- **游戏化** —— 15 项成就、奖牌、连胜、彩带、赛末最佳回顾以及生成的玩家头像。
- **7 种题型** —— 单选与多选、判断题、输入答案和滑块。
- **团队与单人** —— 带实时排行榜的彩色队伍，或通过分享链接单独练习任意测验。
- **插件与骨架主题** —— 管理员可安装的 ZIP 插件和可下载的整局主题包。
- **本地 AI 图像** —— 通过 ComfyUI（Z-Image）在本地设备生成题目/主题图像；密钥保留在服务器端。
- **6 种语言 + PWA** —— EN/DE/FR/ES/IT/ZH，可安装、支持离线，并带有 `/display` 投影视图。

由 592+ 项自动化测试、强化的未认证接口（每局资源上限、每 IP 速率限制、服务器签发的 host-token 认证）以及高达 600 名并发玩家的负载测试作为支撑。

---

## 后端

Razzoozle 提供**两个可互换的后端**，它们通过同一个共享的 Postgres 数据库使用相同的 socket.io 协议 —— 在管理员界面中按客户端切换，或通过 `VITE_DEFAULT_BACKEND` 切换。**Rust** 服务器（`axum` + `socketioxide`，内存安全且占用低）涵盖所有游戏、管理、玩家和显示流程。**Node.js** 服务器（`packages/socket`）功能完整，是 `compose.node.yml` 中的自包含默认后端。少数外围 HTTP 端点（Prometheus 指标、客户端遥测、社交分享预览、OpenAPI 文档）以及服务器端插件 JS 钩子仅在 Node 上可用。

**→ Rust 内部实现、构建与测试：[`rust/README.md`](rust/README.md)**

---

## 配置与文档

运行时数据位于 `config` 卷中，在首次启动时初始化。游戏设置在 `config/game.json` 中；测验在管理员编辑器中编写，或作为 `config/quizz/*.json`。参见 **[docs/](docs/)**：[Self-Hosting](docs/Self-Hosting.md) · [Configuration](docs/Configuration.md) · [Theming](docs/Theming.md) · [Low-latency mode](docs/LOW-LATENCY-MODE.md)。

---

## 应用与配套

- **[Razzoozle Desktop](https://github.com/joehomeskillet/razzoozle-desktop)（Beta）** —— 原生 Windows 应用，无需浏览器即可主持和管理游戏。
- **[Razzoozle Gateway](https://github.com/joehomeskillet/razzloo-gateway)** —— 轻量级发现服务（从不转发游戏流量）。

---

## 贡献

欢迎提交 issue 和 pull request。在提交 PR 前运行 `pnpm verify`（类型检查 + lint + 测试）；对于 Rust 改动，运行 `bash rust/gate.sh`。

---

## 致谢与许可证

[**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) 的一个分支 —— 感谢上游作者。基于 **[MIT 许可证](LICENSE)** 发布（© 2024 Ralex，© 2026 Razzoozle 贡献者）。
