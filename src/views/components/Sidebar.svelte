<script lang="ts">
  import { slide } from 'svelte/transition'
  import type { State } from '../view-types'
  import type { TaskScopes } from '../task-view'
  import type { Task } from '../../classes/task.svelte'

  interface Props {
    state: State;
    scopes: TaskScopes;
    activeTask: Task;
  }

  let { state, scopes, activeTask }: Props = $props()

  $effect(() => {
    if (state.sidebar.open) {
      scopes.tasklist.disable()
      scopes.sidebar.enable()
    } else {
      scopes.sidebar.disable()
      scopes.tasklist.enable()
    }
  })

  const updateDb = () => {
    activeTask.update()
  }
</script>

{#if state.sidebar.open && activeTask}
    <aside transition:slide={{ duration: 300, axis: 'x' }} class="gtd-sidebar">
        <!-- Sidebar content -->
        <div class="setting-item">
            <div class="setting-item-name">Task</div>
            <!--<div class="setting-item-description"></div>-->
            <input bind:this={state.sidebar.fields.text} type="text" spellcheck="false" bind:value={activeTask.text}
                   oninput={updateDb}>
        </div>
        <div class="setting-item">
            <select class="dropdown">
                <option value="">Next action</option>
                <option value="">Project</option>
                <option value="">Someday</option>
            </select>
        </div>
    </aside>
{/if}
