<script lang="ts">
  import type { App } from 'obsidian'

  export let path: string
  export let app: App

  $: href = path.replace(/\.md$/, '')
  $: basename = path?.match(/([^/]+).md$/)?.[1] || ''

  function openLink () {
    app.workspace.openLinkText(basename, path).then()
  }
</script>

<a on:click="{openLink}" {href} class="internal-link" title="{basename}">{basename}</a>
