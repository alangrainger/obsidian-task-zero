import { App, DropdownComponent, PluginSettingTab, Setting } from 'obsidian'
import MyPlugin from './main'
import { TaskEmoji, type TaskRow } from './classes/task.svelte'

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
    key: 'created',
    name: 'Created date',
    dropdownOptions: [DisplayOption.EMOJI, DisplayOption.NONE],
    emoji: TaskEmoji.CREATED
  },
  {
    key: 'scheduled',
    name: 'Scheduled date',
    dropdownOptions: [DisplayOption.EMOJI, DisplayOption.NONE],
    emoji: TaskEmoji.SCHEDULED
  },
  {
    key: 'due',
    name: 'Due date',
    dropdownOptions: [DisplayOption.EMOJI, DisplayOption.NONE],
    emoji: TaskEmoji.DUE
  },
  {
    key: 'completed',
    name: 'Completed date',
    dropdownOptions: [DisplayOption.EMOJI, DisplayOption.NONE],
    emoji: TaskEmoji.COMPLETED
  }
]

export interface NextActionSettings {
  defaultNote: string;
  archiveNote: string;
  taskBlockPrefix: string;
  displayOptions: {
    created: DisplayOption;
    scheduled: DisplayOption;
    due: DisplayOption;
    completed: DisplayOption;
    [key: string]: any
  }
  excludeTags: {
    note: string;
    section: string;
    task: string;
  }
  masterAppId: string;
  database: {
    tasks: {
      autoincrement: number;
      rows: TaskRow[];
    }
  }
  [key: string]: any
}

export const DEFAULT_SETTINGS: NextActionSettings = {
  defaultNote: 'Next Action quick add',
  archiveNote: 'Next Action completed tasks',
  taskBlockPrefix: 'na',
  displayOptions: {
    created: DisplayOption.NONE,
    scheduled: DisplayOption.EMOJI,
    due: DisplayOption.EMOJI,
    completed: DisplayOption.EMOJI,
  },
  excludeTags: {
    note: '#exclude-all-tasks',
    section: '#exclude-tasks',
    task: '#exclude'
  },
  masterAppId: '',
  database: {
    tasks: {
      autoincrement: 1,
      rows: []
    }
  }
}

export class DoSettingTab extends PluginSettingTab {
  plugin: MyPlugin
  settings: NextActionSettings

  constructor (app: App, plugin: MyPlugin) {
    super(app, plugin)
    this.plugin = plugin
    this.settings = plugin.settings

    // Set the initial master device
    // If masterAppId is blank but there are existing database rows,
    // it's because someone has revoked a master device, so we don't
    // want to automatically set a new one.
    if (!this.settings.masterAppId && !this.settings.database.tasks.rows.length) {
      this.settings.masterAppId = this.app.appId
    }
  }

  display (): void {
    const { containerEl } = this

    containerEl.empty()

    if (!this.plugin.isMaster()) {
      new Setting(containerEl)
        .setHeading()
        .setName('This is not the master device!')
        .setDesc('Changes made by this device will not be saved. To make this device the master, you need to first revoke the current master device.')
      new Setting(containerEl)
        .setHeading()
        .setName('Capture notes')
    }

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
            .setValue(this.plugin.settings.displayOptions[element.key])
            .onChange(async (value) => {
              this.plugin.settings.displayOptions[element.key] = value as DisplayOption
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

    if (!this.settings.masterAppId) {
      new Setting(containerEl)
        .setName('Set as master device')
        .setDesc('Set this device as the master device.')
        .addButton(button => button
          .setButtonText('Set as master device')
          .setCta()
          .onClick(async () => {
            this.settings.masterAppId = this.app.appId
            await this.plugin.saveSettings()
            this.display()
          }))
    } else if (this.plugin.isMaster()) {
      new Setting(containerEl)
        .setName('Revoke master device')
        .setDesc('Removes this device as the master device, so you can set a new one.')
        .addButton(button => button
          .setButtonText('Revoke master device')
          .setWarning()
          .onClick(async () => {
            this.settings.masterAppId = ''
            await this.plugin.saveSettings()
            this.display()
          }))
    }

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
