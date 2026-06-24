import {
  recentSecurityEvents,
  recordSecurityEvent,
  type SecurityEvent,
  type SecurityEventLevel,
  type SecurityEventType
} from '~/utils/security-log'

/**
 * SEC-16: thin composable wrapper around the security-log scaffold so callers
 * use the `use*` convention. The underlying buffer is module-level, so this is
 * safe to call from anywhere (stores, plugins, components).
 */
export function useSecurityLog() {
  function logSecurityEvent(
    type: SecurityEventType,
    level: SecurityEventLevel = 'info',
    detail?: string
  ): SecurityEvent {
    return recordSecurityEvent(type, level, detail)
  }

  function recentEvents(): SecurityEvent[] {
    return recentSecurityEvents()
  }

  return {
    logSecurityEvent,
    recentEvents
  }
}
