import { MarkdownView, Plugin, TFile, type WorkspaceLeaf } from 'obsidian'
import { DEFAULT_SETTINGS, type DoPluginSettings, DoSettingTab } from './settings'
import { Tasks } from './classes/tasks'
import { NEXT_ACTION_VIEW_TYPE, NextActionView } from './views/task-view'
import { getOrCreateFile } from './functions'

export default class DoPlugin extends Plugin {
  tasks!: Tasks
  settings!: DoPluginSettings
  view!: NextActionView
  cacheChangeQueue = new Set<string>()
  cacheChangeInterval!: NodeJS.Timeout

  async onload () {
    // Settings
    await this.loadSettings()
    this.addSettingTab(new DoSettingTab(this.app, this))

    // Init classes
    this.tasks = new Tasks(this)

    this.registerView(
      NEXT_ACTION_VIEW_TYPE,
      leaf => {
        this.view = new NextActionView(leaf, this)
        return this.view
      }
    )
    this.addRibbonIcon('dice', 'Activate view', () => {
      this.activateView()
    })

    // Quick capture new task
    this.addCommand({
      id: 'quick-capture',
      name: 'Add new task (quick capture)',
      callback: () => this.tasks.openQuickCapture()
    })

    // Archive completed tasks from the active note
    this.addCommand({
      id: 'archive-completed',
      name: 'Archive completed tasks from the active note',
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView)
        if (checking) {
          return !!view?.file
        } else if (view?.file) {
          (async () => {
            let completedTaskString = ''
            // Remove tasks from original file
            await this.app.vault.process(view.file as TFile, data => {
              const taskRegex = /(?<=(^|\n))[ \t]*- \[x].*?(\n|$)/sg
              const completedTasks = data.match(taskRegex)?.map(line => line.trim()).join('\n')
              if (completedTasks) {
                completedTaskString = completedTasks
                data = data.replace(taskRegex, '')
              }
              return data
            })
            // Add tasks to the archive file
            const file = await getOrCreateFile(this.app, this.settings.archiveNote)
            await this.app.vault.append(file, completedTaskString.trim() + '\n')
          })()
        }
      }
    })

    // Queue note for update when metadata cache change detected
    this.registerEvent(this.app.metadataCache.on('changed', file => this.cacheChangeQueue.add(file.path)))

    // Process the cache change queue
    this.cacheChangeInterval = setInterval(() => {
      this.cacheChangeQueue.forEach(async (cacheItemPath) => {
        // Only process the update if the view is no longer active, to prevent
        // issues with the user and the plugin both changing the data
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView)
        if (activeView?.file?.path !== cacheItemPath) {
          const cache = this.app.metadataCache.getCache(cacheItemPath)
          const file = this.app.vault.getAbstractFileByPath(cacheItemPath)
          if (cache && file instanceof TFile) {
            this.cacheChangeQueue.delete(cacheItemPath)
            const data = await this.app.vault.cachedRead(file)
            await this.tasks.processTasksFromCacheUpdate({ file, data, cache })
          }
        }
      })
    }, 2000)

    // Notify the view when it is visible
    this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
      this.view?.table?.setActive(leaf?.view instanceof NextActionView)
    }))
  }

  onunload () {
    this.view?.close().then()
    clearInterval(this.cacheChangeInterval)
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

    const leaves = workspace.getLeavesOfType(NEXT_ACTION_VIEW_TYPE)
    if (leaves.length > 0) {
      // A leaf with our view already exists, use that
      leaf = leaves[0]
    } else {
      // Our view could not be found in the workspace, create a new leaf
      leaf = workspace.getLeaf(true)
      await leaf?.setViewState({
        type: NEXT_ACTION_VIEW_TYPE,
        active: true
      })
    }
    // Reveal the leaf
    if (leaf) workspace.revealLeaf(leaf).then()
  }
}
