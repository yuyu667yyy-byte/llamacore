# Llamacore

A full-featured desktop client for [llama.cpp](https://github.com/ggerganov/llama.cpp), built with Electron + Vite + React + TypeScript. Chat with local GGUF models, manage `llama-server` processes, convert Hugging Face models to GGUF, monitor training, and build multi-step AI workflows — all from one app.

> 中文说明见本文档下半部分。

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Launch in development mode (hot reload)
npm run electron:dev
```

Then, inside the app:

1. Open the **Models** tab → **Add model**, pick a `.gguf` file, set a port.
2. Click **Start** to launch the `llama-server` process for that model.
3. Switch to the **Chat** tab, select the model in the top bar, and start chatting.

You need a `llama-server` binary on your `PATH` (from a built llama.cpp). See [Installing Dependencies](#installing-dependencies).

---

## Features & Usage

### Chat
- Streaming (SSE) responses with live token output, or non-streaming mode.
- Markdown rendering with code highlighting, GFM tables, and KaTeX math (with copy-LaTeX buttons).
- **Thinking / reasoning mode** — toggle it in the top bar to send `reasoning_effort` (low / medium / high); the model's reasoning is shown in a collapsible block.
- **Per-message metrics** below each AI reply: a live thinking timer, live tokens/sec while generating, and final average / peak tokens/sec plus token count.
- Multimodal input — attach images to a message for vision-capable models.
- Edit any user message to re-run the conversation from that point.
- JSON mode, web search flag, adjustable temperature / max tokens, and custom system + formatting prompts.
- Background generation: switch conversations mid-stream and the reply keeps saving to its own conversation.

### Models
- Add, edit, and delete GGUF model configurations (path, port, extra `llama-server` args).
- Start / stop a `llama-server` process per model, with live server logs.
- Flags for multimodal and web-search support per model.

### Conversations
- Local history in the sidebar: new, rename (right-click), and delete.
- Stored on disk as JSON (see [Data storage](#data-storage)).

### Convert (HF → GGUF)
- Run `convert_hf_to_gguf.py` from a local model directory or a Hugging Face model ID.
- Pick output path and quantization type; conversion logs stream live.
- Requires Python and a llama.cpp checkout containing the script (see below).

### Training Monitor
- Embed a running **TensorBoard** instance by URL, or
- Point at a training **log file** (`.log`, `.txt`, `.jsonl`); the chart refreshes every 2 s.

### Workflow
- Visual node-graph editor to chain AI steps. Node types:
  - **Input / Output** — entry and exit of the graph.
  - **LLM** — call a configured model with a system prompt and a `{{input}}` template.
  - **Tool** — run a shell command (with optional working directory). Every command requires explicit confirmation before it runs.
  - **Router** — branch by keyword; each route has its own output port. Unmatched input flows from the `default` port.
  - **Merge** — combine branches by `concat`, `vote` (most common answer), or `first`.
- Drag from an output port to an input port to connect; click an edge to delete it.
- Runs are validated before execution (missing model, no output node, cycles) with clear messages.
- Live tokens/sec while a node generates, per-node output inspection, and aggregate average / peak after the run.

### Appearance & Language
- Dark / light theme, persisted across sessions.
- Bilingual UI: English and 简体中文.

---

## Installing Dependencies

### Node.js
- [Node.js](https://nodejs.org/) **>= 18**. Run `npm install` in the project folder.

### llama-server (required for chat)
- Build [llama.cpp](https://github.com/ggerganov/llama.cpp) and ensure `llama-server` (or `llama-server.exe` on Windows) is on your `PATH`, or place it next to the packaged app.
- Download GGUF models (e.g. from Hugging Face) and add them in the **Models** tab.

### Python + script (only for Convert)
- [Python](https://www.python.org/) **3.8+** on your `PATH`.
- The `convert_hf_to_gguf.py` script from a llama.cpp checkout, plus its requirements:
  ```bash
  pip install -r /path/to/llama.cpp/requirements.txt
  ```

---

## Build a distributable

```bash
npm run electron:build
# Output in release/
```

| Platform | Run |
|----------|-----|
| **Windows** | `release\Llamacore Setup x.x.x.exe`, then open from the Start menu. |
| **macOS** | Open the `.dmg`, drag to Applications. If blocked, allow it in System Settings → Privacy & Security. |
| **Linux** | `chmod +x "release/Llamacore-x.x.x.AppImage"` then run it. |

---

## Data storage

Conversations, model configs, settings, and workflows are stored locally as JSON:

- **Windows**: `%APPDATA%\Llamacore\llamacore.json`
- **macOS**: `~/Library/Application Support/Llamacore/llamacore.json`
- **Linux**: `~/.config/Llamacore/llamacore.json`

---

## Disclaimer

This software is provided "as is", without warranty of any kind, express or implied. Use it at your own risk.

- **Workflow Tool nodes execute shell commands on your machine.** Although every command requires explicit confirmation, you are solely responsible for what you run. Do not execute untrusted commands or untrusted workflows.
- The app launches and manages local `llama-server` and Python processes; it does not sandbox them.
- Llamacore is an independent client and is not affiliated with or endorsed by the llama.cpp project or any model provider. Model outputs may be inaccurate — verify anything important.
- You are responsible for complying with the licenses and usage terms of any models you load.

---

## License & Attribution

Released under the **MIT License** — see [LICENSE](./LICENSE).

Copyright (c) 2026 Lucas Vann (陆凯文).

This app bundles or depends on third-party open-source software (llama.cpp, Electron, React, Vite, Tailwind CSS, Zustand, i18next, react-markdown, KaTeX, Recharts, and others), each under its own license. See [NOTICE](./NOTICE) for the list.

---

# Llamacore （中文说明）

基于 [llama.cpp](https://github.com/ggerganov/llama.cpp) 的功能完整桌面客户端，使用 Electron + Vite + React + TypeScript 构建。可与本地 GGUF 模型对话、管理 `llama-server` 进程、将 Hugging Face 模型转换为 GGUF、监测训练，并搭建多步骤 AI 工作流——全部集成在一个应用中。

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 启动开发模式（支持热重载）
npm run electron:dev
```

随后在应用内：

1. 打开**模型**标签页 →「添加模型」，选择 `.gguf` 文件并设置端口。
2. 点击**启动**，为该模型启动 `llama-server` 进程。
3. 切换到**对话**标签页，在顶栏选择该模型，开始对话。

你需要在系统 `PATH` 中提供 `llama-server` 可执行文件（来自编译好的 llama.cpp）。详见[安装依赖](#安装依赖)。

## 功能与使用

### 对话
- 流式（SSE）逐字输出，或非流式模式。
- Markdown 渲染，含代码高亮、GFM 表格、KaTeX 公式（带「复制 LaTeX」按钮）。
- **思考 / 推理模式**——在顶栏开启后，每次请求携带 `reasoning_effort`（低 / 中 / 高），推理过程以可折叠块展示。
- **每条消息的指标**显示在 AI 回复下方：实时思考计时、生成中的实时 tokens/秒，以及结束后的平均 / 峰值 tokens/秒和 token 总数。
- 多模态输入——为支持视觉的模型附加图片。
- 可编辑任意用户消息，从该处重新生成对话。
- JSON 模式、联网搜索开关、可调温度 / 最大 token，以及自定义 system 与格式化提示词。
- 后台生成：对话进行中切换会话，回复仍会保存到其所属的会话。

### 模型
- 添加、编辑、删除 GGUF 模型配置（路径、端口、额外 `llama-server` 参数）。
- 按模型独立启动 / 停止 `llama-server` 进程，并查看实时日志。
- 可为每个模型标记是否支持多模态与联网搜索。

### 对话记录
- 侧边栏本地记录：新建、重命名（右键）、删除。
- 以 JSON 形式存储于本地（见[数据存储](#数据存储)）。

### 转换（HF → GGUF）
- 从本地模型目录或 Hugging Face 模型 ID 运行 `convert_hf_to_gguf.py`。
- 选择输出路径与量化类型；转换日志实时输出。
- 需要 Python 以及包含该脚本的 llama.cpp 仓库（见下文）。

### 训练监测
- 通过 URL 嵌入正在运行的 **TensorBoard**，或
- 指定训练**日志文件**（`.log`、`.txt`、`.jsonl`），图表每 2 秒刷新。

### 工作流
- 可视化节点图编辑器，串联多个 AI 步骤。节点类型：
  - **输入 / 输出**——图的入口与出口。
  - **LLM**——以 system 提示词和 `{{input}}` 模板调用已配置的模型。
  - **工具**——执行 Shell 命令（可设工作目录）。每条命令执行前都需显式确认。
  - **路由**——按关键词分支，每条路由有独立输出端口；未匹配的输入走 `default` 端口。
  - **合并**——以 `concat`（拼接）、`vote`（取最多）或 `first`（取第一个）方式合并分支。
- 从输出端口拖拽到输入端口即可连线；点击连线可删除。
- 运行前会校验（未选模型、缺少输出节点、存在环）并给出明确提示。
- 节点生成时显示实时 tokens/秒，可逐节点查看输出，运行结束后给出平均 / 峰值汇总。

### 外观与语言
- 深色 / 浅色主题，跨会话保留。
- 双语界面：English 与简体中文。

## 安装依赖

### Node.js
- [Node.js](https://nodejs.org/) **>= 18**。在项目目录运行 `npm install`。

### llama-server（对话功能必需）
- 编译 [llama.cpp](https://github.com/ggerganov/llama.cpp)，确保 `llama-server`（Windows 为 `llama-server.exe`）在 `PATH` 中，或放在打包后应用的同级目录。
- 下载 GGUF 模型（如从 Hugging Face），在**模型**标签页添加。

### Python + 脚本（仅转换功能需要）
- `PATH` 中的 [Python](https://www.python.org/) **3.8+**。
- 来自 llama.cpp 仓库的 `convert_hf_to_gguf.py` 脚本及其依赖：
  ```bash
  pip install -r /path/to/llama.cpp/requirements.txt
  ```

## 打包发行版

```bash
npm run electron:build
# 输出目录：release/
```

| 平台 | 运行方式 |
|------|----------|
| **Windows** | 运行 `release\Llamacore Setup x.x.x.exe`，再从开始菜单打开。 |
| **macOS** | 打开 `.dmg` 并拖入 Applications。若被拦截，在「系统设置 → 隐私与安全性」中允许打开。 |
| **Linux** | `chmod +x "release/Llamacore-x.x.x.AppImage"` 后运行。 |

## 数据存储

对话记录、模型配置、设置与工作流均以 JSON 形式存储于本地：

- **Windows**：`%APPDATA%\Llamacore\llamacore.json`
- **macOS**：`~/Library/Application Support/Llamacore/llamacore.json`
- **Linux**：`~/.config/Llamacore/llamacore.json`

## 免责声明

本软件按「现状」提供，不附带任何明示或暗示的担保。使用风险由你自行承担。

- **工作流的「工具」节点会在你的机器上执行 Shell 命令。** 尽管每条命令都需显式确认，但你需对所运行的内容负全部责任。请勿执行不受信任的命令或工作流。
- 应用会启动并管理本地 `llama-server` 与 Python 进程，并不对其进行沙箱隔离。
- Llamacore 是独立客户端，与 llama.cpp 项目及任何模型提供方无隶属或背书关系。模型输出可能不准确，重要信息请自行核实。
- 你需自行遵守所加载模型的许可证与使用条款。

## 许可证与署名

基于 **MIT 许可证**发布——详见 [LICENSE](./LICENSE)。

版权所有 (c) 2026 Lucas Vann (陆凯文)。

本应用打包或依赖第三方开源软件（llama.cpp、Electron、React、Vite、Tailwind CSS、Zustand、i18next、react-markdown、KaTeX、Recharts 等），各自遵循其许可证，列表见 [NOTICE](./NOTICE)。


