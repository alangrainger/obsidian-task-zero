<script lang="ts">
  import Tab from './Tab.svelte'
  import type { State } from '../view-types'

  interface Props {
    state: State
  }

  let { state }: Props = $props()
</script>

<div class="workspace-tab-header-container">
    <div class="workspace-tab-header-container-inner">
        {#each state.tabs as tab, index}
            <Tab {state} {tab} tabIndex={index}/>
        {/each}
    </div>
</div>
