# Obsidian Timestamp Player

[![GitHub release](https://img.shields.io/github/v/release/zhoulianglen/obsidian-timestamp-player)](https://github.com/zhoulianglen/obsidian-timestamp-player/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

一款 Obsidian 插件，让你在笔记中嵌入音频播放器并通过时间戳链接快速跳转到指定时间点，支持多音频区域和自动跟随高亮。

[English](https://github.com/zhoulianglen/obsidian-timestamp-player/blob/master/README.md)

## 演示

假设有如下文档：

```markdown
![[会议录音.ogg]]

张三 00:27
所以核心思路是先搭一个平台...

李四 01:02
对，我们应该先从 MVP 开始。
```

在阅读视图下，每个时间戳变成可点击的 `▶ 00:27` 按钮。点击从该位置播放，再次点击暂停。

![预览](https://raw.githubusercontent.com/zhoulianglen/obsidian-timestamp-player/master/assets/preview-cn.png)

## 功能

- **显式时间戳** — `{t:00:27}` 和 `{t:01:02:03}` 会变成可点击播放按钮
- **小节/拍号时间戳** — 配置 BPM 后，`{b:4.3}` 可以按音乐位置跳转
- **分区节奏配置** — `{music bpm=135 delay=0.3 meter=4/4}` 配置其下方音频区段的拍号换算
- **可选节拍器** — 可全局或按区段开启轻量 click 声和节拍脉冲反馈
- **旧语法兼容** — 可在设置中重新启用裸 `MM:SS`，用于旧转录笔记
- **播放/暂停切换** — 点击 `▶` 播放，点击 `⏸` 暂停，再点恢复播放
- **播放跟踪** — 播放过程中，当前时间戳自动高亮，随播放进度依次往下移动
- **多音频支持** — 每个音频文件仅控制其所属区段的时间戳
- **自动检测** — 仅在文档包含嵌入音频时插件才生效

## 时间戳格式

插件默认识别显式标记：

```markdown
![[music.ogg]]
{music bpm=135 delay=0.3 meter=4/4}

Intro {b:1.1}
Hit {b:4.3}
Exact fallback {t:00:27}
Long audio {t:01:02:03}
```

### 绝对时间戳

使用 `{t:MM:SS}` 或 `{t:HH:MM:SS}`：

```markdown
Jump here: {t:00:27}
```

### 小节/拍号时间戳

在节奏配置标记之后使用 `{b:bar.beat}`：

```markdown
![[song.ogg]]
{music bpm=120 delay=0.3 meter=4/4}

Start {b:1.1}
Second bar {b:2.1}
```

`delay` 遵循参考头部延迟模型：解析出的音频时间为 `beat time - delay`。例如，在 120 BPM、4/4、`delay=0.3` 时，`{b:2.1}` 会解析为 1.7 秒。

### 旧语法时间戳

裸时间戳（例如 `00:27`）和说话人行（例如 `Alice 00:27`）默认关闭，以避免误识别。可在插件设置中开启 **Recognize bare timestamps** 来恢复原行为。

> **注意：** 文档中必须包含至少一个嵌入的音频文件（`![[文件.mp3]]`、`![[文件.ogg]]`、`![[文件.wav]]` 等），插件才会生效。支持格式：mp3、wav、ogg、webm、m4a、flac、3gp。

## 多音频文件

当文档包含多个音频文件时，插件会自动将文档分区。每个音频文件控制其**下方**的时间戳，直到遇到下一个音频文件（或文档末尾）为止。

```markdown
![[访谈录音-上半场.mp3]]

张三 00:27
上半场的对话内容...

李四 01:02
还是上半场...

![[访谈录音-下半场.mp3]]

张三 00:15
这是下半场的录音...

李四 00:45
也是下半场...
```

| 时间戳 | 对应音频 |
|--------|----------|
| `00:27`、`01:02` | 访谈录音-上半场.mp3 |
| `00:15`、`00:45` | 访谈录音-下半场.mp3 |

各区段完全独立——不同区段的时间戳可以重叠（例如都有 `00:00`）不会冲突。切换区段时，前一个音频会自动暂停。

## 安装

### 社区插件市场安装（推荐）

在 设置 → 第三方插件 中搜索 **Timestamp Player**，或直接访问[插件页面](https://community.obsidian.md/plugins/timestamp-player)安装。

### 手动安装

1. 从 [最新 release](https://github.com/zhoulianglen/obsidian-timestamp-player/releases) 下载 `main.js`、`styles.css`、`manifest.json`
2. 在 vault 中创建 `.obsidian/plugins/timestamp-player/` 文件夹
3. 将三个文件复制进去
4. 在 设置 → 第三方插件 中启用

## 在 Obsidian 中手动检验

1. 运行 `npm run build`。
2. 把 `main.js`、`styles.css`、`manifest.json` 复制到 `<vault>/.obsidian/plugins/timestamp-player/`。
3. 在 设置 → 第三方插件 中启用 **Timestamp Player**。
4. 在阅读视图打开包含以下内容的笔记：

```markdown
![[music.ogg]]
{music bpm=120 delay=0.3 meter=4/4 metronome=off}

Start {b:1.1}
Bar two {b:2.1}
Absolute {t:00:05}
Bare legacy 00:07
```

预期行为：

- `{b:1.1}`、`{b:2.1}`、`{t:00:05}` 会变成可点击按钮。
- `00:07` 在开启 **Recognize bare timestamps** 前保持普通文本。
- `{b:2.1}` 会跳到 1.7 秒。
- 设置 `metronome=on` 后，播放时会出现节拍脉冲反馈和轻量 click 声。

## 环境要求

- Obsidian 1.0.0+
- 阅读视图（插件不影响编辑/实时预览模式）

## 许可

MIT — [zhoulianglen](https://github.com/zhoulianglen)
