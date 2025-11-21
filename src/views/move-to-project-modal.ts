import { Modal, Setting } from 'obsidian'
import type DoPlugin from '../main'
import { Task, TaskType } from '../classes/task.svelte'
import { TaskSuggest } from './suggest/task-suggest'

export class MoveToProjectModal extends Modal {
  plugin: DoPlugin
  newPath = ''
  projectTask?: Task
  position = 'start'
  otherTaskId = ''
  taskToMove: Task
  taskText = ''
  submitButton?: HTMLButtonElement

  // callback: (taskText: string) => void

  constructor (plugin: DoPlugin, taskToMove: Task) {
    super(plugin.app)
    this.plugin = plugin
    this.taskToMove = taskToMove
  }

  onOpen () {
    this.display()
  }

  display () {
    const { contentEl } = this
    contentEl.empty()

    new Setting(contentEl)
      .setHeading()
      .setName('Move task to a project')

    new Setting(contentEl)
      .setName('Select project')
      .addSearch(search => {
        new TaskSuggest({
          plugin: this.plugin,
          inputEl: search.inputEl,
          filter: task => task.type === TaskType.PROJECT,
          sort: (a, b) => a.text.localeCompare(b.text),
          onSelect: task => {
            this.projectTask = task
            this.display()
          }
        })
        search.setPlaceholder('Start typing...')
        search.setValue(this.projectTask?.text || '')
      })

    if (this.projectTask) {
      new Setting(contentEl)
        .setName('Position in project')
        .addDropdown(dropdown => {
          dropdown
            .addOption('start', 'As first task')
            .addOption('end', 'As last task')
          if (this.projectTask?.children.length) {
            dropdown
              .addOption('before', 'Before a task')
              .addOption('after', 'After a task')
          }
          dropdown
            .setValue(this.position)
            .onChange(value => {
              this.position = value
              this.display()
            })
        })

      if (this.position === 'before' || this.position === 'after') {
        new Setting(contentEl)
          .setName('Select task')
          .addDropdown(dropdown => {
            const tasksInProject = this.plugin.tasks.getTasks()
              .filter(task => task.parent === this.projectTask?.id)
              .sort((a, b) => a.line - b.line)

            dropdown.addOption('', tasksInProject.length ? 'Select task' : 'No tasks found in note')
            tasksInProject
              .forEach(task => dropdown.addOption(task.id.toString(), task.text))
            dropdown
              .setValue(this.otherTaskId)
              .onChange(value => this.otherTaskId = value)
          })
      }
    }

    new Setting(contentEl)
      .addButton(button => {
        button
          .setCta()
          .setButtonText('Move task')
          .onClick(() => {
            if (!this.projectTask) return
            this.taskToMove.parent = this.projectTask.id
            const lastId = this.projectTask.children[this.projectTask.children.length - 1]?.id || this.projectTask.id

            if (this.position === 'start') {
              // Move as the first subtask of the project
              this.taskToMove.move(this.projectTask.path, undefined, this.projectTask.id).then()
            } else if (this.position === 'end') {
              // Move as the last task of the project
              this.taskToMove.move(this.projectTask.path, undefined, lastId).then()
            } else {
              // Move before or after a subtask in the project
              const otherTaskId = parseInt(this.otherTaskId, 10) || undefined
              let beforeTask, afterTask
              if (this.position === 'before' && otherTaskId) beforeTask = otherTaskId
              if (this.position === 'after' && otherTaskId) afterTask = otherTaskId
              if (!beforeTask && !afterTask) afterTask = lastId
              this.taskToMove.move(this.projectTask.path, beforeTask, afterTask).then()
            }
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
