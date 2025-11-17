import type DoPlugin from '../main'
import { TaskEmoji, type TaskRow, TaskStatus, TaskType } from './task.svelte'

export interface MarkdownTaskElements extends Partial<TaskRow> {
  text: string
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
      project: new RegExp(`\\s+(${TaskEmoji.PROJECT}|#${TaskType.PROJECT})\\s+`),
      someday: new RegExp(`\\s+(${TaskEmoji.SOMEDAY}|#${TaskType.SOMEDAY})\\s+`),
      due: /\s+📅\s*(\d{4}-\d{2}-\d{2})\s+/,
      scheduled: /\s+⏳\s*(\d{4}-\d{2}-\d{2})\s+/,
    } as const
  }

  get blockPrefix () {
    return this.plugin.tasks.blockPrefix
  }

  /**
   * Process an arbitrary line of text to extract task elements
   */
  processText (text: string): MarkdownTaskElements {
    this.taskLine = text

    // Run all functions first, as they remove the matched text from the remaining task text
    const isProject = this.isProject()
    const isSomeday = this.isSomeday()
    const due = this.getDue()
    const scheduled = this.getScheduled()

    // Remove other icons which shouldn't be in the final task text
    // This will leave the final task text === this.taskLine.trim()
    const keepIcons = [TaskEmoji.PROJECT, TaskEmoji.SOMEDAY]
    Object.values(TaskEmoji)
      .filter(value => !keepIcons.includes(value as TaskEmoji))
      .forEach(emoji => {
        while (emoji && this.taskLine.includes(emoji)) {
          this.taskLine = this.taskLine.replace(emoji, ' ')
        }
      })

    return {
      type: isSomeday ? TaskType.SOMEDAY : isProject ? TaskType.PROJECT : undefined,
      due,
      scheduled,
      text: this.taskLine.trim()
    }
  }

  /**
   * Process a full markdown task line (e.g. it starts with "- [ ] ..."
   */
  processTaskLine (text: string): MarkdownTaskElements | false {
    this.taskLine = text

    // Run all functions first, as they remove the matched text from the remaining task text
    const status = this.getStatus()
    if (!status) return false // Doesn't appear to be a task line
    const id = this.getId()
    // Process remaining elements
    const parsed = this.processText(this.taskLine)
    parsed.id = id
    parsed.status = status

    return parsed
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

  getDue () {
    return this.getAndRemoveMatch(this.regex.due)
  }

  getScheduled () {
    return this.getAndRemoveMatch(this.regex.scheduled)
  }
}
