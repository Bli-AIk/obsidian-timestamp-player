import { describe, expect, it } from "vitest";
import {
	cloneRhythmConfig,
	DEFAULT_METER,
	DEFAULT_RHYTHM_CONFIG,
	mergeRhythmConfig,
	formatBeatPosition,
	parseBeatPosition,
	parseMeter,
	resolveCurrentBeatPosition,
	resolveBeatSeconds,
} from "./rhythm";

describe("cloneRhythmConfig", () => {
	it("returns a separate meter object", () => {
		const cloned = cloneRhythmConfig({ ...DEFAULT_RHYTHM_CONFIG, bpm: 120 });

		expect(cloned).toEqual({ ...DEFAULT_RHYTHM_CONFIG, bpm: 120 });
		expect(cloned.meter).toEqual(DEFAULT_RHYTHM_CONFIG.meter);
		expect(cloned.meter).not.toBe(DEFAULT_RHYTHM_CONFIG.meter);
	});
});

describe("mergeRhythmConfig", () => {
	it("can clear nullable fields", () => {
		const merged = mergeRhythmConfig({ ...DEFAULT_RHYTHM_CONFIG, bpm: 120, metronome: true }, { bpm: null, metronome: null });

		expect(merged.bpm).toBeNull();
		expect(merged.metronome).toBeNull();
	});

	it("preserves fields not present in the patch", () => {
		const config = {
			bpm: 120,
			delay: 0.25,
			meter: { beatsPerBar: 3, beatUnit: 4, label: "3/4" },
			metronome: true,
		};

		expect(mergeRhythmConfig(config, { delay: 0.5 })).toEqual({
			bpm: 120,
			delay: 0.5,
			meter: { beatsPerBar: 3, beatUnit: 4, label: "3/4" },
			metronome: true,
		});
	});
});

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

	it("rejects invalid exported position inputs", () => {
		expect(resolveBeatSeconds({ bar: 0, beat: 1 }, { ...DEFAULT_RHYTHM_CONFIG, bpm: 120 })).toBeNull();
		expect(resolveBeatSeconds({ bar: 1, beat: 0 }, { ...DEFAULT_RHYTHM_CONFIG, bpm: 120 })).toBeNull();
		expect(resolveBeatSeconds({ bar: 1.5, beat: 1 }, { ...DEFAULT_RHYTHM_CONFIG, bpm: 120 })).toBeNull();
		expect(resolveBeatSeconds({ bar: 1, beat: 1.5 }, { ...DEFAULT_RHYTHM_CONFIG, bpm: 120 })).toBeNull();
	});

	it("rejects invalid exported meter inputs", () => {
		expect(resolveBeatSeconds({ bar: 1, beat: 1 }, { ...DEFAULT_RHYTHM_CONFIG, bpm: 120, meter: { beatsPerBar: 0, beatUnit: 4, label: "0/4" } })).toBeNull();
		expect(resolveBeatSeconds({ bar: 1, beat: 1 }, { ...DEFAULT_RHYTHM_CONFIG, bpm: 120, meter: { beatsPerBar: -1, beatUnit: 4, label: "-1/4" } })).toBeNull();
		expect(resolveBeatSeconds({ bar: 1, beat: 1 }, { ...DEFAULT_RHYTHM_CONFIG, bpm: 120, meter: { beatsPerBar: 1.5, beatUnit: 4, label: "1.5/4" } })).toBeNull();
		expect(resolveBeatSeconds({ bar: 1, beat: 1 }, { ...DEFAULT_RHYTHM_CONFIG, bpm: 120, meter: { beatsPerBar: Number.MAX_SAFE_INTEGER + 1, beatUnit: 4, label: "unsafe/4" } })).toBeNull();
	});
});

describe("resolveCurrentBeatPosition", () => {
	it("maps audio time back to the current beat", () => {
		expect(resolveCurrentBeatPosition(0, { ...DEFAULT_RHYTHM_CONFIG, bpm: 120, delay: 0.3 })).toEqual({ bar: 1, beat: 1 });
		expect(resolveCurrentBeatPosition(1.7, { ...DEFAULT_RHYTHM_CONFIG, bpm: 120, delay: 0.3 })).toEqual({ bar: 2, beat: 1 });
	});

	it("uses the configured meter numerator", () => {
		const meter = parseMeter("3/4");
		expect(meter).not.toBeNull();
		expect(resolveCurrentBeatPosition(3, { ...DEFAULT_RHYTHM_CONFIG, bpm: 60, meter: meter! })).toEqual({ bar: 2, beat: 1 });
	});

	it("rejects invalid display inputs", () => {
		expect(resolveCurrentBeatPosition(-1, { ...DEFAULT_RHYTHM_CONFIG, bpm: 120 })).toBeNull();
		expect(resolveCurrentBeatPosition(0, { ...DEFAULT_RHYTHM_CONFIG, bpm: null })).toBeNull();
		expect(resolveCurrentBeatPosition(0, { ...DEFAULT_RHYTHM_CONFIG, bpm: 120, meter: { beatsPerBar: 0, beatUnit: 4, label: "0/4" } })).toBeNull();
	});
});

describe("formatBeatPosition", () => {
	it("formats bar and beat labels", () => {
		expect(formatBeatPosition({ bar: 12, beat: 3 })).toBe("12.3");
	});
});
