<script setup lang="ts">
import { useId } from 'vue'

const gradientId = useId()
const shadowId = useId()
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 512 512"
    role="img"
    aria-label="Atomic Habit Tracker logo"
  >
    <defs>
      <linearGradient :id="gradientId" x1="96" y1="96" x2="416" y2="416" gradientUnits="userSpaceOnUse">
        <stop offset="0" style="stop-color: var(--ui-color-primary-700)" />
        <stop offset="1" style="stop-color: var(--ui-color-primary-400)" />
      </linearGradient>
      <filter :id="shadowId" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity="0.18" />
      </filter>
    </defs>

    <g fill="none" :stroke="`url(#${gradientId})`" stroke-width="22" stroke-linecap="round">
      <ellipse cx="256" cy="256" rx="178" ry="112" />
      <ellipse cx="256" cy="256" rx="178" ry="112" transform="rotate(60 256 256)" />
      <ellipse cx="256" cy="256" rx="178" ry="112" transform="rotate(-60 256 256)" />
    </g>

    <g :filter="`url(#${shadowId})`">
      <circle cx="256" cy="256" r="72" fill="#0b1220" opacity="0.96" />
      <circle cx="256" cy="256" r="72" :fill="`url(#${gradientId})`" opacity="0.14" />
    </g>

    <path
      d="M226 264l18 18 44-54"
      fill="none"
      :stroke="`url(#${gradientId})`"
      stroke-width="22"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
