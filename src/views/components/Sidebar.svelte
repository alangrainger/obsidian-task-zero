<script lang="ts">
  import { slide } from 'svelte/transition'
  import { Setting, debounce } from 'obsidian'
  import type { Task } from '../../classes/task'

  let sidebarEl: HTMLElement
  let isOpen = true
  export let task: Task | undefined

  // TODO: change debounce to timeout after all edits finished
  const setText = debounce((task: Task, event: Event) => {
    // Task text is required - cannot be blank
    const target = event.target as HTMLInputElement
    if (target.value) {
      task.text = target.value
      task.update()
    }
  }, 4000)

  const toggleSidebar = () => isOpen = !isOpen
</script>

<button on:click={toggleSidebar}>Toggle Sidebar</button>

{#if isOpen && task}
    <aside bind:this={sidebarEl} transition:slide={{ duration: 300, axis: 'x' }} class="gtd-sidebar">
        <!-- Sidebar content -->
        <div class="setting-item" style="display:block;">
            <div class="setting-item-name">Task</div>
            <!--<div class="setting-item-description"></div>-->
            <input type="text" spellcheck="false" value="{task.text}" on:input={(event) => { setText(task, event) }}>
        </div>
    </aside>
{/if}
