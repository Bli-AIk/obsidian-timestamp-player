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
