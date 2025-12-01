import { App, type Hotkey, PluginSettingTab, Setting, type TFile } from 'obsidian'
import MyPlugin from './main'
import { TaskEmoji, type TaskRow } from './classes/task.svelte'
import { debug } from './functions'
import { FileSuggest } from './views/suggest/file-suggest'
import type { Tab } from './views/view-types'
import { HotkeyAction } from './views/hotkeys'

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
    key: 'waitingOn',
    name: 'Waiting on',
    dropdownOptions: [DisplayOption.TAG, DisplayOption.EMOJI, DisplayOption.NONE],
    emoji: TaskEmoji.WAITING_ON
  },
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

const tabSettings = [
  {
    key: 'label',
    name: 'Title',
    placeholder: '🏠 Home'
  },
  {
    key: 'tag',
    name: 'Tag to match on',
    placeholder: '#context/home'
  },
  {
    key: 'icon',
    name: '(Optional) Lucide.dev icon',
    placeholder: 'house'
  }
]

export interface TaskZeroSettings {
  defaultNote: string;
  archiveNote: string;
  taskBlockPrefix: string;
  displayOptions: {
    waitingOn: DisplayOption;
    created: DisplayOption;
    scheduled: DisplayOption;
    due: DisplayOption;
    completed: DisplayOption;
    [key: string]: any
  }
  hotkeys: {
    [key: string]: Hotkey
  }
  excludeTags: {
    note: string;
    section: string;
    task: string;
  }
  tasklistTabs: Tab[];
  masterAppId: string;
  database: {
    tasks: {
      autoincrement: number;
      rows: TaskRow[];
    },
    changeQueue: string[]
    lastQueueCheck: number
    lastCleanup: number
  }
  debug: boolean;

  [key: string]: any
}

export const DEFAULT_SETTINGS: TaskZeroSettings = {
  defaultNote: 'Next Action quick add',
  archiveNote: 'Next Action completed tasks',
  taskBlockPrefix: 'tz',
  displayOptions: {
    waitingOn: DisplayOption.TAG,
    created: DisplayOption.NONE,
    scheduled: DisplayOption.EMOJI,
    due: DisplayOption.EMOJI,
    completed: DisplayOption.EMOJI,
  },
  hotkeys: {
    [HotkeyAction.TASKLIST_MOVE_UP]: { key: 'ArrowUp', modifiers: [] },
    [HotkeyAction.TASKLIST_MOVE_DOWN]: { key: 'ArrowDown', modifiers: [] },
    [HotkeyAction.TASKLIST_MOVE_UP_ALT]: { key: 'j', modifiers: [] },
    [HotkeyAction.TASKLIST_MOVE_DOWN_ALT]: { key: 'k', modifiers: [] },
    [HotkeyAction.TASKLIST_SIDEBAR_CLOSE]: { key: 'Escape', modifiers: [] },
    [HotkeyAction.TASKLIST_OPEN_ACTIVE_ROW]: { key: 'Enter', modifiers: [] },
    [HotkeyAction.TASKLIST_MOVE_TASK]: { key: 'm', modifiers: [] },
    [HotkeyAction.TASKLIST_NEW_TASK]: { key: 'n', modifiers: [] },
    [HotkeyAction.TASKLIST_TOGGLE_COMPLETED]: { key: ' ', modifiers: [] },
    [HotkeyAction.TASK_SET_TYPE_PROJECT]: { key: 'p', modifiers: [] },
    [HotkeyAction.TASK_SET_TYPE_NEXT_ACTION]: { key: 'a', modifiers: [] },
    [HotkeyAction.TASK_SET_TYPE_SOMEDAY]: { key: 's', modifiers: [] },
    [HotkeyAction.TASK_SET_TYPE_WAITING_ON]: { key: 'w', modifiers: [] },
  },
  excludeTags: {
    note: '#exclude-all-tasks',
    section: '#exclude-tasks',
    task: '#exclude'
  },
  tasklistTabs: [],
  masterAppId: '',
  database: {
    tasks: {
      autoincrement: 1,
      rows: []
    },
    changeQueue: [],
    lastQueueCheck: 0,
    lastCleanup: 0
  },
  debug: false
}

export class DoSettingTab extends PluginSettingTab {
  plugin: MyPlugin
  settings: TaskZeroSettings

  constructor (app: App, plugin: MyPlugin) {
    super(app, plugin)
    this.plugin = plugin
    this.settings = plugin.settings
    debug.enabled = this.settings.debug

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
      .addText(text => {
        new FileSuggest(this.app, text.inputEl, async (file: TFile) => {
          this.plugin.settings.defaultNote = file.path
          await this.plugin.saveSettings()
        })
        text.setValue(this.plugin.settings.defaultNote)
      })

    new Setting(containerEl)
      .setName('Archived task note')
      .setDesc('The note that will be used to store completed tasks when you run the Archive command.')
      .addText(text => {
        new FileSuggest(this.app, text.inputEl, async (file: TFile) => {
          this.plugin.settings.archiveNote = file.path
          await this.plugin.saveSettings()
        })
        text.setValue(this.plugin.settings.archiveNote)
      })

    new Setting(containerEl)
      .setHeading()
      .setName('Tasklist Tabs')
      .addButton(button => button
        .setButtonText('Add another tab')
        .setCta()
        .onClick(() => {
          this.settings.tasklistTabs.push({ id: '', label: '' })
          this.display()
        }))

    new Setting(containerEl)
      .setName('Main tasklist')
      .setDesc('This is a built-in tab and cannot be removed.')

    this.settings.tasklistTabs.forEach((tab, i) => {
      new Setting(containerEl)
        .setName(`Tab #${i + 2} settings:`)
        .addButton(button => button
          .setButtonText(`️Delete tab #${i + 2}`)
          .setWarning()
          .onClick(() => {
            this.settings.tasklistTabs.splice(i, 1)
            this.display()
          }))
      for (const info of tabSettings) {
        new Setting(containerEl)
          .setName(info.name)
          .addText(text => {
            text
              .setPlaceholder(info.placeholder)
              .setValue(tab[info.key] || '')
              .onChange(async (value) => {
                tab[info.key] = value
                await this.plugin.saveSettings()
              })
          })
          .setClass('next-action-tab-setting')
      }
    })

    new Setting(containerEl)
      .setName('💤 Someday tasks')
      .setDesc('This is a built-in tab and cannot be removed.')

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
    } else {
      new Setting(containerEl)
        .setName('Revoke master device')
        .setDesc('Removes the current master device, so you can set a new one.')
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
        .setPlaceholder(DEFAULT_SETTINGS.taskBlockPrefix)
        .setValue(this.plugin.settings.taskBlockPrefix)
        .onChange(async (value) => {
          value = value.replace(/[^A-Za-z]/g, '')
          this.plugin.settings.taskBlockPrefix = value || DEFAULT_SETTINGS.taskBlockPrefix
          await this.plugin.saveSettings()
        }))

    new Setting(containerEl)
      .setName('Show debug messages')
      .setDesc('Enable debug messages in the console.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.debug)
        .onChange(async value => {
          this.plugin.settings.debug = value
          debug.enabled = value
          await this.plugin.saveSettings()
        }))
  }
}
