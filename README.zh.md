<div align="center">

<img src="docs/screenshots/hero.webp" width="680" alt="Razzoozle" />

# Razzoozle

### 一个自托管、开源的实时答题平台 —— 包裹在紫罗兰色液态玻璃界面之中。

🌐 [English](README.md) · [Deutsch](README.de.md) · **中文**

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-149ECA?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-06B6D4?logo=tailwindcss&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Tests](https://img.shields.io/badge/tests-350%2B-3DBFA0)

**[▶ 在线演示](https://razzoozle.joelduss.xyz)** · **[📚 Docs](docs/)** · **[反馈问题](https://github.com/joehomeskillet/Razzoozle/issues)** · *fork 自 [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## 🧩 这是什么？

Razzoozle 是一个自托管、实时的**答题游戏**，适用于课堂、活动和游戏之夜。主持人在大屏幕上开局，玩家用手机输入 PIN 码加入，所有人争相作答 —— 答得又快又对得分更高。它是 [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) 的一个友好分支，围绕一种别具一格的**紫罗兰色液态玻璃**外观重新打造，配备由管理员驱动的主题系统、游戏化机制、团队与单人玩法以及本地 AI 图像生成 —— 同时保留经典的 Kahoot 风格主持人 + 手机体验（带形状的彩色答案方块、倒计时、领奖台）。

> Razzoozle 是一个独立的开源项目。它与 Kahoot!® 或任何其他商业答题平台没有关联、未获其认可，也与之无任何联系。

---

## 📸 截图

<div align="center">

| 主持人 / 主屏 | 玩家手机 |
| :---: | :---: |
| <img src="docs/screenshots/presenter.webp" width="420" alt="Presenter screen" /> | <img src="docs/screenshots/phone.webp" width="200" alt="Player phone" /> |

| 桌面游戏客户端 | 管理员 · 主题驾驶舱 |
| :---: | :---: |
| <img src="docs/screenshots/desktop.webp" width="420" alt="Desktop game client" /> | <img src="docs/screenshots/admin.webp" width="420" alt="Manager theme cockpit" /> |

<img src="docs/screenshots/start.webp" width="680" alt="Host start screen with the Game PIN" />

</div>

---

## ✦ Razzoozle 相较 Razzia 新增了什么

| | 功能 |
| --- | --- |
| 🎨 | **主题驾驶舱** —— 一个实时的管理员"设计"标签页：颜色、各视图背景、Logo、圆角，以及一个 **扁平 ⇄ 玻璃** 风格切换开关，附带预设（一个紫罗兰色**液态玻璃**预设和一个扁平默认预设）以及对比度感知的取色器。模板可**导出 / 导入**为 JSON 文件，并提供一个**编辑**操作，可在设计器中重新打开已保存的模板。 |
| 🕹️ | **进行中游戏控制台** —— 一个实时的管理员视图，一目了然地查看每一场进行中的游戏：可在同一处结束某场游戏，或接管某场游戏。 |
| 🧊 | **液态玻璃界面** —— 一个可选启用的玻璃拟态主题变体（磨砂、模糊的表面），绝不触碰扁平基线。 |
| 🎯 | **忠于 Kahoot 的游戏界面** —— 带经典形状图标（三角形 / 菱形 / 圆形 / 方形）的答案方块、一个环形倒计时计时器、一个已收到答案计数器，以及一个带动画的领奖台。 |
| 🏆 | **游戏化** —— 15 项成就、奖牌、连胜、彩带和音效铃声，外加个人奖杯陈列室。 |
| 👥 | **团队模式** —— 红 / 蓝 / 绿 / 黄队，配实时团队排行榜。 |
| 📱 | **单人玩法** —— 通过分享链接独自练习任意测验，拥有自己的得分历史。 |
| ✍️ | **更多题型** —— 在经典单选之外，新增多选、填空作答和滑块。 |
| 🤝 | **社区题目** —— 一个公开的投稿页面，配管理员审核队列，外加可复用的题目目录和测验存档。 |
| 🖼️ | **本地 AI 图像** —— 通过 ComfyUI（Z-Image）在本地设备上生成题目/主题图像，或接入云端服务商 —— 密钥始终留在服务端。 |
| 🌍 | **6 种语言 + PWA** —— 英语、德语、法语、西班牙语、意大利语、中文；可安装、支持离线感知。 |
| 📺 | **投影仪 kiosk 模式 + 可靠性** —— 一个 `/display` 投影仪视图、低延迟模式、崩溃恢复、断线重连，以及一个用于 AI 工具控制的 MCP 服务器。离开大厅会立即拆除该场游戏（不留幽灵游戏），游戏 PIN 码会进行冲突检查，答错时会揭晓正确答案。 |

由 **350+ 项自动化测试**支撑，经过路径遍历 + `ws`-CVE 安全检查，以及一个基于健康检查门控的 Docker 部署。已通过 **600 名并发玩家**的负载测试。

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

在**自动模式**下，主持人会立即推进当前屏幕，并通过一个实时倒计时显示下一屏何时出现。点击**退出**会要求主持人确认，随后玩家会看到一个清晰的"主持人已结束游戏"画面，而不是被直接踢出。

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
