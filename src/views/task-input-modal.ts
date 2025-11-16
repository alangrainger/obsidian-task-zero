import { App, Modal, Setting } from 'obsidian'
import type { Task } from '../classes/task.svelte'

export class TaskInputModal extends Modal {
  project: Task | null
  taskText = ''
  callback: (taskText: string) => void

  constructor (app: App, project: Task | null, callback: (taskText: string) => void) {
    super(app)
    this.project = project
    this.callback = callback
  }

  onOpen () {
    const { contentEl } = this

    new Setting(contentEl)
      .setName('Task text')
      .addText(text => text
        .setPlaceholder('')
        .onChange(value => {
          this.taskText = value
        })
        .inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            this.submit()
          }
        }))

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
