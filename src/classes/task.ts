import { ListItemCache, TFile } from 'obsidian'
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
  path: string,
  /**
   * If the task is not present in any note
   */
  orphaned: number
}

const DEFAULT_ROW: TaskRow = {
  id: 0,
  status: ' ',
  text: '',
  path: '',
  orphaned: 0
}

interface MarkdownTaskElements {
  id?: number,
  status: string,
  text: string
}

export class Task {
  tasks: Tasks

  id: number
  status: string
  text: string
  path: string
  orphaned: number

  constructor (tasks: Tasks) {
    this.tasks = tasks
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
      orphaned: this.orphaned
    }
  }

  setData (data: TaskRow) {
    // @ts-ignore
    Object.keys(data).forEach(key => this[key] = data[key])
  }

  completed () {
    return this.status === TaskStatus.Complete
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
      path: cacheUpdate.file.path,
      orphaned: 0
    })
    if (!result) {
      // Unable to insert data - reset to default data
      // Which will show task.valid() === false
      this.setData(DEFAULT_ROW)
      return
    } else {
      this.setData(result)
      this.update().then()
    }
  }

  generateMarkdownTask () {
    const parts = [
      `- [${this.status}]`,
      this.text,
      '^' + this.tasks.plugin.settings.taskBlockPrefix + this.id
    ]
    return parts.join(' ')
  }

  /**
   * Updates the database and markdown note
   */
  async update () {
    if (!this.id || !this.path) {
      console.log('Unable to update task ' + this.text + ' as there is no ID or path for it')
      return
    }
    const tfile = this.tasks.plugin.app.vault.getAbstractFileByPath(this.path)
    if (tfile instanceof TFile) {
      await this.tasks.plugin.app.vault.process(tfile, data => {
        data.replace(new RegExp(`^\s*- \[.][^$]+\^${this.tasks.plugin.settings.taskBlockPrefix}\\d+\s*$`, 's'), this.generateMarkdownTask())
        return data
      })
    }
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
