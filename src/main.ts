import { MarkdownView, Plugin, type WorkspaceLeaf } from 'obsidian'
import { DEFAULT_SETTINGS, type TaskZeroSettings, DoSettingTab } from './settings'
import { Tasks } from './classes/tasks'
import { TASK_ZERO_VIEW_TYPE, TaskZeroView } from './views/task-view'
import { debug } from './functions'
import { DetectUser } from './classes/detect-user'
import { UpdateQueue } from './classes/update-queue'
import { DatabaseEvent, dbEvents } from './classes/database-events'

export default class TaskZeroPlugin extends Plugin {
  tasks!: Tasks
  settings!: TaskZeroSettings
  view!: TaskZeroView
  userActivity!: DetectUser
  updateQueue!: UpdateQueue

  async onload () {
    // Settings
    await this.loadSettings()
    this.addSettingTab(new DoSettingTab(this.app, this))
    this.applyRootClass()
    this.userActivity = new DetectUser()
    this.updateQueue = new UpdateQueue(this)

    this.tasks = new Tasks(this)

    this.registerView(
      TASK_ZERO_VIEW_TYPE,
      (leaf) => new TaskZeroView(leaf, this)
    )
    this.addRibbonIcon('square-check-big', 'Open Tasklist', () => {
      void this.activateView()
    })

    // Quick capture new task
    this.addCommand({
      id: 'quick-capture',
      name: 'Add new task (quick capture)',
      callback: () => this.tasks.openQuickCapture()
    })

    this.addCommand({
      id: 'open-tasklist',
      name: 'Open the Tasklist',
      callback: () => this.activateView()
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
          void this.tasks.archiveTasksFromPath(view.file.path)
        }
      }
    })

    // Queue note for update when metadata cache change detected
    this.registerEvent(this.app.metadataCache.on('changed', file => this.updateQueue.add(file.path)))

    window.tz = this // Should be allowed - I got it from https://obsidian.md/plugins?id=kv-store
  }

  onunload () {
    this.updateQueue.unload()
    this.userActivity.unload()
    dbEvents.destroy()
    delete window.tz
  }

  async loadSettings () {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings () {
    /*
      Only the master device can make changes to the data.json, to prevent issues
      with two devices modifying copies of the database and causing lost data.
      The master device can be revoked from inside the Settings page.

      See https://taskzero.alan.gr/master-device for more details.
     */
    if (this.isMaster() || !this.settings.masterAppId) {
      await this.saveData(this.settings)
    } else {
      debug('Not saving settings, as not the master device')
    }
  }

  applyRootClass () {
    if (this.settings.styleBlockId) {
      document.body.addClass('task-zero')
    } else {
      document.body.removeClass('task-zero')
    }
  }

  async activateView () {
    let leaf: WorkspaceLeaf | null
    const leaves = this.app.workspace.getLeavesOfType(TASK_ZERO_VIEW_TYPE)
    if (leaves.length > 0) {
      leaf = leaves[0]
    } else {
      // No view found, create a new leaf
      leaf = this.app.workspace.getLeaf(true)
      await leaf?.setViewState({
        type: TASK_ZERO_VIEW_TYPE,
        active: true
      })
    }
    if (leaf) {
      await this.app.workspace.revealLeaf(leaf)
      // Strangely enough, revealing the leaf doesn't fire Obsidian's
      // active-leaf-change event, so we have to send our own event 🤷
      dbEvents.emit(DatabaseEvent.OpenTasklistView)
    }
  }

  /**
   * Is the current device the master device?
   *
   * See https://taskzero.alan.gr/master-device for more details.
   */
  isMaster () { return this.app.appId === this.settings.masterAppId }
}

declare global {
  interface Window {
    tz?: TaskZeroPlugin
  }
}
