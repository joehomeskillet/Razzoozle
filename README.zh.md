<div align="center">

<img src="docs/screenshots/hero.webp" width="640" alt="Razzoozle" />

# Razzoozle

### 自托管、开源的实时测验平台 —— Kahoot 式主持人 + 手机游戏。

[English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · [Italiano](README.it.md) · 🌐 **中文**

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![Rust](https://img.shields.io/badge/Rust-CE422B?logo=rust&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)

**[▶ 在线演示](https://rust.razzoozle.xyz)** · **[📚 文档](docs/)** · **[报告问题](https://github.com/joehomeskillet/Razzoozle/issues)** · *fork 自 [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## 什么是 Razzoozle?

自托管、实时的测验平台，适用于教室和活动。主持人在大屏幕上打开游戏，玩家用 PIN 码从手机加入，越快答对得分越高。它支持 17 种题型（选择、判断、滑块、投票、多选、文字输入、句子拼接、数学、词性、排序、填空、配对、标点、词云、头脑风暴、信心度、微课程），团队和单人模式，以及一个管理员控制台用于自定义主题、游戏化、班级管理和本地 AI 图像生成。

**功能特性：** [在线演示](https://rust.razzoozle.xyz) · [完整功能列表](docs/README.md) · 592+ 项测试 · Docker + Rust 服务器

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
DOCKER_BUILDKIT=1 docker build -f rust/Dockerfile -t razzoozle:latest .
docker run -d -p 3020:3020 \
  -e DATABASE_URL='postgresql://razzoozle:password@postgres:5432/razzoozle' \
  -e BOOTSTRAP_ADMIN_PASSWORD='change-me' \
  -v razzoozle-config:/config \
  razzoozle:latest
```

应用在 `http://localhost:3020` 上运行。详见 **[自托管](docs/Self-Hosting.md)** 获取反向代理 + TLS 设置。

---

## 后续步骤

- **管理员设置：** 打开 `/manager`，使用引导密码登录，**立即修改**。
- **部署到生产：** [自托管指南](docs/Self-Hosting.md)
- **自定义外观：** [主题设置](docs/Theming.md)
- **配置游戏：** [配置文档](docs/Configuration.md)
- **Rust 内部实现：** [rust/README.md](rust/README.md)

---

## 贡献

欢迎提交 Issue 和 Pull Request。在提交 PR 前：

```bash
pnpm verify          # 类型检查 + lint + 测试
bash rust/gate.sh    # Rust 后端测试（如有修改）
```

---

## 许可证和致谢

MIT 许可证（© 2024 Ralex，© 2026 Razzoozle 贡献者）。Fork 自 [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia)。
