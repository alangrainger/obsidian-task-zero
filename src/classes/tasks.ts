import { Task, TaskRow } from './task'
import DoPlugin from '../main'
import { CachedMetadata, TFile } from 'obsidian'
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

  processTasksFromCacheUpdate (cacheUpdate: CacheUpdate) {
    // console.log('file', cacheUpdate.file)
    // console.log('data', cacheUpdate.data)
    // console.log('cache', cacheUpdate.cache)

    (cacheUpdate.cache.listItems?.filter(x => x.task) || [])
      .forEach(item => {
        const task = new Task(this)
        task.initFromListItem(item, cacheUpdate)
      })
    console.log('test')
    this.db.saveDb()
  }
}
