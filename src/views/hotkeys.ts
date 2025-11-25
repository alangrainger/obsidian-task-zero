import { type Hotkey, Modal, Setting } from 'obsidian'
import TaskZeroPlugin from '../main'

export enum HotkeyAction {
  TASKLIST_MOVE_UP = 'tasklist-move-up',
  TASKLIST_MOVE_DOWN = 'tasklist-move-down',
  TASKLIST_MOVE_UP_ALT = 'tasklist-move-up-alt',
  TASKLIST_MOVE_DOWN_ALT = 'tasklist-move-down-alt',
  TASKLIST_SIDEBAR_CLOSE = 'tasklist-sidebar-close',
  TASKLIST_OPEN_ACTIVE_ROW = 'tasklist-open-active-row',
  TASKLIST_MOVE_TASK = 'tasklist-move-task',
  TASKLIST_NEW_TASK = 'tasklist-new-task',
  TASK_SET_TYPE_PROJECT = 'task-set-type-project',
  TASK_SET_TYPE_NEXT_ACTION = 'task-set-type-next-action',
  TASK_SET_TYPE_SOMEDAY = 'task-set-type-someday',
  TASK_SET_TYPE_WAITING_ON = 'task-set-type-waiting-on',
  TASKLIST_TOGGLE_COMPLETED = 'task-toggle-completed',
  OPEN_KEYBOARD_SHORTCUTS = 'open-keyboard-shortcuts',
}

export const HOTKEY_DESCRIPTIONS: Record<HotkeyAction, string> = {
  [HotkeyAction.TASKLIST_MOVE_UP]: 'Move up the tasklist',
  [HotkeyAction.TASKLIST_MOVE_DOWN]: 'Move down the tasklist',
  [HotkeyAction.TASKLIST_MOVE_UP_ALT]: 'Alternative key to move up the tasklist',
  [HotkeyAction.TASKLIST_MOVE_DOWN_ALT]: 'Alternative key to move down the tasklist',
  [HotkeyAction.TASKLIST_SIDEBAR_CLOSE]: 'Close the sidebar',
  [HotkeyAction.TASKLIST_OPEN_ACTIVE_ROW]: 'Open the currently active row in the sidebar',
  [HotkeyAction.TASKLIST_MOVE_TASK]: 'Move the highlighted task into a project',
  [HotkeyAction.TASKLIST_NEW_TASK]: 'Create a new task. If a project is highlighted, a subtask will be created for that project instead',
  [HotkeyAction.TASK_SET_TYPE_PROJECT]: 'Set the task type to "Project"',
  [HotkeyAction.TASK_SET_TYPE_NEXT_ACTION]: 'Set the task type to "Next Action"',
  [HotkeyAction.TASK_SET_TYPE_SOMEDAY]: 'Set the task type to "Someday"',
  [HotkeyAction.TASK_SET_TYPE_WAITING_ON]: 'Set the task type to "Waiting On"',
  [HotkeyAction.TASKLIST_TOGGLE_COMPLETED]: 'Toggle the completed status of the task',
  [HotkeyAction.OPEN_KEYBOARD_SHORTCUTS]: 'Open this help screen',
}

export class HotkeyModal extends Modal {
  plugin: TaskZeroPlugin

  constructor (plugin: TaskZeroPlugin) {
    super(plugin.app)
    this.plugin = plugin
  }

  onOpen () {
    const { contentEl } = this

    new Setting(contentEl)
      .setHeading()
      .setName('Keyboard Shortcuts')

    for (const [key, description] of Object.entries(HOTKEY_DESCRIPTIONS)) {
      const hotkey = this.plugin.settings.hotkeys[key as HotkeyAction]
      if (!hotkey) continue
      contentEl.createEl('p', { text: `${remapKeyName(hotkey)} - ${description}` })
    }
  }

  onClose () {
    const { contentEl } = this
    contentEl.empty()
  }
}

function remapKeyName (hotkey: Hotkey): string {
  if (hotkey?.key === ' ') return 'Space'
  return hotkey?.key || ''
}
