<script lang="ts">
  import NoteLink from './NoteLink.svelte'
  import Sidebar from './Sidebar.svelte'
  import Checkbox from './Checkbox.svelte'

  import { onMount, tick } from 'svelte'
  import type TaskZeroPlugin from '../../main'
  import { DefaultTabs, type State, type Tab } from '../view-types'
  import { DatabaseEvent, dbEvents } from '../../classes/database-events'
  import { debug, fromNow } from '../../functions'
  import { TaskZeroView, type TaskScopes } from '../task-view'
  import { Task, TaskEmoji, TaskType } from '../../classes/task.svelte'
  import { TaskInputModal } from '../task-input-modal'
  import { MoveToProjectModal } from '../move-to-project-modal'
  import Tabs from './Tabs.svelte'
  import { WorkspaceLeaf } from 'obsidian'
  import { HotkeyAction, HotkeyModal } from '../hotkeys'

  interface Props {
    view: TaskZeroView
    plugin: TaskZeroPlugin
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
    activeTab: DefaultTabs.TASKS,
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
  const isWarning = (task: Task) => !task.type ||
    task.type === TaskType.INBOX ||
    task.type === TaskType.PROJECT && !task.activeChildren.length

  $effect(() => {
    if (state.viewIsActive) {
      scopes.tasklist.enable()
      // When view becomes active, refresh the list and move the selected line back
      // to the first task in the list. This is as per GTD - you start at the top
      // and work down.
      refresh(true)
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
  const hotkeys = plugin.settings.hotkeys
  scopes.tasklistAndSidebar.addHotkeys([
    [hotkeys[HotkeyAction.TASKLIST_SIDEBAR_CLOSE], () => state.sidebar.open = false],
    [{ key: 'ArrowUp', modifiers: ['Alt'] }, listUp],
    [{ key: 'ArrowDown', modifiers: ['Alt'] }, listDown],
    // ['p', ['Alt'], () => setTaskType(TaskType.PROJECT)],
    // ['a', ['Alt'], () => setTaskType(TaskType.NEXT_ACTION)],
    // ['s', ['Alt'], () => setTaskType(TaskType.SOMEDAY)],
    // ['w', ['Alt'], () => setTaskType(TaskType.WAITING_ON)]
  ])

  // Hotkeys for tasklist only
  scopes.tasklist.addHotkeys([
    [hotkeys[HotkeyAction.TASKLIST_MOVE_UP], listUp],
    [hotkeys[HotkeyAction.TASKLIST_MOVE_DOWN], listDown],
    [hotkeys[HotkeyAction.TASKLIST_MOVE_UP_ALT], listUp],
    [hotkeys[HotkeyAction.TASKLIST_MOVE_DOWN_ALT], listDown],
    [hotkeys[HotkeyAction.TASKLIST_OPEN_ACTIVE_ROW], openActiveRow],
    [hotkeys[HotkeyAction.TASKLIST_TOGGLE_COMPLETED], () => {
      activeTask.toggle()
      listDown()
    }],
    [hotkeys[HotkeyAction.TASK_SET_TYPE_PROJECT], () => setTaskType(TaskType.PROJECT)],
    [hotkeys[HotkeyAction.TASK_SET_TYPE_NEXT_ACTION], () => setTaskType(TaskType.NEXT_ACTION)],
    [hotkeys[HotkeyAction.TASK_SET_TYPE_SOMEDAY], () => setTaskType(TaskType.SOMEDAY)],
    [hotkeys[HotkeyAction.TASK_SET_TYPE_WAITING_ON], () => setTaskType(TaskType.WAITING_ON)],
    [hotkeys[HotkeyAction.TASKLIST_MOVE_TASK], () => { if (activeTask) new MoveToProjectModal(plugin, activeTask).open() }],
    [hotkeys[HotkeyAction.TASKLIST_NEW_TASK], newTask],
    [{ key: '?', modifiers: ['Shift'] }, () => new HotkeyModal(plugin).open()]
  ])

  // Add hotkeys for Alt + 1-9 for switching tabs
  Array.from({ length: 9 }, (_, index) => index + 1)
    .forEach(num => scopes.tasklist.addHotkey({ key: num.toString(), modifiers: ['Alt'] }, () => switchTab(num)))

  /**
   * Refresh the tasklist
   * @param resetPosition - Optionally move the highlighted row back to the top
   */
  export async function refresh (resetPosition = false) {
    debug('Refreshing task list')

    // Create the standard tabs
    const tabs = [
      { label: DefaultTabs.TASKS },
      { label: DefaultTabs.PROJECTS },
      { label: DefaultTabs.SOMEDAY }
    ] as Tab[]

    // Add in the user's custom tabs
    tabs.splice(1, 0, ...plugin.settings.tasklistTabs
      .filter(x => x.label && x.tag)
      .map(x => ({
        label: x.label,
        filter: (task: Task) => task.text.includes(x.tag.replace(/#/g, ''))
      })))
    state.tabs = tabs

    // Create the task lists
    let tasks = []
    // Filter using the built-in or custom user function
    if (state.activeTab === DefaultTabs.SOMEDAY) {
      tasks = plugin.tasks.getTasks(TaskType.SOMEDAY)
    } else if (state.activeTab === DefaultTabs.TASKS) {
      tasks = plugin.tasks.getTasklist()
    } else if (state.activeTab === DefaultTabs.PROJECTS) {
      tasks = plugin.tasks.getTasks(TaskType.PROJECT)
    } else {
      // Custom user functions
      tasks = plugin.tasks.getTasklist()
        .filter(tabs.find(x => x.label === state.activeTab)?.filter || (() => true))
    }

    await Promise.all(tasks.map(async task => await task.renderMarkdown()))
    state.tasks = tasks
    if (resetPosition) state.activeId = tasks[0]?.id
  }

  function switchTab (index: number) {
    if (index < 1 || index > state.tabs.length) return
    state.activeTab = state.tabs[index - 1].label
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
    // Watch for leaf changes to know when the tasklist is visible/active
    plugin.app.workspace.on('active-leaf-change', watchLeafChanges)
    state.viewIsActive = plugin.app.workspace.getActiveViewOfType(TaskZeroView) !== null
    refresh(true)
  })

  /**
   * Runs when this component is unmounted/destroyed, and is called from task-view.ts
   *
   * I couldn't see how to fire this from onDestroy() or from returning
   * a function from onMount as per the docs: https://svelte.dev/docs/svelte/lifecycle-hooks#onMount
   * which is why I've done it this way
   */
  export function unmount () {
    dbEvents.off(DatabaseEvent.TasksExternalChange, refresh)
    dbEvents.off(DatabaseEvent.TasksChanged, () => {
      if (!plugin.userActivity.isActive()) refresh()
    })
    view.disableAllScopes()
    plugin.app.workspace.off('active-leaf-change', watchLeafChanges)
  }

  /**
   * Watch for the view to become active and set the reactive state property
   */
  function watchLeafChanges (leaf: WorkspaceLeaf | null) {
    state.viewIsActive = leaf?.view instanceof TaskZeroView
  }
</script>

<div class="task-zero-view">
    <Sidebar {activeTask} {state} {scopes} {plugin}/>
    <Tabs {state}/>
    <table class="task-zero-table">
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
                    class:task-zero-inbox-row={(isWarning(task)) && task.id !== state.activeId}
                    class:task-zero-active-row={task.id === state.activeId}
            >
                <td class="task-zero-table-checkbox">
                    <Checkbox {task}/>
                </td>
                <td style="width:1.8em">{@html icon(task)}</td>
                <td class="task-zero-table-task">
                    <div class="task-zero-table-clip">
                        <!--{task.text}-->
                        {@html task.renderedMarkdown}
                    </div>
                </td>
                {#if anyProjects}
                    <td class="task-zero-table-project">
                        <div class="task-zero-table-clip">
                            {#if task.parent}
                                {projectName(task)}
                            {/if}
                        </div>
                    </td>
                {/if}
                <td class="task-zero-table-due">
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
