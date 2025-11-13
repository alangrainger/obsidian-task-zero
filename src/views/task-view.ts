import { ItemView, WorkspaceLeaf } from 'obsidian'
import Table from './components/TaskTable.svelte'
import type GtdPlugin from '../main'

export const GTD_VIEW_TYPE = 'gtd-view'

export class GtdView extends ItemView {
  plugin: GtdPlugin
  table?: Table

  constructor (leaf: WorkspaceLeaf, plugin: GtdPlugin) {
    super(leaf)
    this.plugin = plugin
  }

  getViewType () {
    return GTD_VIEW_TYPE
  }

  getDisplayText () {
    return 'GTD view'
  }

  async onOpen () {
    this.table = new Table({
      target: this.contentEl,
      props: {
        plugin: this.plugin
      }
    })
  }

  update () {
    this.table?.update()
  }

  async onClose () {
    this.table?.$destroy()
  }
}
