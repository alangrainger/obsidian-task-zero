import { Task, type TaskRow, TaskStatus } from './task.svelte'
import DoPlugin from '../main'
import { type CachedMetadata, debounce, type ListItemCache, TFile } from 'obsidian'
import { Table } from './table'
import { DatabaseEvent, dbEvents } from './database-events'
import { debug, moment } from '../functions'

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
  private noteUpdateQueue: Set<number> = new Set([])
  private readonly debounceQueueUpdate: () => void

  constructor (plugin: DoPlugin) {
    this.plugin = plugin
    this.db = new Table<TaskRow>(this.tableName, this.plugin.app)
    this.debounceQueueUpdate = debounce(() => {
      this.processQueue().then()
    }, 5000, true)
  }

  get blockPrefix () {
    return this.plugin.settings.taskBlockPrefix
  }

  taskLineRegex (id: number) {
    const prefix = this.blockPrefix
    return new RegExp(`^[ \\t]*- \\[.][^$\n]+\\^${prefix}${id}[ \\t]*$`, 'm')
  }

  async processTasksFromCacheUpdate (cacheUpdate: CacheUpdate) {
    if (!this.db.initialised) return

    debug('Processing cache update for ' + cacheUpdate.file.path)

    const processed: { task: Task, cacheItem: ListItemCache }[] = []
    const updated: Task[] = []
    for (const item of (cacheUpdate.cache.listItems?.filter(x => x.task) || [])) {
      const res = new Task(this).initFromListItem(item, cacheUpdate, processed.map(x => x.task.id))
      if (res.valid) {
        processed.push({ task: res.task, cacheItem: item })
        if (res.isUpdated) updated.push(res.task)
      }
    }

    // Orphan tasks in the DB which are no longer present in the note
    const processedIds = processed.map(x => x.task.id)
    this.db.rows()
      .filter(row =>
        row.path === cacheUpdate.file.path &&
        !processedIds.includes(row.id))
      .forEach(task => {
        task.orphaned = moment().valueOf()
        this.db.saveDb()
      })

    // Update the file markdown contents if needed, for example to add task IDs
    let updatedCount = 0
    await this.plugin.app.vault.process(cacheUpdate.file, data => {
      if (cacheUpdate.data === data) {
        // The live file contents is the same as the expected contents from the cache
        // (this is the ideal case)
        const lines = cacheUpdate.data.split('\n')
        for (const row of processed) {
          // TODO: handle indentation
          const newLine = row.task.generateMarkdownTask()
          if (lines[row.cacheItem.position.start.line] !== newLine) {
            lines[row.cacheItem.position.start.line] = newLine
            updatedCount++
          }
        }
        if (updatedCount) data = lines.join('\n')
      } else {
        // Cache and file differ - this is bad.
        // We don't want to modify the file here and risk content loss.
        // Orphan these tasks in the DB and re-process them again next time.
        debug('Cache and file differ')
        processed.forEach(row => {
          if (row.task.id) {
            row.task.orphaned = moment().valueOf()
            this.db.update(row.task.getData())
          }
        })
      }
      return data
    })

    debug('updated # ' + updated.length)
    if (updated.length) {
      dbEvents.emit(DatabaseEvent.TasksExternalChange)
    }
  }

  getTaskById (id: number) {
    const task = new Task(this)
    task.initFromId(id)
    return task
  }

  getActiveTasks () {
    return this.db.rows()
      .filter(row => !row.orphaned && row.status !== TaskStatus.DONE)
      .map(row => {
        const task = new Task(this)
        task.initFromRow(row)
        return task
      })
      // Sort by created date - oldest task first
      .sort((a, b) => a.created.localeCompare(b.created))
  }

  /**
   * Queue tasks for update in the original note, using the data from the DB
   */
  addTaskToUpdateQueue (id: number) {
    console.log('Adding to queue: ' + id)
    this.noteUpdateQueue.add(id)
    this.debounceQueueUpdate()
  }

  async processQueue () {
    // Split queue into files
    const grouped: any = []
    this.noteUpdateQueue.forEach(id => {
      const task = new Task(this).initFromId(id)
      if (task.valid()) {
        if (!grouped[task.path]) grouped[task.path] = []
        grouped[task.path].push(task)
      }
    })
    this.noteUpdateQueue = new Set([])

    for (const path of Object.keys(grouped)) {
      await this.updateTasksInNote(path, grouped[path])
    }
  }

  async updateTasksInNote (path: string, tasks: Task[]) {
    const tfile = this.plugin.app.vault.getAbstractFileByPath(path)
    if (tfile instanceof TFile) {
      await this.plugin.app.vault.process(tfile, data => {
        console.log('Bulk update tasks in ' + path)
        for (const task of tasks) {
          data = data.replace(this.taskLineRegex(task.id), task.generateMarkdownTask())
        }
        return data
      })
    }
  }
}
