import type TaskZeroPlugin from '../main'
import { App, MarkdownView, TFile } from 'obsidian'
import { debug } from '../functions'

export class UpdateQueue {
  private readonly app: App
  private readonly plugin: TaskZeroPlugin
  private readonly queue: string[]
  private cacheChangeInterval: NodeJS.Timeout
  private running = false

  constructor (plugin: TaskZeroPlugin) {
    this.app = plugin.app
    this.plugin = plugin
    this.queue = plugin.settings.database.changeQueue

    // Process the cache change queue
    this.cacheChangeInterval = this.initQueue()
  }

  private initQueue () {
    clearInterval(this.cacheChangeInterval)
    this.cacheChangeInterval = setInterval(async () => {
      // Store the time the queue was last executed, so that we can identify if it fails
      this.plugin.settings.database.lastQueueCheck = Date.now()
      await this.processQueue()
      this.plugin.tasks.cleanOrphans()
    }, 2000)
    return this.cacheChangeInterval
  }

  private checkQueue () {
    // If the queue hasn't run in the last 2 minutes, restart it
    if (this.plugin.settings.database.lastQueueCheck < Date.now() - 1000 * 60 * 2)
      this.initQueue()
  }

  add (path: string) {
    if (!this.queue.includes(path)) {
      debug(`Added ${path} to update queue`)
      this.queue.push(path)
      void this.plugin.saveSettings()
    }
    this.checkQueue()
  }

  delete (path: string) {
    const index = this.queue.indexOf(path)
    if (index !== -1) {
      this.queue.splice(index, 1)
      void this.plugin.saveSettings()
    }
  }

  /**
   * Changes only happen on the master device, and only if the user is actively using
   * that same device. This is important to prevent race conditions where the user is
   * making a change on a different device, and that changed data is being synced back
   * to the master device, processed, then synced back to the active device, potentially
   * messing up the note the user is actively typing on.
   */
  private async processQueue () {
    if (this.running) return

    if (this.plugin.isMaster() && this.plugin.userActivity.isActive()) {
      this.running = true
      for (const cacheItemPath of this.queue) {
        try {
          // Only process the update if the view is no longer active, to prevent
          // issues with the user and the plugin both changing the data
          const activeView = this.app.workspace.getActiveViewOfType(MarkdownView)
          if (!activeView || activeView.file?.path !== cacheItemPath) {
            this.delete(cacheItemPath)
            debug(`🔄 Processing ${cacheItemPath}`)
            const cache = this.app.metadataCache.getCache(cacheItemPath)
            const file = this.app.vault.getAbstractFileByPath(cacheItemPath)
            if (cache && file instanceof TFile) {
              const data = await this.app.vault.cachedRead(file)
              await this.plugin.tasks.processTasksFromCacheUpdate({ file, data, cache })
            }
          }
        } catch (e) {
          debug(e)
        }
      }
    }
    this.running = false
  }

  unload () {
    clearInterval(this.cacheChangeInterval)
  }
}
