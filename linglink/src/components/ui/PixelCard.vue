<script setup lang="ts">
defineProps<{
  title?: string
  subtitle?: string
}>()
</script>

<template>
  <article class="pixel-card pixel-box">
    <header v-if="title || subtitle || $slots.aside" class="pixel-card__header">
      <div class="pixel-card__heading">
        <h2 v-if="title" class="pixel-card__title">{{ title }}</h2>
        <p v-if="subtitle" class="pixel-card__subtitle pixel-text-muted">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.aside" class="pixel-card__aside">
        <slot name="aside" />
      </div>
    </header>
    <div class="pixel-card__body">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="pixel-card__footer">
      <slot name="footer" />
    </footer>
  </article>
</template>

<style scoped>
.pixel-card {
  padding: 1.15rem 1.15rem 1.05rem;
}

.pixel-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.pixel-card__heading {
  min-width: 0;
  flex: 1 1 auto;
}

.pixel-card__aside {
  flex: 0 0 auto;
}

.pixel-card__title {
  margin: 0 0 0.3rem;
  font-size: var(--pixel-font-size-sm);
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.3;
}

.pixel-card__subtitle {
  margin: 0;
  font-size: var(--pixel-font-size-xs);
  line-height: 1.5;
}

.pixel-card__footer {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--pixel-border);
}
</style>
