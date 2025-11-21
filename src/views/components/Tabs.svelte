<script lang="ts">
  import Tab from './Tab.svelte'

  let tabs = [
    {
      label: '✅ Tasks',
      icon: 'briefcase',
      isActive: false
    },
    {
      label: '💤 Someday',
      icon: 'briefcase',
      isActive: false
    },
    {
      label: '💼 Work',
      icon: 'briefcase',
      isActive: true
    },
    {
      label: '🏠 Home',
      icon: 'house',
      isActive: false
    }
  ]
</script>

<div class="workspace-tab-header-container">
    <div class="workspace-tab-header-container-inner">
        {#each tabs as tab}
            <Tab label={tab.label} icon={tab.icon} isActive={tab.isActive}/>
        {/each}
    </div>
</div>
