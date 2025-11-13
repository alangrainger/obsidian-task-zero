<script lang="ts">
  import { createEventDispatcher } from 'svelte'

  export let checked = false
  const dispatch = createEventDispatcher()

  function toggle () {
    checked = !checked
    dispatch('update', checked)
  }
</script>

<input type="checkbox" {checked} on:click={toggle} class="task-list-item-checkbox">
