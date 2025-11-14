<script lang="ts">
  import { type Task, TaskStatus } from '../../classes/task.svelte'

  interface Props {
    task: Task
  }

  let { task }: Props = $props()

  function toggle(event: Event) {
    event.stopPropagation();
    task.toggle()
    task.update()
  }
</script>

<input type="checkbox" checked={task.status === TaskStatus.Complete} onclick={toggle} class="task-list-item-checkbox">
