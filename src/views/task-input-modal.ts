import { Modal, Setting } from 'obsidian'
import { type Task, TaskEmoji } from '../classes/task.svelte'
import type TaskZeroPlugin from '../main'

export class TaskInputModal extends Modal {
  plugin: TaskZeroPlugin
  project: Task | null
  taskText = ''
  callback: (taskText: string) => void

  constructor (plugin: TaskZeroPlugin, project: Task | null, callback: (taskText: string) => void) {
    super(plugin.app)
    this.plugin = plugin
    this.project = project
    this.callback = callback
  }

  onOpen () {
    const { contentEl } = this

    new Setting(contentEl)
      .setHeading()
      .setName(this.project ? `Add subtask to ${TaskEmoji.PROJECT} ${this.project.text}` : 'Capture new task')
      .setDesc(this.project ? 'Project has no Next Actions - time to add one.' : `Adding task to the default note: "${this.plugin.settings.defaultNote}"`)

    const textEl = new Setting(contentEl)
      .addTextArea(text => text
        .setPlaceholder('Start typing your task here...')
        .onChange(value => {
          this.taskText = value
        })
        .inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            this.submit()
          }
        }))
      .setClass('task-zero-task-textarea')
    textEl.infoEl.remove()

    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText('Submit')
        .setCta()
        .onClick(() => {
          this.submit()
        }))
  }

  submit () {
    this.close()
    this.callback(this.taskText)
  }

  onClose () {
    const { contentEl } = this
    contentEl.empty()
  }
}
