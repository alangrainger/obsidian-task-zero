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
  text: string
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
    const parsed = parseMarkdownTaskString(lines[item.position.start.line] || '', this.tasks.plugin.settings.taskBlockPrefix)
    if (!parsed) {
      // Not able to find a task in this line
      return
    }

    this.data = {
      id: parsed.id || 0,
      status: parsed.status,
      text: parsed.text
    }

    this.tasks.db.insertOrUpdate(this.data)
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
      id, status, text
    }
  } else {
    return false
  }
}
