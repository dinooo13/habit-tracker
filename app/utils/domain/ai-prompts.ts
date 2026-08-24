import type { Habit } from '~/types/app-data'

/**
 * Deterministic AI prompt builders extracted from `settings.vue` (issue #69).
 *
 * Both take their variable inputs as arguments (rather than reading `todayDateKey()`
 * or a store snapshot internally) so they are pure and directly unit-testable. The
 * page passes `todayDateKey()` / `habitsStore.snapshot()` at the call site.
 */

/**
 * Build the "getting started" prompt that guides an AI assistant to interview the
 * user and emit an import-ready habits JSON. `today` seeds the default `startDate`.
 */
export function buildGettingStartedPrompt(today: string): string {
  return `You are my habit setup assistant for a habit-tracker app.

Goal:
- Ask me short, practical questions to design a starter habit list.
- Ask one question at a time and wait for my answer.
- Keep going until you have enough data for each habit.

Required fields for each habit:
- name: short habit title
- type: "build" or "break"
- identityStatement: identity-based statement in first person
- scheduleWeekdays: array of weekday numbers (0=Sun, 1=Mon, ... 6=Sat)
- reminderTime: "HH:mm" 24-hour string or null
- startDate: "YYYY-MM-DD" (default to ${today} if I do not specify)
- archived: boolean (default false)
- pauses: array of { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } ranges when the habit is paused (default [])

Constraints:
- Only return habits that are specific and realistic.
- Prefer 3 to 7 habits unless I ask for more.
- Keep naming concise.
- If any detail is missing, ask me before generating output.

Output format:
- After questions are complete, generate a downloadable file named "habits-import.json".
- The file content must be ONLY valid JSON.
- If file download is not possible in this chat, then show ONLY valid JSON in one code block as fallback.
- JSON shape must be:
{
  "habits": [
    {
      "name": "string",
      "type": "build|break",
      "identityStatement": "string",
      "scheduleWeekdays": [1,2,3],
      "reminderTime": "HH:mm or null",
      "startDate": "YYYY-MM-DD",
      "archived": false,
      "pauses": [{ "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }]
    }
  ]
}`.trim()
}

/**
 * Build the "refine my current habits" prompt, embedding a JSON snapshot of the
 * provided habits so an AI assistant can propose edits while keeping existing ids.
 */
export function buildCurrentHabitsPrompt(habits: Habit[]): string {
  const currentHabitsJson = JSON.stringify(
    {
      habits: habits.map(habit => ({
        id: habit.id,
        name: habit.name,
        type: habit.type,
        identityStatement: habit.identityStatement,
        scheduleWeekdays: habit.scheduleWeekdays,
        reminderTime: habit.reminderTime,
        startDate: habit.startDate,
        archived: habit.archived,
        pauses: habit.pauses,
      })),
    },
    null,
    2,
  )

  return `You are helping me refine my existing habits for a habit-tracker app.

Instructions:
- Review the current habits JSON I provide below.
- Ask clarifying questions before making changes.
- Propose better habit wording, schedules, and reminders if useful.
- Keep existing ids so the app can update matching habits.
- You may add new habits with new ids when needed.
- Final output should be a downloadable file named "habits-import.json".
- The file content must be only valid JSON in the same shape.
- If file download is not possible in this chat, then return only valid JSON in one code block.

Output format:
{
  "habits": [
    {
      "id": "existing-or-new-id",
      "name": "string",
      "type": "build|break",
      "identityStatement": "string",
      "scheduleWeekdays": [1,2,3],
      "reminderTime": "HH:mm or null",
      "startDate": "YYYY-MM-DD",
      "archived": false,
      "pauses": [{ "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }]
    }
  ]
}

Current habits JSON:
\`\`\`json
${currentHabitsJson}
\`\`\`
`.trim()
}
