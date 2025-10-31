# Joplin AI Tools

一个通过 AI 能力增强 Joplin 笔记体验的插件，支持智能对话、标题生成和原子化标签管理。

[English](#english) | [开发文档](./GENERATOR_DOC.md)

## 核心功能

- **AI 对话** - 选中文本即可与 AI 实时交流
- **智能标题** - 单篇或批量为笔记生成精准标题
- **原子标签** - 基于语义拆解的智能标签生成与管理
- **标签池** - 全局标签库自动维护，优先复用现有标签
- **批量操作** - 支持批量生成标题、标签或清理标签

## 快速开始

1. **安装插件**  
   将插件文件复制到 Joplin 插件目录，或通过设置面板安装

2. **配置 API**  
   打开 `工具 > 选项 > AI Tools`，配置：
   - Base URL（默认：`https://api.deepseek.com/v1`）
   - API Key（必填）

3. **开始使用**  
   - 选中文本 → 点击 AI Chat 按钮
   - 打开笔记 → 点击工具栏按钮生成标题/标签
   - 菜单 `工具 > AI Tools` 访问所有功能

## 功能说明

### AI 对话
选中笔记中的任意文本，点击编辑器工具栏的 AI Chat 按钮，AI 回复将直接追加到选中文本后。

### 标题与标签生成
- **单篇生成**：打开笔记，点击笔记工具栏的生成按钮
- **批量生成**：菜单 `工具 > AI Tools > AI Generate Titles for All Notes`（快捷键 `Ctrl+Shift+T`）

### 自定义提示词
通过菜单 `工具 > AI Tools > AI 编辑提示词` 自定义标题和标签生成规则。

### 标签池管理
插件自动维护全局标签池，生成标签时优先复用已有标签。通过 `AI 查看标签池` 查看当前所有标签。

## 技术特性

- 支持 OpenAI 兼容 API（DeepSeek、OpenAI、本地模型等）
- 流式响应，实时显示 AI 输出
- 原子化标签策略，避免重复与冗余
- 智能标签复用机制

---

<a name="english"></a>

# Joplin AI Tools

An AI-powered plugin to enhance Joplin note-taking experience with intelligent chat, title generation, and atomic tag management.

[中文](#joplin-ai-tools) | [Developer Doc](./GENERATOR_DOC.md)

## Core Features

- **AI Chat** - Interact with AI by selecting text
- **Smart Titles** - Generate precise titles for single or batch notes
- **Atomic Tags** - Intelligent tag generation based on semantic decomposition
- **Tag Pool** - Global tag library with automatic reuse
- **Batch Operations** - Bulk title/tag generation and tag cleanup

## Quick Start

1. **Install Plugin**  
   Copy plugin files to Joplin plugin directory or install via settings panel

2. **Configure API**  
   Open `Tools > Options > AI Tools`, configure:
   - Base URL (default: `https://api.deepseek.com/v1`)
   - API Key (required)

3. **Start Using**  
   - Select text → Click AI Chat button
   - Open note → Click toolbar buttons for title/tag generation
   - Access all features via `Tools > AI Tools` menu

## Usage

### AI Chat
Select any text in your note, click the AI Chat button in editor toolbar. AI response will be appended after selection.

### Title & Tag Generation
- **Single Note**: Open note, click generate button in note toolbar
- **Batch Mode**: Menu `Tools > AI Tools > AI Generate Titles for All Notes` (Shortcut: `Ctrl+Shift+T`)

### Custom Prompts
Customize title and tag generation rules via `Tools > AI Tools > AI 编辑提示词`.

### Tag Pool Management
Plugin automatically maintains a global tag pool, prioritizing existing tags during generation. View all tags via `AI 查看标签池`.

## Technical Features

- OpenAI-compatible API support (DeepSeek, OpenAI, local models, etc.)
- Streaming response with real-time output
- Atomic tag strategy to avoid duplication
- Intelligent tag reuse mechanism

---

## License

MIT
