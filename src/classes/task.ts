import { ListItemCache } from 'obsidian'
import { CacheUpdate, Tasks } from './tasks'

export enum TaskStatus {
  Todo = ' ',
  Complete = 'x'
}

export enum TaskEmoji {
  Due = '📅',
  Created = '➕',
  Scheduled = '⏳'
}

export interface TaskRow {
  id: number,
  status: string,
  text: string,
  path: string
}

const DEFAULT_ROW: TaskRow = {
  id: 0,
  status: ' ',
  text: '',
  path: ''
}

interface MarkdownTaskElements {
  id?: number,
  status: string,
  text: string
}

export class Task {
  tasks: Tasks
  data: TaskRow

  constructor (tasks: Tasks) {
    this.tasks = tasks
  }

  valid () {
    return !!this.data.id
  }

  complete () {
    return this.data.status === TaskStatus.Complete
  }

  initFromListItem (item: ListItemCache, cacheUpdate: CacheUpdate) {
    // Get the original task line
    const lines = cacheUpdate.data.split('\n')
    const originalLine = lines[item.position.start.line] || ''
    const parsed = parseMarkdownTaskString(originalLine, this.tasks.plugin.settings.taskBlockPrefix)
    if (!parsed) {
      // Not able to find a task in this line
      return
    }
    // Insert into DB or update existing row
    const result = this.tasks.db.insertOrUpdate({
      id: parsed.id || 0,
      status: parsed.status,
      text: parsed.text,
      path: cacheUpdate.file.path
    })
    if (!result) {
      // Unable to insert data - reset to default data
      this.data = Object.assign({}, DEFAULT_ROW)
      return
    } else {
      this.data = result
    }
  }

  generateMarkdownTask () {
    const parts = [
      `- [${this.data.status}]`,
      this.data.text,
      '^' + this.tasks.plugin.settings.taskBlockPrefix + this.data.id
    ]
    return parts.join(' ')
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
