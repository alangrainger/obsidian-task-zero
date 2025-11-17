<script lang="ts">
  import NoteLink from './NoteLink.svelte'
  import Sidebar from './Sidebar.svelte'
  import Checkbox from './Checkbox.svelte'

  import { onDestroy, onMount, tick } from 'svelte'
  import type DoPlugin from '../../main'
  import type { State } from '../view-types'
  import { DatabaseEvent, dbEvents } from '../../classes/database-events'
  import { debug, fromNow } from '../../functions'
  import { DoTaskView, type TaskScopes } from '../task-view'
  import { Task, TaskEmoji, TaskType } from '../../classes/task.svelte'
  import { TaskInputModal } from '../task-input-modal'

  interface Props {
    view: DoTaskView
    plugin: DoPlugin
    scopes: TaskScopes
  }

  let {
    view,
    plugin,
    scopes
  }: Props = $props()

  let state: State = $state({
    activeId: 0,
    tasks: [],
    sidebar: {
      open: false,
      fields: {
        text: null
      }
    },
    viewIsActive: false
  })

  let activeIndex = $derived(state.tasks.findIndex(x => x.id === state.activeId) || 0)
  let activeTask = $derived(state.tasks[activeIndex])
  const isWarning = (task: Task) => !task.type || task.type === TaskType.INBOX || task.type === TaskType.PROJECT

  $effect(() => {
    if (state.viewIsActive) {
      scopes.tasklist.enable()
      refresh() // Refresh the task list when the view becomes active
    } else {
      view.disableAllScopes()
    }
  })

  async function openActiveRow () {
    state.sidebar.open = true
    await tick()
    state.sidebar.fields.text?.focus()
  }

  // Navigate up/down the task list
  const getRowDown = () => state.tasks[Math.min(activeIndex + 1, state.tasks.length - 1)]
  const listUp = () => state.activeId = state.tasks[Math.max(activeIndex - 1, 0)].id
  const listDown = () => state.activeId = getRowDown().id

  /*
   * Hotkeys that apply to both tasklist and sidebar views
   */
  scopes.tasklistAndSidebar.addHotkeys([
    ['Escape', [], () => state.sidebar.open = false],
    ['ArrowUp', [], listUp],
    ['ArrowDown', [], listDown],
    ['p', ['Alt'], () => setTaskType(TaskType.PROJECT)],
    ['a', ['Alt'], () => setTaskType(TaskType.NEXT_ACTION)],
    ['s', ['Alt'], () => setTaskType(TaskType.SOMEDAY)],
    ['w', ['Alt'], () => setTaskType(TaskType.WAITING_ON)]
  ])

  // Hotkeys for tasklist only
  scopes.tasklist.addHotkeys([
    ['j', [], listUp],
    ['k', [], listDown],
    ['Enter', [], openActiveRow],
    [' ', [], () => activeTask.toggle()],
    ['p', [], () => setTaskType(TaskType.PROJECT)],
    ['a', [], () => setTaskType(TaskType.NEXT_ACTION)],
    ['s', [], () => setTaskType(TaskType.SOMEDAY)],
    ['w', [], () => setTaskType(TaskType.WAITING_ON)],
    ['n', [], () => {
      const project = activeTask.type === TaskType.PROJECT ? activeTask : null
      new TaskInputModal(plugin, project, (taskText) => {
        if (!taskText.trim().length) {
          return
        } else if (project) {
          // If this is a project line, add the task as a subtask of that project
          const nextTaskInList = getRowDown()
          activeTask.addSubtask(taskText).then()
          // Remove the project from the tasklist since it now has a next action
          state.tasks.splice(activeIndex, 1)
          state.activeId = nextTaskInList.id
        } else {
          // Otherwise, add the task to the default note
          const task = new Task(plugin.tasks).initFromText(taskText).task
          plugin.tasks.addTaskToDefaultNote(task).then()
        }
      }).open()
    }]
  ])

  /**
   * Refresh the list of tasks
   */
  export function refresh () {
    debug('Refreshing task list')
    state.tasks = plugin.tasks.getTasklist()
  }

  function setTaskType (type: TaskType) {
    // const prevType = activeTask.type
    activeTask.setAs(type)
    // If someone has changed the type of a task it will change position on the list,
    // so move to the next task then refresh
    state.activeId = getRowDown().id
    refresh()
  }

  export function setActive (isActive: boolean) {
    state.viewIsActive = isActive
  }

  function clickRow (id: number) {
    if (state.activeId === id && state.sidebar.open) {
      state.sidebar.open = false
    } else {
      state.activeId = id
      openActiveRow()
    }
  }

  /**
   * Display an icon in the 2nd column, for specific types only
   */
  function icon (task: Task) {
    if (task.isDue) {
      return `<span title="Task is due ${fromNow(task.isDue)}">🗓️</span>`
    }
    const tooltip = {
      [TaskType.PROJECT]: 'Project has no next action. Select the row and press N / Alt+N to create one.',
      [TaskType.WAITING_ON]: 'Waiting On'
    }
    const excludedIcons = [TaskType.NEXT_ACTION]
    if (!excludedIcons.includes(task.type)) {
      const key = Object.keys(TaskType).find(k => TaskType[k] === task.type)
      const image = TaskEmoji[key] || ''
      if (image) {
        return `<span title="${tooltip[task.type] || ''}">${image}</span>`
      }
    }
    return ''
  }

  // Update tasks list when tasks DB changes
  dbEvents.on(DatabaseEvent.TasksExternalChange, refresh)

  onMount(() => {
    // I have no idea why, but refresh() would never actually do anything here
    // unless I put it after a small timeout
    setTimeout(() => {
      refresh()
      state.activeId = state.tasks[0].id
    }, 200)
  })

  onDestroy(() => {
    dbEvents.off(DatabaseEvent.TasksExternalChange, refresh)
    view.disableAllScopes()
  })
</script>

<div class="gtd-view">
    <Sidebar {activeTask} {state} {scopes}/>
    {activeIndex}
    <table class="gtd-table">
        <thead>
        <tr>
            <th></th>
            <th></th>
            <th>Task</th>
            <th>Due</th>
            <th></th>
        </tr>
        </thead>
        <tbody>
        {#each state.tasks as task}
            <tr
                    onclick={() => clickRow(task.id)}
                    class:do-task-inbox-row={(isWarning(task)) && task.id !== state.activeId}
                    class:do-task-active-row={task.id === state.activeId}
            >
                <td class="gtd-table-checkbox">
                    <Checkbox {task}/>
                </td>
                <td style="width:1.8em">{@html icon(task)}</td>
                <td class="gtd-table-task">
                    <div class="gtd-table-clip">
                        {task.text}
                    </div>
                </td>
                <td class="done-task-table-due">
                    {#if task.isDue}
                        <a href="." class="tag">{fromNow(task.isDue)}</a>
                    {/if}
                </td>
                <td>
                    <NoteLink {task} icon={true}/>
                </td>
            </tr>
        {/each}
        </tbody>
    </table>
</div>
