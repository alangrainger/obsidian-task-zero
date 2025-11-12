import { Task, TaskRow } from './task'
import DoPlugin from '../main'
import { CachedMetadata, ListItemCache, TFile } from 'obsidian'
import { Table } from './table'

export interface CacheUpdate {
  file: TFile,
  data: string,
  cache: CachedMetadata
}

export class Tasks {
  readonly tableName = 'tasks'
  plugin: DoPlugin
  db: Table<TaskRow>

  constructor (plugin: DoPlugin) {
    this.plugin = plugin
    this.db = new Table<TaskRow>(this.tableName, this.plugin.app)
  }

  async processTasksFromCacheUpdate (cacheUpdate: CacheUpdate) {
    const tasks: {task: Task, cacheItem: ListItemCache}[] = []
    for (const item of (cacheUpdate.cache.listItems?.filter(x => x.task) || [])) {
      const task = new Task(this)
      task.initFromListItem(item, cacheUpdate)
      tasks.push({task, cacheItem: item})
    }

    // Update the file markdown contents if needed
    // Modify the original markdown task line if necessary
    await this.plugin.app.vault.process(cacheUpdate.file, data => {
      if (cacheUpdate.data === data) {
        // The live file contents is the same as the expected contents from the cache
        // (this is the ideal case)
        const lines = cacheUpdate.data.split('\n')
        for (const row of tasks) {
          // TODO: handle indentation
          lines[row.cacheItem.position.start.line] = row.task.generateMarkdownTask()
        }
        data = lines.join('\n')
      } else {
        // Cache and file differ - this is bad.
        // We don't want to modify the file here and risk content loss.
        // Better to drop these tasks from the DB and re-process them again next time.
        console.log('Cache and file differ')
        tasks.forEach(row => this.db.delete(row.task.data.id))
      }
      return data
    })
  }
}
