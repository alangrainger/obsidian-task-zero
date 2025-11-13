import { Plugin } from 'obsidian'
import { DEFAULT_SETTINGS, DoPluginSettings, DoSettingTab } from './settings'
import { Tasks } from './classes/tasks'

export default class DoPlugin extends Plugin {
  tasks: Tasks
  settings: DoPluginSettings
  updateTimer: { [key: string]: NodeJS.Timeout } = {}

  async onload () {
    // Settings
    await this.loadSettings()
    this.addSettingTab(new DoSettingTab(this.app, this))

    // Init classes
    this.tasks = new Tasks(this)

    // Watch for metadata cache changes, but only start processing after no changes in N seconds
    this.registerEvent(this.app.metadataCache.on('changed', (file, data, cache) => {
      clearTimeout(this.updateTimer[file.path])
      this.updateTimer[file.path] = setTimeout(() => {
        console.log('Processing ' + file.basename)
        this.tasks.processTasksFromCacheUpdate({ file, data, cache })
      }, 2000)
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
}
