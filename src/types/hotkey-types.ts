import type { Modifier } from 'obsidian'

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
}

export interface HotkeyConfig {
  key: string;
  modifiers: Modifier[];
}

export type HotkeySettings = Record<HotkeyAction, HotkeyConfig>;

export const DEFAULT_HOTKEYS: HotkeySettings = {
  [HotkeyAction.TASKLIST_MOVE_UP]: { key: 'ArrowUp', modifiers: [] },
  [HotkeyAction.TASKLIST_MOVE_DOWN]: { key: 'ArrowDown', modifiers: [] },
  [HotkeyAction.TASKLIST_MOVE_UP_ALT]: { key: 'j', modifiers: [] },
  [HotkeyAction.TASKLIST_MOVE_DOWN_ALT]: { key: 'k', modifiers: [] },
  [HotkeyAction.TASKLIST_SIDEBAR_CLOSE]: { key: 'Escape', modifiers: [] },
  [HotkeyAction.TASKLIST_OPEN_ACTIVE_ROW]: { key: 'Enter', modifiers: [] },
  [HotkeyAction.TASKLIST_MOVE_TASK]: { key: 'm', modifiers: [] },
  [HotkeyAction.TASKLIST_NEW_TASK]: { key: 'n', modifiers: [] },
  [HotkeyAction.TASK_SET_TYPE_PROJECT]: { key: 'p', modifiers: [] },
  [HotkeyAction.TASK_SET_TYPE_NEXT_ACTION]: { key: 'a', modifiers: [] },
  [HotkeyAction.TASK_SET_TYPE_SOMEDAY]: { key: 's', modifiers: [] },
  [HotkeyAction.TASK_SET_TYPE_WAITING_ON]: { key: 'w', modifiers: [] },
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
}
