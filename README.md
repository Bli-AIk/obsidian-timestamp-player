# Obsidian Timestamp Player

[![GitHub release](https://img.shields.io/github/v/release/zhoulianglen/obsidian-timestamp-player)](https://github.com/zhoulianglen/obsidian-timestamp-player/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An Obsidian plugin that embeds audio players in your notes with timestamp links for instant seeking — supports multiple audio regions and auto-follow highlighting.

[中文文档](https://github.com/zhoulianglen/obsidian-timestamp-player/blob/master/README_CN.md)

## Demo

Given a document like this:

```markdown
![[meeting-recording.ogg]]

Alice 00:27
So the main idea is to build a platform that connects...

Bob 01:02
Right, and we should probably start with the MVP first.
```

In reading view, each timestamp becomes a clickable `▶ 00:27` button. Click to play from that position; click again to pause.

![Preview](https://raw.githubusercontent.com/zhoulianglen/obsidian-timestamp-player/master/assets/preview-en.png)

## Features

- **Explicit timestamp tokens** — `{t:00:27}` and `{t:01:02:03}` become clickable play buttons
- **Beat/bar tokens** — `{b:4.3}` can seek by musical position when a section declares BPM
- **Per-section rhythm config** — `{music bpm=135 delay=0.3 meter=4/4}` configures beat conversion for the audio below it
- **Optional metronome** — enable quiet click and beat pulse feedback globally or per section
- **Legacy compatibility** — bare `MM:SS` timestamps can be re-enabled in settings for old transcript notes
- **Play / pause toggle** — click `▶` to play, click `⏸` to pause, click again to resume
- **Playback follow-along** — the current timestamp auto-highlights and progresses as the audio plays
- **Multiple audio files** — each audio controls only the timestamps in its own section
- **Auto-detection** — the plugin only activates on documents that contain embedded audio

## Timestamp Format

The plugin now recognizes explicit tokens by default:

```markdown
![[music.ogg]]
{music bpm=135 delay=0.3 meter=4/4}

Intro {b:1.1}
Hit {b:4.3}
Exact fallback {t:00:27}
Long audio {t:01:02:03}
```

### Absolute timestamps

Use `{t:MM:SS}` or `{t:HH:MM:SS}`:

```markdown
Jump here: {t:00:27}
```

### Beat/bar timestamps

Use `{b:bar.beat}` after a rhythm config token:

```markdown
![[song.ogg]]
{music bpm=120 delay=0.3 meter=4/4}

Start {b:1.1}
Second bar {b:2.1}
```

`delay` follows the reference head-delay model: the resolved audio time is `beat time - delay`. For example, `{b:2.1}` at 120 BPM in 4/4 with `delay=0.3` resolves to 1.7 seconds.

### Legacy timestamps

Bare timestamps such as `00:27` and speaker lines such as `Alice 00:27` are disabled by default to avoid false positives. Enable **Recognize bare timestamps** in plugin settings to restore the original behavior.

> **Note:** The document must contain at least one embedded audio file (`![[file.mp3]]`, `![[file.ogg]]`, `![[file.wav]]`, etc.) for the plugin to activate. Supported formats: mp3, wav, ogg, webm, m4a, flac, 3gp.

## Multiple Audio Files

When a document contains more than one audio file, the plugin automatically partitions the document into sections. Each audio file controls the timestamps that appear **below it**, up until the next audio file (or the end of the document).

```markdown
![[interview-part1.mp3]]

Alice 00:27
First part of the conversation...

Bob 01:02
Still part one...

![[interview-part2.mp3]]

Alice 00:15
This is the second recording...

Bob 00:45
Also in part two...
```

| Timestamp | Audio file |
|-----------|------------|
| `00:27`, `01:02` | interview-part1.mp3 |
| `00:15`, `00:45` | interview-part2.mp3 |

Sections are fully independent — timestamps can overlap across sections (e.g., both can have `00:00`) without conflict. When switching between sections, the previous audio is automatically paused.

## Installation

### Community plugins (recommended)

Search for **Timestamp Player** in Settings → Community plugins, or install directly from [the plugin page](https://community.obsidian.md/plugins/timestamp-player).

### Manual

1. Download `main.js`, `styles.css`, `manifest.json` from the [latest release](https://github.com/zhoulianglen/obsidian-timestamp-player/releases)
2. Create `.obsidian/plugins/timestamp-player/` in your vault
3. Copy the three files into it
4. Enable in Settings → Community plugins

## Manual Testing In Obsidian

1. Run `npm run build`.
2. Copy `main.js`, `styles.css`, and `manifest.json` into `<vault>/.obsidian/plugins/timestamp-player/`.
3. Enable **Timestamp Player** in Settings → Community plugins.
4. Open a note in reading view with:

```markdown
![[music.ogg]]
{music bpm=120 delay=0.3 meter=4/4 metronome=off}

Start {b:1.1}
Bar two {b:2.1}
Absolute {t:00:05}
Bare legacy 00:07
```

Expected behavior:

- `{b:1.1}`, `{b:2.1}`, and `{t:00:05}` become clickable buttons.
- `00:07` stays plain text until **Recognize bare timestamps** is enabled.
- `{b:2.1}` seeks to 1.7 seconds.
- Setting `metronome=on` produces beat pulse feedback and quiet clicks during playback.

## Requirements

- Obsidian 1.0.0+
- Reading view (the plugin does not modify edit/live-preview mode)

## License

MIT — [zhoulianglen](https://github.com/zhoulianglen)
