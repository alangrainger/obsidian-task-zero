import { Task, type TaskRow, TaskStatus, TaskType } from './task.svelte'
import DoPlugin from '../main'
import { type App, type CachedMetadata, debounce, type ListItemCache, TFile } from 'obsidian'
import { Table } from './table'
import { DatabaseEvent, dbEvents } from './database-events'
import { debug, getOrCreateFile, getTFileFromPath } from '../functions'
import { TaskInputModal } from '../views/task-input-modal'
import moment from 'moment'

export interface CacheUpdate {
  file: TFile
  data: string
  cache: CachedMetadata
}

export type CacheUpdateItem = {
  task: Task
  cacheItem: ListItemCache
}

export const TaskChangeEvent = 'do:tasks-change'

export class Tasks {
  readonly tableName = 'tasks'
  app: App
  plugin: DoPlugin
  db: Table<TaskRow>
  private noteUpdateQueue: Set<number> = new Set([])
  private readonly debounceQueueUpdate: () => void

  constructor (plugin: DoPlugin) {
    this.plugin = plugin
    this.app = plugin.app
    this.db = new Table<TaskRow>(this.tableName, this.app)

    // Load tasks data from disk
    this.db.loadDb().then()

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

    const processed: CacheUpdateItem[] = []
    const updated: CacheUpdateItem[] = []
    for (const item of (cacheUpdate.cache.listItems?.filter(x => x.task) || [])) {
      const res = new Task(this).initFromListItem(item, cacheUpdate, processed)
      if (res.valid) {
        processed.push({ task: res.task, cacheItem: item })
        if (res.hasChanges) updated.push({ task: res.task, cacheItem: item })
      }
    }

    // Orphan tasks in the DB which are no longer present in the note
    const processedIds = processed.map(x => x.task.id)
    this.db.rows()
      .filter(row =>
        !row.orphaned &&
        row.path === cacheUpdate.file.path &&
        !processedIds.includes(row.id))
      .forEach(task => {
        debug('Orphaning task ' + task.id)
        task.orphaned = moment().valueOf()
        this.db.saveDb()
      })

    // Update the file markdown contents if needed, for example to add task IDs
    if (updated.length) {
      let updatedCount = 0
      await this.plugin.app.vault.process(cacheUpdate.file, data => {
        if (cacheUpdate.data === data) {
          // The live file contents is the same as the expected contents from the cache
          // (this is the ideal case)
          const lines = cacheUpdate.data.split('\n')
          for (const row of updated) {
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
          updated.forEach(row => {
            if (row.task.id) {
              debug('Orphaning task ' + row.task.id)
              row.task.orphaned = moment().valueOf()
              this.db.update(row.task.getData())
            }
          })
        }
        return data
      })
    }

    debug(`Updated ${updated.length} tasks in ${cacheUpdate.file.path}, with ${processed.length - updated.length} tasks unchanged`)
    if (updated.length) {
      dbEvents.emit(DatabaseEvent.TasksExternalChange)
    }
  }

  getTaskById (id: number) {
    const task = new Task(this)
    task.initFromId(id)
    return task
  }

  getTasks (type?: TaskType) {
    return this.db.rows()
      .filter(row => {
        // Match INBOX type to tasks which have no type set
        const typeMatch = !type || row.type === type || (type === TaskType.INBOX && !row.type)
        return typeMatch && !row.orphaned && row.status !== TaskStatus.DONE && row.path
      })
      .map(row => new Task(this).initFromRow(row).task)
      // Sort by created date - oldest task first
      .sort((a, b) => a.created.localeCompare(b.created))
  }

  /**
   * This is the main task list that a user works from, in opinionated GTD order
   */
  getTasklist () {
    const allTasks = this.getTasks()
    const tasks = allTasks.filter(task => task.isDue)
      // Inbox tasks
      .concat(allTasks.filter(task => task.type === TaskType.INBOX))
      // Projects that have no next action (i.e. no sub-tasks)
      .concat(allTasks.filter(task => task.type === TaskType.PROJECT)
        .filter(project => !this.db.rows().filter(subtask => subtask.parent === project.id && subtask.status !== TaskStatus.DONE && !subtask.orphaned).length
        ))
      // Next Actions
      .concat(allTasks.filter(task => task.type === TaskType.NEXT_ACTION))
      // Waiting-On
      .concat(allTasks.filter(task => task.type === TaskType.WAITING_ON))

    // Deduplicate, keeping the first instance of any task
    return Array.from(
      new Map(tasks.map(task => [task.id, task])).values()
    )
  }

  /**
   * Queue tasks for update in the original note, using the data from the DB
   */
  addTaskToUpdateQueue (id: number) {
    debug('Adding to queue: ' + id)
    this.noteUpdateQueue.add(id)
    this.debounceQueueUpdate()
  }

  async processQueue () {
    // Split queue into files
    const grouped: any = []
    this.noteUpdateQueue.forEach(id => {
      const task = new Task(this).initFromId(id).task
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

  /**
   * Update existing task(s) data in a note. This will only match
   * existing tasks based on their ID. If no exact match(es) found,
   * nothing will be changed.
   */
  async updateTasksInNote (path: string, tasks: Task[]) {
    const tfile = getTFileFromPath(this.app, path)
    if (tfile) {
      await this.app.vault.process(tfile, data => {
        debug(`Updated ${tasks.length} tasks in ${path}`)
        for (const task of tasks) {
          data = data.replace(this.taskLineRegex(task.id), task.generateMarkdownTask())
        }
        return data
      })
    }
  }

  async addTaskToDefaultNote (task: Task) {
    if (!task.valid()) return
    const file = await getOrCreateFile(this.app, this.plugin.settings.defaultNote)
    await this.app.vault.append(file, task.generateMarkdownTask() + '\n')
  }

  openQuickCapture () {
    new TaskInputModal(this.plugin, null, taskText => {
      if (taskText.trim().length) {
        const task = new Task(this).initFromText(taskText).task
        this.addTaskToDefaultNote(task).then()
      }
    }).open()
  }

  archiveCompletedTasks () {

  }

  cleanOrphans () {
    const now = moment()
    for (const row of this.db.rows()) {
      if (!row.path) {
        // Task has no path, so orphan it now
        if (!row.orphaned) row.orphaned = now.valueOf()
      }
      if (now.diff(moment(row.orphaned), 'days') > 30) {
        // Task has been orphaned for more than 1 month, delete it
      }
    }
  }
}
