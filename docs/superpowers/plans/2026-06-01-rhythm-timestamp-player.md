# Rhythm Timestamp Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit timestamp tokens, beat/bar navigation, optional metronome support, and default-off legacy bare timestamp compatibility to the Obsidian Timestamp Player plugin.

**Architecture:** Keep Obsidian lifecycle, DOM replacement, and playback state in `src/main.ts`, while moving parsing, rhythm math, settings, and metronome scheduling into focused modules. Unit tests cover pure parsing and conversion behavior; Obsidian behavior is verified with build checks and manual reading-view checks.

**Tech Stack:** TypeScript, Obsidian plugin API, esbuild, Vitest, browser Web Audio API.

---

## File Structure

- `package.json`: add a `test` script and Vitest dev dependency.
- `package-lock.json`: update from `npm install -D vitest`.
- `src/rhythm.ts`: meter parsing, default rhythm config, beat-to-seconds conversion.
- `src/rhythm.test.ts`: focused tests for meter and beat conversion.
- `src/parsing.ts`: explicit token parsing, music config parsing, absolute timestamp parsing, legacy bare timestamp parsing.
- `src/parsing.test.ts`: focused tests for token parsing and legacy gating helpers.
- `src/settings.ts`: plugin settings types, defaults, and settings tab UI.
- `src/metronome.ts`: Web Audio click scheduling tied to an active `HTMLAudioElement`.
- `src/main.ts`: wire settings, parse DOM text in document order, render buttons, preserve legacy compatibility when enabled, and control metronome lifecycle.
- `styles.css`: add beat/metronome pulse styling.
- `README.md`: document the new syntax and verification workflow in English.
- `README_CN.md`: document the new syntax and verification workflow in Chinese.

---

### Task 1: Add Test Harness

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Add Vitest**

Run:

```bash
npm install -D vitest
```

Expected: `package.json` and `package-lock.json` change, and `node_modules` contains Vitest.

- [ ] **Step 2: Add the test script**

Modify `package.json` so the `scripts` block is:

```json
"scripts": {
  "dev": "node esbuild.config.mjs",
  "build": "node esbuild.config.mjs production",
  "test": "vitest run --passWithNoTests"
}
```

- [ ] **Step 3: Run the empty test command**

Run:

```bash
npm test
```

Expected: Vitest exits with code `0` and reports no test files found.

- [ ] **Step 4: Verify the existing build still works**

Run:

```bash
npm run build
```

Expected: esbuild finishes successfully and writes `main.js`.

- [ ] **Step 5: Commit**

Run:

```bash
git add package.json package-lock.json
git commit -m "test: add vitest harness"
```

---

### Task 2: Rhythm Math

**Files:**
- Create: `src/rhythm.test.ts`
- Create: `src/rhythm.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/rhythm.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
	DEFAULT_METER,
	DEFAULT_RHYTHM_CONFIG,
	parseBeatPosition,
	parseMeter,
	resolveBeatSeconds,
} from "./rhythm";

describe("parseMeter", () => {
	it("defaults to 4/4 through DEFAULT_METER", () => {
		expect(DEFAULT_METER).toEqual({ beatsPerBar: 4, beatUnit: 4, label: "4/4" });
	});

	it("parses common meters", () => {
		expect(parseMeter("3/4")).toEqual({ beatsPerBar: 3, beatUnit: 4, label: "3/4" });
		expect(parseMeter("6/8")).toEqual({ beatsPerBar: 6, beatUnit: 8, label: "6/8" });
	});

	it("rejects invalid meters", () => {
		expect(parseMeter("0/4")).toBeNull();
		expect(parseMeter("4/0")).toBeNull();
		expect(parseMeter("abc")).toBeNull();
	});
});

describe("parseBeatPosition", () => {
	it("parses one-based bar and beat values", () => {
		expect(parseBeatPosition("4.3")).toEqual({ bar: 4, beat: 3 });
	});

	it("rejects zero values and malformed positions", () => {
		expect(parseBeatPosition("0.1")).toBeNull();
		expect(parseBeatPosition("1.0")).toBeNull();
		expect(parseBeatPosition("1:1")).toBeNull();
	});
});

describe("resolveBeatSeconds", () => {
	it("resolves the first beat to the start of audio", () => {
		expect(resolveBeatSeconds({ bar: 1, beat: 1 }, { ...DEFAULT_RHYTHM_CONFIG, bpm: 120 })).toBe(0);
	});

	it("uses head delay semantics from the reference project", () => {
		expect(resolveBeatSeconds({ bar: 2, beat: 1 }, { ...DEFAULT_RHYTHM_CONFIG, bpm: 120, delay: 0.3 })).toBeCloseTo(1.7);
	});

	it("uses the meter numerator as beats per bar", () => {
		const meter = parseMeter("3/4");
		expect(meter).not.toBeNull();
		expect(resolveBeatSeconds({ bar: 2, beat: 1 }, { ...DEFAULT_RHYTHM_CONFIG, bpm: 60, meter: meter! })).toBe(3);
	});

	it("rejects beats outside the current meter", () => {
		expect(resolveBeatSeconds({ bar: 1, beat: 5 }, { ...DEFAULT_RHYTHM_CONFIG, bpm: 120 })).toBeNull();
	});

	it("requires a positive bpm", () => {
		expect(resolveBeatSeconds({ bar: 1, beat: 1 }, { ...DEFAULT_RHYTHM_CONFIG, bpm: null })).toBeNull();
		expect(resolveBeatSeconds({ bar: 1, beat: 1 }, { ...DEFAULT_RHYTHM_CONFIG, bpm: 0 })).toBeNull();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/rhythm.test.ts
```

Expected: FAIL because `src/rhythm.ts` does not exist.

- [ ] **Step 3: Implement rhythm helpers**

Create `src/rhythm.ts` with:

```ts
export interface Meter {
	beatsPerBar: number;
	beatUnit: number;
	label: string;
}

export interface BeatPosition {
	bar: number;
	beat: number;
}

export interface RhythmConfig {
	bpm: number | null;
	delay: number;
	meter: Meter;
	metronome: boolean | null;
}

export type RhythmConfigPatch = Partial<RhythmConfig>;

export const DEFAULT_METER: Meter = {
	beatsPerBar: 4,
	beatUnit: 4,
	label: "4/4",
};

export const DEFAULT_RHYTHM_CONFIG: RhythmConfig = {
	bpm: null,
	delay: 0,
	meter: DEFAULT_METER,
	metronome: null,
};

export function cloneRhythmConfig(config: RhythmConfig = DEFAULT_RHYTHM_CONFIG): RhythmConfig {
	return {
		bpm: config.bpm,
		delay: config.delay,
		meter: { ...config.meter },
		metronome: config.metronome,
	};
}

export function mergeRhythmConfig(config: RhythmConfig, patch: RhythmConfigPatch): RhythmConfig {
	return {
		bpm: patch.bpm ?? config.bpm,
		delay: patch.delay ?? config.delay,
		meter: patch.meter ? { ...patch.meter } : { ...config.meter },
		metronome: patch.metronome ?? config.metronome,
	};
}

export function parseMeter(input: string): Meter | null {
	const match = input.trim().match(/^([1-9]\d*)\/([1-9]\d*)$/);
	if (!match) return null;

	const beatsPerBar = Number(match[1]);
	const beatUnit = Number(match[2]);
	if (!Number.isSafeInteger(beatsPerBar) || !Number.isSafeInteger(beatUnit)) return null;

	return {
		beatsPerBar,
		beatUnit,
		label: `${beatsPerBar}/${beatUnit}`,
	};
}

export function parseBeatPosition(input: string): BeatPosition | null {
	const match = input.trim().match(/^([1-9]\d*)\.([1-9]\d*)$/);
	if (!match) return null;

	const bar = Number(match[1]);
	const beat = Number(match[2]);
	if (!Number.isSafeInteger(bar) || !Number.isSafeInteger(beat)) return null;

	return { bar, beat };
}

export function resolveBeatSeconds(position: BeatPosition, config: Pick<RhythmConfig, "bpm" | "delay" | "meter">): number | null {
	if (config.bpm === null || !Number.isFinite(config.bpm) || config.bpm <= 0) return null;
	if (!Number.isFinite(config.delay)) return null;
	if (position.beat > config.meter.beatsPerBar) return null;

	const secondsPerBeat = 60 / config.bpm;
	const beatIndex = (position.bar - 1) * config.meter.beatsPerBar + (position.beat - 1);
	const beatSeconds = beatIndex * secondsPerBeat;
	return Math.max(0, beatSeconds - config.delay);
}
```

- [ ] **Step 4: Run rhythm tests**

Run:

```bash
npm test -- src/rhythm.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/rhythm.ts src/rhythm.test.ts
git commit -m "feat: add rhythm conversion helpers"
```

---

### Task 3: Token Parsing

**Files:**
- Create: `src/parsing.test.ts`
- Create: `src/parsing.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/parsing.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
	findExplicitTokens,
	findLegacyInlineTimestamps,
	parseLegacySpeakerLine,
	parseTimestampLiteral,
} from "./parsing";

describe("parseTimestampLiteral", () => {
	it("parses MM:SS", () => {
		expect(parseTimestampLiteral("00:27")).toEqual({ label: "00:27", seconds: 27 });
	});

	it("parses HH:MM:SS", () => {
		expect(parseTimestampLiteral("01:02:03")).toEqual({ label: "01:02:03", seconds: 3723 });
	});

	it("rejects invalid timestamps", () => {
		expect(parseTimestampLiteral("00:60")).toBeNull();
		expect(parseTimestampLiteral("1")).toBeNull();
	});
});

describe("findExplicitTokens", () => {
	it("parses explicit time tokens", () => {
		expect(findExplicitTokens("Go {t:00:27} now")).toEqual([
			{ type: "time", raw: "{t:00:27}", start: 3, end: 12, label: "00:27", seconds: 27 },
		]);
	});

	it("parses explicit beat tokens", () => {
		expect(findExplicitTokens("Hit {b:4.3}")).toEqual([
			{ type: "beat", raw: "{b:4.3}", start: 4, end: 11, label: "4.3", position: { bar: 4, beat: 3 } },
		]);
	});

	it("parses music config tokens with valid fields", () => {
		expect(findExplicitTokens("{music bpm=135 delay=0.3 meter=3/4 metronome=on}")).toEqual([
			{
				type: "music",
				raw: "{music bpm=135 delay=0.3 meter=3/4 metronome=on}",
				start: 0,
				end: 48,
				patch: {
					bpm: 135,
					delay: 0.3,
					meter: { beatsPerBar: 3, beatUnit: 4, label: "3/4" },
					metronome: true,
				},
			},
		]);
	});

	it("keeps malformed explicit tokens as invalid tokens", () => {
		expect(findExplicitTokens("{t:00:60} {music bpm=nope}")).toEqual([
			{ type: "invalid", raw: "{t:00:60}", start: 0, end: 9 },
			{ type: "invalid", raw: "{music bpm=nope}", start: 10, end: 26 },
		]);
	});
});

describe("legacy parsing helpers", () => {
	it("finds inline bare timestamps for compatibility mode", () => {
		expect(findLegacyInlineTimestamps("At 00:27 and 01:02")).toEqual([
			{ label: "00:27", seconds: 27, start: 3, end: 8 },
			{ label: "01:02", seconds: 62, start: 13, end: 18 },
		]);
	});

	it("parses speaker lines for compatibility mode", () => {
		expect(parseLegacySpeakerLine("Alice 00:27")).toEqual({
			speaker: "Alice",
			label: "00:27",
			seconds: 27,
		});
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/parsing.test.ts
```

Expected: FAIL because `src/parsing.ts` does not exist.

- [ ] **Step 3: Implement parsing helpers**

Create `src/parsing.ts` with:

```ts
import { BeatPosition, Meter, RhythmConfigPatch, parseBeatPosition, parseMeter } from "./rhythm";

export interface ParsedTimestamp {
	label: string;
	seconds: number;
}

export interface PositionedTimestamp extends ParsedTimestamp {
	start: number;
	end: number;
}

export interface TimeToken extends PositionedTimestamp {
	type: "time";
	raw: string;
}

export interface BeatToken {
	type: "beat";
	raw: string;
	start: number;
	end: number;
	label: string;
	position: BeatPosition;
}

export interface MusicToken {
	type: "music";
	raw: string;
	start: number;
	end: number;
	patch: RhythmConfigPatch;
}

export interface InvalidToken {
	type: "invalid";
	raw: string;
	start: number;
	end: number;
}

export type ExplicitToken = TimeToken | BeatToken | MusicToken | InvalidToken;

export interface LegacySpeakerLine {
	speaker: string;
	label: string;
	seconds: number;
}

const EXPLICIT_TOKEN_RE = /\{(?:t:[^{}\s]+|b:[^{}\s]+|music(?:\s+[^{}]*)?)\}/g;
const LEGACY_INLINE_RE = /\b(\d{1,3}:\d{2})\b/g;
const LEGACY_SPEAKER_RE = /^(.+?)\s+(\d{1,3}:\d{2})\s*$/;

export function parseTimestampLiteral(input: string): ParsedTimestamp | null {
	const parts = input.trim().split(":");
	if (parts.length !== 2 && parts.length !== 3) return null;
	if (!parts.every((part) => /^\d+$/.test(part))) return null;

	const values = parts.map((part) => Number(part));
	if (values.some((value) => !Number.isSafeInteger(value))) return null;

	if (parts.length === 2) {
		const [minutes, seconds] = values;
		if (seconds > 59) return null;
		return { label: input, seconds: minutes * 60 + seconds };
	}

	const [hours, minutes, seconds] = values;
	if (minutes > 59 || seconds > 59) return null;
	return { label: input, seconds: hours * 3600 + minutes * 60 + seconds };
}

export function findExplicitTokens(text: string): ExplicitToken[] {
	const tokens: ExplicitToken[] = [];
	EXPLICIT_TOKEN_RE.lastIndex = 0;

	let match: RegExpExecArray | null;
	while ((match = EXPLICIT_TOKEN_RE.exec(text)) !== null) {
		const raw = match[0];
		const start = match.index;
		const end = start + raw.length;
		tokens.push(parseExplicitToken(raw, start, end));
	}

	return tokens;
}

function parseExplicitToken(raw: string, start: number, end: number): ExplicitToken {
	if (raw.startsWith("{t:")) {
		const literal = raw.slice(3, -1);
		const parsed = parseTimestampLiteral(literal);
		if (!parsed) return { type: "invalid", raw, start, end };
		return { type: "time", raw, start, end, ...parsed };
	}

	if (raw.startsWith("{b:")) {
		const label = raw.slice(3, -1);
		const position = parseBeatPosition(label);
		if (!position) return { type: "invalid", raw, start, end };
		return { type: "beat", raw, start, end, label, position };
	}

	return parseMusicToken(raw, start, end);
}

function parseMusicToken(raw: string, start: number, end: number): ExplicitToken {
	const body = raw.slice(1, -1).trim();
	const parts = body.split(/\s+/);
	const patch: RhythmConfigPatch = {};

	for (const part of parts.slice(1)) {
		const [key, value] = part.split("=");
		if (!key || value === undefined) continue;

		if (key === "bpm") {
			const bpm = Number(value);
			if (Number.isFinite(bpm) && bpm > 0) patch.bpm = bpm;
		} else if (key === "delay") {
			const delay = Number(value);
			if (Number.isFinite(delay)) patch.delay = delay;
		} else if (key === "meter") {
			const meter: Meter | null = parseMeter(value);
			if (meter) patch.meter = meter;
		} else if (key === "metronome") {
			if (value === "on") patch.metronome = true;
			if (value === "off") patch.metronome = false;
		}
	}

	if (Object.keys(patch).length === 0) return { type: "invalid", raw, start, end };
	return { type: "music", raw, start, end, patch };
}

export function findLegacyInlineTimestamps(text: string): PositionedTimestamp[] {
	const timestamps: PositionedTimestamp[] = [];
	LEGACY_INLINE_RE.lastIndex = 0;

	let match: RegExpExecArray | null;
	while ((match = LEGACY_INLINE_RE.exec(text)) !== null) {
		const parsed = parseTimestampLiteral(match[1]);
		if (!parsed) continue;
		timestamps.push({
			...parsed,
			start: match.index,
			end: match.index + match[1].length,
		});
	}

	return timestamps;
}

export function parseLegacySpeakerLine(text: string): LegacySpeakerLine | null {
	const match = text.trim().match(LEGACY_SPEAKER_RE);
	if (!match) return null;

	const parsed = parseTimestampLiteral(match[2]);
	if (!parsed) return null;

	return {
		speaker: match[1],
		label: parsed.label,
		seconds: parsed.seconds,
	};
}
```

- [ ] **Step 4: Run parsing tests**

Run:

```bash
npm test -- src/parsing.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run all tests and build**

Run:

```bash
npm test
npm run build
```

Expected: both commands PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/parsing.ts src/parsing.test.ts
git commit -m "feat: add timestamp token parser"
```

---

### Task 4: Settings UI

**Files:**
- Create: `src/settings.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Create settings module**

Create `src/settings.ts` with:

```ts
import { App, Plugin, PluginSettingTab, Setting } from "obsidian";

export interface TimestampPlayerSettings {
	legacyBareTimestamps: boolean;
	metronomeDefaultEnabled: boolean;
	metronomeVolume: number;
}

export const DEFAULT_SETTINGS: TimestampPlayerSettings = {
	legacyBareTimestamps: false,
	metronomeDefaultEnabled: false,
	metronomeVolume: 0.15,
};

export type TimestampPlayerSettingsHost = Plugin & {
	settings: TimestampPlayerSettings;
	saveSettings(): Promise<void>;
};

export class TimestampPlayerSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: TimestampPlayerSettingsHost) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Recognize bare timestamps")
			.setDesc("Parse legacy bare MM:SS timestamps and speaker-line timestamps in addition to explicit {t:...} and {b:...} tokens.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.legacyBareTimestamps).onChange(async (value) => {
					this.plugin.settings.legacyBareTimestamps = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Enable metronome by default")
			.setDesc("Enable the metronome for sections that do not set metronome=on or metronome=off.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.metronomeDefaultEnabled).onChange(async (value) => {
					this.plugin.settings.metronomeDefaultEnabled = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Metronome volume")
			.setDesc("Controls the generated click volume from 0 to 1.")
			.addSlider((slider) =>
				slider
					.setLimits(0, 1, 0.05)
					.setValue(this.plugin.settings.metronomeVolume)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.metronomeVolume = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
```

- [ ] **Step 2: Wire settings into plugin lifecycle**

In `src/main.ts`, change the import to:

```ts
import { Plugin, MarkdownPostProcessorContext, MarkdownView, TFile } from "obsidian";
import { DEFAULT_SETTINGS, TimestampPlayerSettings, TimestampPlayerSettingTab } from "./settings";
```

At the top of `TimestampPlayerPlugin`, add:

```ts
	settings: TimestampPlayerSettings = { ...DEFAULT_SETTINGS };
```

Replace `onload()` with:

```ts
	async onload() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.addSettingTab(new TimestampPlayerSettingTab(this.app, this));

		this.registerMarkdownPostProcessor(
			async (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
				if (!(await this.hasAudioEmbed(ctx))) return;
				this.processTimestamps(el);
			}
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
```

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```bash
git add src/settings.ts src/main.ts
git commit -m "feat: add timestamp player settings"
```

---

### Task 5: Explicit Tokens And Legacy Gate

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Update imports**

In `src/main.ts`, replace the current regex constants and imports with:

```ts
import { Plugin, MarkdownPostProcessorContext, MarkdownView, TFile } from "obsidian";
import {
	DEFAULT_RHYTHM_CONFIG,
	RhythmConfig,
	cloneRhythmConfig,
	mergeRhythmConfig,
	resolveBeatSeconds,
} from "./rhythm";
import {
	ExplicitToken,
	findExplicitTokens,
	findLegacyInlineTimestamps,
	parseLegacySpeakerLine,
} from "./parsing";
import { DEFAULT_SETTINGS, TimestampPlayerSettings, TimestampPlayerSettingTab } from "./settings";

const AUDIO_EMBED_RE = /!\[\[.+?\.(mp3|webm|wav|m4a|ogg|3gp|flac)\]\]/i;
const TOKEN_SCAN_RE = /\{(?:t:|b:|music\b)|\b\d{1,3}:\d{2}\b/;

interface TimelineTextNode {
	type: "text";
	node: Text;
}

interface TimelineAudioNode {
	type: "audio";
	node: HTMLAudioElement;
}

type TimelineNode = TimelineTextNode | TimelineAudioNode;
```

- [ ] **Step 2: Queue full markdown-root processing**

Add this field near the existing playback fields:

```ts
	private queuedRoots = new WeakSet<HTMLElement>();
```

In `onload()`, change the postprocessor callback body from:

```ts
				this.processTimestamps(el);
```

to:

```ts
				this.queueProcessTimestamps(el);
```

Add these methods before `processTimestamps`:

```ts
	private queueProcessTimestamps(el: HTMLElement) {
		const root = this.getMarkdownRoot(el);
		if (this.queuedRoots.has(root)) return;
		this.queuedRoots.add(root);

		window.setTimeout(() => {
			this.queuedRoots.delete(root);
			if (!root.isConnected) return;
			this.processTimestamps(root);
		}, 0);
	}

	private getMarkdownRoot(el: HTMLElement): HTMLElement {
		return (el.closest(".markdown-preview-view") as HTMLElement | null) ?? el;
	}
```

- [ ] **Step 3: Replace timestamp processing methods**

Remove `processTimestamps`, `replaceSpeakerLine`, and `replaceInlineTimestamps`. Add these methods in their place:

```ts
	private processTimestamps(el: HTMLElement) {
		let sectionConfig: RhythmConfig = cloneRhythmConfig(DEFAULT_RHYTHM_CONFIG);

		for (const item of this.collectTimelineNodes(el)) {
			if (item.type === "audio") {
				sectionConfig = cloneRhythmConfig(DEFAULT_RHYTHM_CONFIG);
				continue;
			}

			const nextConfig = this.processTextNode(item.node, sectionConfig);
			if (nextConfig) sectionConfig = nextConfig;
		}
	}

	private collectTimelineNodes(root: HTMLElement): TimelineNode[] {
		const nodes: TimelineNode[] = [];
		const walker = activeDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
			acceptNode: (node) => {
				if (node instanceof HTMLElement) {
					if (node.matches("code, pre, .tsp-processed, .tsp-timestamp")) return NodeFilter.FILTER_REJECT;
					if (node.tagName === "AUDIO") return NodeFilter.FILTER_ACCEPT;
					return NodeFilter.FILTER_SKIP;
				}

				const text = node.textContent ?? "";
				if (!TOKEN_SCAN_RE.test(text)) return NodeFilter.FILTER_REJECT;
				return NodeFilter.FILTER_ACCEPT;
			},
		});

		let node: Node | null;
		while ((node = walker.nextNode()) !== null) {
			if (node instanceof HTMLAudioElement) {
				nodes.push({ type: "audio", node });
			} else if (node.nodeType === Node.TEXT_NODE) {
				nodes.push({ type: "text", node: node as Text });
			}
		}

		return nodes;
	}

	private processTextNode(node: Text, sectionConfig: RhythmConfig): RhythmConfig | null {
		const text = node.textContent ?? "";
		const explicitTokens = findExplicitTokens(text);

		if (explicitTokens.length === 0) {
			if (!this.settings.legacyBareTimestamps) return null;
			return this.replaceLegacyTextNode(node, sectionConfig);
		}

		const fragment = createFragment();
		const wrapper = createSpan({ cls: "tsp-processed" });
		let lastIndex = 0;
		let nextConfig = sectionConfig;

		for (const token of explicitTokens) {
			this.appendTextWithLegacy(wrapper, text.slice(lastIndex, token.start), nextConfig);
			nextConfig = this.appendExplicitToken(wrapper, token, nextConfig);
			lastIndex = token.end;
		}

		this.appendTextWithLegacy(wrapper, text.slice(lastIndex), nextConfig);
		fragment.appendChild(wrapper);
		node.parentNode?.replaceChild(fragment, node);
		return nextConfig;
	}

	private appendExplicitToken(fragment: DocumentFragment | HTMLElement, token: ExplicitToken, sectionConfig: RhythmConfig): RhythmConfig {
		if (token.type === "time") {
			fragment.appendChild(this.createTimestampBtn(token.label, token.seconds, sectionConfig));
			return sectionConfig;
		}

		if (token.type === "beat") {
			const seconds = resolveBeatSeconds(token.position, sectionConfig);
			if (seconds === null) {
				fragment.appendChild(activeDocument.createTextNode(token.raw));
			} else {
				fragment.appendChild(this.createTimestampBtn(token.label, seconds, sectionConfig));
			}
			return sectionConfig;
		}

		if (token.type === "music") {
			return mergeRhythmConfig(sectionConfig, token.patch);
		}

		fragment.appendChild(activeDocument.createTextNode(token.raw));
		return sectionConfig;
	}

	private appendTextWithLegacy(fragment: DocumentFragment | HTMLElement, text: string, sectionConfig: RhythmConfig) {
		if (!text) return;
		if (!this.settings.legacyBareTimestamps) {
			fragment.appendChild(activeDocument.createTextNode(text));
			return;
		}

		const legacyTokens = findLegacyInlineTimestamps(text);
		if (legacyTokens.length === 0) {
			fragment.appendChild(activeDocument.createTextNode(text));
			return;
		}

		let lastIndex = 0;
		for (const token of legacyTokens) {
			if (token.start > lastIndex) {
				fragment.appendChild(activeDocument.createTextNode(text.slice(lastIndex, token.start)));
			}
			fragment.appendChild(this.createTimestampBtn(token.label, token.seconds, sectionConfig));
			lastIndex = token.end;
		}

		if (lastIndex < text.length) {
			fragment.appendChild(activeDocument.createTextNode(text.slice(lastIndex)));
		}
	}

	private replaceLegacyTextNode(node: Text, sectionConfig: RhythmConfig): RhythmConfig | null {
		const text = node.textContent ?? "";
		const speaker = parseLegacySpeakerLine(text);
		if (speaker) {
			const wrapper = createFragment();
			wrapper.appendChild(createSpan({ cls: "tsp-speaker", text: speaker.speaker + " " }));
			wrapper.appendChild(this.createTimestampBtn(speaker.label, speaker.seconds, sectionConfig));
			node.parentNode?.replaceChild(wrapper, node);
			return null;
		}

		const legacyTokens = findLegacyInlineTimestamps(text);
		if (legacyTokens.length === 0) return null;

		const fragment = createFragment();
		this.appendTextWithLegacy(fragment, text, sectionConfig);
		node.parentNode?.replaceChild(fragment, node);
		return null;
	}
```

- [ ] **Step 4: Update button creation**

Replace `createTimestampBtn(timeStr: string, totalSeconds: number)` with:

```ts
	private createTimestampBtn(label: string, totalSeconds: number, rhythmConfig: RhythmConfig): HTMLSpanElement {
		const btn = createSpan({ cls: "tsp-timestamp" });
		btn.setAttribute("data-seconds", String(totalSeconds));
		btn.setAttribute("data-metronome-enabled", String(rhythmConfig.metronome ?? this.settings.metronomeDefaultEnabled));
		btn.setAttribute("data-metronome-volume", String(this.settings.metronomeVolume));
		btn.setAttribute("data-delay", String(rhythmConfig.delay));
		btn.setAttribute("data-beats-per-bar", String(rhythmConfig.meter.beatsPerBar));
		if (rhythmConfig.bpm !== null) btn.setAttribute("data-bpm", String(rhythmConfig.bpm));
		btn.setAttribute("role", "button");
		btn.setAttribute("aria-label", `Play from ${label}`);

		const icon = createSpan({ cls: "tsp-play-icon", text: "▶" });
		btn.appendChild(icon);
		btn.appendChild(createSpan({ cls: "tsp-time", text: label }));

		btn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.togglePlay(btn, totalSeconds);
		});

		return btn;
	}
```

- [ ] **Step 5: Run tests and build**

Run:

```bash
npm test
npm run build
```

Expected: both commands PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/main.ts
git commit -m "feat: render explicit timestamp tokens"
```

---

### Task 6: Metronome Runtime

**Files:**
- Create: `src/metronome.ts`
- Modify: `src/main.ts`
- Modify: `styles.css`

- [ ] **Step 1: Create metronome module**

Create `src/metronome.ts` with:

```ts
export interface MetronomeRuntimeConfig {
	bpm: number;
	delay: number;
	beatsPerBar: number;
	volume: number;
}

type BeatCallback = (beatIndex: number, downbeat: boolean) => void;
type AudioContextConstructor = typeof AudioContext;

export class TimestampMetronome {
	private audio: HTMLAudioElement | null = null;
	private config: MetronomeRuntimeConfig | null = null;
	private timer: number | null = null;
	private context: AudioContext | null = null;
	private lastBeatIndex: number | null = null;
	private onBeat: BeatCallback | null = null;

	start(audio: HTMLAudioElement, config: MetronomeRuntimeConfig, onBeat: BeatCallback): void {
		this.audio = audio;
		this.config = config;
		this.onBeat = onBeat;
		this.lastBeatIndex = null;

		if (this.timer === null) {
			this.timer = window.setInterval(() => this.tick(), 25);
		}

		this.tick();
	}

	stop(): void {
		if (this.timer !== null) {
			window.clearInterval(this.timer);
			this.timer = null;
		}
		this.audio = null;
		this.config = null;
		this.lastBeatIndex = null;
		this.onBeat = null;
	}

	private tick(): void {
		if (!this.audio || !this.config || this.audio.paused || this.audio.ended) return;

		const secondsPerBeat = 60 / this.config.bpm;
		const beatPositionSeconds = this.audio.currentTime + this.config.delay;
		if (beatPositionSeconds < 0) return;

		const beatIndex = Math.floor(beatPositionSeconds / secondsPerBeat);
		if (beatIndex === this.lastBeatIndex) return;

		this.lastBeatIndex = beatIndex;
		const downbeat = beatIndex % this.config.beatsPerBar === 0;
		this.playClick(downbeat);
		this.onBeat?.(beatIndex, downbeat);
	}

	private playClick(downbeat: boolean): void {
		const context = this.getAudioContext();
		if (!context || !this.config || this.config.volume <= 0) return;

		const now = context.currentTime;
		const oscillator = context.createOscillator();
		const gain = context.createGain();

		oscillator.type = "sine";
		oscillator.frequency.value = downbeat ? 1200 : 800;
		gain.gain.setValueAtTime(0.0001, now);
		gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, this.config.volume), now + 0.005);
		gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

		oscillator.connect(gain);
		gain.connect(context.destination);
		oscillator.start(now);
		oscillator.stop(now + 0.05);
	}

	private getAudioContext(): AudioContext | null {
		if (this.context) return this.context;

		const audioWindow = window as Window & { webkitAudioContext?: AudioContextConstructor };
		const ContextCtor = window.AudioContext ?? audioWindow.webkitAudioContext;
		if (!ContextCtor) return null;

		this.context = new ContextCtor();
		return this.context;
	}
}
```

- [ ] **Step 2: Wire metronome imports and fields**

In `src/main.ts`, add:

```ts
import { TimestampMetronome, MetronomeRuntimeConfig } from "./metronome";
```

Add fields near playback state:

```ts
	private boundPlay: (() => void) | null = null;
	private metronome = new TimestampMetronome();
```

- [ ] **Step 3: Update playback listener lifecycle**

In `togglePlay`, replace the current anonymous `play` listener block with:

```ts
		this.boundPlay = () => {
			if (this.activeBtn) {
				const icon = this.activeBtn.querySelector(".tsp-play-icon");
				if (icon) icon.textContent = "⏸";
				this.startMetronomeForActiveButton();
			}
		};
		audio.addEventListener("play", this.boundPlay);
```

Inside the existing `boundPause`, after changing the icon, add:

```ts
			this.metronome.stop();
```

In `detachAudioListeners`, add:

```ts
			if (this.boundPlay) this.activeAudio.removeEventListener("play", this.boundPlay);
			this.metronome.stop();
```

After nulling `boundPause`, also null `boundPlay`:

```ts
		this.boundPlay = null;
```

In `clearPlaybackState`, keep the existing call to `detachAudioListeners`; that call now stops the metronome.

- [ ] **Step 4: Start metronome from active button data**

Add these methods to `TimestampPlayerPlugin`:

```ts
	private startMetronomeForActiveButton() {
		if (!this.activeAudio || !this.activeBtn || this.activeAudio.paused) return;

		const config = this.getMetronomeConfig(this.activeBtn);
		if (!config) {
			this.metronome.stop();
			return;
		}

		this.metronome.start(this.activeAudio, config, (_beatIndex, downbeat) => {
			this.pulseBeat(downbeat);
		});
	}

	private getMetronomeConfig(btn: HTMLElement): MetronomeRuntimeConfig | null {
		if (btn.getAttribute("data-metronome-enabled") !== "true") return null;

		const bpm = Number(btn.getAttribute("data-bpm"));
		const delay = Number(btn.getAttribute("data-delay"));
		const beatsPerBar = Number(btn.getAttribute("data-beats-per-bar"));
		const volume = Number(btn.getAttribute("data-metronome-volume"));

		if (!Number.isFinite(bpm) || bpm <= 0) return null;
		if (!Number.isFinite(delay)) return null;
		if (!Number.isSafeInteger(beatsPerBar) || beatsPerBar <= 0) return null;
		if (!Number.isFinite(volume)) return null;

		return {
			bpm,
			delay,
			beatsPerBar,
			volume: Math.max(0, Math.min(1, volume)),
		};
	}

	private pulseBeat(downbeat: boolean) {
		if (!this.activeBtn) return;
		this.activeBtn.removeClass("tsp-beat-pulse");
		this.activeBtn.removeClass("tsp-downbeat-pulse");

		window.requestAnimationFrame(() => {
			if (!this.activeBtn) return;
			this.activeBtn.addClass(downbeat ? "tsp-downbeat-pulse" : "tsp-beat-pulse");
			window.setTimeout(() => {
				this.activeBtn?.removeClass("tsp-beat-pulse");
				this.activeBtn?.removeClass("tsp-downbeat-pulse");
			}, 120);
		});
	}
```

At the end of `setActiveBtn`, add:

```ts
		this.startMetronomeForActiveButton();
```

- [ ] **Step 5: Add pulse styling**

Append to `styles.css`:

```css
.tsp-timestamp.tsp-beat-pulse {
	box-shadow: 0 0 0 2px var(--background-modifier-border);
}

.tsp-timestamp.tsp-downbeat-pulse {
	box-shadow: 0 0 0 2px var(--text-accent);
}
```

- [ ] **Step 6: Run tests and build**

Run:

```bash
npm test
npm run build
```

Expected: both commands PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/metronome.ts src/main.ts styles.css
git commit -m "feat: add optional metronome"
```

---

### Task 7: Documentation And Manual Verification Notes

**Files:**
- Modify: `README.md`
- Modify: `README_CN.md`

- [ ] **Step 1: Update English README feature list**

In `README.md`, replace the feature list with:

```markdown
- **Explicit timestamp tokens** — `{t:00:27}` and `{t:01:02:03}` become clickable play buttons
- **Beat/bar tokens** — `{b:4.3}` can seek by musical position when a section declares BPM
- **Per-section rhythm config** — `{music bpm=135 delay=0.3 meter=4/4}` configures beat conversion for the audio below it
- **Optional metronome** — enable quiet click and beat pulse feedback globally or per section
- **Legacy compatibility** — bare `MM:SS` timestamps can be re-enabled in settings for old transcript notes
- **Play / pause toggle** — click `▶` to play, click `⏸` to pause, click again to resume
- **Playback follow-along** — the current timestamp auto-highlights and progresses as the audio plays
- **Multiple audio files** — each audio controls only the timestamps in its own section
- **Auto-detection** — the plugin only activates on documents that contain embedded audio
```

- [ ] **Step 2: Update English timestamp format section**

Replace the current `## Timestamp Format` section through its inline timestamp example with:

````markdown
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
````

- [ ] **Step 3: Add English manual verification section**

Before `## Requirements`, add:

````markdown
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
````

- [ ] **Step 4: Update Chinese README with matching content**

In `README_CN.md`, make the same semantic updates using Chinese text. Use this feature list:

```markdown
- **显式时间戳** — `{t:00:27}` 和 `{t:01:02:03}` 会变成可点击播放按钮
- **小节/拍号时间戳** — 配置 BPM 后，`{b:4.3}` 可以按音乐位置跳转
- **分区节奏配置** — `{music bpm=135 delay=0.3 meter=4/4}` 配置其下方音频区段的拍号换算
- **可选节拍器** — 可全局或按区段开启轻量 click 声和节拍脉冲反馈
- **旧语法兼容** — 可在设置中重新启用裸 `MM:SS`，用于旧转录笔记
- **播放/暂停切换** — 点击 `▶` 播放，点击 `⏸` 暂停，再点恢复播放
- **播放跟踪** — 播放过程中，当前时间戳自动高亮，随播放进度依次往下移动
- **多音频支持** — 每个音频文件仅控制其所属区段的时间戳
- **自动检测** — 仅在文档包含嵌入音频时插件才生效
```

Use this Chinese verification section before `## 环境要求`:

````markdown
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
````

- [ ] **Step 5: Run verification commands**

Run:

```bash
npm test
npm run build
```

Expected: both commands PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add README.md README_CN.md
git commit -m "docs: document rhythm timestamp syntax"
```

---

### Task 8: Final Verification

**Files:**
- Inspect: `git status`
- Inspect: generated `main.js`

- [ ] **Step 1: Run full automated verification**

Run:

```bash
npm test
npm run build
```

Expected: both commands PASS.

- [ ] **Step 2: Confirm working tree state**

Run:

```bash
git status --short
```

Expected: no source changes except generated `main.js` if the repository tracks build output after `npm run build`.

- [ ] **Step 3: If `main.js` is tracked and changed, commit it**

Run:

```bash
git ls-files main.js
```

If the command prints `main.js`, run:

```bash
git add main.js
git commit -m "build: update bundled plugin"
```

- [ ] **Step 4: Record manual test instructions for the user**

In the final response, include:

```text
To test in Obsidian:
1. Run npm run build.
2. Copy main.js, styles.css, and manifest.json into <vault>/.obsidian/plugins/timestamp-player/.
3. Enable Timestamp Player in Settings -> Community plugins.
4. Open a note in reading view containing an embedded audio file and explicit tokens such as {music bpm=120 delay=0.3}, {b:2.1}, and {t:00:05}.
```
