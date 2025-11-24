import { MarkdownView, Plugin, TFile, type WorkspaceLeaf } from 'obsidian'
import { DEFAULT_SETTINGS, type NextActionSettings, DoSettingTab } from './settings'
import { Tasks } from './classes/tasks'
import { NEXT_ACTION_VIEW_TYPE, NextActionView } from './views/task-view'
import { debug, getOrCreateFile } from './functions'
import { DetectUser } from './classes/detect-user'
import { UpdateQueue } from './classes/update-queue'

export default class DoPlugin extends Plugin {
  tasks!: Tasks
  settings!: NextActionSettings
  view!: NextActionView
  userActivity!: DetectUser
  updateQueue!: UpdateQueue

  async onload () {
    // Settings
    await this.loadSettings()
    this.addSettingTab(new DoSettingTab(this.app, this))
    this.userActivity = new DetectUser()
    this.updateQueue = new UpdateQueue(this)

    this.tasks = new Tasks(this)

    this.registerView(
      NEXT_ACTION_VIEW_TYPE,
      leaf => {
        this.view = new NextActionView(leaf, this)
        return this.view
      }
    )
    this.addRibbonIcon('square-check-big', 'Open Tasklist', () => {
      this.activateView()
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
    this.registerEvent(this.app.metadataCache.on('changed', file => this.updateQueue.add(file.path)))
  }

  onunload () {
    this.view?.close().then()
    this.updateQueue.unload()
    this.userActivity.unload()
  }

  async loadSettings () {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings () {
    /*
      Only the master device can make changes to the data.json, to prevent issues
      with two devices modifying copies of the database and causing lost data.
      The master device can be revoked from inside the Settings page.

      Since not everyone will be using Obsidian Sync, I can't check the
      status of sync.instance either. If two devices are modifying files,
      they can get into a race condition where each is updating tasks
      then syncing the changes, causing the other device to react to the
      metadataCache change and so on.
     */
    if (this.isMaster() || !this.settings.masterAppId) {
      await this.saveData(this.settings)
    } else {
      debug('Not saving settings, as not the master device')
    }
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

  /**
   * Is the current device the master device
   * See the explanation in this.saveSettings() for more details
   */
  isMaster () { return this.app.appId === this.settings.masterAppId }
}
