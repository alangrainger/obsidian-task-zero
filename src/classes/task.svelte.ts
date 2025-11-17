import { type ListItemCache, Notice } from 'obsidian'
import { type CacheUpdate, type CacheUpdateItem, Tasks } from './tasks'
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
  NEXT_ACTION = '➡️',
  PROJECT = '🗃️',
  WAITING_ON = '⏸️',
  SOMEDAY = '💤',
  DEPENDENT = '⛓️',
  CREATED = '➕',
  SCHEDULED = '⏳',
  DUE = '📅'
}

type TaskInitResult = {
  task: Task
  isUpdated: boolean
  valid: boolean
}

export interface TaskRow {
  [key: string]: any

  id: number
  status: TaskStatus
  text: string
  path: string
  type: TaskType
  created: string
  orphaned: number // If the task is not present in any note
  line: number     // The line number of the task in the original note (used for sequencing project sub-tasks)
  parent: number   // The parent task ID, if this is a sub-task
}

interface MarkdownTaskElements extends Partial<TaskRow> {
  status: TaskStatus
  text: string
}

export class Task implements TaskRow {
  tasks: Tasks

  id = 0
  status = $state(TaskStatus.TODO)
  text = $state('')
  path = ''
  orphaned = 0
  created = ''
  type = $state(TaskType.INBOX)
  line = 0
  parent = 0

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
      parent: 0
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
      type: this.type,
      line: this.line,
      parent: this.parent
    }
  }

  setData (data: TaskRow) {
    // @ts-ignore
    Object.keys(data).forEach(key => this[key] = data[key])
  }

  get isCompleted () {
    return this.status === TaskStatus.DONE
  }

  initFromId (id: number) {
    const row = this.tasks.db.getRow(id)
    if (row) {
      this.initFromRow(row)
    } else {
      this.reset()
    }
    return this.initResult()
  }

  initFromRow (row: TaskRow) {
    // Populate any missing data from DEFAULT_DATA
    const data = assignExisting(this.DEFAULT_DATA, row)
    this.setData(data)
    return this.initResult()
  }

  initFromListItem (item: ListItemCache, cacheUpdate: CacheUpdate, previous: CacheUpdateItem[]) {
    // Get the original task line
    const lines = cacheUpdate.data.split('\n')
    const originalLine = lines[item.position.start.line] || ''
    const parsed = parseMarkdownTaskString(originalLine, this.tasks.blockPrefix)
    if (!parsed) {
      // Not able to find a task in this line
      return this.initResult()
    }

    // Check if this ID has already been used on this page (duplicate ID)
    const previousIds = previous.map(i => i.task.id)
    if (parsed.id && previousIds.includes(parsed.id)) parsed.id = 0

    // Default task
    let record = this.DEFAULT_DATA
    record.path = cacheUpdate.file.path

    // Check DB for existing task
    const existing = this.tasks.db.getRow(parsed.id || 0)

    // Overwrite the base record with database-data (if any), then parsed data
    record = assignExisting(record, existing, parsed)

    // Update with the current line position
    record.line = item.position.start.line

    // Is this a sub-task?
    if (item.parent > 0) {
      const parentTask = previous.find(x => x.task.line === item.parent)?.task
      if (parentTask) {
        record.parent = parentTask.id
        // Ensure the root-level parent is set to Project type
        let ancestors = parentTask.ancestors
        ancestors = ancestors.length ? ancestors : [parentTask]
        const rootParent = ancestors[0]
        rootParent.type = TaskType.PROJECT
        // Check the sequence. The first available sub-task should be a Next Action,
        // and the rest should be Dependent
        record.type = previous.find(prev => ancestors
          .map(x => x.id)
          .includes(prev.task.parent) && !prev.task.isCompleted) ? TaskType.DEPENDENT : TaskType.NEXT_ACTION
      }
    }

    // Are there any changes from the DB record, and/or is a new record?
    const isUpdated = !existing || Object.keys(record).some(key => record[key] !== existing[key])

    const result = this.tasks.db.insertOrUpdate(record)
    if (!result) {
      // Unable to insert data. Reset to default data, which will show task.valid() === false
      this.reset()
      return this.initResult()
    } else {
      this.setData(result)
    }
    return this.initResult(isUpdated)
  }

  /**
   * This is the standard result format from all the 'init' methods
   */
  initResult (isUpdated = false): TaskInitResult {
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
    if (this.isCompleted) return '' // No need for signifier cluttering up the view for completed tasks

    const signifiers = [
      TaskType.PROJECT,
      TaskType.SOMEDAY,
      TaskType.NEXT_ACTION,
      TaskType.DEPENDENT
    ]
    if (signifiers.includes(this.type)) {
      const key = Object.keys(TaskType).find(key => TaskType[key as keyof typeof TaskType] === this.type) || '';
      return TaskEmoji[key as keyof typeof TaskEmoji] || ''
    }
    return ''
  }

  generateMarkdownTask () {
    // Get indentation level
    let indent = 0
    let parent = this.parent
    while (parent) {
      indent++
      parent = this.tasks.db.getRow(parent)?.parent || 0
    }

    const parts = [
      '\t'.repeat(indent) + `- [${this.status}]`,
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

  get descendants (): Task[] {
    const tasks = this.tasks.db.rows() // Get all tasks

    // Recursive function to get descendants
    const getDescendants = (parentId: number): Task[] => {
      return tasks
        .filter(row => row.parent === parentId && row.orphaned === 0)
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
   * Creates a subtask for the current task. This will convert the current task
   * to a project if not already the case.
   * It will add the subtask at the end of any existing subtasks.
   */
  async createSubtask (newTaskText: string) {
    // Get the position in the note to insert the new task
    const descendants = this.descendants
    const line = (descendants.length ? descendants[descendants.length - 1].line : this.line) + 1

    // Create the new subtask
    const subtask = new Task(this.tasks).initFromRow({
      text: newTaskText
    } as TaskRow).task
    subtask.parent = this.id
    subtask.line = line

    const tfile = this.tasks.getTFileFromPath(this.path)
    if (tfile) {
      await this.tasks.app.vault.process(tfile, data => {
        const lines = data.split('\n')
        lines.splice(line, 0, subtask.generateMarkdownTask())
        return lines.join('\n')
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

  // Remove other icons which shouldn't be in the final task line
  const remove = [TaskEmoji.NEXT_ACTION, TaskEmoji.DEPENDENT]
  remove.forEach(emoji => {
    text = text.replace(emoji, ' ')
  })

  if (status && text) {
    return {
      id,
      status: status as TaskStatus,
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
