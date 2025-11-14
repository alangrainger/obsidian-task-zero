<script lang="ts">
  import { slide } from 'svelte/transition'
  import type { State } from '../view-types'
  import type DoPlugin from '../../main'

  interface Props {
    state: State;
    plugin: DoPlugin;
  }

  let { state, plugin }: Props = $props()

  let activeTask = $derived(state.tasks.find(x => x.id === state.activeId))

  const updateDb = () => {
    console.log('Updating DB from sidebar')
    activeTask.update()
  }

  const toggleSidebar = () => state.sidebar.open = !state.sidebar.open
</script>

<button onclick={toggleSidebar}>Toggle Sidebar</button>

{#if state.sidebar.open && activeTask}
    <aside bind:this={state.sidebar.element} transition:slide={{ duration: 300, axis: 'x' }} class="gtd-sidebar">
        <!-- Sidebar content -->
        <div class="setting-item" style="display:block;">
            <div class="setting-item-name">Task</div>
            <!--<div class="setting-item-description"></div>-->
            <input type="text" spellcheck="false" bind:value={activeTask.text} oninput={updateDb}>
            <p>{activeTask.text}</p>
        </div>
    </aside>
{/if}
