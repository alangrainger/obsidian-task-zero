import { ItemView, WorkspaceLeaf } from 'obsidian'
import Table from './components/TaskTable.svelte'
import TaskZeroPlugin from '../main'
import { mount, unmount } from 'svelte'
import { KeymapScope } from '../classes/keymap-scope'

export const TASK_ZERO_VIEW_TYPE = 'task-zero-view'

export interface TaskScopes {
  tasklist: KeymapScope
  sidebar: KeymapScope
  tasklistAndSidebar: KeymapScope
  [key: string]: KeymapScope
}

export class TaskZeroView extends ItemView {
  plugin: TaskZeroPlugin
  table?: ReturnType<typeof Table>
  scopes: TaskScopes
  icon = 'square-check-big'

  constructor (leaf: WorkspaceLeaf, plugin: TaskZeroPlugin) {
    super(leaf)
    this.plugin = plugin
    const tasklistAndSidebar = new KeymapScope(plugin, plugin.app.scope)
    this.scopes = {
      tasklistAndSidebar,
      tasklist: new KeymapScope(plugin, tasklistAndSidebar.scope),
      sidebar: new KeymapScope(plugin, tasklistAndSidebar.scope)
    }
  }

  getViewType () {
    return TASK_ZERO_VIEW_TYPE
  }

  getDisplayText () {
    return 'Tasklist'
  }

  async onOpen () {
    this.table = mount(Table, {
      target: this.contentEl,
      props: {
        view: this,
        plugin: this.plugin,
        scopes: this.scopes
      }
    })
  }

  async onClose () {
    this.table?.unmount()
    this.disableAllScopes()
    return unmount(Table)
  }

  /**
   * Disable all keymap (hotkey) scopes
   */
  disableAllScopes () {
    Object.keys(this.scopes).forEach(scope => this.scopes[scope].disable())
  }
}
