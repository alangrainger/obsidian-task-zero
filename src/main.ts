import { Plugin, type WorkspaceLeaf } from 'obsidian'
import { DEFAULT_SETTINGS, type DoPluginSettings, DoSettingTab } from './settings'
import { Tasks } from './classes/tasks'
import { GTD_VIEW_TYPE, GtdView } from './views/task-view'

export default class DoPlugin extends Plugin {
  tasks!: Tasks
  settings!: DoPluginSettings
  updateTimer: { [key: string]: NodeJS.Timeout } = {}

  async onload () {
    // Settings
    await this.loadSettings()
    this.addSettingTab(new DoSettingTab(this.app, this))

    // Init classes
    this.tasks = new Tasks(this)

    this.registerView(
      GTD_VIEW_TYPE,
      (leaf) => new GtdView(leaf, this)
    )
    this.addRibbonIcon('dice', 'Activate view', () => {
      this.activateView()
    })

    // Watch for metadata cache changes, but only start processing after no changes in N seconds
    this.registerEvent(this.app.metadataCache.on('changed', (file, data, cache) => {
      clearTimeout(this.updateTimer[file.path])
      this.updateTimer[file.path] = setTimeout(() => {
        console.log('Processing ' + file.basename)
        this.tasks.processTasksFromCacheUpdate({ file, data, cache })
      }, 3000)
    }))
  }

  onunload () {

  }

  async loadSettings () {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings () {
    await this.saveData(this.settings)
  }

  async activateView () {
    const { workspace } = this.app

    let leaf: WorkspaceLeaf | null

    const leaves = workspace.getLeavesOfType(GTD_VIEW_TYPE)
    if (leaves.length > 0) {
      // A leaf with our view already exists, use that
      leaf = leaves[0]
    } else {
      // Our view could not be found in the workspace, create a new leaf
      leaf = workspace.getLeaf(true)
      await leaf?.setViewState({
        type: GTD_VIEW_TYPE,
        active: true
      })
    }
    // Reveal the leaf
    if (leaf) workspace.revealLeaf(leaf)
  }
}
