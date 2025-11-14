<script lang="ts">
  import NoteLink from './NoteLink.svelte'
  import Sidebar from './Sidebar.svelte'
  import Checkbox from './Checkbox.svelte'

  import { onDestroy, onMount } from 'svelte'
  import type DoPlugin from '../../main'
  import type { State } from '../view-types'
  import { DatabaseEvent, dbEvents } from '../../classes/database-events'
  import type { Task } from '../../classes/task.svelte'

  interface Props {
    plugin: DoPlugin;
  }

  let {
    plugin
  }: Props = $props()

  let state: State = $state({
    activeId: 0,
    tasks: [],
    sidebar: {
      open: true,
      element: undefined
    }
  })

  export function updateView () {
    console.log('Updating view')
    state.tasks = plugin.tasks.getActiveTasks()
  }

  function toggleSidebar (selectedTask: Task) {
    if (state.activeId === selectedTask.id && state.sidebar.open) {
      state.sidebar.open = false
      state.activeId = 0
    } else {
      state.sidebar.open = true
      state.activeId = selectedTask.id
    }
  }

  // Update tasks list when tasks DB changes
  dbEvents.on(DatabaseEvent.TasksExternalChange, updateView)

  onMount(() => {
    // I have no idea why, but updateView() would never actually do anything here
    // unless I put it after a small timeout
    setTimeout(() => { updateView() }, 200)
  })

  onDestroy(() => {
    dbEvents.off(DatabaseEvent.TasksExternalChange, updateView)
  })
</script>

<div class="gtd-view">
    <Sidebar state={state} plugin={plugin}></Sidebar>
    <table class="gtd-table">
        <thead>
        <tr>
            <th></th>
            <th>Task</th>
            <th>Note</th>
            <th>Status</th>
        </tr>
        </thead>
        <tbody>
        {#each state.tasks as task}
            <tr onclick={() => toggleSidebar(task)}>
                <td class="gtd-table-checkbox">
                    <Checkbox {task}/>
                </td>
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
                <td>{task.status}</td>
            </tr>
        {/each}
        </tbody>
    </table>
</div>
