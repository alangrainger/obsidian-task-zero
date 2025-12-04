import { type App, Component, type ListItemCache, MarkdownRenderer } from 'obsidian'
import { type CacheUpdate, type CacheUpdateItem, noteIsExcluded, Tasks } from './tasks'
import { assignExisting, debug, moment } from '../functions'
import { MarkdownTaskParser } from './markdown-task-parser'
import { DisplayOption } from '../settings'
import type TaskZeroPlugin from '../main'
import { DatabaseEvent, dbEvents } from './database-events'

export enum TaskStatus {
  TODO = ' ',
  DONE = 'x'
}

export enum TaskType {
  INBOX = 'inbox',
  NEXT_ACTION = 'next-action',
  PROJECT = 'project',
  WAITING_ON = 'waiting-on',
  SOMEDAY = 'someday',
  DEPENDENT = 'dependent' // A task in a project sequence, which is waiting on the previous task to be completed
}

export enum TaskEmoji {
  NONE = '',
  INBOX = '📥',
  NEXT_ACTION = '➡️',
  PROJECT = '🗃️',
  WAITING_ON = '⏸️',
  SOMEDAY = '💤',
  DEPENDENT = '⛓️',
  CREATED = '➕',
  SCHEDULED = '⏳',
  DUE = '📅',
  COMPLETED = '✅'
}

type TaskInitResult = {
  task: Task
  hasChanges: boolean
  valid: boolean
}

export interface TaskRow {
  id: number
  status: TaskStatus
  text: string
  path: string
  type: TaskType
  created: string
  orphaned: number // If the task is not present in any note
  line: number     // The line number of the task in the original note (used for sequencing project sub-tasks)
  parent: number   // The parent task ID, if this is a sub-task
  due: string
  scheduled: string
  completed: string
}

export class Task implements TaskRow {
  tasks: Tasks
  app: App
  plugin: TaskZeroPlugin

  id = 0
  status = $state(TaskStatus.TODO)
  text = $state('')
  path = ''
  orphaned = 0
  created = ''
  type = $state(TaskType.INBOX)
  line = 0
  parent = 0
  due = ''
  scheduled = ''
  completed = ''

  renderedMarkdown = $state('')
  markdownComponent = new Component()
  markdownTaskParser: MarkdownTaskParser

  get DEFAULT_DATA (): TaskRow {
    return {
      id: 0,
      status: TaskStatus.TODO,
      text: '',
      path: '',
      orphaned: 0,
      created: moment().format(),
      type: TaskType.INBOX,
      line: 0,
      parent: 0,
      due: '',
      scheduled: '',
      completed: ''
    }
  }

  get blockPrefix () {
    return this.tasks.blockPrefix
  }

  constructor (tasks: Tasks) {
    this.tasks = tasks
    this.app = tasks.app
    this.plugin = tasks.plugin
    this.markdownTaskParser = new MarkdownTaskParser(this.plugin)
  }

  reset () {
    this.setData(this.DEFAULT_DATA)
  }

  valid () {
    return !!this.id || !this.text.trim()
  }

  getData (): TaskRow {
    return {
      id: this.id,
      status: this.status,
      text: this.text,
      path: this.path,
      orphaned: this.orphaned,
      created: this.created,
      type: this.type,
      line: this.line,
      parent: this.parent,
      due: this.due,
      scheduled: this.scheduled,
      completed: this.completed
    }
  }

  setData (data: TaskRow) {
    Object.keys(data).forEach(key => this[key] = data[key])
  }

  get isCompleted () {
    return this.status === TaskStatus.DONE
  }

  /**
   * "Due" is considered a task which has a "scheduled" or "due" date which is on or before today
   */
  get isDue () {
    const today = moment()

    if (this.due) {
      const due = moment(this.due)
      if (due.isSameOrBefore(today, 'day')) return due
    }

    if (this.scheduled) {
      const scheduled = moment(this.scheduled)
      if (scheduled.isSameOrBefore(today, 'day')) return scheduled
    }
  }

  initFromId (id: number) {
    const row = this.tasks.db.getRow(id)
    if (row) {
      this.initFromRow(row)
    } else {
      this.reset()
    }
    return this.resultFromInit()
  }

  initFromRow (row: TaskRow) {
    // Populate any missing data from DEFAULT_DATA
    const data = assignExisting(this.DEFAULT_DATA, row)
    this.setData(data)
    return this.resultFromInit()
  }

  initFromListItem (item: ListItemCache, cacheUpdate: CacheUpdate, previous: CacheUpdateItem[]) {
    // Get the original task line
    const lines = cacheUpdate.data.split('\n')
    const originalLine = lines[item.position.start.line] || ''
    const parsedRes = this.markdownTaskParser.processTaskLine(originalLine)
    if (!parsedRes || parsedRes.excluded) {
      // Not able to find a task in this line
      return this.resultFromInit(false)
    }
    const parsed = parsedRes.parsed

    // Check whether the note or section is excluded
    if (noteIsExcluded(cacheUpdate, this.plugin)) {
      return this.resultFromInit(false)
    } else {
      const nearestHeading = cacheUpdate.cache.headings
        ?.filter(heading => heading.position.start.line < item.position.start.line)
        .pop()?.position.start.line
      const section = lines.slice(nearestHeading || 0, item.position.start.line).join('\n')
      const tag = this.tasks.plugin.settings.excludeTags.section
      if (section.match(new RegExp(`(^|\\s)${tag}($|\\s)`, 'm'))) {
        // This section is excluded from processing
        debug(`Task ${parsed.text} is excluded from processing because of section tag ${tag}`)
        return this.resultFromInit(false)
      }
    }

    // Check if this ID has already been used on this page (duplicate ID)
    const previousIds = previous.map(i => i.task.id)
    if (parsed.id && previousIds.includes(parsed.id)) parsed.id = 0

    // Default task
    let record = this.DEFAULT_DATA

    // Check DB for existing task
    const existing = this.tasks.db.getRow(parsed.id || 0)

    // Overwrite the base record with database-data (if any), then parsed data
    record = assignExisting(record, existing, parsed)

    // Does the task contain some text?
    if (!record.text.trim()) return this.resultFromInit(false)

    if (parsed.status === TaskStatus.DONE && (!existing || existing.status === TaskStatus.DONE)) {
      // If the task is completed AND the database task is also completed,
      //   OR it doesn't exist in the database at all,
      // return without making any changes. This is so that completed tasks
      // remain truthful to their state as when they were originally ticked off.
      // This allows completed tasks to be archived to a "Completed task" note
      // without causing path etc to update.
      this.setData(record)
      return this.resultFromInit(false)
    } else if (parsed.status === TaskStatus.DONE && existing?.status !== TaskStatus.DONE) {
      // If the task is completed and the database task is not completed,
      // set the completed date.
      record.completed = moment().format()
    }

    // Update with the latest live metadata
    record.line = item.position.start.line // If the task has been re-ordered within the note
    record.orphaned = 0 // Since it definitely exists in this note
    record.path = cacheUpdate.file.path // In case the task has been moved from another note

    // Is this a sub-task?
    // 'item.parent' is Obsidian returning the line number of the sub-task's parent
    if (item.parent > 0) {
      const parentTask = previous.find(x => x.task.line === item.parent)?.task
      if (parentTask) {
        record.parent = parentTask.id
        // Ensure the parent is set to Project type
        if (parentTask.type !== TaskType.PROJECT) {
          parentTask.type = TaskType.PROJECT
          const parentItem = previous.find(x => x.task.id === parentTask.id)
          if (parentItem) parentItem.hasChanges = true
        }
        // Check all the previously processed subtasks in the same tree
        // The first available subtask should be active and the rest should be Dependent
        let ancestors = parentTask.ancestors
        ancestors = ancestors.length ? ancestors : [parentTask]
        const rootParent = ancestors[0]
        if (previous.find(prev =>
          prev.task.ancestors[0]?.id === rootParent.id  &&
          !prev.task.isCompleted && prev.task.type !== TaskType.PROJECT)) {
          // There is at least one previous next action, therefore this task is dependent
          record.type = TaskType.DEPENDENT
        } else if (!record.type || [TaskType.INBOX, TaskType.DEPENDENT].includes(record.type)) {
          // If it's the first task in the sequence, make sure it's not "Dependent".
          // Don't change if it's SOMEDAY or WAITING_ON etc.
          record.type = TaskType.NEXT_ACTION
        }
      }
    } else {
      // The note is the source-of-truth, so if the task has been re-ordered and there's
      // no longer a parent, we need to update the DB to match
      record.parent = 0
      // If it was previously a dependent task in a project, send it back to the inbox to be classified
      if (record.type === TaskType.DEPENDENT) record.type = TaskType.INBOX
    }

    // Are there any changes from the DB record, and/or is a new record?
    const hasChanges = !existing || Object.keys(record).some(key => record[key] !== existing[key])

    const result = this.tasks.db.insertOrUpdate(record)
    if (!result) {
      // Unable to insert data. Reset to default data, which will show task.valid() === false
      this.reset()
      return this.resultFromInit(false)
    } else {
      this.setData(result)
    }
    return this.resultFromInit(hasChanges)
  }

  /**
   * Create a new task from arbitrary text. It will parse out task elements,
   * but will always create a new task as a block ID is not expected here.
   */
  initFromText (text: string) {
    const parsedRes = this.markdownTaskParser.processText(text)
    const record = assignExisting(this.DEFAULT_DATA, parsedRes.parsed)
    const result = this.tasks.db.insertOrUpdate(record)
    if (!result) {
      // Unable to insert data. Reset to default data, which will show task.valid() === false
      this.reset()
      return this.resultFromInit()
    } else {
      this.setData(result)
    }
    return this.resultFromInit()
  }

  /**
   * This is the standard result format from all the 'init' methods
   */
  resultFromInit (hasChanges = false): TaskInitResult {
    return {
      task: this,
      hasChanges,
      valid: this.valid()
    }
  }

  toggle () {
    this.status = this.status === TaskStatus.DONE ? TaskStatus.TODO : TaskStatus.DONE
    this.update()
  }

  setAs (type: TaskType) {
    if (type !== this.type) {
      this.type = type
      this.update()
    }
    return this
  }

  getTypeSignifier () {
    if (this.isCompleted) return TaskEmoji.NONE // No need for signifier cluttering up the view for completed tasks

    const signifiers = [TaskType.PROJECT, TaskType.SOMEDAY, TaskType.WAITING_ON]
    if (process.env.NODE_ENV === 'development') signifiers.push(TaskType.INBOX, TaskType.NEXT_ACTION, TaskType.DEPENDENT)

    if (signifiers.includes(this.type)) {
      const key = Object.keys(TaskType).find(key => TaskType[key as keyof typeof TaskType] === this.type) || ''
      if (key === 'WAITING_ON') {
        const displayOptions = this.tasks.plugin.settings.displayOptions
        if (displayOptions.waitingOn === DisplayOption.TAG) {
          return '#' + TaskType.WAITING_ON
        } else if (displayOptions.waitingOn === DisplayOption.EMOJI) {
          return TaskEmoji.WAITING_ON
        } else if (!this.plugin.isMaster()) {
          return TaskEmoji.WAITING_ON
        } else {
          return ''
        }
      } else {
        return TaskEmoji[key as keyof typeof TaskEmoji] || TaskEmoji.NONE
      }
    }
    return TaskEmoji.NONE
  }

  generateMarkdownTask () {
    const displayOptions = this.tasks.plugin.settings.displayOptions

    // Get indentation level
    let indent = 0
    let parent = this.parent
    while (parent) {
      indent++
      parent = this.tasks.db.getRow(parent)?.parent || 0
    }

    // Scheduled date
    let scheduled = ''
    if (this.scheduled && (displayOptions.scheduled === DisplayOption.EMOJI || !this.plugin.isMaster())) {
      scheduled = TaskEmoji.SCHEDULED + ' ' + this.scheduled
    }

    // Due date
    let due = ''
    if (this.due && (displayOptions.due === DisplayOption.EMOJI || !this.plugin.isMaster())) {
      due = TaskEmoji.DUE + ' ' + this.due
    }

    // Completed date
    let completed = ''
    if (this.status === TaskStatus.DONE && (displayOptions.completed === DisplayOption.EMOJI || !this.plugin.isMaster())) {
      const date = this.completed ? moment(this.completed) : moment()
      completed = TaskEmoji.COMPLETED + ' ' + date.format('YYYY-MM-DD')
    }

    const parts = [
      '\t'.repeat(indent) + `- [${this.status}]`,
      this.getTypeSignifier(),
      this.text,
      scheduled,
      due,
      completed,
      '^' + this.tasks.blockPrefix + this.id
    ]
    return parts
      .filter(Boolean)
      .join(' ')
  }

  /**
   * Updates the database and markdown note
   */
  update () {
    if (!this.id || !this.path) {
      debug('Unable to update task ' + this.text + ' as there is no ID or path for it')
      return this
    }

    // Update the DB with the new data
    this.tasks.db.update(this.getData())
    dbEvents.emit(DatabaseEvent.TasksChanged)

    // Render the markdown so it's available
    void this.renderMarkdown()

    // Queue the task for update in the original markdown note
    this.tasks.addTaskToUpdateQueue(this.id)

    return this
  }

  /**
   * Move a task to the specified note.
   * @param toPath - The note to move to
   * @param beforeTask - (optional) Move it before the task with this ID
   * @param afterTask - (optional) Move it after the task with this ID
   */
  async move (toPath: string, beforeTask?: number, afterTask?: number) {
    const newFile = this.app.vault.getFileByPath(toPath)
    if (!newFile) return this

    // Remove the task from its current note
    const currentFile = this.app.vault.getFileByPath(this.path)
    if (!currentFile) return this
    await this.app.vault.process(currentFile, data => {
      const lines = data.split('\n')
      const index = lines.findIndex(line => line.endsWith(` ^${this.tasks.blockPrefix}${this.id}`))
      if (index !== -1) lines.splice(index, 1)
      return lines.join('\n')
    })

    // Get line position based on before/after existing tasks
    let line = -1
    const existingId = beforeTask || afterTask
    if (existingId) {
      const existingTask = this.tasks.getTaskById(existingId)
      if (existingTask.path === toPath) {
        line = beforeTask ? existingTask.line : existingTask.line + 1
      }
    }

    // Add task to new note
    await this.app.vault.process(newFile, data => {
      if (line >= 0) {
        // Insert task at the specific position
        const rows = data.split('\n')
        rows.splice(line, 0, this.generateMarkdownTask())
        data = rows.join('\n')
      } else {
        // Append task to end of the note
        data = data.trimEnd() + '\n' + this.generateMarkdownTask() + '\n'
      }
      return data
    })

    return this
  }

  async renderMarkdown () {
    const el = document.createElement('div')
    await MarkdownRenderer.render(this.tasks.app, this.text, el, '', this.markdownComponent)
    this.renderedMarkdown = el.innerHTML
  }

  /**
   * Returns a list of all parents back to the root level
   */
  get ancestors (): Task[] {
    const ancestors: Task[] = []
    let parentId = this.parent
    while (parentId) {
      const parentTask = this.tasks.getTaskById(parentId)
      if (parentTask.valid()) {
        parentId = parentTask.parent
        ancestors.push(parentTask)
      } else {
        parentId = 0
      }
    }
    return ancestors.reverse()
  }

  get children (): Task[] {
    return this.tasks.db.rows()
      .filter(row => row.parent === this.id)
      .map(row => new Task(this.tasks).initFromRow(row).task)
  }

  /**
   * Return all subtasks for this task/project (including completed tasks)
   */
  get descendants (): Task[] {
    const tasks = this.tasks.db.rows().filter(row => row.parent > 0 && row.orphaned === 0)

    // Recursive function to get descendants
    const getDescendants = (parentId: number): Task[] => {
      return tasks
        .filter(row => row.parent === parentId)
        .map(row => [
          new Task(this.tasks).initFromRow(row).task,
          ...getDescendants(row.id)
        ])
        .flat()
        // Sort by the order they appear in the note
        .sort((a, b) => a.line - b.line)
    }

    return getDescendants(this.id)
  }

  /**
   * Return all uncompleted subtasks for this task/project
   */
  get activeDescendants (): Task[] {
    return this.descendants.filter(child => !child.isCompleted)
  }

  /**
   * Creates a subtask for the current task. This will convert the current task
   * to a project if not already the case.
   * It will add the subtask at the end of any existing subtasks.
   *
   * Returns the newly added subtask
   */
  async addSubtask (newTaskText: string, type?: TaskType) {
    // Get the position in the note to insert the new task
    const descendants = this.descendants
    const line = (descendants.length ? descendants[descendants.length - 1].line : this.line) + 1

    // Create the new subtask
    const subtask = new Task(this.tasks).initFromRow({
      text: newTaskText
    } as TaskRow).task
    subtask.parent = this.id
    subtask.line = line
    if (type) subtask.type = type

    const tfile = this.tasks.app.vault.getFileByPath(this.path)
    if (tfile) {
      await this.tasks.app.vault.process(tfile, data => {
        const lines = data.split('\n')
        lines.splice(line, 0, subtask.generateMarkdownTask())
        return lines.join('\n')
      })
    }

    return subtask
  }
}
