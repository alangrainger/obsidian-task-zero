import { Modal, Setting } from 'obsidian'
import type DoPlugin from '../main'
import { FileSuggest } from './suggest/file-suggest'
import { Task } from '../classes/task.svelte'

export class MoveFileModal extends Modal {
  plugin: DoPlugin
  newPath = ''
  position = ''
  otherTaskId = ''
  task: Task
  taskText = ''
  submitButton?: HTMLButtonElement

  // callback: (taskText: string) => void

  constructor (plugin: DoPlugin, task: Task) {
    super(plugin.app)
    this.plugin = plugin
    this.task = task
    // this.project = project
    // this.callback = callback
  }

  onOpen () {
    this.display()
  }

  display () {
    const { contentEl } = this
    contentEl.empty()

    new Setting(contentEl)
      .setHeading()
      .setName('Move task to another note')

    new Setting(contentEl)
      .setName('Select note')
      .addText(text => {
        new FileSuggest(this.app, text.inputEl, file => {
          this.newPath = file.path
        })
        text.setPlaceholder('Start typing...')
        text.setValue(this.newPath)
      })

    new Setting(contentEl)
      .setName('Position in note')
      .addDropdown(dropdown => {
        dropdown
          .addOption('', 'Add to end')
          .addOption('before', 'Before task')
          .addOption('after', 'After task')
          .setValue(this.position)
          .onChange(value => {
            this.position = value
            this.display()
          })
      })

    if (this.position) {
      new Setting(contentEl)
        .setName('Select task')
        .addDropdown(dropdown => {
          const tasksInFile = this.plugin.tasks.getTasks()
            .filter(task => task.path === this.newPath)
            .sort((a, b) => a.line - b.line)

          dropdown.addOption('', tasksInFile.length ? 'Select task' : 'No tasks found in note')
          tasksInFile
            .forEach(task => dropdown.addOption(task.id.toString(), task.text))
          dropdown
            .setValue(this.otherTaskId)
            .onChange(value => this.otherTaskId = value)
        })
    }

    new Setting(contentEl)
      .addButton(button => {
        button
          .setCta()
          .setButtonText('Move task')
          .onClick(() => {
            let beforeTask, afterTask
            const otherTaskId = parseInt(this.otherTaskId, 10) || undefined
            if (this.position === 'before' && otherTaskId) beforeTask = otherTaskId
            if (this.position === 'after' && otherTaskId) afterTask = otherTaskId
            this.task.move(this.newPath, beforeTask, afterTask).then()
            this.close()
          })
      })
  }

  submit () {
    this.close()
  }

  onClose () {
    const { contentEl } = this
    contentEl.empty()
  }
}
