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

	it("normalizes labels to the trimmed timestamp literal", () => {
		expect(parseTimestampLiteral(" 00:27 ")).toEqual({ label: "00:27", seconds: 27 });
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

	it("keeps malformed explicit time tokens with whitespace as invalid tokens", () => {
		expect(findExplicitTokens("{t:00:27 bad}")).toEqual([
			{ type: "invalid", raw: "{t:00:27 bad}", start: 0, end: 13 },
		]);
	});

	it("keeps malformed explicit beat tokens with whitespace as invalid tokens", () => {
		expect(findExplicitTokens("{b:1.1 bad}")).toEqual([
			{ type: "invalid", raw: "{b:1.1 bad}", start: 0, end: 11 },
		]);
	});

	it("rejects music config tokens with malformed assignments", () => {
		expect(findExplicitTokens("{music bpm=120=bad}")).toEqual([
			{ type: "invalid", raw: "{music bpm=120=bad}", start: 0, end: 19 },
		]);
	});

	it("keeps valid music config values when invalid values are syntactically well formed", () => {
		expect(findExplicitTokens("{music bpm=120 delay=nope meter=3/4}")).toEqual([
			{
				type: "music",
				raw: "{music bpm=120 delay=nope meter=3/4}",
				start: 0,
				end: 36,
				patch: {
					bpm: 120,
					meter: { beatsPerBar: 3, beatUnit: 4, label: "3/4" },
				},
			},
		]);
	});

	it("ignores empty music config values when other valid fields remain", () => {
		expect(findExplicitTokens("{music bpm=120 delay=}")).toEqual([
			{
				type: "music",
				raw: "{music bpm=120 delay=}",
				start: 0,
				end: 22,
				patch: {
					bpm: 120,
				},
			},
		]);
	});

	it("rejects music config tokens with only empty values", () => {
		expect(findExplicitTokens("{music delay=}")).toEqual([
			{ type: "invalid", raw: "{music delay=}", start: 0, end: 14 },
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

	it("does not return bare timestamps inside explicit token spans", () => {
		expect(findLegacyInlineTimestamps("before 00:01 {t:00:27 bad} after 00:02")).toEqual([
			{ label: "00:01", seconds: 1, start: 7, end: 12 },
			{ label: "00:02", seconds: 2, start: 33, end: 38 },
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
