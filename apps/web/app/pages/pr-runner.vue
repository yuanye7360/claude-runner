<script setup lang="ts">
// PR Runner is now integrated into the main pipeline page.
// Redirect to home with PR tab active.
if (import.meta.client) {
  localStorage.setItem('cr-active-feature', 'pr');
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
