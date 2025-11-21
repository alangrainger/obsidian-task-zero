import DoPlugin from '../../main'
import type { Task } from '../../classes/task.svelte'
import { AbstractInputSuggest } from 'obsidian'

type TaskSuggestProps = {
  plugin: DoPlugin
  inputEl: HTMLInputElement
  filter: (task: Task) => boolean
  sort: (a: Task, b: Task) => number
  onSelect: (selectedTask: Task) => any
}

/**
 * After selecting a task, the task ID will be set in the inputEl's dataset, as
 * inputEl.dataset.taskId
 */
export class TaskSuggest extends AbstractInputSuggest<Task> {
  plugin: DoPlugin
  tasks: Task[]
  inputEl: HTMLInputElement
  callback: (selectedTask: Task) => any

  constructor (taskSuggestProps: TaskSuggestProps) {
    super(taskSuggestProps.plugin.app, taskSuggestProps.inputEl)
    this.plugin = taskSuggestProps.plugin
    this.inputEl = taskSuggestProps.inputEl
    this.callback = taskSuggestProps.onSelect
    this.tasks = this.plugin.tasks.getTasks()
      .filter(taskSuggestProps.filter)
      .sort(taskSuggestProps.sort)
  }

  getSuggestions (inputStr: string): Task[] {
    const lowerCaseInputStr = inputStr.toLowerCase()
    return this.tasks.filter(task => task.text.toLowerCase().contains(lowerCaseInputStr))
  }

  renderSuggestion (task: Task, el: HTMLElement): void {
    el.setText(task.text)
  }

  selectSuggestion (task: Task): void {
    this.callback(task)
    this.setValue(task.text)
    this.close()
  }
}
