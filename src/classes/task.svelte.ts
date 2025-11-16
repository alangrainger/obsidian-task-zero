import { type ListItemCache, Notice } from 'obsidian'
import { type CacheUpdate, Tasks } from './tasks'
import { assignExisting, moment } from '../functions'

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
  INBOX = '📥',
  NEXT_ACTION = '✅',
  PROJECT = '🗃️',
  WAITING_ON = '⏸️',
  SOMEDAY = '💤',
  DEPENDENT = '⛓️',
  CREATED = '➕',
  SCHEDULED = '⏳',
  DUE = '📅',
}

export interface TaskRow {
  [key: string]: any

  id: number
  status: string
  text: string
  path: string
  /**
   * If the task is not present in any note
   */
  orphaned: number
  created: string
  type: TaskType
}

interface MarkdownTaskElements extends Partial<TaskRow> {
  status: string
  text: string
}

export class Task {
  tasks: Tasks

  id = 0
  status = $state(' ')
  text = $state('')
  path = ''
  orphaned = 0
  created = ''
  type = $state(TaskType.INBOX)

  get DEFAULT_DATA (): TaskRow {
    return {
      id: 0,
      status: ' ',
      text: '',
      path: '',
      orphaned: 0,
      created: moment().format(),
      type: TaskType.INBOX
    }
  }

  constructor (tasks: Tasks) {
    this.tasks = tasks
  }

  reset () {
    this.setData(this.DEFAULT_DATA)
  }

  valid () {
    return !!this.id
  }

  getData (): TaskRow {
    return {
      id: this.id,
      status: this.status,
      text: this.text,
      path: this.path,
      orphaned: this.orphaned,
      created: this.created,
      type: this.type
    }
  }

  setData (data: TaskRow) {
    // @ts-ignore
    Object.keys(data).forEach(key => this[key] = data[key])
  }

  completed () {
    return this.status === TaskStatus.DONE
  }

  initFromId (id: number) {
    const row = this.tasks.db.getRow(id)
    if (row) {
      this.initFromRow(row)
    } else {
      this.reset()
    }
    return this
  }

  initFromRow (row: TaskRow) {
    // Populate any missing data from DEFAULT_ROW
    const data = Object.assign({}, this.DEFAULT_DATA, row)
    this.setData(data)
    return this
  }

  initFromListItem (item: ListItemCache, cacheUpdate: CacheUpdate, blacklistIds: number[]) {
    // Get the original task line
    const lines = cacheUpdate.data.split('\n')
    const originalLine = lines[item.position.start.line] || ''
    const parsed = parseMarkdownTaskString(originalLine, this.tasks.blockPrefix)
    if (!parsed) {
      // Not able to find a task in this line
      return this.initResult()
    }

    // Check if this ID has already been used on this page (duplicate ID)
    if (parsed.id && blacklistIds.includes(parsed.id)) parsed.id = 0

    // Default task
    let record = this.DEFAULT_DATA
    record.path = cacheUpdate.file.path

    // Check DB for existing task
    const existing = this.tasks.db.getRow(parsed.id || 0)

    record = assignExisting(record, existing, parsed)

    // Are there any changes from the DB record / or is a new record?
    const isUpdated = !existing || Object.keys(record).some(key => record[key] !== existing[key])

    const result = this.tasks.db.insertOrUpdate(record)
    if (!result) {
      // Unable to insert data - reset to default data
      // Which will show task.valid() === false
      this.reset()
      return this.initResult()
    } else {
      this.setData(result)
    }
    return this.initResult(isUpdated)
  }

  initResult (isUpdated = false) {
    return {
      task: this,
      isUpdated,
      valid: this.valid()
    }
  }

  toggle () {
    this.status = this.status === TaskStatus.DONE ? TaskStatus.TODO : TaskStatus.DONE
    this.update()
  }

  setAs (type: TaskType) {
    if (type === this.type) return // no change

    new Notice('Changing task type to ' + type)
    this.type = type
    this.update()
  }

  getTypeSignifier () {
    if (this.type === TaskType.PROJECT) return TaskEmoji.PROJECT
    if (this.type === TaskType.SOMEDAY) return TaskEmoji.SOMEDAY
    return ''
  }

  generateMarkdownTask () {
    const parts = [
      `- [${this.status}]`,
      this.getTypeSignifier(),
      this.text,
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
      console.log('Unable to update task ' + this.text + ' as there is no ID or path for it')
      return
    }

    // Update the DB with the new data
    this.tasks.db.update(this.getData())
    // Queue the task for update in the original markdown note
    this.tasks.addTaskToUpdateQueue(this.id)
  }
}

/**
 * Find a matching element via regex, and remove
 * the entire search query from the original string
 */
function getAndRemoveMatch (text: string, regex: RegExp): [string | undefined, string] {
  let foundText
  let matching = true
  // Remove multiple occurrences if they exist
  while (matching) {
    const match = text.match(regex)
    if (match) {
      foundText = match[1]
      text = text.replace(regex, ' ')
    } else {
      matching = false
    }
  }
  return [foundText, text]
}

/**
 * Parse a markdown task line into its component elements
 */
function parseMarkdownTaskString (text: string, prefix: string): MarkdownTaskElements | false {
  let taskType

  // Get task ID
  let id
  [id, text] = getAndRemoveMatch(text, new RegExp(`\\^${prefix}(\\d+)\\s*$`))
  id = id ? parseInt(id, 10) : undefined

  // Get status
  let status
  [status, text] = getAndRemoveMatch(text, /^\s*-\s+\[(.)]\s+/)

  // Is project?
  let isProject
  [isProject, text] = detectEmojiOrTag(text, TaskEmoji.PROJECT, TaskType.PROJECT)
  if (isProject) taskType = TaskType.PROJECT

  // Is someday?
  let isSomeday
  [isSomeday, text] = detectEmojiOrTag(text, TaskEmoji.SOMEDAY, TaskType.SOMEDAY)
  if (isSomeday) taskType = TaskType.SOMEDAY

  if (status && text) {
    return {
      id,
      status,
      text: text.trim(),
      type: taskType
    }
  } else {
    return false
  }
}

function detectEmojiOrTag (text: string, emoji: TaskEmoji, type: TaskType): [string | undefined, string] {
  let hasEmoji
  [hasEmoji, text] = getAndRemoveMatch(text, new RegExp(`\\s+(${emoji})\\s+`))
  let hasTag
  [hasTag, text] = getAndRemoveMatch(text, new RegExp(`\\s+(#${type})\\s+`))
  return [hasEmoji || hasTag, text]
}
