<script lang="ts">
  import { type TaskRow, TaskStatus } from '../../classes/task'

  interface Props {
    row: TaskRow
  }

  let { row }: Props = $props()
</script>

<input type="checkbox" checked={row.status === TaskStatus.Complete} class="task-list-item-checkbox">
