import type TaskZeroPlugin from '../main'
import { App, MarkdownView, TFile } from 'obsidian'
import { debug } from '../functions'

export class UpdateQueue {
  readonly #app: App
  readonly #plugin: TaskZeroPlugin
  readonly #queue: string[]
  #cacheChangeInterval: number
  #running = false

  constructor (plugin: TaskZeroPlugin) {
    this.#app = plugin.app
    this.#plugin = plugin
    this.#queue = plugin.settings.database.changeQueue

    // Process the cache change queue
    this.#cacheChangeInterval = this.#initQueue()
  }

  #initQueue () {
    window.clearInterval(this.#cacheChangeInterval)
    this.#cacheChangeInterval = window.setInterval(() => {
      // Store the time the queue was last executed, so that we can identify if it fails
      this.#plugin.settings.database.lastQueueCheck = Date.now()
      void (async () => {
        await this.#processQueue()
        this.#plugin.tasks.cleanOrphans()
      })()
    }, 2000)
    return this.#cacheChangeInterval
  }

  #checkQueue () {
    // If the queue hasn't run in the last 2 minutes, restart it
    if (this.#plugin.settings.database.lastQueueCheck < Date.now() - 1000 * 60 * 2) { this.#initQueue() }
  }

  add (path: string) {
    if (!this.#queue.includes(path)) {
      debug(`Added ${path} to update queue`)
      this.#queue.push(path)
      void this.#plugin.saveSettings()
    }
    this.#checkQueue()
  }

  delete (path: string) {
    const index = this.#queue.indexOf(path)
    if (index !== -1) {
      this.#queue.splice(index, 1)
      void this.#plugin.saveSettings()
    }
  }

  /**
   * Process queued markdown changes. Only runs when the user is actively using
   * this device, to prevent race conditions where the user is editing on a
   * different device and the synced edits are being processed here at the
   * same time.
   */
  async #processQueue () {
    if (this.#running) return

    if (this.#plugin.userActivity.isActive()) {
      this.#running = true
      for (const cacheItemPath of this.#queue) {
        try {
          // Only process the update if the view is no longer active, to prevent
          // issues with the user and the plugin both changing the data
          const activeView = this.#app.workspace.getActiveViewOfType(MarkdownView)
          if (!activeView || activeView.file?.path !== cacheItemPath) {
            this.delete(cacheItemPath)
            debug(`🔄 Processing ${cacheItemPath}`)
            const cache = this.#app.metadataCache.getCache(cacheItemPath)
            const file = this.#app.vault.getAbstractFileByPath(cacheItemPath)
            if (cache && file instanceof TFile) {
              const data = await this.#app.vault.cachedRead(file)
              await this.#plugin.tasks.processTasksFromCacheUpdate({ file, data, cache })
            }
          }
        } catch (e) {
          debug(e)
        }
      }
    }
    this.#running = false
  }

  unload () {
    window.clearInterval(this.#cacheChangeInterval)
  }
}
