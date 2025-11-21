<script lang="ts">
  import type { Task } from '../../classes/task.svelte'
  import { setIcon } from 'obsidian'

  interface Props {
    label: string
    isActive: Boolean
    icon: string
  }

  let { isActive, label, icon }: Props = $props()
  let iconEl: HTMLElement

  $effect(() => {
    if (icon) setIcon(iconEl, icon)
  })
</script>

<div class:is-active={isActive} class:mod-active={isActive} class="workspace-tab-header" aria-label={label}>
    <div class="workspace-tab-header-inner">
<!--        <div bind:this={iconEl} class="workspace-tab-header-inner-icon"></div>-->
        <div class="workspace-tab-header-inner-title">{label}</div>
    </div>
</div>
