import type TaskZeroPlugin from '../main'
import { TaskEmoji, type TaskRow, TaskStatus, TaskType } from './task.svelte'
import { moment } from '../functions'

const DATE_FORMAT = 'YYYY-MM-DD'

export type MarkdownTaskElements = Partial<TaskRow>

export type ParsedMarkdownTask = {
  parsed: MarkdownTaskElements
  excluded: boolean
}

const DATE_WORDS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  tod: 0,
  tom: 1,
  week: 7
}

export class MarkdownTaskParser {
  private plugin: TaskZeroPlugin
  private regex: { [key: string]: RegExp }
  private taskline = ''

  constructor (plugin: TaskZeroPlugin) {
    this.plugin = plugin
    this.regex = {
      id: new RegExp(`\\^${this.blockPrefix}(\\d+)\\s*$`),
      status: /^\s*-\s+\[(.)]\s+/,
      project: new RegExp(`\\s+(${TaskEmoji.PROJECT}|#${TaskType.PROJECT})[^\\w-]`),
      someday: new RegExp(`\\s+(${TaskEmoji.SOMEDAY}|#${TaskType.SOMEDAY})[^\\w-]`),
      waitingOn: new RegExp(`\\s+(${TaskEmoji.WAITING_ON}|#${TaskType.WAITING_ON})[^\\w-]`),
      created: /➕\s*(\d{4}-\d{2}-\d{2})/,
      due: /📅\s*(\d{4}-\d{2}-\d{2})/,
      scheduled: /⏳\s*(\d{4}-\d{2}-\d{2})/,
      completed: /✅\s*(\d{4}-\d{2}-\d{2})/,
      excluded: new RegExp(`\\s${plugin.settings.excludeTags.task}(\\s|$)`)
    } as const
  }

  private get blockPrefix () {
    return this.plugin.tasks.blockPrefix
  }

  /**
   * Process an arbitrary line of text to extract task elements
   */
  processText (text: string): ParsedMarkdownTask {
    this.taskline = text

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
        while (emoji && this.taskline.includes(emoji)) {
          this.taskline = this.taskline.replace(emoji, ' ')
        }
      })

    return {
      parsed: {
        type: isSomeday ? TaskType.SOMEDAY : isWaitingOn ? TaskType.WAITING_ON : isProject ? TaskType.PROJECT : undefined,
        created,
        due,
        scheduled,
        completed,
        text: this.taskline.trim()
      },
      excluded: !!excluded
    }
  }

  /**
   * Process a full markdown task line (e.g. it starts with "- [ ] ..."
   */
  processTaskLine (text: string): ParsedMarkdownTask | false {
    this.taskline = text

    // Run all functions first, as they remove the matched text from the remaining task text
    const status = this.getStatus()
    if (!status) return false // Doesn't appear to be a task line
    const id = this.getId()
    // Process remaining elements
    const data = this.processText(this.taskline)
    data.parsed.id = id || 0
    data.parsed.status = status

    return data
  }

  private getAndRemoveMatch (regex: RegExp): string {
    let foundText = ''
    let matching = true
    // Remove multiple occurrences if they exist
    while (matching) {
      const match = this.taskline.match(regex)
      if (match) {
        foundText = match[1]
        this.taskline = this.taskline.replace(regex, ' ')
      } else {
        matching = false
      }
    }
    return foundText
  }

  private getId () {
    const id = this.getAndRemoveMatch(this.regex.id)
    return id ? parseInt(id, 10) : undefined
  }

  private getStatus () {
    return this.getAndRemoveMatch(this.regex.status) as TaskStatus
  }

  private isProject () {
    return !!this.getAndRemoveMatch(this.regex.project)
  }

  private isSomeday () {
    return !!this.getAndRemoveMatch(this.regex.someday)
  }

  private isWaitingOn () {
    return !!this.getAndRemoveMatch(this.regex.waitingOn)
  }

  private getCreated () {
    return this.getAndRemoveMatch(this.regex.created)
  }

  private getDue () {
    return this.getAndRemoveMatch(this.regex.due)
  }

  private getScheduled () {
    // This is the normal ⏳ 2025-01-01 style
    const standard = this.getAndRemoveMatch(this.regex.scheduled)
    if (standard) return standard

    // This is for the special $date type
    const match = this.taskline.match(/(?:^|\s)\$([a-z]+)(?:\s|$)/)
    if (!match || match?.length < 2) return ''
    const input = match[1]
    let date = ''

    // A named day like $tuesday
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
    for (let i = 0; i < days.length; i++) {
      if (input.startsWith(days[i])) {
        const day = moment().day(i)
        if (day.isSameOrBefore(moment(), 'day')) day.add(7, 'days')
        date = day.format(DATE_FORMAT)
      }
    }

    // Other special date words like $three
    if (!date) {
      for (const [key, value] of Object.entries(DATE_WORDS)) {
        if (input.startsWith(key)) {
          date = moment().add(value, 'day').format(DATE_FORMAT)
          break
        }
      }
    }

    // Remove the original input text from the task line
    if (date) this.taskline = this.taskline.replace(match[0], ' ')

    return date
  }

  private getCompleted () {
    return this.getAndRemoveMatch(this.regex.completed)
  }

  private getExcluded () {
    return this.getAndRemoveMatch(this.regex.excluded)
  }
}
