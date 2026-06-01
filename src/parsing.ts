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

const EXPLICIT_TOKEN_RE = /\{(?:t:|b:|music(?=\s|\}))[^{}]*\}/g;
const LEGACY_INLINE_RE = /\b(\d{1,3}:\d{2})\b/g;
const LEGACY_SPEAKER_RE = /^(.+?)\s+(\d{1,3}:\d{2})\s*$/;

export function parseTimestampLiteral(input: string): ParsedTimestamp | null {
	const label = input.trim();
	const parts = label.split(":");
	if (parts.length !== 2 && parts.length !== 3) return null;
	if (!parts.every((part) => /^\d+$/.test(part))) return null;

	const values = parts.map((part) => Number(part));
	if (values.some((value) => !Number.isSafeInteger(value))) return null;

	if (parts.length === 2) {
		const [minutes, seconds] = values;
		if (seconds > 59) return null;
		return { label, seconds: minutes * 60 + seconds };
	}

	const [hours, minutes, seconds] = values;
	if (minutes > 59 || seconds > 59) return null;
	return { label, seconds: hours * 3600 + minutes * 60 + seconds };
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
		const assignment = part.split("=");
		if (assignment.length > 2) return { type: "invalid", raw, start, end };

		const [key, value] = assignment;
		if (!key || value === undefined) continue;
		if (value === "") continue;

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
	const explicitTokens = findExplicitTokens(text);
	LEGACY_INLINE_RE.lastIndex = 0;

	let match: RegExpExecArray | null;
	while ((match = LEGACY_INLINE_RE.exec(text)) !== null) {
		const start = match.index;
		const end = start + match[1].length;
		if (explicitTokens.some((token) => start >= token.start && end <= token.end)) continue;

		const parsed = parseTimestampLiteral(match[1]);
		if (!parsed) continue;
		timestamps.push({
			...parsed,
			start,
			end,
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
