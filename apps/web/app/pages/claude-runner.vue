<script setup lang="ts">
// Claude Runner is now integrated into the main pipeline page.
// Redirect to home with JIRA tab active.
if (import.meta.client) {
  localStorage.setItem('cr-active-feature', 'jira');
}
navigateTo('/', { replace: true });
</script>

<template>
  <div
    class="flex h-screen items-center justify-center bg-gray-950 text-gray-400"
  >
    正在跳轉...
  </div>
</template>
