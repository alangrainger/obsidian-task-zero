<script lang="ts">
  import type { Task } from '../../classes/task.svelte'

  interface Props {
    task: Task;
    icon?: Boolean;
  }

  let { task, icon }: Props = $props()

  let href = $derived(task?.path?.replace(/\.md$/, ''))
  let text = $derived(icon ? '📄' : task?.basename || '')

  function openLink (event: MouseEvent) {
    event.stopPropagation()
    if (task?.path) void task.openLink()
  }
</script>

{#if task?.path}
    <a onclick="{openLink}" {href} class="internal-link" title="{task.basename}">{text}</a>
{/if}
