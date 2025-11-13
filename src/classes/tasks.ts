import { Task, type TaskRow, TaskStatus } from './task'
import DoPlugin from '../main'
import { type CachedMetadata, type ListItemCache, moment, TFile } from 'obsidian'
import { Table } from './table'

export interface CacheUpdate {
  file: TFile,
  data: string,
  cache: CachedMetadata
}

export const TaskChangeEvent = 'do:tasks-change'

export class Tasks {
  readonly tableName = 'tasks'
  plugin: DoPlugin
  db: Table<TaskRow>

  constructor (plugin: DoPlugin) {
    this.plugin = plugin
    this.db = new Table<TaskRow>(this.tableName, this.plugin.app)
  }

  async processTasksFromCacheUpdate (cacheUpdate: CacheUpdate) {
    const processed: { task: Task, cacheItem: ListItemCache }[] = []
    for (const item of (cacheUpdate.cache.listItems?.filter(x => x.task) || [])) {
      const task = new Task(this)
      task.initFromListItem(item, cacheUpdate, processed.map(x => x.task.id))
      if (task.valid()) processed.push({ task, cacheItem: item })
    }

    // Orphan tasks in the DB which are no longer present in the note
    const processedIds = processed.map(x => x.task.id)
    this.db.rows()
      .filter(row =>
        row.path === cacheUpdate.file.path &&
        !processedIds.includes(row.id))
      .forEach(task => {
        task.orphaned = moment.default().valueOf()
        this.db.saveDb()
      })

    // Update the file markdown contents if needed
    // Modify the original markdown task line if necessary
    await this.plugin.app.vault.process(cacheUpdate.file, data => {
      if (cacheUpdate.data === data) {
        // The live file contents is the same as the expected contents from the cache
        // (this is the ideal case)
        const lines = cacheUpdate.data.split('\n')
        for (const row of processed) {
          // TODO: handle indentation
          lines[row.cacheItem.position.start.line] = row.task.generateMarkdownTask()
        }
        data = lines.join('\n')
      } else {
        // Cache and file differ - this is bad.
        // We don't want to modify the file here and risk content loss.
        // Orphan these tasks in the DB and re-process them again next time.
        console.log('Cache and file differ')
        processed.forEach(row => {
          if (row.task.id) {
            row.task.orphaned = moment.default().valueOf()
            this.db.update(row.task.getData())
          }
        })
      }
      return data
    })
  }

  getTaskById (id: number) {
    const task = new Task(this)
    task.initFromId(id)
    return task
  }

  getActiveTasks () {
    return this.db.rows()
      .filter(row => !row.orphaned && row.status !== TaskStatus.Complete)
      .map(row => {
        const task = new Task(this)
        task.initFromDb(row)
        return task
      })
  }
}
