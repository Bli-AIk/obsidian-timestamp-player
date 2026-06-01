# Rhythm Timestamp Player Design

## Context

The fork currently turns bare `MM:SS` text into clickable timestamp buttons in Obsidian reading view. That works well for transcripts, but it can misidentify ordinary times in design notes. The new behavior should require a small explicit syntax for timestamps and add beat-based navigation for music-driven documents.

The reference rhythm model comes from `/home/aik/Projects/RustroverProjects/deltarune-ddd`, where a track has `bpm` and `head_delay`, and the beat index is calculated from `current_seconds + head_delay`.

## Goals

- Replace default bare timestamp detection with explicit timestamp tokens.
- Support beat/bar tokens that resolve to audio seconds from per-track rhythm metadata.
- Preserve the original multi-audio section behavior: an audio embed controls tokens below it until the next audio embed.
- Provide a simple metronome aid with visual highlighting and optional click sound, disabled by default.
- Keep old bare timestamp support available through a compatibility setting, disabled by default.
- Document how to verify the plugin inside Obsidian after implementation.

## Non-Goals

- Do not modify or consume content from the user's external design documents.
- Do not support edit mode or live preview mode in this change; the plugin remains reading-view focused.
- Do not build a full DAW timeline, tempo map, tempo changes, or automatic beat detection.
- Do not support arbitrary Obsidian embed-style commands such as `![[b:1.1]]`, because they conflict with Obsidian's existing embed rendering.

## Syntax

Explicit tokens are plain text enclosed in braces:

```markdown
![[music.ogg]]
{music bpm=135 delay=0.3}

Intro {b:1.1}
Hit {b:4.3}
Exact fallback {t:00:27}
```

Supported token forms:

- `{t:MM:SS}` seeks to an absolute timestamp.
- `{t:HH:MM:SS}` seeks to an absolute timestamp for longer audio.
- `{b:bar.beat}` seeks to a beat position using the current audio section's rhythm metadata.
- `{music bpm=135 delay=0.3}` configures the current audio section.
- `{music bpm=135 delay=0.3 meter=3/4 metronome=on}` also overrides meter and enables the metronome for the section.

`{b:bar.beat}` uses one-based display values. `{b:1.1}` is the first beat of the first bar.

## Rhythm Metadata

Each audio section has rhythm configuration:

- `bpm`: beats per minute. Required for `{b:...}` tokens in that section.
- `delay`: head delay in seconds. Optional, default `0`.
- `meter`: optional, default `4/4`.
- `metronome`: optional per-section override, default inherited from plugin settings.

For implementation, only the meter numerator is needed for `bar.beat` conversion. `4/4` means four beats per bar, `3/4` means three beats per bar, and `6/8` means six beat units per bar. The denominator is retained for readable configuration and future extension.

If multiple `{music ...}` tokens appear in the same audio section, later tokens override earlier values for tokens that follow them in document order.

Valid `{music ...}` config tokens are consumed and hidden in reading view so they do not add visual noise to the note. A malformed `{music ...}` token remains visible as plain text.

## Beat Conversion

The plugin follows the reference project's `head_delay` semantics.

Given:

- `bar` and `beat` are one-based values from `{b:bar.beat}`.
- `beatsPerBar` is the meter numerator.
- `secondsPerBeat = 60 / bpm`.
- `delay` is the configured head delay in seconds.

Then:

```text
beatIndex = (bar - 1) * beatsPerBar + (beat - 1)
beatSeconds = beatIndex * secondsPerBeat
audioSeconds = max(0, beatSeconds - delay)
```

This matches the reference model where playback time plus `head_delay` is used to derive the current beat.

Validation rules:

- `bpm` must be a positive number.
- `delay` must be a finite number and may be positive, zero, or negative.
- `bar` must be an integer greater than or equal to `1`.
- `beat` must be an integer greater than or equal to `1` and less than or equal to `beatsPerBar`.
- Invalid tokens remain visible as plain text and should not break processing of other tokens.

## Rendering And Playback

In reading view, valid tokens become clickable timestamp buttons. The button label should preserve the user-facing token meaning:

- `{t:00:27}` renders as a play button labeled `00:27`.
- `{b:4.3}` renders as a play button labeled `4.3`.
- Valid `{music ...}` tokens do not render a button and are removed from reading view after their configuration is applied.

Click behavior remains the same as the original plugin:

- Clicking a token seeks the matching audio element and plays from the resolved second.
- Clicking the active token toggles pause/play.
- Switching to another audio section pauses the previous audio.
- Playback follow-along highlights the latest token at or before the current audio time within the active section.

For follow-along, `{b:...}` tokens compare by their resolved `audioSeconds`, so beat tokens and absolute time tokens can coexist.

## Legacy Compatibility

Bare `MM:SS` and speaker-line timestamp detection is disabled by default.

A plugin setting named `legacyBareTimestamps` enables the old behavior for existing transcript notes. When enabled, the old behavior applies in addition to the new explicit tokens:

- `SpeakerName MM:SS` at the start of a paragraph renders like the original plugin.
- Inline bare `MM:SS` renders like the original plugin.

Explicit tokens always work regardless of the legacy setting.

## Metronome

The metronome has two parts:

- Visual: while audio plays, mark the current beat for configured sections.
- Audio: optionally play a short click on each beat, with a distinct accent on the first beat of each bar.

The metronome is disabled by default. It can be enabled globally in plugin settings or per audio section with `metronome=on`. A per-section `metronome=off` disables it for that section even if the global setting is on.

The click should be generated in the browser using the Web Audio API to avoid adding binary assets. It should be short, quiet, and tied to the active audio's playback state. Pausing, ending, or switching audio stops scheduled clicks.

## Settings

Add a settings tab with:

- `Recognize bare timestamps`: default off.
- `Enable metronome by default`: default off.
- `Metronome volume`: default quiet value, stored as a number between `0` and `1`.

Per-section document config can override the metronome state but does not change global settings.

## Error Handling

- Notes without audio embeds are ignored, matching the original plugin.
- `{b:...}` tokens without a valid `bpm` in their section remain plain text.
- Invalid config values are ignored individually; valid values in the same `{music ...}` token still apply.
- Invalid timestamp or beat tokens remain plain text.
- Runtime audio playback failures are swallowed the same way the current plugin swallows `audio.play()` rejection.

## Testing

Add unit-testable pure functions for:

- Token parsing.
- Music config parsing.
- Absolute timestamp conversion.
- Beat-to-seconds conversion.
- Legacy bare timestamp gating.

Run at least:

```bash
npm run build
```

If a test runner is added, include focused tests for:

- `{t:00:27}` resolves to `27`.
- `{t:01:02:03}` resolves to `3723`.
- `{b:1.1}` at `bpm=120`, `delay=0`, `meter=4/4` resolves to `0`.
- `{b:2.1}` at `bpm=120`, `delay=0.3`, `meter=4/4` resolves to `1.7`.
- `{b:2.1}` at `bpm=60`, `delay=0`, `meter=3/4` resolves to `3`.
- Invalid `{b:1.5}` with `meter=4/4` is rejected.
- Bare `00:27` is ignored when `legacyBareTimestamps` is false.
- Bare `00:27` is parsed when `legacyBareTimestamps` is true.

## Manual Obsidian Verification

After implementation, build the plugin and copy `main.js`, `manifest.json`, and `styles.css` into a test vault at `.obsidian/plugins/timestamp-player/`. Enable the plugin in Obsidian community plugin settings, open a note in reading view, and verify:

```markdown
![[music.ogg]]
{music bpm=120 delay=0.3 meter=4/4 metronome=off}

Start {b:1.1}
Bar two {b:2.1}
Absolute {t:00:05}
Bare legacy 00:07
```

Expected results:

- The three explicit tokens become clickable buttons.
- The bare `00:07` remains plain text until the compatibility setting is enabled.
- `{b:2.1}` seeks to `1.7` seconds.
- Enabling the metronome produces visual beat feedback and quiet clicks during playback.

## Implementation Shape

Keep the current plugin architecture but split parsing and conversion into small pure helpers so behavior can be tested without Obsidian. `src/main.ts` should stay responsible for Obsidian lifecycle, DOM replacement, settings, and playback state.

Likely units:

- `src/parsing.ts`: token and config parsing.
- `src/rhythm.ts`: meter parsing and beat-to-seconds conversion.
- `src/settings.ts`: plugin settings defaults and settings tab.
- `src/main.ts`: markdown postprocessor, DOM replacement, audio lookup, metronome integration.

This keeps the change scoped while avoiding a large all-in-one `main.ts`.
