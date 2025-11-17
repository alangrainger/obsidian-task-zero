import { ItemView, WorkspaceLeaf } from 'obsidian'
import Table from './components/TaskTable.svelte'
import type DoTaskPlugin from '../main'
import { mount, unmount } from 'svelte'
import { KeymapScope } from '../classes/keymap-scope'

export const DO_TASK_VIEW_TYPE = 'gtd-view'

export interface TaskScopes {
  tasklist: KeymapScope
  sidebar: KeymapScope
  tasklistAndSidebar: KeymapScope
  [key: string]: KeymapScope
}

export class DoTaskView extends ItemView {
  plugin: DoTaskPlugin
  table?: ReturnType<typeof Table>
  scopes: TaskScopes

  constructor (leaf: WorkspaceLeaf, plugin: DoTaskPlugin) {
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
    return DO_TASK_VIEW_TYPE
  }

  getDisplayText () {
    return 'Do Tasks view'
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
    this.table.setActive(true)
  }

  async onClose () {
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
