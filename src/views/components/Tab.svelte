<script lang="ts">
  import type { State, Tab } from '../view-types'

  interface Props {
    state: State
    tab: Tab
    tabIndex: number
  }

  let { state, tab, tabIndex }: Props = $props()
  let isActive = $derived(state.activeTab === tab.id)
</script>

<div
        onclick={() => state.activeTab = tab.id}
        onkeydown={() => state.activeTab = tab.id}
        class:is-active={isActive}
        class:mod-active={isActive}
        class="workspace-tab-header"
        aria-label={tab.label} role="tab" tabindex={tabIndex}>
    <div class="workspace-tab-header-inner">
        <!--        <div bind:this={iconEl} class="workspace-tab-header-inner-icon"></div>-->
        <div class="workspace-tab-header-inner-title">{tab.label}</div>
    </div>
</div>
