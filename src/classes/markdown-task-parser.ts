import type DoPlugin from '../main'
import { TaskEmoji, type TaskRow, TaskStatus, TaskType } from './task.svelte'
import moment from 'moment'

const DATE_FORMAT = 'YYYY-MM-DD'

export interface MarkdownTaskElements extends Partial<TaskRow> {
  text: string
}

export interface ParsedMarkdownTask {
  parsed: MarkdownTaskElements
  excluded: boolean
}

export class MarkdownTaskParser {
  plugin: DoPlugin
  regex: { [key: string]: RegExp }
  taskLine = ''

  constructor (plugin: DoPlugin) {
    this.plugin = plugin
    this.regex = {
      id: new RegExp(`\\^${this.blockPrefix}(\\d+)\\s*$`),
      status: /^\s*-\s+\[(.)]\s+/,
      project: new RegExp(`\\s+(${TaskEmoji.PROJECT}|#${TaskType.PROJECT})[^\w-]`),
      someday: new RegExp(`\\s+(${TaskEmoji.SOMEDAY}|#${TaskType.SOMEDAY})[^\w-]`),
      waitingOn: new RegExp(`\\s+(${TaskEmoji.WAITING_ON}|#${TaskType.WAITING_ON})[^\w-]`),
      created: /➕\s*(\d{4}-\d{2}-\d{2})/,
      due: /📅\s*(\d{4}-\d{2}-\d{2})/,
      scheduled: /⏳\s*(\d{4}-\d{2}-\d{2})/,
      completed: /✅\s*(\d{4}-\d{2}-\d{2})/,
      excluded: new RegExp(`\\s${plugin.settings.excludeTags.task}(\\s|$)`)
    } as const
  }

  get blockPrefix () {
    return this.plugin.tasks.blockPrefix
  }

  /**
   * Process an arbitrary line of text to extract task elements
   */
  processText (text: string): ParsedMarkdownTask {
    this.taskLine = text

    // Run all functions first, as they remove the matched text from the remaining task text
    const isProject = this.isProject()
    const isSomeday = this.isSomeday()
    const isWaitingOn = this.isWaitingOn()
    const created = this.getCreated()
    const due = this.getDue()
    const scheduled = this.getScheduled()
    const completed = this.getCompleted()
    const excluded = this.getExcluded()

    // Ensure all icons are removed from the final task line
    Object.values(TaskEmoji)
      .forEach(emoji => {
        while (emoji && this.taskLine.includes(emoji)) {
          this.taskLine = this.taskLine.replace(emoji, ' ')
        }
      })

    return {
      parsed: {
        type: isSomeday ? TaskType.SOMEDAY : isWaitingOn ? TaskType.WAITING_ON : isProject ? TaskType.PROJECT : undefined,
        created,
        due,
        scheduled,
        completed,
        text: this.taskLine.trim()
      },
      excluded: !!excluded
    }
  }

  /**
   * Process a full markdown task line (e.g. it starts with "- [ ] ..."
   */
  processTaskLine (text: string): ParsedMarkdownTask | false {
    this.taskLine = text

    // Run all functions first, as they remove the matched text from the remaining task text
    const status = this.getStatus()
    if (!status) return false // Doesn't appear to be a task line
    const id = this.getId()
    // Process remaining elements
    const data = this.processText(this.taskLine)
    data.parsed.id = id
    data.parsed.status = status

    return data
  }

  getAndRemoveMatch (regex: RegExp): string {
    let foundText = ''
    let matching = true
    // Remove multiple occurrences if they exist
    while (matching) {
      const match = this.taskLine.match(regex)
      if (match) {
        foundText = match[1]
        this.taskLine = this.taskLine.replace(regex, ' ')
      } else {
        matching = false
      }
    }
    return foundText
  }

  getId () {
    const id = this.getAndRemoveMatch(this.regex.id)
    return id ? parseInt(id, 10) : undefined
  }

  getStatus () {
    return this.getAndRemoveMatch(this.regex.status) as TaskStatus
  }

  isProject () {
    return !!this.getAndRemoveMatch(this.regex.project)
  }

  isSomeday () {
    return !!this.getAndRemoveMatch(this.regex.someday)
  }

  isWaitingOn () {
    return !!this.getAndRemoveMatch(this.regex.waitingOn)
  }

  getCreated () {
    return this.getAndRemoveMatch(this.regex.created)
  }

  getDue () {
    return this.getAndRemoveMatch(this.regex.due)
  }

  getScheduled () {
    const match = this.getAndRemoveMatch(this.regex.scheduled)
    if (match) {
      // This is the normal ⏳ 2025-01-01 style
      return match
    } else if (this.getAndRemoveMatch(/(\$tod(ay|))/)) {
      // Today
      return moment().format(DATE_FORMAT)
    } else if (this.getAndRemoveMatch(/(\$tom(orrow|))/)) {
      // Tomorrow
      return moment().add(1, 'day').format(DATE_FORMAT)
    } else {
      // The next occurrence of this day - e.g. $tuesday
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
      for (let i = 0; i < days.length; i++) {
        const match = this.getAndRemoveMatch(new RegExp(`(\\$${days[i]})`))
        if (match) {
          const day = moment().day(i)
          if (day.isSameOrBefore(moment(), 'day')) day.add(7, 'days')
          return day.format(DATE_FORMAT)
        }
      }
    }
    return ''
  }

  getCompleted () {
    return this.getAndRemoveMatch(this.regex.completed)
  }

  getExcluded () {
    return this.getAndRemoveMatch(this.regex.excluded)
  }
}
