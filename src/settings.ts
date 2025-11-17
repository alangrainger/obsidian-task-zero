import { App, DropdownComponent, PluginSettingTab, Setting } from 'obsidian'
import MyPlugin from './main'
import { TaskEmoji } from './classes/task.svelte'

interface TaskElement {
  key: string
  name: string
  dropdownOptions: DisplayOption[]
  emoji: string
}

export enum DisplayOption {
  EMOJI = 'Emoji',
  TAG = 'Tag',
  NONE = 'None'
}

const taskElements: TaskElement[] = [
  {
    key: 'createdDisplay',
    name: 'Created date',
    dropdownOptions: [DisplayOption.EMOJI, DisplayOption.NONE],
    emoji: TaskEmoji.CREATED
  },
  {
    key: 'scheduledDisplay',
    name: 'Scheduled date',
    dropdownOptions: [DisplayOption.EMOJI, DisplayOption.NONE],
    emoji: TaskEmoji.SCHEDULED
  },
  {
    key: 'dueDisplay',
    name: 'Due date',
    dropdownOptions: [DisplayOption.EMOJI, DisplayOption.NONE],
    emoji: TaskEmoji.DUE
  },
  {
    key: 'completedDisplay',
    name: 'Completed date',
    dropdownOptions: [DisplayOption.EMOJI, DisplayOption.NONE],
    emoji: TaskEmoji.COMPLETED
  }
]

export interface DoPluginSettings {
  [key: string]: any
  defaultNote: string;
  archiveNote: string;
  taskBlockPrefix: string;
  createdDisplay: DisplayOption;
  scheduledDisplay: DisplayOption;
  dueDisplay: DisplayOption;
  completedDisplay: DisplayOption;
}

export const DEFAULT_SETTINGS: DoPluginSettings = {
  defaultNote: 'Next Action quick add',
  archiveNote: 'Next Action completed tasks',
  taskBlockPrefix: 'na',
  createdDisplay: DisplayOption.NONE,
  scheduledDisplay: DisplayOption.EMOJI,
  dueDisplay: DisplayOption.EMOJI,
  completedDisplay: DisplayOption.EMOJI
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

    new Setting(containerEl)
      .setName('Archived task note')
      .setDesc('The note that will be used to store completed tasks when you run the Archive command.')
      .addText(text => text
        .setValue(this.plugin.settings.archiveNote)
        .onChange(async (value) => {
          this.plugin.settings.archiveNote = value || DEFAULT_SETTINGS.archiveNote
          await this.plugin.saveSettings()
        }))

    new Setting(containerEl)
      .setHeading()
      .setName('Task line settings')
      .setDesc('Choose how you want to display each of the task attributes in your notes. This will not affect how tasks are detected, it will only change how they are displayed.')

    for (const element of taskElements) {
      new Setting(this.containerEl)
        .setName(element.name)
        .addDropdown(dropdown => {
          element.dropdownOptions
            .forEach(key => {
              const prefix = key === DisplayOption.EMOJI ? element.emoji + ' ' : ''
              dropdown.addOption(key, prefix + key)
            })
          dropdown
            .setValue(this.plugin.settings[element.key])
            .onChange(async (value) => {
              this.plugin.settings[element.key] = value as DisplayOption
              await this.plugin.saveSettings()
            })
        })
    }

    /*
     * Advanced settings
     */

    new Setting(containerEl)
      .setHeading()
      .setName('Advanced settings')
      .setDesc('Most users will not need to change these settings. Proceed with caution.')

    new Setting(containerEl)
      .setName('Task block prefix')
      .setDesc(`This will be used in the block ID format for task lines. For example, setting a value of "${this.plugin.settings.taskBlockPrefix}" will produce a block ID in the format of "^${this.plugin.settings.taskBlockPrefix}123"`)
      .addText(text => text
        .setPlaceholder('do')
        .setValue(this.plugin.settings.taskBlockPrefix)
        .onChange(async (value) => {
          this.plugin.settings.taskBlockPrefix = value || DEFAULT_SETTINGS.taskBlockPrefix
          await this.plugin.saveSettings()
        }))
  }

  addDisplayOptions (el: DropdownComponent, options: string[]) {
    options.forEach(key => el.addOption(key, key))
  }
}
