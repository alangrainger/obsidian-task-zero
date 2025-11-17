<script lang="ts">
  import type { Task } from '../../classes/task.svelte'

  interface Props {
    task: Task;
    icon?: Boolean;
  }

  let { task, icon }: Props = $props()

  let href = $derived(task?.path?.replace(/\.md$/, ''))
  let basename = $derived(task?.path?.match(/([^/]+).md$/)?.[1] || '')
  let text = $derived(icon ? '📄' : basename)

  function openLink (event: MouseEvent) {
    event.stopPropagation()
    if (task?.path) task.tasks.app.workspace.openLinkText(basename, task.path).then()
  }
</script>

{#if task?.path}
    <a onclick="{openLink}" {href} class="internal-link" title="{basename}">{text}</a>
{/if}
