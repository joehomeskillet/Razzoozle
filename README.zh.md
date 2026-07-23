<div align="center">

<img src="docs/screenshots/hero.webp" width="640" alt="Razzoozle" />

# Razzoozle

### 自托管、开源的实时测验平台 —— 采用简洁米色设计的 Kahoot 式主持人 + 手机游戏。

[English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · [Italiano](README.it.md) · 🌐 **中文**

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-CE422B?logo=rust&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![Tests](https://img.shields.io/badge/tests-592+-3DBFA0)

**[▶ 在线演示](https://razzoozle.joelduss.xyz)** · **[🌐 展示页](https://joehomeskillet.github.io/Razzoozle/)** · **[📚 文档](docs/)** · **[报告问题](https://github.com/joehomeskillet/Razzoozle/issues)** · *fork 自 [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## 这是什么？

Razzoozle 是一款自托管、实时的**测验游戏**，适用于教室、活动和游戏之夜。主持人在大屏幕上打开一局游戏，玩家用 PIN 码从手机加入，越快答对得分越高。它是 [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) 的友好分支，带有由管理员驱动的主题控制台、游戏化、团队与单人玩法，以及本地 AI 图像 —— 同时保留经典的彩色方块主持人 + 手机体验。

> 独立开源项目。与 Kahoot!® 或任何其他商业测验平台无关联、未获认可，亦无连接。

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

## 快速开始

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle

# 构建 Docker 镜像（包括 Web SPA + Rust 服务器）
DOCKER_BUILDKIT=1 docker build -f rust/Dockerfile -t razzoozle:latest .

# 运行 Postgres（需要 DATABASE_URL 环境变量）
# 例子：为管理员设置默认密码
docker run -d \
  -p 3020:3020 \
  -e DATABASE_URL='postgresql://razzoozle:password@postgres:5432/razzoozle' \
  -e BOOTSTRAP_ADMIN_PASSWORD='your-secure-password' \
  -v razzoozle-config:/config \
  razzoozle:latest

# 分别启动 Postgres 或添加到 docker-compose 中
# 详见 docs/Self-Hosting.md 的完整部署说明
```

服务器运行在端口 `3020` 并需要 PostgreSQL 数据库。打开应用，进入 `/manager`，并**修改默认的管理员密码**。在前面放置一个反向代理（Caddy/Traefik/nginx）以获得 TLS 和公共主机名。详见 **[Self-Hosting](docs/Self-Hosting.md)** 的详细设置。

---

## ✦ Razzoozle 相比 Razzia 新增的功能

| | 功能 |
| --- | --- |
| 🎨 | **主题控制台** —— 管理员中的实时"Design"标签页：颜色、各视图背景、徽标、圆角以及 **Flat ⇄ Glass** 风格切换，附带预设（默认的扁平**米色** + 可选的紫色 **liquid-glass** 预设）和具备对比度感知的取色器。 |
| ☕ | **扁平米色设计** —— 温暖的扁平米色界面，配有生动的动画背景（漂移的色块 + 漂浮的学习/知识图标）、扁平的文字标识/徽标，以及墨色配米色的答案方块。 |
| 🧊 | **Liquid-glass 界面** —— 可选的旧版玻璃拟态主题变体（磨砂、模糊表面），绝不影响扁平基线。 |
| 🎯 | **忠于 Kahoot 的游戏界面** —— 带经典形状图标（三角形 / 菱形 / 圆形 / 方形）的答案方块、圆形倒计时、已收答案计数器和动画领奖台。 |
| 🧑‍🎨 | **玩家头像** —— 每位玩家获得一个生成的 DiceBear 头像（选择风格 + 重新生成，或上传自己的）；头像在大厅中漂浮，并出现在排行榜、领奖台和奖项中。 |
| 🏆 | **游戏化** —— 15 项成就、奖章、连胜、彩带和提示音，以及个人奖杯陈列室。 |
| 🥇 | **赛末颁奖回顾** —— 动画式的最佳表现序列（手速最快、最大逆袭者、最长连胜、逆转之王……），展示每位获胜者的头像 + 名字，在自动播放中自动节奏。 |
| 👥 | **团队模式** —— 红 / 蓝 / 绿 / 黄队伍，配有实时团队排行榜。 |
| 📱 | **单人游戏** —— 通过分享链接单独练习任意测验，并拥有独立的得分历史。 |
| 🏫 | **学校班级模式** —— 可选的教师模式：创建班级、管理学生名册（添加学生、在班级间移动、移除）、为每位学生设置专属 PIN，并将测验整班布置，支持截止日期、作答次数限制以及隐私优先的假名成绩追踪。 |
| ✍️ | **九种题型** —— 单选、判断、投票、滑块、多选、输入答案、句子拼接、数学输入和词类（Wortarten），基于经典彩色方块答案。 |
| 📳 | **移动触觉反馈** —— 玩家手机上可选的振动反馈（倒计时、答题），支持减弱动效。 |
| 🔗 | **可分享的结果** —— 丰富的按结果链接预览（Open Graph 展开）、带"自己来玩 / 主持你自己的"行动号召的结果页，以及可下载的获胜者贴纸。 |
| 🤝 | **社区题目** —— 带管理员审核队列的公开提交页面，以及可复用的题目目录和测验存档。 |
| 🖼️ | **本地 AI 图像** —— 通过 ComfyUI（Z-Image）在本地设备生成题目/主题图像，或接入云端提供商 —— 密钥保留在服务器端。 |
| 🌍 | **6 种语言 + PWA** —— 英语、德语、法语、西班牙语、意大利语、中文；可安装、支持离线。 |
| 📺 | **投影仪 kiosk + 可靠性** —— `/display` 投影视图、低延迟模式、崩溃恢复、重连，以及用于 AI 工具控制的 MCP 服务器。 |
| 🎛️ | **统一管理控制台** —— 重新设计的管理界面，具有基于行的系统、多选操作、批量操作以及所有管理标签页中的一致控制。 |

由 **592+ 项自动化测试**、一次路径穿越 + `ws` CVE 安全审查、强化的未认证接口（每局资源上限 + 游戏驱逐、每 IP 速率限制、管理员认证防暴力破解节流、服务器签发的 host-token 认证以关闭 IDOR）以及带健康门控的 Docker 部署作为支撑。经负载测试可达 **600 名并发玩家**。

---

## Rust 服务器

Razzoozle 的后端是一个 **Rust 服务器**（`axum` + `socketioxide`，内存安全且占用低），涵盖所有游戏、管理、玩家和显示流程，并通过 socket.io 与未改动的 React 客户端通信。状态完全持久化在 **PostgreSQL** 中；不再有基于文件的持久化。

**→ Rust 内部实现、构建与测试：[`rust/README.md`](rust/README.md)**

---

## 智能体开发

Razzoozle 几乎完全由 AI 编码智能体开发，由人类监督协调。由多个专业模型和工具组成的多元团队共同合作，构建、测试、审查和部署功能。

| 智能体 | 角色 |
| --- | --- |
| Claude | 协调与审查 |
| Codex (GPT-5.6) | 全栈实现 |
| Cursor (GPT-5.6) | 代码细化与修复 |
| Grok (xAI) | Rust 后端实现 |
| Gemini (Google) | 长上下文审查与评判 |
| 开放模型 | Qwen、DeepSeek、Nemotron |
| 本地推理 | Intel Arc 上的 OpenVINO |
| Browser QA (Playwright) | 端到端游戏测试 |

人类审查并合并每个提交。AI 增强速度和质量，而不是替代判断。

---

## 配置与文档

运行时数据位于 `config` 卷中，在首次启动时初始化。游戏设置在 `config/game.json` 中；测验在管理员编辑器中编写，或作为 `config/quizz/*.json`。参见 **[docs/](docs/)**：[Self-Hosting](docs/Self-Hosting.md) · [Configuration](docs/Configuration.md) · [Theming](docs/Theming.md) · [Low-latency mode](docs/LOW-LATENCY-MODE.md)。

---

## 贡献

欢迎提交 issue 和 pull request。在提交 PR 前运行 `pnpm verify`（类型检查 + lint + 测试）；对于 Rust 改动，运行 `bash rust/gate.sh`。

---

## 致谢与许可证

[**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) 的一个分支 —— 感谢上游作者。基于 **[MIT 许可证](LICENSE)** 发布（© 2024 Ralex，© 2026 Razzoozle 贡献者）。
