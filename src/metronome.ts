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
		const alreadyStarted = this.audio === audio && this.config !== null && this.hasSameConfig(config);

		this.audio = audio;
		this.config = config;
		this.onBeat = onBeat;
		if (!alreadyStarted) this.lastBeatIndex = null;

		if (this.timer === null) {
			this.timer = window.setInterval(() => this.tick(), 25);
		}

		if (!alreadyStarted) this.tick();
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

	dispose(): void {
		this.stop();
		const context = this.context;
		this.context = null;
		if (context && context.state !== "closed") context.close().catch(() => {});
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
		if (!this.config || this.config.volume <= 0) return;

		const context = this.getAudioContext();
		if (!context) return;
		if (context.state === "suspended") context.resume().catch(() => {});

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

	private hasSameConfig(config: MetronomeRuntimeConfig): boolean {
		return this.config !== null
			&& this.config.bpm === config.bpm
			&& this.config.delay === config.delay
			&& this.config.beatsPerBar === config.beatsPerBar
			&& this.config.volume === config.volume;
	}
}
