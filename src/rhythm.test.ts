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
