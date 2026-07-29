<div align="center">

<img src="docs/screenshots/hero.webp" width="640" alt="Razzoozle 欢迎界面，显示 PIN 输入和动画背景" />

# Razzoozle

### 自托管、开源的实时测验平台 —— Kahoot 式主持人 + 手机游戏，采用清爽的奶油色设计。

[English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · [Italiano](README.it.md) · 🌐 **中文**

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-CE422B?logo=rust&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![Tests](https://img.shields.io/badge/tests-592+-3DBFA0)

**[▶ 在线演示](https://rust.razzoozle.xyz)** · **[🌐 展示](https://joehomeskillet.github.io/Razzoozle/)** · **[📚 文档](docs/)** · **[报告问题](https://github.com/joehomeskillet/Razzoozle/issues)** · *衍生自 [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## 什么是 Razzoozle？

Razzoozle 是一个自托管、实时的**测验游戏平台**，适用于教室、活动和游戏之夜。主持人在大屏幕上打开游戏，玩家用 PIN 码从手机加入，越快答对得分越高。这是 [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) 的友好分支，配备主持人驱动的主题控制舱、游戏化、团队和单人模式以及本地 AI 图像 —— 保留经典的彩色方块出题器 + 手机游戏体验。

> 独立的开源项目。与 Kahoot!® 或任何其他商业测验平台无关。

---

## 快速开始

### 选项 1：本地开发

需要 Node 22+ 和 pnpm 11+。

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
pnpm install
pnpm dev
```

打开 `http://localhost:3000`（Web 客户端）。服务器在独立端口运行（支持热重载）。

### 选项 2：Docker（推荐用于生产环境）

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle

# 构建 Docker 镜像（包含 Web SPA + Rust 服务器）
DOCKER_BUILDKIT=1 docker build -f rust/Dockerfile -t razzoozle:latest .

# 使用 Postgres 运行（需要 DATABASE_URL 环境变量）
# 示例：为主持人设置默认管理员密码
docker run -d \
  -p 3020:3020 \
  -e DATABASE_URL='postgresql://razzoozle:password@postgres:5432/razzoozle' \
  -e BOOTSTRAP_ADMIN_PASSWORD='你的安全密码' \
  -v razzoozle-config:/config \
  razzoozle:latest
```

<div align="center">
<img src="docs/screenshots/start.webp" width="680" alt="主持人启动界面，显示游戏 PIN 和玩家加入二维码" />
</div>

服务器运行在端口 `3020` 上，需要 PostgreSQL 数据库。打开应用，进入 `/manager`，**更改默认的管理员密码**。使用反向代理（Caddy/Traefik/nginx）处理 TLS 和公共主机名。详见 **[自托管](docs/Self-Hosting.md)** 获取详细设置。

---

## ✦ Razzoozle 相比 Razzia 的新增功能

| | 功能 |
| --- | --- |
| 🎨 | **主题控制舱** —— 实时主持人"设计"标签，支持颜色、分视图背景、logo、圆角、预设和对比度感知的颜色选择器。 |
| ☕ | **平面奶油色设计** —— 温暖的平面奶油色界面，采用生动的动画背景（漂动的色块 + 飘浮的学校/知识图标）、平面 logo 和奶油色背景上的墨色答题方块。 |
| 🎯 | **Kahoot 风格游戏界面** —— 带有经典形状图标的答题方块（三角形 / 菱形 / 圆形 / 正方形）、圆形倒计时器、答题计数器和动画领奖台。 |
| 🧑‍🎨 | **玩家头像** —— 每个玩家都获得一个生成的 DiceBear 头像（选择风格 + 重新生成或上传自己的）；头像在大厅周围浮动，并出现在排行榜、领奖台和奖项上。 |
| 🏆 | **游戏化** —— 14 项成就、勋章、连胜、彩带和音效，加上个人奖杯库。 |
| 🥇 | **游戏结束奖项回顾** —— 动画超级形容词序列（最快的手指、最大的爬升者、最长连胜、王者归来…），展示每个获胜者的头像和名字，自动播放。 |
| 👥 | **团队模式** —— 红 / 蓝 / 绿 / 黄色团队，配备实时团队排行榜。 |
| 📱 | **单人游戏** —— 通过共享链接独自练习任何测验，拥有自己的分数历史。 |
| 🏫 | **学校班级模式** —— 可选的教师模式：创建班级、管理学生名单（添加学生、在班级间移动、删除），为每个学生分配个人 PIN，并为整个班级分配测验，支持截止日期、尝试次数限制和隐私优先的匿名结果追踪。 |
| ✍️ | **十七种题型** —— 单选、判断、投票、滑块、多选、文字输入、句子拼接、数学计算、词性、排序、填空、配对、标记、词云、头脑风暴、信心度和微课程，加上经典的彩色答题方块。 |
| 📳 | **移动振动反馈** —— 玩家手机上的可选振动反馈（倒计时、答题），尊重减少运动偏好。 |
| 🔗 | **可分享结果** —— 丰富的结果链接预览（Open Graph unfurl）、结果页面（带有"自己玩 / 主持自己的"号召性用语）和可下载的获胜者贴纸。 |
| 🤝 | **社区题目** —— 公开投稿页面、主持人审核队列、可复用题库和测验存档。 |
| 🖼️ | **本地 AI 图像** —— 通过 ComfyUI（Z-Image）在设备上生成题目/主题图像，或接入云提供商 —— API 密钥保留在服务器端。 |
| 🌍 | **6 种语言 + PWA** —— 英文、德文、法文、西班牙文、意大利文、中文；可安装，离线感知。 |
| 📺 | **投影仪展示 + 可靠性** —— `/display` 投影仪视图、低延迟模式、崩溃恢复、重新连接和 MCP 服务器用于 AI 工具控制。 |
| 🎛️ | **统一主持人控制台** —— 重新设计的主持人 UI，采用行基系统、多选操作、批量操作和所有管理标签间的一致控制。 |

支撑 **592+ 自动化测试**、路径遍历 + `ws` CVE 安全审计、强化的无认证表面（每个游戏的资源上限 + 游戏驱逐、每 IP 速率限制、主持人认证暴力破解节流、服务器铸造的主机令牌认证关闭 IDOR）和健康门控 Docker 部署。负载测试至 **600 个并发玩家**。

---

## 游戏体验

### 主持人和出题屏幕

主持人在大屏幕上使用经典 Kahoot 风格的答题方块控制游戏：

<div align="center">
<img src="docs/screenshots/presenter.webp" width="680" alt="出题屏幕，显示大型答题方块、倒计时器和答题计数器" />
</div>

### 玩家手机和桌面客户端

玩家从手机或桌面加入，看到相同的题目、方块、当前分数和倒计时器：

<div align="center">

| 手机玩家 | 桌面玩家 |
| :---: | :---: |
| <img src="docs/screenshots/phone.webp" width="280" alt="手机玩家视图，显示题目和答题按钮" /> | <img src="docs/screenshots/desktop.webp" width="420" alt="桌面玩家视图，显示答题方块" /> |

</div>

### 头像选择

每个玩家在加入前选择或生成头像：

<div align="center">
<img src="docs/screenshots/avatar.webp" width="420" alt="头像选择屏幕，显示 DiceBear 风格选项和上传选项" />
</div>

---

## 主持人主题控制舱

实时自定义整个外观和感受 —— 颜色、背景、动画和字体 —— 无需编写代码：

<div align="center">
<img src="docs/screenshots/admin.webp" width="680" alt="主持人设计控制面板，显示主题设置和实时预览" />
</div>

---

## Rust 服务器

Razzoozle 的后端是一个 **Rust 服务器**（`axum` + `socketioxide`，内存安全且低占用），覆盖所有游戏、主持人、玩家和展示流程，通过 socket.io 与不变的 React 客户端通信。游戏状态持久化到 **PostgreSQL**；测验模板以文件形式存储在 `config/templates/*.json`。

**→ Rust 内部实现、构建和测试：[`rust/README.md`](rust/README.md)**

---

## 由 AI 代理开发

Razzoozle 几乎完全由 AI 编码代理开发，由人工监督进行编排。一个多样化的专业模型和工具团队合作构建功能、测试、审查和部署。

| 代理 | 角色 |
| --- | --- |
| Claude | 编排和审查 |
| Codex (GPT-5.6) | 全栈实现 |
| Cursor (GPT-5.6) | 代码改进和修复 |
| Grok (xAI) | Rust 后端实现 |
| Gemini (Google) | 长上下文审查和判断 |
| 开源模型 | Qwen、DeepSeek、Nemotron |
| 本地推理 | Intel Arc 上的 OpenVINO |
| 浏览器 QA（Playwright） | 端到端游戏测试 |

人类审查并合并每个提交。AI 增强速度和质量，而不是替代判断力。

---

## 配置和文档

运行时数据存储在 `config` 卷中，在首次启动时初始化。游戏设置在 `config/game.json`；测验在主持人编辑器中创作或作为 `config/quizz/*.json`。详见 **[docs/](docs/)**：[自托管](docs/Self-Hosting.md) · [配置](docs/Configuration.md) · [主题](docs/Theming.md) · [低延迟模式](docs/LOW-LATENCY-MODE.md)。

---

## 贡献

欢迎提交 Issue 和 Pull Request。在打开 PR 前运行 `pnpm verify`（类型检查 + lint + 测试）；对于 Rust 更改，运行 `bash rust/gate.sh`。

---

## 致谢和许可证

[**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) 的分支 —— 感谢上游作者。在 **[MIT 许可证](LICENSE)** 下发布（© 2024 Ralex，© 2026 Razzoozle 贡献者）。
