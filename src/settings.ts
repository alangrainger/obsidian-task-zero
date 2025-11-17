import { App, PluginSettingTab, Setting } from 'obsidian'
import MyPlugin from './main'

export interface DoPluginSettings {
  defaultNote: string;
  taskBlockPrefix: string;
}

export const DEFAULT_SETTINGS: DoPluginSettings = {
  defaultNote: 'Done Tasks quick add',
  taskBlockPrefix: 'do'
}

export class DoSettingTab extends PluginSettingTab {
  plugin: MyPlugin

  constructor (app: App, plugin: MyPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display (): void {
    const { containerEl } = this

    containerEl.empty()

    new Setting(containerEl)
      .setName('Default task note')
      .setDesc('The note that will be used to store tasks when creating from Quick Add.')
      .addText(text => text
        .setValue(this.plugin.settings.defaultNote)
        .onChange(async (value) => {
          this.plugin.settings.defaultNote = value || DEFAULT_SETTINGS.defaultNote
          await this.plugin.saveSettings()
        }))

    /*
     * Advanced settings
     */

    new Setting(containerEl)
      .setHeading()
      .setName('Advanced settings')
      .setDesc('Most users will not need to change these settings. Proceed with caution.')

    new Setting(containerEl)
      .setName('Task block prefix')
      .setDesc('')
      .addText(text => text
        .setValue(this.plugin.settings.taskBlockPrefix)
        .onChange(async (value) => {
          this.plugin.settings.taskBlockPrefix = value
          await this.plugin.saveSettings()
        }))
  }
}
