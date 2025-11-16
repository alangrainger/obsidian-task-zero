<script lang="ts">
  import NoteLink from './NoteLink.svelte'
  import Sidebar from './Sidebar.svelte'
  import Checkbox from './Checkbox.svelte'

  import { onDestroy, onMount, tick } from 'svelte'
  import type DoPlugin from '../../main'
  import type { State } from '../view-types'
  import { DatabaseEvent, dbEvents } from '../../classes/database-events'
  import { moment } from '../../functions'
  import { DoTaskView, type TaskScopes } from '../task-view'
  import { TaskEmoji, TaskType } from '../../classes/task.svelte'

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
    activeIndex: 0,
    tasks: [],
    sidebar: {
      open: false,
      fields: {
        text: null
      }
    },
    viewIsActive: false
  })

  let activeTask = $derived(state.tasks[state.activeIndex])

  $effect(() => {
    if (state.viewIsActive) {
      console.log('view is active')
      scopes.tasklist.enable()
      refresh() // Refresh the task list when the view becomes active
    } else {
      console.log('view is NOT active')
      view.disableAllScopes()
    }
  })

  async function openActiveRow () {
    state.sidebar.open = true
    await tick()
    state.sidebar.fields.text.focus()
  }

  // Navigate up/down the task list
  const listUp = () => state.activeIndex = Math.max(state.activeIndex - 1, 0)
  const listDown = () => state.activeIndex = Math.min(state.activeIndex + 1, state.tasks.length - 1)

  /*
   * Hotkeys that apply to both tasklist and sidebar views
   */
  scopes.tasklistAndSidebar.addHotkeys([
    ['Escape', [], () => state.sidebar.open = false],
    ['ArrowUp', [], listUp],
    ['ArrowDown', [], listDown],
    ['p', ['Alt'], () => activeTask.setAs(TaskType.PROJECT)],
    ['n', ['Alt'], () => activeTask.setAs(TaskType.NEXT_ACTION)],
    ['s', ['Alt'], () => activeTask.setAs(TaskType.SOMEDAY)],
    ['w', ['Alt'], () => activeTask.setAs(TaskType.WAITING_ON)]
  ])

  // Hotkeys for tasklist only
  scopes.tasklist.addHotkeys([
    ['j', [], listUp],
    ['k', [], listDown],
    ['Enter', [], openActiveRow],
    [' ', [], () => activeTask.toggle()],
    ['p', [], () => activeTask.setAs(TaskType.PROJECT)],
    ['n', [], () => activeTask.setAs(TaskType.NEXT_ACTION)],
    ['s', [], () => activeTask.setAs(TaskType.SOMEDAY)],
    ['w', [], () => activeTask.setAs(TaskType.WAITING_ON)]
  ])

  /**
   * Refresh the list of tasks
   */
  export function refresh () {
    console.log('Refreshing task list')
    state.tasks = plugin.tasks.getTasks(TaskType.INBOX)
      .concat(plugin.tasks.getTasks(TaskType.NEXT_ACTION))
      .concat(plugin.tasks.getTasks(TaskType.PROJECT))
      .concat(plugin.tasks.getTasks(TaskType.SOMEDAY))
  }

  export function setActive (isActive: boolean) {
    state.viewIsActive = isActive
  }

  function clickRow (index: number) {
    if (state.activeIndex === index && state.sidebar.open) {
      state.sidebar.open = false
    } else {
      state.activeIndex = index
      openActiveRow()
    }
  }

  function icon (type: TaskType) {
    const key = Object.keys(TaskType).find(k => TaskType[k] === type)
    return TaskEmoji[key] || ''
  }

  // Update tasks list when tasks DB changes
  dbEvents.on(DatabaseEvent.TasksExternalChange, refresh)

  onMount(() => {
    // I have no idea why, but refresh() would never actually do anything here
    // unless I put it after a small timeout
    setTimeout(() => { refresh() }, 200)
  })

  onDestroy(() => {
    dbEvents.off(DatabaseEvent.TasksExternalChange, refresh)
    view.disableAllScopes()
  })
</script>

<div class="gtd-view">
    <Sidebar {state} {scopes}/>
    <table class="gtd-table">
        <thead>
        <tr>
            <th></th>
            <th></th>
            <th>Task</th>
            <th>Note</th>
            <th>Created</th>
        </tr>
        </thead>
        <tbody>
        {#each state.tasks as task, index}
            <tr
                    onclick={() => clickRow(index)}
                    class:do-task-inbox-row={(!task.type || task.type === TaskType.INBOX) && index !== state.activeIndex}
                    class:do-task-active-row={index === state.activeIndex}
            >
                <td class="gtd-table-checkbox">
                    <Checkbox {task}/>
                </td>
                <td style="width:1.8em">{icon(task.type)}</td>
                <td class="gtd-table-task">
                    <div class="gtd-table-clip">
                        {task.text}
                    </div>
                </td>
                <td class="gtd-table-note">
                    <div class="gtd-table-clip">
                        <NoteLink app={plugin.app} path={task.path}/>
                    </div>
                </td>
                <td>{moment(task.created).format('D MMM YYYY')}</td>
            </tr>
        {/each}
        </tbody>
    </table>
</div>
