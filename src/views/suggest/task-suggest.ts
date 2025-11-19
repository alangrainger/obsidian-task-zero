import { TextInputSuggest } from './suggest'
import DoPlugin from '../../main'
import { Tasks } from '../../classes/tasks'
import type { Task } from '../../classes/task.svelte'

export class TaskSuggest extends TextInputSuggest<Task> {
  plugin: DoPlugin
  tasks: Tasks
  path: string

  constructor (plugin: DoPlugin, inputEl: HTMLInputElement, path: string) {
    super(plugin.app, inputEl)
    this.plugin = plugin
    this.tasks = plugin.tasks
    this.path = path
  }

  getSuggestions (inputStr: string): Task[] {
    const lowerCaseInputStr = inputStr.toLowerCase()
    const tasks = this.tasks.getTasks()
      .filter(task => task.path === this.path)
      .sort((a, b) => a.line - b.line)

    return tasks.filter(task => task.text.toLowerCase().contains(lowerCaseInputStr))
  }

  renderSuggestion (task: Task, el: HTMLElement): void {
    el.setText(task.text)
  }

  selectSuggestion (task: Task): void {
    this.inputEl.dataset.taskId = task.id.toString()
    this.inputEl.value = task.text
    this.inputEl.trigger('input')
    this.close()
  }
}
