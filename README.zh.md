<div align="center">

<img src="docs/screenshots/hero.webp" width="680" alt="Razzoozle" />

# Razzoozle

### 一个自托管、开源的实时答题平台 —— 采用简洁扁平的**奶油色（cream）**设计（并提供可选的液态玻璃主题）。

🌐 [English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · [Italiano](README.it.md) · **中文**

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-149ECA?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-06B6D4?logo=tailwindcss&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-5FA04E?logo=nodedotjs&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?logo=socketdotio&logoColor=white)
![Rust](https://img.shields.io/badge/Rust_server-rewrite_in_progress-CE422B?logo=rust&logoColor=white)
![Motion](https://img.shields.io/badge/Motion-0055FF?logo=framer&logoColor=white)
![Zustand](https://img.shields.io/badge/Zustand-433E38)
![Tests](https://img.shields.io/badge/tests-592-3DBFA0)

**[▶ 在线演示](https://razzoozle.joelduss.xyz)** · **[🖥️ Razzoozle Desktop — Windows 应用（Beta）](https://github.com/joehomeskillet/razzoozle-desktop)** · **[🛰️ Gateway](https://github.com/joehomeskillet/razzloo-gateway)** · **[🌐 项目展示](https://joehomeskillet.github.io/Razzoozle/)** · **[📚 Docs](docs/)** · **[反馈问题](https://github.com/joehomeskillet/Razzoozle/issues)** · *fork 自 [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## 🦀 Rust 重写 — 功能完整的预览版（非默认版本）

Node.js 游戏服务器（`packages/socket`）仍然是 [razzoozle.joelduss.xyz](https://razzoozle.joelduss.xyz) 上**生产环境**运行的版本 —— 本 README 中的每一项功能、所有题型、主题/skeleton、游戏化机制、团队与单人玩法、DiceBear 头像、本地 AI 图像、移动端触感反馈、6 种语言、约 592 项测试，已通过 600 名并发玩家的负载测试。

与此同时，一个从零开始的 **Rust 重写**版游戏服务器（`axum` + `socketioxide 0.15`）使用*完全相同*的 socket.io 通信协议，所以前端察觉不到差异。它现已**功能完整**：一场完整的多题计分游戏、全部 7 种题型、玩家生命周期 + 断线重连、管理员鉴权、从磁盘加载测验、HTTP + 单人端点、游戏控制（踢出 / 跳过 / 中止 / 计时器）、机器人、`/display` kiosk、以及 AI/媒体支持。共享类型由 Rust 通过 `ts-rs` 生成 —— Rust 的通信类型是唯一源。它作为**并行容器在 `:3012` 上**运行，与 Node 的 `:3011` 并行，并通过每次部署时执行一场真实游戏 CI 门控（一场 100 人的完整游戏 + 一次断线重连测试）。但它**尚未成为默认版本**；Node 仍是生产路径，直到完成遮挡式切换。

**为什么选择 Rust：** 将桌面主机应用作为一个 **~10 MB 的 Tauri 应用**（Rust sidecar）发布，而不是约 150 MB 的 Electron 包；编译检查的游戏状态机；以及单个静态二进制文件。

一项并行的 **v2.0 加固**工作 —— 一场对抗性的多模型查漏（19 项已确认的发现）—— 在两个分支上落地了修复：每局资源上限 + 局进化、每 IP 速率限制、路径遍历白名单、Unicode 正确的文本匹配，以及一项由服务器签发的主机令牌鉴权，关闭了一个跨局控制（IDOR）漏洞。下一步计划进行模块化 / 按游戏的 actor 模式重构。

**→ 详情、状态表、构建与运行：[`rust/README.md`](rust/README.md)**

---

## 🧩 这是什么？

Razzoozle 是一个自托管、实时的**答题游戏**，适用于课堂、活动和游戏之夜。主持人在大屏幕上开局，玩家用手机输入 PIN 码加入，所有人争相作答 —— 答得又快又对得分更高。它是 [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) 的一个友好分支，围绕一种简洁扁平的**奶油色**设计（液态玻璃现在是可选主题）重新打造，配备由管理员驱动的主题系统、游戏化机制、团队与单人玩法以及本地 AI 图像生成 —— 同时保留经典的 Kahoot 风格主持人 + 手机体验（带形状的彩色答案方块、倒计时、领奖台）。

> Razzoozle 是一个独立的开源项目。它与 Kahoot!® 或任何其他商业答题平台没有关联、未获其认可，也与之无任何联系。

---

## 📸 截图

<div align="center">

| 主持人 / 主屏 | 桌面游戏客户端 |
| :---: | :---: |
| <img src="docs/screenshots/presenter.webp" width="420" alt="Presenter screen" /> | <img src="docs/screenshots/desktop.webp" width="420" alt="Desktop game client" /> |

| 玩家手机 | 头像选择 |
| :---: | :---: |
| <img src="docs/screenshots/phone.webp" width="240" alt="Player phone" /> | <img src="docs/screenshots/avatar.webp" width="240" alt="Avatar selection" /> |

<img src="docs/screenshots/admin.webp" width="680" alt="Manager theme cockpit" />

<img src="docs/screenshots/start.webp" width="680" alt="Host start screen with the Game PIN" />

</div>

---

## ✦ Razzoozle 相较 Razzia 新增了什么

| | 功能 |
| --- | --- |
| 🎨 | **主题驾驶舱** —— 一个实时的管理员"设计"标签页：颜色、各视图背景、Logo、圆角，以及一个 **扁平 ⇄ 玻璃** 风格切换开关，附带预设（扁平**奶油色**默认 + 可选的紫色**液态玻璃**预设）以及对比度感知的取色器。 |
| ☕ | **扁平奶油色设计** —— 温暖的扁平奶油色界面，带有动态背景（漂浮的光斑 + 漂浮的学校/知识图标）、扁平的 "Zig" 字标/徽标，以及墨色奶油底答题色块。 |
| 🧊 | **液态玻璃界面（可选 / 旧版）** —— 一个可选启用的玻璃拟态主题变体（磨砂、模糊的表面），绝不触碰扁平基线。 |
| 🎯 | **忠于 Kahoot 的游戏界面** —— 带经典形状图标（三角形 / 菱形 / 圆形 / 方形）的答案方块、一个环形倒计时计时器、一个已收到答案计数器，以及一个带动画的领奖台。 |
| 🧑‍🎨 | **玩家头像** —— 每位玩家获得生成的 DiceBear 头像（选择风格 + 重新随机，或上传自己的图片）；头像在大厅中漂浮，并显示在排行榜、领奖台和颁奖中。 |
| 🏆 | **游戏化** —— 15 项成就、奖牌、连胜、彩带和音效铃声，外加个人奖杯陈列室。 |
| 🥇 | **终局颁奖回顾** —— 动画式的"之最"序列（最快手速、最大逆袭、最长连胜、逆转之王……），显示每位获奖者的头像 + 名字，自动播放时按节奏自动推进。 |
| 👥 | **团队模式** —— 红 / 蓝 / 绿 / 黄队，配实时团队排行榜。 |
| 📱 | **单人玩法** —— 通过分享链接独自练习任意测验，拥有自己的得分历史。 |
| ✍️ | **更多题型** —— 在经典单选之外，新增多选、填空作答和滑块。 |
| 🔌 | **插件系统** —— 管理员可安装的 ZIP 插件，拥有独立的"插件"标签页。 |
| 🧩 | **管理员附加组件（Addons）** —— 从管理员控制台上传、启用并配置 JavaScript 附加组件（独立标签页、能力徽章、持久化配置）；并附带一个可复制粘贴的入门 skeleton（`examples/plugins/starter/`），含编写约定。 |
| 📦 | **Skeleton 主题 ZIP** —— 将整个游戏主题作为 LLM 可读的 ZIP（"skeleton"：设计令牌 + CSS + JS + SKELETON.md 约定）下载/上传。 |
| 📳 | **移动端触感反馈** —— 玩家手机上的可选振动反馈（倒计时、答题），尊重 reduced-motion。 |
| 🔗 | **可分享的结果** —— 每个结果的精美链接预览（Open Graph unfurl）、带有"自己来玩 / 自己托管"行动号召的结果页，以及可下载的获胜者贴纸。 |
| 🤝 | **社区题目** —— 一个公开的投稿页面，配管理员审核队列，外加可复用的题目目录和测验存档。 |
| 🖼️ | **本地 AI 图像** —— 通过 ComfyUI（Z-Image）在本地设备上生成题目/主题图像，或接入云端服务商 —— 密钥始终留在服务端。 |
| 🌍 | **6 种语言 + PWA** —— 英语、德语、法语、西班牙语、意大利语、中文；可安装、支持离线感知。 |
| 📺 | **投影仪 kiosk 模式 + 可靠性** —— 一个 `/display` 投影仪视图、低延迟模式、崩溃恢复、断线重连，以及一个用于 AI 工具控制的 MCP 服务器。 |

由 **592 项自动化测试**支撑，经过路径遍历 + `ws`-CVE 安全检查，一个加固后的未鉴权攻击面（每局玩家数与活跃对局数上限、限流的公开端点、管理员鉴权暴力破解节流），以及一个基于健康检查门控的 Docker 部署。已通过 **600 名并发玩家**的负载测试。

---

## 📲 应用与配套

- **[Razzoozle Desktop](https://github.com/joehomeskillet/razzoozle-desktop)（Beta）** — Razzoozle 的首个原生 **Windows** 桌面应用。直接在你的电脑上托管和管理对局，无需浏览器。
- **[Razzoozle Gateway](https://github.com/joehomeskillet/razzloo-gateway)** — 一个轻量的会合 / 发现服务，帮助客户端相互找到彼此。仅用于发现 — 绝不中转游戏数据。

---

## ⚙️ 前置要求

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

应用会在 `http://127.0.0.1:3011` 上启动（nginx + socket 服务器位于同一个容器中）。配置和用户数据存放在 `./config` 卷中，会在首次启动时创建并初始化。把它放在你自己的反向代理（Caddy、nginx、Traefik 等）后面，以获得 TLS 和公开主机名。

### 🛠️ 不使用 Docker

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
pnpm install
pnpm build        # production build
pnpm start        # or: pnpm dev  (web + socket, hot reload)
```

---

## 🎮 如何游玩

1. 在主机上打开 `/manager`，用管理员密码登录。
2. 选一个测验并开始游戏 —— 会出现一个 PIN 码（通过 `/display` 在投影仪上展示它）。
3. 玩家在手机上打开网站，输入 PIN 码和一个昵称。
4. 尽可能快地作答 —— 答得又快又对得分更高。
5. 在每轮之间观看排行榜、奖牌和彩带。

更想独自游玩？打开任意测验的**单人**分享链接，按自己的节奏练习。

---

## ⚙️ 配置

运行时数据存放在 `config/`（已被 git 忽略，首次启动时初始化）。

### 游戏设置 —— `config/game.json`

```jsonc
{
  "managerPassword": "PASSWORD", // 修改它 —— 默认值会阻止管理员访问
  "teamMode": false,             // 启用红/蓝/绿/黄队
  "lowLatencyMode": { "enabled": false } // 可选启用的时序/体验收紧（见 docs/LOW-LATENCY-MODE.md）
}
```

### 测验 —— `config/quizz/*.json`

在管理员的编辑器中构建测验（推荐），或以 JSON 形式构建。一道题目支持多种 `type`（`choice`、`boolean`、`slider`，外加通过多个 `solutions` 实现的多选，以及填空作答）：

```jsonc
{
  "subject": "Python Basics",
  "questions": [
    {
      "question": "Which keyword defines a function in Python?",
      "type": "choice",
      "answers": ["func", "def", "function", "fun"],
      "solutions": [1],          // 从 0 开始的索引；多个 = 多选
      "time": 20,                 // 作答秒数（5–120）
      "cooldown": 5,              // 揭晓答案前的秒数（3–15）
      "media": { "type": "image", "url": "https://placehold.co/600x400.png" } // 可选
    }
  ]
}
```

AI 服务商（关闭 / 本地 ComfyUI / 云端）在管理员的 **AI** 标签页中配置；API 密钥存储在服务端的 `config/` 中，绝不会发送给客户端。

---

## 📺 投影仪 / kiosk 显示

`/display` 将主持人演示以全屏方式呈现，适用于投影仪或电视（采用基于 vh 缩放的字号，整个房间都能看清），可从手机配对。`/satellite/<gameId>` 路由是一个无控制的 kiosk 视图，使用令牌进行身份验证（无需管理员密码）。还附带一个可选的树莓派 satellite 镜像。

---

## 🧱 技术栈

一个 pnpm monorepo —— **`@razzoozle/web`**（React + Vite + Tailwind v4、TanStack Router、PWA）、**`@razzoozle/socket`**（Node + Socket.IO + Express、崩溃恢复快照）、**`@razzoozle/common`**（共享的、经 Zod 校验的类型），以及 **`@razzoozle/mcp`**（一个用于 AI 工具控制的 MCP 服务器）。以单个 Docker 镜像（通过 supervisord 运行 nginx + node）发布，带有一个 `/healthz` 端点 + Docker `HEALTHCHECK`。

---

## 🤝 贡献

欢迎提交 issue 和 pull request。在开启 PR 之前请运行 `pnpm verify`（类型检查 + lint + 测试）。

---

## ⭐ Star 历史

<a href="https://star-history.com/#joehomeskillet/Razzoozle&Date">
  <img src="https://api.star-history.com/svg?repos=joehomeskillet/Razzoozle&type=Date" width="600" alt="Star history" />
</a>

---

## 📝 致谢与许可

Razzoozle 是 [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) 的一个分支 —— 衷心感谢上游作者。基于 **[MIT 许可证](LICENSE)** 发布（© 2024 Ralex，© 2026 Razzoozle 贡献者）；保留了上游的 MIT 声明。
