<script lang="ts">
  import NoteLink from './NoteLink.svelte'
  import Sidebar from './Sidebar.svelte'
  import Checkbox from './Checkbox.svelte'

  import { onDestroy, onMount, tick } from 'svelte'
  import type DoPlugin from '../../main'
  import type { State } from '../view-types'
  import { DatabaseEvent, dbEvents } from '../../classes/database-events'
  import { debug, fromNow } from '../../functions'
  import { NextActionView, type TaskScopes } from '../task-view'
  import { Task, TaskEmoji, TaskType } from '../../classes/task.svelte'
  import { TaskInputModal } from '../task-input-modal'
  import { MoveToProjectModal } from '../move-to-project-modal'
  import Tabs from './Tabs.svelte'

  interface Props {
    view: NextActionView
    plugin: DoPlugin
    scopes: TaskScopes
  }

  let {
    view,
    plugin,
    scopes
  }: Props = $props()

  let state: State = $state({
    tasks: [],
    activeId: 0,
    tabs: [],
    activeTab: 'tasklist',
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
  let anyProjects = $derived(state.tasks.filter(x => x.parent).length > 0)
  const isWarning = (task: Task) => !task.type || task.type === TaskType.INBOX || task.type === TaskType.PROJECT

  $effect(() => {
    if (state.viewIsActive) {
      scopes.tasklist.enable()
      refresh() // Refresh the task list when the view becomes active
    } else {
      view.disableAllScopes()
    }
  })

  // Watch for changes to the active task's text, and re-render the HTML/markdown
  $effect(() => {
    if (activeTask?.text) activeTask.renderMarkdown().then()
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
    [' ', [], () => {
      activeTask.toggle()
      listDown()
    }],
    ['p', [], () => setTaskType(TaskType.PROJECT)],
    ['a', [], () => setTaskType(TaskType.NEXT_ACTION)],
    ['s', [], () => setTaskType(TaskType.SOMEDAY)],
    ['w', [], () => setTaskType(TaskType.WAITING_ON)],
    // Move task
    ['m', [], () => { if (activeTask) new MoveToProjectModal(plugin, activeTask).open() }],
    ['n', [], newTask],
    ['1', ['Alt'], () => state.activeTab = 'tasklist'],
    ['2', ['Alt'], () => state.activeTab = 'someday'],
  ])

  /**
   * Refresh the list of tasks
   */
  export async function refresh () {
    debug('Refreshing task list')
    state.tabs = [
      {
        id: 'tasklist',
        label: '✅ Tasks',
      },
      {
        id: 'someday',
        label: '💤 Someday',
      },
      {
        id: 'work',
        label: '💼 Work',
      },
      {
        id: 'home',
        label: '🏠 Home',
      }
    ]
    let tasks = []
    if (state.activeTab === 'someday') {
      tasks = plugin.tasks.getTasks(TaskType.SOMEDAY)
    } else {
      tasks = plugin.tasks.getTasklist()
    }
    await Promise.all(tasks.map(async task => await task.renderMarkdown()))
    state.tasks = tasks
  }

  function setTaskType (type: TaskType) {
    if (type !== activeTask.type) {
      activeTask.setAs(type)
      // If someone has changed the type of a task it will change position on the list,
      // so move to the next task then refresh
      state.activeId = getRowDown().id
      refresh()
    }
  }

  function newTask () {
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
  }

  export function setActive (isActive: boolean) {
    state.viewIsActive = isActive
    if (isActive) {
      // When view becomes active, refresh the list and move the selected line back
      // to the first task in the list. This is as per GTD - you start at the top
      // and work down.
      refresh()
      state.activeId = state.tasks[0]?.id
    }
  }

  function clickRow (id: number, event: MouseEvent) {
    const target = event.target as HTMLAnchorElement
    if (target.closest('a')) {
      if (target.href.startsWith('app')) {
        plugin.app.workspace.openLinkText(target.innerText, '')
      }
    } else {
      if (state.activeId === id) {
        state.sidebar.open = !state.sidebar.open
      } else {
        state.activeId = id
      }
    }
  }

  function projectName (task: Task) {
    const parentTask = plugin.tasks.getTaskById(task.parent)
    return parentTask?.text ? TaskEmoji.PROJECT + ' ' + parentTask.text : ''
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
  dbEvents.on(DatabaseEvent.TasksChanged, () => {
    if (!plugin.userActivity.isActive()) refresh()
  })

  onMount(() => {
    state.tabs = [
      {
        id: 'tasklist',
        label: '✅ Tasks',
      },
      {
        id: 'someday',
        label: '💤 Someday',
      },
      {
        id: 'work',
        label: '💼 Work',
      },
      {
        id: 'home',
        label: '🏠 Home',
      }
    ]
    // I have no idea why, but refresh() would never actually do anything here
    // unless I put it after a small timeout
    setTimeout(async () => {
      await refresh()
      state.activeId = state.tasks[0]?.id
    }, 200)
  })

  onDestroy(() => {
    dbEvents.off(DatabaseEvent.TasksExternalChange, refresh)
    dbEvents.off(DatabaseEvent.TasksChanged, () => {
      if (!plugin.userActivity.isActive()) refresh()
    })
    view.disableAllScopes()
  })
</script>

<div class="gtd-view">
    <Sidebar {activeTask} {state} {scopes} {plugin}/>
    <Tabs {state}/>
    <table class="gtd-table">
        <!--<thead>
        <tr>
            <th></th>
            <th></th>
            <th>Task</th>
            {#if anyProjects}
                <th>Project</th>
            {/if}
            <th>Due</th>
            <th></th>
        </tr>
        </thead>-->
        <tbody>
        {#each state.tasks as task}
            <tr
                    onclick={event => clickRow(task.id, event)}
                    class:do-task-inbox-row={(isWarning(task)) && task.id !== state.activeId}
                    class:do-task-active-row={task.id === state.activeId}
            >
                <td class="gtd-table-checkbox">
                    <Checkbox {task}/>
                </td>
                <td style="width:1.8em">{@html icon(task)}</td>
                <td class="gtd-table-task">
                    <div class="gtd-table-clip" id="test">
                        <!--{task.text}-->
                        {@html task.renderedMarkdown}
                    </div>
                </td>
                {#if anyProjects}
                    <td class="next-action-table-project">
                        <div class="gtd-table-clip">
                            {#if task.parent}
                                {projectName(task)}
                            {/if}
                        </div>
                    </td>
                {/if}
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
