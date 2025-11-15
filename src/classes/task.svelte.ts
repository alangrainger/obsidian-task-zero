import { type ListItemCache } from 'obsidian'
import { type CacheUpdate, Tasks } from './tasks'
import { moment } from '../functions'

export enum TaskStatus {
  TODO = ' ',
  DONE = 'x'
}

export enum TaskType {
  INBOX = 'inbox',
  NEXT_ACTION  = 'next-action',
  PROJECT = 'project',
  WAITING_ON = 'waiting-on',
  SOMEDAY = 'someday'
}

export enum TaskEmoji {
  DUE = '📅',
  CREATED = '➕',
  SCHEDULED = '⏳'
}

export interface TaskRow {
  [key: string]: any

  id: number,
  status: string,
  text: string,
  path: string,
  /**
   * If the task is not present in any note
   */
  orphaned: number,
  created: string
}

const DEFAULT_ROW: TaskRow = {
  id: 0,
  status: ' ',
  text: '',
  path: '',
  orphaned: 0,
  created: ''
}

interface MarkdownTaskElements {
  id?: number,
  status: string,
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

  constructor (tasks: Tasks) {
    this.tasks = tasks
  }

  reset () {
    this.setData(DEFAULT_ROW)
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
      created: this.created
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
    this.setData(row)
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

    const record = Object.assign({}, DEFAULT_ROW)

    // Check DB for existing task
    const existing = this.tasks.db.getRow(parsed.id || 0)
    if (parsed.id && existing) Object.assign(record, existing)

    // Update the record from the parsed data
    Object.assign(record, {
      status: parsed.status,
      text: parsed.text,
      path: cacheUpdate.file.path,
      orphaned: 0
    })
    if (!record.created) record.created = moment().format()
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

  generateMarkdownTask () {
    const parts = [
      `- [${this.status}]`,
      this.text,
      '^' + this.tasks.blockPrefix + this.id
    ]
    return parts.join(' ')
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
  const match = text.match(regex)
  if (match) {
    foundText = match[1]
    text = text.replace(regex, '')
  }
  return [foundText, text.trim()]
}

/**
 * Parse a markdown task line into its component elements
 */
function parseMarkdownTaskString (text: string, prefix: string): MarkdownTaskElements | false {
  // Get task ID
  let id
  [id, text] = getAndRemoveMatch(text, new RegExp(`\\^${prefix}(\\d+)\\s*$`))
  id = id ? parseInt(id, 10) : undefined

  // Get status
  let status
  [status, text] = getAndRemoveMatch(text, /^\s*-\s+\[(.)]\s+/)

  if (status && text) {
    return {
      id,
      status,
      text
    }
  } else {
    return false
  }
}
