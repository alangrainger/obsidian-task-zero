import { Task, type TaskRow, TaskStatus, TaskType } from './task.svelte'
import TaskZeroPlugin from '../main'
import { type App, type CachedMetadata, debounce, type ListItemCache, TFile } from 'obsidian'
import { Table, Tablename } from './table'
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
  hasChanges: boolean
}

export const TaskChangeEvent = 'tz:tasks-change'

export class Tasks {
  readonly tableName = 'tasks'
  app: App
  plugin: TaskZeroPlugin
  db: Table<TaskRow>
  private noteUpdateQueue: Set<number> = new Set([])
  private readonly debounceQueueUpdate: () => void

  constructor (plugin: TaskZeroPlugin) {
    this.plugin = plugin
    this.app = plugin.app
    this.db = new Table<TaskRow>(this.plugin, Tablename.TASKS)

    this.debounceQueueUpdate = debounce(() => {
      debug('Processing debounced queue')
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
    debug('⚙️ Processing cache update for ' + cacheUpdate.file.path)

    if (noteIsExcluded(cacheUpdate, this.plugin)) {
      // This note is excluded from processing, orphan any existing tasks
      this.orphanOtherTasks(cacheUpdate.file.path, [])
      return
    }

    const processed: CacheUpdateItem[] = []
    for (const item of (cacheUpdate.cache.listItems?.filter(x => x.task) || [])) {
      const res = new Task(this).initFromListItem(item, cacheUpdate, processed)
      if (res.valid) {
        processed.push({ task: res.task, cacheItem: item, hasChanges: res.hasChanges })
      }
    }
    const updated = processed.filter(x => x.hasChanges)

    // Orphan tasks in the DB which are no longer present in the note
    const processedIds = processed.map(x => x.task.id)
    this.orphanOtherTasks(cacheUpdate.file.path, processedIds)

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

  /**
   * Get all active tasks, i.e.:
   * - not orphaned
   * - not completed
   * - exist in a note
   */
  getTasks (type?: TaskType) {
    return this.db.rows()
      .filter(row => {
        // Match INBOX type to tasks which have no type set
        const typeMatch = !type || row.type === type || (type === TaskType.INBOX && !row.type)
        return typeMatch &&
          !row.orphaned &&                  // Not orphaned
          row.status !== TaskStatus.DONE && // Not completed
          row.path                          // Is associated with a note
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
      .filter(task =>
        // Is not scheduled for the future
        (!task.scheduled || moment(task.scheduled).isSameOrBefore(moment(), 'day')))

    const tasks = allTasks.filter(task => task.isDue)
      // Get due tasks, and order by earliest date first
      .sort((a, b) => {
        const dateA = [a.due, a.scheduled].filter(Boolean).sort()[0]
        const dateB = [b.due, b.scheduled].filter(Boolean).sort()[0]
        return dateA.localeCompare(dateB)
      })
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

  orphanOtherTasks (path: string, keepIds: number[]) {
    this.db.rows()
      .filter(row =>
        !row.orphaned &&
        row.path === path &&
        !keepIds.includes(row.id))
      .forEach(task => {
        debug('Orphaning task ' + task.id)
        task.orphaned = moment().valueOf()
        this.db.saveDb()
      })
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

/**
 * Check that if the note contains the #exclude-all-tasks tag.
 * This checks for the tag both with and without the # symbol
 */
export function noteIsExcluded (cacheUpdate: CacheUpdate, plugin: TaskZeroPlugin) {
  const tag = plugin.settings.excludeTags.note.replace(/#/g, '')
  const tags = [tag, `#${tag}`]
  // The standard frontmatter tags array
  const standard = (cacheUpdate.cache.frontmatter?.tags || []).map((x: any) => x.tag).filter((tag: string) => tags.includes(tag))
  // If the tag exists in the body of the note
  const body = (cacheUpdate.cache.tags || []).map(x => x.tag).filter((tag: string) => tags.includes(tag))
  // In case the user has put tags into the frontmatter with # symbol, causing them to become a list
  const list = (cacheUpdate.cache.frontmatter?.tags || []).filter((tag: string) => tags.includes(tag))

  const excluded = standard?.length || body?.length || list?.length
  if (excluded) debug(`Note ${cacheUpdate.file.path} is excluded from processing because it has the tag #${tag}`)
  return !!excluded
}
