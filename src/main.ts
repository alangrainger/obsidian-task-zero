import { MarkdownView, Plugin, type WorkspaceLeaf } from 'obsidian'
import { DEFAULT_SETTINGS, type TaskZeroSettings, DoSettingTab } from './settings'
import { Tasks } from './classes/tasks'
import { TASK_ZERO_VIEW_TYPE, TaskZeroView } from './views/task-view'
import { debug } from './functions'
import { DetectUser } from './classes/detect-user'
import { UpdateQueue } from './classes/update-queue'
import { DatabaseEvent, dbEvents } from './classes/database-events'
import { Task } from './classes/task.svelte'
import { MoveToProjectModal } from './views/move-to-project-modal'

export default class TaskZeroPlugin extends Plugin {
  tasks!: Tasks
  settings!: TaskZeroSettings
  userActivity!: DetectUser
  #updateQueue!: UpdateQueue

  async onload () {
    // Settings
    await this.loadSettings()
    this.ensureDeviceId()
    this.addSettingTab(new DoSettingTab(this.app, this))
    this.applyRootClass()
    this.userActivity = new DetectUser()
    this.#updateQueue = new UpdateQueue(this)

    this.tasks = new Tasks(this)
    await this.tasks.load()

    this.registerView(
      TASK_ZERO_VIEW_TYPE,
      (leaf) => new TaskZeroView(leaf, this)
    )
    this.addRibbonIcon('square-check-big', 'Open Tasklist', () => {
      void this.#activateView()
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
      callback: () => this.#activateView()
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

    // Archive completed tasks from the active note
    this.addCommand({
      id: 'move-task-to-project',
      name: 'Move task to project',
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView)
        if (checking && !view) return false

        const editor = view?.editor
        const line = editor?.getLine(editor.getCursor().line) || ''
        const valid = !!(view?.file && line.match(new RegExp(`\\^${this.tasks.blockPrefix}([A-Za-z0-9]+)$`)))
        if (checking) {
          return valid
        } else if (valid) {
          const task = new Task(this.tasks).initFromMarkdownTask(line).task
          if (task.isValid) new MoveToProjectModal(this, task).open()
        }
      }
    })

    // Queue note for update when metadata cache change detected
    this.registerEvent(this.app.metadataCache.on('changed', file => this.#updateQueue.add(file.path)))

    window.tz = this // Should be allowed - I got it from https://obsidian.md/plugins?id=kv-store
  }

  onunload () {
    this.#updateQueue.unload()
    this.userActivity.unload()
    dbEvents.destroy()
    delete window.tz
  }

  async loadSettings () {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings () {
    await this.saveData(this.settings)
  }

  applyRootClass () {
    if (this.settings.styleBlockId) {
      document.body.addClass('task-zero')
    } else {
      document.body.removeClass('task-zero')
    }
  }

  async #activateView () {
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
   * Short identifier for this device, used for block ID prefixes and per-device
   * sync file names. 2 lowercase letters, randomly generated on first run and
   * persisted in settings. Decoupled from `app.appId` (which is only used as
   * the collision-detection signal inside the per-device sync file).
   */
  get deviceId () { return this.settings.deviceId }

  ensureDeviceId () {
    if (this.settings.deviceId) return
    this.settings.deviceId = generateDeviceId()
    void this.saveSettings()
  }

  /**
   * Called when we detect this device collided with another (our db file
   * already exists with a different appId inside). Pick a new deviceId and
   * persist it. The old db file effectively belongs to the other device now.
   */
  regenerateDeviceId () {
    this.settings.deviceId = generateDeviceId()
    void this.saveSettings()
  }
}

function generateDeviceId (): string {
  const a = 'a'.charCodeAt(0)
  const pick = () => String.fromCharCode(a + Math.floor(Math.random() * 26))
  return pick() + pick()
}

declare global {
  interface Window {
    tz?: TaskZeroPlugin
  }
}
