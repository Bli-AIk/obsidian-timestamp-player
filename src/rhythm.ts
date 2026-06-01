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
		bpm: "bpm" in patch ? patch.bpm! : config.bpm,
		delay: "delay" in patch ? patch.delay! : config.delay,
		meter: patch.meter ? { ...patch.meter } : { ...config.meter },
		metronome: "metronome" in patch ? patch.metronome! : config.metronome,
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
	if (!Number.isSafeInteger(position.bar) || position.bar <= 0) return null;
	if (!Number.isSafeInteger(position.beat) || position.beat <= 0) return null;
	if (!Number.isSafeInteger(config.meter.beatsPerBar) || config.meter.beatsPerBar <= 0) return null;
	if (position.beat > config.meter.beatsPerBar) return null;

	const secondsPerBeat = 60 / config.bpm;
	const beatIndex = (position.bar - 1) * config.meter.beatsPerBar + (position.beat - 1);
	const beatSeconds = beatIndex * secondsPerBeat;
	return Math.max(0, beatSeconds - config.delay);
}
