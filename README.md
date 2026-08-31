<div align="center">

# Roleplay Agent

**AI 角色扮演对话系统** —— 自定义角色 · 多模型切换 · Agent 工具调用 · MCP 服务器 · 插件扩展

[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-66%20passed-brightgreen)](#-测试)

基于 Next.js 构建的本地 AI 角色扮演 Agent。所有数据（对话、API Key、记忆）仅保存在本地，不依赖任何云端服务。

</div>

---

## 目录

- [功能特性](#-功能特性)
  - [角色扮演](#-角色扮演)
  - [多模型支持](#-多模型支持)
  - [Agent 工具调用](#-agent-工具调用)
  - [MCP 服务器](#-mcp-服务器)
  - [插件系统](#-插件系统)
  - [定时提醒](#-定时提醒)
  - [其他](#-其他)
- [安全设计](#-安全设计)
- [快速开始](#-快速开始)
  - [环境要求](#环境要求)
  - [安装运行](#安装运行)
  - [配置模型](#配置模型)
- [使用指南](#-使用指南)
  - [添加 MCP 服务器](#添加-mcp-服务器)
  - [安装插件](#安装插件)
- [常用脚本](#-常用脚本)
- [项目结构](#-项目结构)
- [测试](#-测试)
- [贡献](#-贡献)
- [免责声明](#-免责声明)
- [License](#-license)

---

## 功能特性

### 角色扮演

- **自定义角色**：创建、编辑、删除角色，内置 6 套预设模板一键创建
- **角色状态系统**：心情、好感度、信任度等 6 维状态随对话动态演化
- **剧情事件**：根据对话进展自动触发剧情节点
- **长期记忆**：向量数据库存储角色记忆，LLM 自动生成记忆摘要
- **角色头像**：支持上传图片作为角色头像

### 多模型支持

兼容所有 OpenAI 格式 API：Kimi、DeepSeek、通义千问、OpenAI、Ollama 等，运行时可随时切换。

### Agent 工具调用

| 类别 | 工具 | 说明 |
|------|------|------|
| 浏览器 | `browse_webpage` / `screenshot_webpage` | Playwright 无头浏览器（可选依赖） |
| 系统 | `run_command` / `read_file` / `write_file` 等 | **白名单 + 黑名单双重防护** |
| 实用 | `get_weather` / `calculate` / `web_search` | 天气、计算、网络搜索 |
| 提醒 | `set_reminder` | 中文自然语言定时提醒 |

真正的 **ReAct Agent 循环**：模型发起工具调用 → 执行 → 结果以标准 `tool` 消息回传 → 模型基于结果继续决策，最多循环 N 轮（可配置），支持多步任务。对话历史以完整消息序列传给模型，上下文不再断裂。

- **人工审批**：高危工具（执行命令 / 写文件 / 打开应用 / 桌面截图）默认需要你在界面上点「同意」才会执行，可切换为自动模式
- **工具开关**：每个工具可单独启用 / 禁用
- **Token 用量统计**：按模型累计输入 / 输出 tokens
- **审计日志**：每次工具执行写入 `data/audit.log`，可追溯

### MCP 服务器

接入标准 [Model Context Protocol](https://modelcontextprotocol.io) 服务器，直接复用 Claude Desktop、Cursor 等生态中的工具：

- **传输方式**：stdio（本地命令）/ SSE / HTTP
- **自动发现**：连接后自动列出服务器提供的全部工具
- **工具命名**：`mcp__<服务器>__<工具名>`，与内置工具统一开关管理
- **状态监控**：实时显示连接状态、工具数量、错误信息
- **懒连接缓存**：同一服务器复用连接，避免重复启动子进程

在「工具」设置弹窗中添加 / 编辑 / 测试 / 删除 MCP 服务器即可。

### 插件系统

轻量自定义 HTTP 工具包：在 `plugins/` 目录下放置 `plugin.json` 清单即可扩展 Agent 能力。

```json
{
  "name": "todo",
  "displayName": "待办插件",
  "version": "1.0.0",
  "tools": [
    {
      "name": "list",
      "description": "列出待办事项",
      "parameters": { "type": "object", "properties": {} },
      "http": { "url": "https://todo.example.com/list", "method": "GET" }
    }
  ]
}
```

- 支持 GET / POST 调用，参数自动填入 query / body
- 工具命名：`plugin__<插件>__<工具名>`
- 插件工具与 MCP / 内置工具共享同一套开关、审批、审计机制
- 支持 `plugins/<name>/plugin.json` 目录形态或 `plugins/<name>.json` 单文件形态

### 定时提醒

支持中文自然语言时间描述，到时自动弹窗：

> "10分钟后"、"半小时后"、"明天下午3点"、"今晚10点"、"8月30日 15:00"……

提醒持久化存储，服务重启不丢失。

### 其他

- **真实流式输出**：逐 token 返回，非模拟打字机
- **对话管理**：导入/导出（JSON / Markdown），全量备份恢复
- **深色/浅色主题**：极简黑白设计
- **API Key 加密**：本地 AES-256-GCM 加密存储

---

## 安全设计

- **人工审批**：高危工具（执行命令 / 写文件 / 打开应用 / 桌面截图）默认需要人工确认后才执行（可在「工具」设置中切换）
- **命令执行双重防线**：黑名单（关机/格式化/注入等）+ 白名单（默认仅放行 node、npm、git 等开发命令），可设 `ROLEPLAY_ALLOW_ANY_COMMAND=1` 解锁（风险自负）
- **敏感文件保护**：`.ssh`、`.env`、`id_rsa`、`credentials.json` 等凭据文件禁止 AI 读写
- **审计日志**：所有工具执行记录（参数、结果摘要、是否经批准）写入 `data/audit.log`
- **本地加密**：API Key 使用机器派生密钥加密，不明文落盘
- **超时与重试**：工具执行有超时保护，LLM 调用对限流/网络错误自动退避重试

---

## 快速开始

### 环境要求

- Node.js >= 18（推荐 20+）
- Windows / macOS / Linux

### 安装运行

```bash
git clone https://github.com/Alaswint/-Agent.git
cd roleplay-agent

npm install

# 浏览器工具需要（可选，playwright 为可选依赖）
npx playwright install chromium

# 开发模式
npm run dev
```

访问 `http://127.0.0.1:5000`

### 生产部署

```bash
npm run build
npm start
```

### 配置模型

首次使用需添加模型：点击顶部 **⚙** → 添加新模型，填入 Base URL、模型 ID 和 API Key。

| 服务商 | Base URL | 模型 ID |
|--------|----------|---------|
| Kimi | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-turbo` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Ollama | `http://localhost:11434/v1` | `llama3` |

> 在模型配置里填写 **Embedding 模型 ID** 后，长期记忆功能自动启用（如 Kimi 的 `moonshot-v1-embedding`）；不填也不影响对话。

---

## 使用指南

### 添加 MCP 服务器

1. 打开界面 → 顶部「工具」按钮 → 工具设置弹窗
2. 在「MCP 服务器」区域点击「添加」
3. 选择传输方式：
   - **stdio**：填写命令（如 `npx` / `uvx` / `node`）和参数
   - **SSE / HTTP**：填写服务器 URL
4. 点击「保存」→「测试」验证连接
5. 启用服务器后，其工具自动出现在 Agent 可用列表中

### 安装插件

1. 在项目根目录创建 `plugins/` 文件夹
2. 创建插件清单文件，例如 `plugins/weather.json`：

```json
{
  "name": "weather",
  "displayName": "天气插件",
  "version": "1.0.0",
  "tools": [
    {
      "name": "query",
      "description": "查询指定城市天气",
      "parameters": {
        "type": "object",
        "properties": {
          "city": { "type": "string", "description": "城市名" }
        },
        "required": ["city"]
      },
      "http": {
        "url": "https://api.example.com/weather",
        "method": "GET"
      }
    }
  ]
}
```

3. 刷新页面，插件自动加载并在「工具」设置中显示

---

## 常用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器（端口 5000） |
| `npm run build` | 生产构建 |
| `npm start` | 启动生产服务器 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm test` | 运行 66 项单元测试 |
| `npm run lint` | ESLint 检查 |
| `npm run lint:fix` | ESLint 自动修复 |
| `npm run format` | Prettier 格式化 |

---

## 项目结构

```
roleplay-agent/
├── app/                          # Next.js 页面和 API 路由
│   ├── api/
│   │   ├── chat/                 # 对话流、审批恢复
│   │   ├── characters/           # 角色 CRUD
│   │   ├── models/               # 模型配置
│   │   ├── mcp/                  # MCP 服务器管理
│   │   ├── plugins/              # 插件列表
│   │   ├── reminders/            # 定时提醒
│   │   ├── tools/                # 工具开关、配置、审计
│   │   └── usage/                # Token 用量统计
│   └── page.tsx                  # 主界面
├── lib/
│   ├── agents/                   # 输入理解 / 后处理 Agent
│   ├── mcp/                      # MCP 客户端与桥接
│   │   ├── config.ts             # 服务器配置持久化
│   │   ├── manager.ts            # 连接管理、工具发现/调用
│   │   └── bridge.ts             # MCP Schema → 内部 Tool 格式
│   ├── plugins/                  # 插件系统
│   │   └── loader.ts             # 扫描 plugins/ 目录，HTTP 调用
│   ├── tools/                    # 内置工具定义与实现
│   │   ├── registry.ts           # 工具注册表
│   │   ├── tool-settings.ts      # 开关、审批、Agent 参数
│   │   ├── audit.ts              # 审计日志
│   │   └── types.ts              # 工具类型定义
│   ├── dynamic-tools.ts          # MCP + 插件动态工具聚合
│   ├── agent-loop.ts             # ReAct Agent 循环（多轮工具调用）
│   ├── engine.ts                 # 对话引擎（组装 Agent Loop）
│   ├── llm.ts                    # LLM 调用封装（流式 + 工具 + 重试）
│   ├── usage.ts                  # Token 用量统计
│   ├── memory.ts                 # 长期/短期记忆
│   ├── vector-db.ts              # 向量数据库
│   ├── prompt-engine.ts          # Prompt 构建
│   ├── reminder-time.ts          # 中文自然语言时间解析
│   └── reminder-store.ts         # 提醒持久化 + 调度器
├── tests/                        # 单元测试
├── characters/                   # 角色数据（JSON）
├── plugins/                      # 插件目录（运行时创建）
└── data/                         # 运行时数据（已 gitignore）
    ├── tool-settings.json        # 工具配置
    ├── mcp.json                  # MCP 服务器配置
    ├── usage.json                # Token 用量
    └── audit.log                 # 审计日志
```

---

## 测试

```bash
npm test
```

覆盖范围：

- **Agent Loop**：多轮工具循环、标准 tool 消息序列、审批暂停、轮数上限、超时降级
- **MCP 桥接**：工具命名/解析、Schema 转换、结果文本提取
- **插件系统**：清单校验、目录扫描、工具命名/解析
- **工具配置**：默认值、开关持久化、审批模式切换、参数钳制、高危清单
- **安全**：危险命令黑名单、命令白名单与注入拦截、敏感路径拦截
- **时间解析**：相对时长、日期 + 时刻、绝对日期、已过时间顺延
- **向量数据库**：插入、检索、upsert、持久化、删除
- **JSON 容错**：LLM 输出 JSON 提取与修复

---

## 界面预览

极简黑白设计，支持深浅色主题切换。

<!-- 开源后建议截图替换此处 -->
<!-- ![主界面](docs/screenshot-main.png) -->

---

## 贡献

欢迎 Issue 和 PR：

1. Fork 本仓库
2. 创建分支：`git checkout -b feature/your-feature`
3. 提交改动：`git commit -m "feat: add your feature"`
4. 推送：`git push origin feature/your-feature`
5. 提交 Pull Request

提交前请确保 `npm run typecheck` 和 `npm test` 通过。

---

## 免责声明

本项目仅供学习与研究用途。工具调用功能会执行本地命令和读写文件，请自行评估风险；`data/` 目录包含你的对话记录与加密密钥，请勿提交到公开仓库（`.gitignore` 已默认排除）。

---

## License

[MIT](./LICENSE) © Alaswint
