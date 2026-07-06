<div align="center">

<img src="docs/screenshots/hero.webp" width="680" alt="Razzoozle" />

# Razzoozle

### 一个自托管的开源实时答题平台 — 采用简洁平坦的**奶油色**设计（以及可选的液态玻璃主题）。

[English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · [Italiano](README.it.md) · 🌐 **中文**

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-149ECA?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-06B6D4?logo=tailwindcss&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Rust](https://img.shields.io/badge/Rust_server-default_backend-CE422B?logo=rust&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js_backend-available-5FA04E?logo=nodedotjs&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?logo=socketdotio&logoColor=white)
![Motion](https://img.shields.io/badge/Motion-0055FF?logo=framer&logoColor=white)
![Zustand](https://img.shields.io/badge/Zustand-433E38)
![Tests](https://img.shields.io/badge/tests-592+-3DBFA0)

**[▶ 在线演示](https://razzoozle.joelduss.xyz)** · **[🖥️ Razzoozle Desktop — Windows 应用（测试版）](https://github.com/joehomeskillet/razzoozle-desktop)** · **[🛰️ 网关](https://github.com/joehomeskillet/razzloo-gateway)** · **[🌐 展示](https://joehomeskillet.github.io/Razzoozle/)** · **[📚 文档](docs/)** · **[报告问题](https://github.com/joehomeskillet/Razzoozle/issues)** · *来自 [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## 🧩 这是什么？

Razzoozle 是一个自托管的实时**答题游戏**平台，适用于课堂、活动和游戏之夜。主持人在大屏幕上开启游戏，玩家从手机用 PIN 码加入，所有人竞速作答 — 正确且快速的答案得分更高。这是 [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) 的友好分支，围绕简洁平坦的**奶油色**设计重新构建（液态玻璃现在是可选主题），配有管理员驱动的主题系统、游戏化功能、团队和个人模式以及本地 AI 图像生成 — 同时保留了经典 Kahoot 风格的演讲者 + 手机体验（彩色答题卡带有形状、倒计时、领奖台）。

> Razzoozle 是一个独立的开源项目。它与 Kahoot!® 或任何其他商业答题平台无关、未被认可，也未与其相关联。

---

## 🚀 架构：双后端（Rust 现为默认）

Razzoozle 搭载一个**高性能的 Rust 后端作为默认配置**，同时保持原始 Node.js 服务器的可用性以实现兼容性和渐进式迁移。

### 为什么选择 Rust？

- **内存安全、编译检查的游戏状态机** — 无运行时恐慌或未定义行为。
- **快速、低占用的实时服务器** — socketioxide + axum 可处理 600+ 并发玩家，开销最少。
- **单一静态二进制文件** — 作为 ~10 MB Tauri 应用（Rust 侧边栏）而不是 ~150 MB Electron + Node 运行时来发布。
- **行为对等性** — 使用相同的 socket.io 线协议；前端和玩家看不出区别。
- **共享信息源** — 两个后端都读写相同的 Postgres 数据库，支持按客户端无缝切换。

### 工作原理

**Rust 后端**（`rust/` 工作区）：
- **`protocol/`** — ~200 条线协议类型，通过 `ts-rs` 自动生成 TypeScript 绑定（Rust 是信息源）。
- **`engine/`** — 纯游戏逻辑（句子构建分块、Fisher-Yates 随机排列带防重复守卫）。
- **`server/`** — `axum` HTTP + `socketioxide` 实时服务器；内存游戏注册表；管理员身份验证（主机令牌）；速率限制 + 资源上限；从磁盘或数据库加载测验。

**管理员操作**完全在 Rust 中实现：测验保存/更新/删除/复制/存档、配置管理、提交审核、目录、正在进行的游戏、主题切换 — 由 `rust/gate.sh` 把控（cargo 构建 + 回归测试）。

**功能对等性**与 Node 服务器：全部 7 个问题类型、玩家生命周期 + 重连、游戏控制（踢出/跳过/中止/计时器）、机器人、`/display` 亭、AI/媒体、个人端点、团队模式。

**Node 后端**（`packages/socket`）保留用于向后兼容；在管理员 UI 中或通过 `VITE_DEFAULT_BACKEND` 切换。

**→ 详情、构建与测试：[`rust/README.md`](rust/README.md)**

---

## 📸 截图

<div align="center">

| 演讲者 / 主持人 | 桌面游戏客户端 |
| :---: | :---: |
| <img src="docs/screenshots/presenter.webp" width="420" alt="Presenter screen" /> | <img src="docs/screenshots/desktop.webp" width="420" alt="Desktop game client" /> |

| 玩家手机 | 头像选择 |
| :---: | :---: |
| <img src="docs/screenshots/phone.webp" width="240" alt="Player phone" /> | <img src="docs/screenshots/avatar.webp" width="240" alt="Avatar selection" /> |

<img src="docs/screenshots/admin.webp" width="680" alt="Manager theme cockpit" />

<img src="docs/screenshots/start.webp" width="680" alt="Host start screen with the Game PIN" />

</div>

---

## ✦ Razzoozle 相比 Razzia 增加的功能

| | 功能 |
| --- | --- |
| 🎨 | **主题驾驶舱** — 实时管理员"设计"标签：颜色、每个视图背景、标志、圆角和**平坦 ⇄ 玻璃**样式切换，带预设（平坦**奶油色**默认 + 可选紫色**液态玻璃**预设）和对比度感知色选择器。 |
| ☕ | **平坦奶油色设计** — 温暖的平坦奶油色界面，带有生动的动画背景（漂移斑点 + 浮动学校/知识图标）、平坦"Zig"字标/徽标和油墨在奶油色上的答题卡。 |
| 🧊 | **液态玻璃 UI** — 可选的、遗留的玻璃态主题变体（磨砂、模糊表面）永远不会触碰平坦基线。 |
| 🎯 | **Kahoot 忠实游戏屏幕** — 答题卡带有经典形状图标（三角形 / 钻石 / 圆形 / 正方形）、圆形倒计时器、已收答计数器和动画领奖台。 |
| 🧑‍🎨 | **玩家头像** — 每个玩家获得生成的 DiceBear 头像（选择样式 + 重新滚动，或上传你自己的）；头像在大厅周围浮动，并出现在排行榜、领奖台和奖项上。 |
| 🏆 | **游戏化** — 15 项成就、奖章、连胜、五彩纸屑和音效，加上个人奖杯库。 |
| 🥇 | **游戏结束奖项回顾** — 一个动画的最高荣誉序列（最快手指、最大爬升、最长连胜、绝地翻盘……）显示每个获胜者的头像 + 名字，自动播放中自动配速。 |
| 👥 | **团队模式** — 红色 / 蓝色 / 绿色 / 黄色团队，带有实时团队排行榜。 |
| 📱 | **个人模式** — 通过分享链接单独练习任何测验，有自己的分数历史。 |
| ✍️ | **更多问题类型** — 多选、输入答案和滑块，在经典单选题之上。 |
| 🔌 | **插件系统** — 管理员可安装的 ZIP 附加组件带有自己的"插件"标签。 |
| 🧩 | **管理员附加组件** — 从管理员控制台上传、启用和配置 JavaScript 附加组件（自有标签、能力徽章、持久配置）；附带一个复制粘贴启动者骨架（`examples/plugins/starter/`）和身份验证契约。 |
| 📦 | **骨架主题 ZIP** — 下载/上传整个游戏主题作为 LLM 可读的 ZIP（"骨架"：设计令牌 + CSS + JS + SKELETON.md 契约）。 |
| 📳 | **移动触觉** — 玩家手机上可选的振动反馈（倒计时、答案），支持减少运动。 |
| 🔗 | **可分享结果** — 丰富的每个结果链接预览（Open Graph 展开）、带有"自己玩 / 主持你自己的"行动呼吁的结果页面以及可下载的赢家贴纸。 |
| 🤝 | **社区问题** — 带有管理员审核队列的公共提交页面、可重用问题目录和测验存档。 |
| 🖼️ | **本地 AI 图像** — 通过 ComfyUI (Z-Image) 在设备上生成问题/主题图像，或插入云提供商 — 密钥保持服务器端。 |
| 🌍 | **6 种语言 + PWA** — 英文、德文、法文、西班牙文、意大利文、中文；可安装的、离线感知的。 |
| 📺 | **放映机亭 + 可靠性** — `/display` 投影机视图、低延迟模式、崩溃恢复、重连以及用于 AI 工具控制的 MCP 服务器。 |

由**592+ 自动化测试**支持，经过路径遍历 + `ws`-CVE 安全审查，加固的未认证表面（每游戏资源上限 + 游戏驱逐、每 IP 速率限制、管理员身份验证蛮力节流、服务器铸造的主机令牌身份验证关闭 IDOR），以及健康网关 Docker 部署。负载测试至**600 并发玩家**。

---

## 📲 应用和同伴

- **[Razzoozle Desktop](https://github.com/joehomeskillet/razzoozle-desktop)（测试版）** — 第一个用于 Razzoozle 的原生 **Windows** 桌面应用。从你的机器主持和管理游戏，无需浏览器。
- **[Razzoozle 网关](https://github.com/joehomeskillet/razzloo-gateway)** — 一个轻量级的会合 / 发现服务，帮助客户端相互查找。仅发现 — 它永远不中继游戏。

---

## ⚙️ 前提条件

**使用 Docker（推荐）：** Docker + Docker Compose。
**不使用 Docker：** Node.js 22+ 和 pnpm 11+。

---

## 📖 快速开始

### 🐳 Docker（推荐）

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
docker compose up -d
```

应用启动在 `http://127.0.0.1:3011`（nginx + 默认 Rust 后端在一个容器中）。配置和用户数据位于 `./config` 卷中，在首次启动时创建和播种。将其放在你自己的反向代理（Caddy、nginx、Traefik……）后面以获取 TLS 和公共主机名。

要使用 Node 后端，请在构建前设置 `VITE_DEFAULT_BACKEND=node`，或在管理员 UI 中切换。

### 🛠️ 不使用 Docker

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
pnpm install
pnpm build        # production build
pnpm start        # or: pnpm dev  (web + Rust backend, hot reload)
```

---

## 🎮 如何游玩

1. 在主机上打开 `/manager` 并用管理员密码登录。
2. 选择测验并开始游戏 — 出现 PIN（通过 `/display` 在放映机上显示）。
3. 玩家在手机上打开网站，输入 PIN 和名字。
4. 尽可能快地作答 — 正确且快速的答案得分更高。
5. 观看排行榜、奖章和轮次之间的五彩纸屑。

偏好单独游玩？打开任何测验的**个人**分享链接，按自己的速度练习。

---

## ⚙️ 配置

运行时数据位于 `config/`（git 忽略，在首次启动时播种）。

### 游戏设置 — `config/game.json`

```jsonc
{
  "managerPassword": "PASSWORD", // 更改此项 — 默认值阻止管理员访问
  "teamMode": false,             // 启用红色/蓝色/绿色/黄色团队
  "lowLatencyMode": { "enabled": false } // 选择加入时序/UX 紧缩（见 docs/LOW-LATENCY-MODE.md）
}
```

### 测验 — `config/quizz/*.json`

在管理员编辑器中构建测验（推荐）或作为 JSON。问题支持多个 `type`（`choice`、`boolean`、`slider`，加上通过多个 `solutions` 的多选和输入答案）：

```jsonc
{
  "subject": "Python Basics",
  "questions": [
    {
      "question": "Which keyword defines a function in Python?",
      "type": "choice",
      "answers": ["func", "def", "function", "fun"],
      "solutions": [1],          // 0-based indices; multiple = multi-select
      "time": 20,                 // seconds to answer (5–120)
      "cooldown": 5,              // seconds before the answer is revealed (3–15)
      "media": { "type": "image", "url": "https://placehold.co/600x400.png" } // optional
    }
  ]
}
```

AI 提供商（关闭 / 本地 ComfyUI / 云）在管理员的 **AI** 标签中配置；API 密钥存储在服务器端的 `config/` 中，永远不会发送给客户端。

---

## 📺 放映机 / 亭展示

`/display` 为投影机或电视渲染主机演讲全屏（vh 缩放类型可在房间内阅读），可从手机配对。`/satellite/<gameId>` 路由是无控制亭视图，使用令牌身份验证（无管理员密码）。包括一个可选的 Raspberry Pi 卫星镜像。

---

## 🧱 技术栈

一个 pnpm 单体仓库 — **`@razzoozle/web`**（React + Vite + Tailwind v4、TanStack Router、PWA）、一个**双后端**（默认 Rust `axum` + `socketioxide`，或 Node + Socket.IO 以实现兼容性）、**`@razzoozle/common`**（共享 Zod 验证类型、从 Rust 通过 `ts-rs` 自动生成）和 **`@razzoozle/mcp`**（用于 AI 工具控制的 MCP 服务器）。作为单一 Docker 镜像与 `/healthz` 端点 + Docker `HEALTHCHECK` 发布。

**Rust 后端**（`rust/` 工作区）：`razzoozle-protocol`（线类型）、`razzoozle-engine`（游戏逻辑）、`razzoozle-server`（`axum` + `socketioxide`）。

---

## 🤝 贡献

欢迎问题和拉取请求。在打开 PR 前运行 `pnpm verify`（类型检查 + lint + 测试）。对于 Rust 后端更改，在 `rust/` 中运行 `cargo test` 并验证 CI 网关（实际游戏烟雾测试）通过。

---

## ⭐ 星历

<a href="https://star-history.com/#joehomeskillet/Razzoozle&Date">
  <img src="https://api.star-history.com/svg?repos=joehomeskillet/Razzoozle&type=Date" width="600" alt="Star history" />
</a>

---

## 📝 致谢和许可证

Razzoozle 是 [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) 的分支 — 非常感谢上游作者。在 **[MIT 许可证](LICENSE)** 下发布（© 2024 Ralex，© 2026 Razzoozle 贡献者）；上游 MIT 声明被保留。
