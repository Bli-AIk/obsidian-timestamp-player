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

export default class TimestampPlayerPlugin extends Plugin {
	settings: TimestampPlayerSettings = { ...DEFAULT_SETTINGS };

	async onload() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.addSettingTab(new TimestampPlayerSettingTab(this.app, this));

		this.registerMarkdownPostProcessor(
			async (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
				if (!(await this.hasAudioEmbed(ctx))) return;
				this.queueProcessTimestamps(el);
			}
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private async hasAudioEmbed(ctx: MarkdownPostProcessorContext): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!(file instanceof TFile)) return false;
		const content = await this.app.vault.cachedRead(file);
		return AUDIO_EMBED_RE.test(content);
	}

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

		const wrapper = createFragment();
		this.appendTextWithLegacy(wrapper, text, sectionConfig);
		node.parentNode?.replaceChild(wrapper, node);
		return null;
	}

	private activeBtn: HTMLElement | null = null;
	private activeAudio: HTMLAudioElement | null = null;
	private activeContainer: HTMLElement | null = null;
	private boundTimeUpdate: (() => void) | null = null;
	private boundEnded: (() => void) | null = null;
	private boundPause: (() => void) | null = null;
	private switching = false;
	private queuedRoots = new WeakSet<HTMLElement>();

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

	private togglePlay(btn: HTMLElement, seconds: number) {
		// If clicking the active button, toggle pause/play
		if (this.activeBtn === btn && this.activeAudio) {
			if (!this.activeAudio.paused) {
				this.activeAudio.pause();
			} else {
				this.activeAudio.play().catch(() => {});
			}
			return;
		}

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;

		const container = view.containerEl;
		const audio = this.findAudioForBtn(container, btn);
		if (!audio) return;

		// Detach old listeners before pausing to avoid stale callbacks
		this.detachAudioListeners();
		this.resetActiveBtn();

		// Pause previous audio if different
		this.switching = true;
		if (this.activeAudio && this.activeAudio !== audio && !this.activeAudio.paused) {
			this.activeAudio.pause();
		}
		this.switching = false;

		// Seek and play the matched audio
		audio.currentTime = Math.min(seconds, audio.duration || Infinity);
		audio.play().catch(() => {});

		this.activeAudio = audio;
		this.activeContainer = container;
		this.setActiveBtn(btn);

		// Attach listeners for follow-along and cleanup
		this.boundTimeUpdate = () => this.onTimeUpdate();
		this.boundEnded = () => this.clearPlaybackState();
		this.boundPause = () => {
			if (this.switching) return;
			if (this.activeBtn) {
				const icon = this.activeBtn.querySelector(".tsp-play-icon");
				if (icon) icon.textContent = "▶";
			}
		};
		audio.addEventListener("timeupdate", this.boundTimeUpdate);
		audio.addEventListener("ended", this.boundEnded);
		audio.addEventListener("pause", this.boundPause);
		audio.addEventListener("play", () => {
			if (this.activeBtn) {
				const icon = this.activeBtn.querySelector(".tsp-play-icon");
				if (icon) icon.textContent = "⏸";
			}
		});
	}

	/** Find the audio element that this button belongs to (the last audio before it in document order) */
	private findAudioForBtn(container: HTMLElement, btn: HTMLElement): HTMLAudioElement | null {
		const all = Array.from(container.querySelectorAll("audio, .tsp-timestamp"));
		let lastAudio: HTMLAudioElement | null = null;
		for (const el of all) {
			if (el.tagName === "AUDIO") {
				lastAudio = el as HTMLAudioElement;
			} else if (el === btn) {
				return lastAudio;
			}
		}
		return lastAudio;
	}

	/** Get timestamp buttons that belong to the same audio section (between this audio and the next) */
	private getTimestampsForAudio(container: HTMLElement, audio: HTMLAudioElement): HTMLElement[] {
		const all = Array.from(container.querySelectorAll("audio, .tsp-timestamp"));
		const audioIndex = all.indexOf(audio);
		if (audioIndex === -1) return [];

		const result: HTMLElement[] = [];
		for (let i = audioIndex + 1; i < all.length; i++) {
			if (all[i].tagName === "AUDIO") break;
			result.push(all[i] as HTMLElement);
		}
		return result;
	}

	private onTimeUpdate() {
		if (!this.activeAudio || !this.activeContainer) return;
		const currentTime = this.activeAudio.currentTime;

		const buttons = this.getTimestampsForAudio(this.activeContainer, this.activeAudio)
			.map((el) => ({
				el,
				seconds: parseFloat(el.getAttribute("data-seconds") || "0"),
			}))
			.sort((a, b) => a.seconds - b.seconds);

		let target: HTMLElement | null = null;
		for (const b of buttons) {
			if (b.seconds <= currentTime) {
				target = b.el;
			} else {
				break;
			}
		}

		if (target && target !== this.activeBtn) {
			this.setActiveBtn(target);
		}
	}

	private setActiveBtn(btn: HTMLElement) {
		if (this.activeBtn) {
			const prevIcon = this.activeBtn.querySelector(".tsp-play-icon");
			if (prevIcon) prevIcon.textContent = "▶";
			this.activeBtn.removeClass("tsp-active");
		}
		btn.addClass("tsp-active");
		const icon = btn.querySelector(".tsp-play-icon");
		if (icon) icon.textContent = "⏸";
		this.activeBtn = btn;
	}

	private resetActiveBtn() {
		if (this.activeBtn) {
			const icon = this.activeBtn.querySelector(".tsp-play-icon");
			if (icon) icon.textContent = "▶";
			this.activeBtn.removeClass("tsp-active");
			this.activeBtn = null;
		}
	}

	private detachAudioListeners() {
		if (this.activeAudio) {
			if (this.boundTimeUpdate) this.activeAudio.removeEventListener("timeupdate", this.boundTimeUpdate);
			if (this.boundEnded) this.activeAudio.removeEventListener("ended", this.boundEnded);
			if (this.boundPause) this.activeAudio.removeEventListener("pause", this.boundPause);
		}
		this.boundTimeUpdate = null;
		this.boundEnded = null;
		this.boundPause = null;
	}

	private clearPlaybackState() {
		this.detachAudioListeners();
		this.resetActiveBtn();
		this.activeAudio = null;
		this.activeContainer = null;
	}
}
