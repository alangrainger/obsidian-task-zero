<script lang="ts">
  import NoteLink from './NoteLink.svelte'
  import Checkbox from './Checkbox.svelte'
  import Sidebar from './Sidebar.svelte'

  import { onDestroy, onMount } from 'svelte'
  import type DoPlugin from '../../main'
  import type { Task } from '../../classes/task'
  import { TaskChangeEvent } from '../../classes/tasks'

  export let plugin: DoPlugin
  let rows: Task[] = []
  let activeTask: Task

  function updateView () {
    rows = plugin.tasks.getActiveTasks()
  }

  function updateCheckbox () {
  }

  // Update tasks list when tasks DB changes
  addEventListener(TaskChangeEvent, updateView)

  // Immediately update the tasks list on component mount
  onMount(updateView)

  onDestroy(() => {
    removeEventListener(TaskChangeEvent, updateView)
  })
</script>

<div class="gtd-view">
    <Sidebar task="{activeTask}"></Sidebar>
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
        {#each rows as row}
            <tr on:click="{() => {activeTask = row}}">
                <td class="gtd-table-checkbox">
                    <Checkbox checked="{row.status === 'x'}" on:update="{(event) => { updateCheckbox(row, event.detail) }}"/>
                </td>
                <td class="gtd-table-task">
                    <div class="gtd-table-clip">
                        {row.text}
                    </div>
                </td>
                <td class="gtd-table-note">
                    <div class="gtd-table-clip">
                        <NoteLink app="{plugin.app}" path="{row.path}"/>
                    </div>
                </td>
                <td>{row.status}</td>
            </tr>
        {/each}
        </tbody>
    </table>
</div>
