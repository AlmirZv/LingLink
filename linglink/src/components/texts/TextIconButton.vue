<script setup lang="ts">
withDefaults(
  defineProps<{
    name:
      | 'like'
      | 'dislike'
      | 'save'
      | 'comment'
      | 'words'
      | 'edit'
      | 'hide'
      | 'show'
      | 'delete'
      | 'close'
      | 'back'
      | 'supplement'
      | 'reply'
      | 'send'
    label: string
    caption?: string
    active?: boolean
    tone?: 'like' | 'dislike' | 'danger'
    count?: number
    disabled?: boolean
  }>(),
  { active: false, tone: undefined, count: undefined, disabled: false },
)
</script>

<template>
  <button
    class="icon-btn"
    :class="{
      'icon-btn--caption': Boolean(caption),
      'icon-btn--like': active && tone !== 'dislike' && tone !== 'danger',
      'icon-btn--dislike': active && tone === 'dislike',
      'icon-btn--danger': tone === 'danger',
    }"
    type="button"
    :aria-label="label"
    :title="label"
    :disabled="disabled"
  >
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        v-if="name === 'like'"
        d="M8 13.2S3.2 9.8 3.2 6.7C3.2 5.1 4.4 4 5.8 4c.9 0 1.6.4 2.2 1.2C8.6 4.4 9.3 4 10.2 4c1.4 0 2.6 1.1 2.6 2.7 0 3.1-4.8 6.5-4.8 6.5z"
        :fill="active ? 'currentColor' : 'none'"
        stroke="currentColor"
        stroke-width="1.3"
      />
      <g
        v-else-if="name === 'dislike'"
        transform="scale(0.667)"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linejoin="round"
        stroke-linecap="round"
      >
        <path
          d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"
          :fill="active ? 'currentColor' : 'none'"
        />
        <path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
      </g>
      <path
        v-else-if="name === 'save'"
        d="M4 2.2h8v11.4L8 11.1 4 13.6V2.2z"
        :fill="active ? 'currentColor' : 'none'"
        stroke="currentColor"
        stroke-width="1.3"
        stroke-linejoin="round"
      />
      <path
        v-else-if="name === 'comment'"
        d="M3 3.2h10v7.2H6.2L3 12.8V3.2z"
        fill="none"
        stroke="currentColor"
        stroke-width="1.3"
        stroke-linejoin="round"
      />
      <g v-else-if="name === 'words'" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round">
        <path d="M8 3v10M3 8h10" />
      </g>
      <path
        v-else-if="name === 'edit'"
        d="M11.2 1.8l3 3L5.8 13.2 2.2 14l.8-3.6L11.2 1.8z"
        fill="none"
        stroke="currentColor"
        stroke-width="1.3"
        stroke-linejoin="round"
      />
      <g v-else-if="name === 'hide'" fill="none" stroke="currentColor" stroke-width="1.3">
        <path d="M1 8s2.6-4.5 7-4.5S15 8 15 8s-2.6 4.5-7 4.5S1 8 1 8z" />
        <path d="M3 13L13 3" />
      </g>
      <g v-else-if="name === 'show'" fill="none" stroke="currentColor" stroke-width="1.3">
        <path d="M1 8s2.6-4.5 7-4.5S15 8 15 8s-2.6 4.5-7 4.5S1 8 1 8z" />
        <circle cx="8" cy="8" r="1.7" fill="currentColor" stroke="none" />
      </g>
      <path
        v-else-if="name === 'delete'"
        d="M3.5 4.5h9M6 4.5V3h4v1.5M5 4.5l.6 8.2h4.8L11 4.5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.3"
        stroke-linejoin="round"
      />
      <g
        v-else-if="name === 'close'"
        fill="none"
        stroke="currentColor"
        stroke-width="1.3"
        stroke-linecap="round"
      >
        <path d="M4.2 4.2l7.6 7.6M11.8 4.2L4.2 11.8" />
      </g>
      <path
        v-else-if="name === 'back'"
        d="M9.5 3.2L4.5 8l5 4.8M5 8h7"
        fill="none"
        stroke="currentColor"
        stroke-width="1.3"
        stroke-linejoin="round"
      />
      <path
        v-else-if="name === 'supplement'"
        d="M8 3v10M3 8h10"
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
      />
      <path
        v-else-if="name === 'reply'"
        d="M6 4.2H3.2V8M3.4 4.5l4.8 4.2H13"
        fill="none"
        stroke="currentColor"
        stroke-width="1.3"
        stroke-linejoin="round"
      />
      <path
        v-else
        d="M3 8h9M8.5 4.2L12.2 8 8.5 11.8"
        fill="none"
        stroke="currentColor"
        stroke-width="1.3"
        stroke-linejoin="round"
      />
    </svg>
    <span v-if="caption" class="icon-btn__caption">{{ caption }}</span>
    <span v-if="count !== undefined" class="icon-btn__count">{{ count }}</span>
  </button>
</template>

<style scoped>
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  min-width: 2.35rem;
  height: 2.35rem;
  padding: 0 0.4rem;
  border: 1px solid var(--pixel-border);
  border-radius: var(--pixel-radius-pill);
  background: var(--pixel-bg);
  color: var(--pixel-text-muted);
  box-shadow: none;
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 600;
}

.icon-btn--caption {
  min-width: 0;
  padding: 0 0.6rem;
  gap: 0.3rem;
}

.icon-btn__caption {
  line-height: 1;
  white-space: nowrap;
}

.icon-btn svg {
  width: 1rem;
  height: 1rem;
  display: block;
}

.icon-btn--like {
  color: var(--pixel-accent);
}

.icon-btn--dislike,
.icon-btn--danger {
  color: var(--pixel-danger);
}

.icon-btn:not(:disabled):active {
  filter: var(--pixel-press-filter);
}

.icon-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.icon-btn__count {
  line-height: 1;
}
</style>
