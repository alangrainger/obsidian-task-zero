import type DoPlugin from '../main'
import { App, MarkdownView, TFile } from 'obsidian'

export class UpdateQueue {
  app: App
  plugin: DoPlugin
  private readonly queue: string[]
  private readonly cacheChangeInterval: NodeJS.Timeout
  private running = false

  constructor (plugin: DoPlugin) {
    this.app = plugin.app
    this.plugin = plugin
    this.queue = plugin.settings.database.changeQueue

    // Process the cache change queue
    this.cacheChangeInterval = setInterval(() => {
      this.processQueue().then()
    }, 2000)
  }

  add (path: string) {
    if (!this.queue.includes(path)) {
      this.queue.push(path)
      this.plugin.saveSettings().then()
    }
  }

  delete (path: string) {
    const index = this.queue.indexOf(path)
    if (index !== -1) {
      this.queue.splice(index, 1)
      this.plugin.saveSettings().then()
    }
  }

  /**
   * Changes only happen on the master device, and only if the user is actively using
   * that same device. This is important to prevent race conditions where the user is
   * making a change on a different device, and that changed data is being synced back
   * to the master device, processed, then synced back to the active device, potentially
   * messing up the note the user is actively typing on.
   */
  async processQueue () {
    if (this.running) return

    if (this.plugin.isMaster() && this.plugin.userActivity.isActive()) {
      this.running = true
      for (const cacheItemPath of this.queue) {
        // Only process the update if the view is no longer active, to prevent
        // issues with the user and the plugin both changing the data
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView)
        if (!activeView || activeView.file?.path !== cacheItemPath) {
          const cache = this.app.metadataCache.getCache(cacheItemPath)
          const file = this.app.vault.getAbstractFileByPath(cacheItemPath)
          if (cache && file instanceof TFile) {
            this.delete(cacheItemPath)
            const data = await this.app.vault.cachedRead(file)
            await this.plugin.tasks.processTasksFromCacheUpdate({ file, data, cache })
          }
        }
      }
    }
    this.running = false
  }

  unload () {
    clearInterval(this.cacheChangeInterval)
  }
}
