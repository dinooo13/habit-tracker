import type {
  AtomicLaw,
  CoachingSuggestion,
  Habit,
  HabitEntry,
  LawDirection,
  MissReasonCode
} from '~/types/app-data'
import { createId } from '~/utils/id'
import { nowIso } from '~/utils/date'

interface AtomicTemplate {
  law: AtomicLaw
  direction: LawDirection
  title: string
  action: string
  rationale: string
}

export const MISS_REASON_LABELS: Record<MissReasonCode, string> = {
  forgot: 'I forgot',
  no_time: 'I had no time',
  low_motivation: 'I lacked motivation',
  too_hard: 'It felt too hard',
  bad_environment: 'My environment worked against me',
  no_immediate_reward: 'There was no quick reward',
  social_pressure: 'Social pressure made it hard',
  other: 'Other'
}

const BUILD_RULES: Record<MissReasonCode, AtomicTemplate[]> = {
  forgot: [
    {
      law: 'obvious',
      direction: 'increase',
      title: 'Attach a visible cue',
      action: 'Link this habit to an existing routine and place a visual trigger where that routine happens.',
      rationale: 'Obvious cues reduce memory load and make the next action easier to start.'
    },
    {
      law: 'obvious',
      direction: 'increase',
      title: 'Use implementation intention',
      action: 'Write: "After I <current routine>, I will <habit> at <location>."',
      rationale: 'Precise context increases follow-through compared to vague intentions.'
    }
  ],
  no_time: [
    {
      law: 'easy',
      direction: 'increase',
      title: 'Shrink to a 2-minute version',
      action: 'Define the smallest possible version that takes under 2 minutes and count that as a win.',
      rationale: 'Lowering activation energy keeps consistency even on busy days.'
    },
    {
      law: 'easy',
      direction: 'increase',
      title: 'Prepare environment in advance',
      action: 'Pre-stage tools tonight so the habit starts with one action tomorrow.',
      rationale: 'Fewer setup steps means less friction at execution time.'
    }
  ],
  low_motivation: [
    {
      law: 'attractive',
      direction: 'increase',
      title: 'Temptation bundling',
      action: 'Pair the habit with something enjoyable you only allow during that habit.',
      rationale: 'Immediate attraction increases the chance of starting.'
    },
    {
      law: 'attractive',
      direction: 'increase',
      title: 'Identity reinforcement',
      action: 'Read your identity statement before starting and track a visible "votes for identity" counter.',
      rationale: 'Identity-based framing improves consistency over outcome-only motivation.'
    }
  ],
  too_hard: [
    {
      law: 'easy',
      direction: 'increase',
      title: 'Reduce difficulty tier',
      action: 'Move one step down in effort today, then ramp up only after three consistent completions.',
      rationale: 'Progressive overload works better after consistency is re-established.'
    },
    {
      law: 'easy',
      direction: 'increase',
      title: 'Use a start ritual',
      action: 'Create a 30-second starter sequence that signals habit start every time.',
      rationale: 'Stable rituals reduce resistance and make execution automatic.'
    }
  ],
  bad_environment: [
    {
      law: 'obvious',
      direction: 'increase',
      title: 'Redesign the environment',
      action: 'Move required tools into sight and remove unrelated distractions from the habit zone.',
      rationale: 'Environment design changes behavior faster than willpower.'
    },
    {
      law: 'easy',
      direction: 'increase',
      title: 'Shorten setup distance',
      action: 'Place all required items within immediate reach of where the habit starts.',
      rationale: 'Distance and setup time are hidden friction costs.'
    }
  ],
  no_immediate_reward: [
    {
      law: 'satisfying',
      direction: 'increase',
      title: 'Add immediate reward',
      action: 'Attach a small immediate reward right after completion (tea, music, checkmark celebration).',
      rationale: 'Immediate satisfaction helps habits survive long-term goals.'
    },
    {
      law: 'satisfying',
      direction: 'increase',
      title: 'Visual progress cue',
      action: 'Use a visible streak board and never miss twice in a row.',
      rationale: 'Visible progress keeps momentum and reduces drop-off.'
    }
  ],
  social_pressure: [
    {
      law: 'attractive',
      direction: 'increase',
      title: 'Join proximity group',
      action: 'Do the habit near people who already do it consistently.',
      rationale: 'Behavior follows social norms and immediate peer context.'
    },
    {
      law: 'satisfying',
      direction: 'increase',
      title: 'Create accountability check',
      action: 'Send one daily completion message to an accountability partner.',
      rationale: 'External accountability increases follow-through when motivation dips.'
    }
  ],
  other: [
    {
      law: 'obvious',
      direction: 'increase',
      title: 'Clarify next action',
      action: 'Rewrite the habit as one concrete action with a specific trigger and location.',
      rationale: 'Specificity prevents ambiguity from becoming inaction.'
    },
    {
      law: 'easy',
      direction: 'increase',
      title: 'Lower the threshold',
      action: 'Set the minimum successful version so small it is hard to skip.',
      rationale: 'Consistency first, intensity second.'
    }
  ]
}

const BREAK_RULES: Record<MissReasonCode, AtomicTemplate[]> = {
  forgot: [
    {
      law: 'obvious',
      direction: 'decrease',
      title: 'Hide cues for bad habit',
      action: 'Remove or hide the first visual cue that usually triggers the bad habit.',
      rationale: 'If the cue is less visible, the routine starts less often.'
    },
    {
      law: 'obvious',
      direction: 'decrease',
      title: 'Disrupt default sequence',
      action: 'Change one early step in the trigger context so autopilot is interrupted.',
      rationale: 'Breaking the sequence weakens automatic behavior loops.'
    }
  ],
  no_time: [
    {
      law: 'easy',
      direction: 'decrease',
      title: 'Add friction barrier',
      action: 'Require one extra effort step before the bad habit is possible.',
      rationale: 'Even small friction can reduce impulsive behaviors.'
    },
    {
      law: 'satisfying',
      direction: 'decrease',
      title: 'Use quick replacement',
      action: 'Define a 60-second replacement action when the urge appears.',
      rationale: 'Substitution works better than suppression under time pressure.'
    }
  ],
  low_motivation: [
    {
      law: 'attractive',
      direction: 'decrease',
      title: 'Reframe the downside',
      action: 'Write one immediate cost of the bad habit and keep it visible near the trigger.',
      rationale: 'Making costs salient reduces perceived attractiveness.'
    },
    {
      law: 'attractive',
      direction: 'decrease',
      title: 'Identity dissonance prompt',
      action: 'Ask: "Would the person I want to become do this right now?"',
      rationale: 'Identity mismatch helps interrupt urges.'
    }
  ],
  too_hard: [
    {
      law: 'easy',
      direction: 'decrease',
      title: 'Increase access effort',
      action: 'Move triggers farther away or add a lock/delay before access.',
      rationale: 'Higher effort decreases frequency of undesirable actions.'
    },
    {
      law: 'satisfying',
      direction: 'decrease',
      title: 'Introduce immediate consequence',
      action: 'Create a small consequence contract for each bad-habit occurrence.',
      rationale: 'Immediate consequences counter immediate gratification.'
    }
  ],
  bad_environment: [
    {
      law: 'obvious',
      direction: 'decrease',
      title: 'Remove triggers from space',
      action: 'Change your environment so the trigger is out of sight and out of reach.',
      rationale: 'Environment redesign is stronger than relying on discipline.'
    },
    {
      law: 'easy',
      direction: 'decrease',
      title: 'Plan escape route',
      action: 'Define a quick exit routine when you enter high-risk contexts.',
      rationale: 'Pre-commitment reduces decisions in weak moments.'
    }
  ],
  no_immediate_reward: [
    {
      law: 'satisfying',
      direction: 'decrease',
      title: 'Track clean-day streak',
      action: 'Use a visible streak board for each day you avoid the bad habit.',
      rationale: 'Visible wins replace the missing immediate reward loop.'
    },
    {
      law: 'satisfying',
      direction: 'decrease',
      title: 'Reward the replacement',
      action: 'Give yourself a small reward every time you choose the healthier alternative.',
      rationale: 'Rewarding the replacement habit accelerates adoption.'
    }
  ],
  social_pressure: [
    {
      law: 'attractive',
      direction: 'decrease',
      title: 'Avoid trigger circles',
      action: 'Limit exposure to social settings where the bad habit is normalized.',
      rationale: 'Norms are powerful; reducing exposure protects consistency.'
    },
    {
      law: 'satisfying',
      direction: 'decrease',
      title: 'Public commitment',
      action: 'State your no-go rule to one trusted person and report daily.',
      rationale: 'Public commitments increase follow-through through accountability.'
    }
  ],
  other: [
    {
      law: 'obvious',
      direction: 'decrease',
      title: 'Identify trigger precisely',
      action: 'Log the context right before each urge and remove the strongest trigger.',
      rationale: 'Specific trigger awareness enables direct intervention.'
    },
    {
      law: 'easy',
      direction: 'decrease',
      title: 'Delay rule',
      action: 'Add a mandatory 10-minute delay before acting on the urge.',
      rationale: 'Delay weakens impulses and creates room for better choices.'
    }
  ]
}

export function generateSuggestionsForMissedEntry(entry: HabitEntry, habit: Habit): CoachingSuggestion[] {
  const reason = entry.missReasonCode ?? 'other'
  const templates = habit.type === 'build' ? BUILD_RULES[reason] : BREAK_RULES[reason]

  return templates.map((template) => ({
    id: createId('suggestion'),
    entryId: entry.id,
    law: template.law,
    direction: template.direction,
    title: template.title,
    action: template.action,
    rationale: template.rationale,
    createdAt: nowIso()
  }))
}
