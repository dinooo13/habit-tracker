// SEC-16: lightweight, client-side security event log scaffold.
//
// This is intentionally minimal: a bounded in-memory ring buffer plus a
// `console` sink. There is **no network transmission and no persistence** — the
// app is local-first with no backend, so events live only for the current
// session. It exists so that security-relevant actions (auth, import/export,
// deletion, validation failures, storage problems) have a single, structured
// emission point that can be inspected in devtools or wired to richer sinks
// later. See issue #1 (SEC-16) and ADR-0010.

export type SecurityEventLevel = 'info' | 'warn' | 'error'

export type SecurityEventType =
  | 'auth.login'
  | 'auth.logout'
  | 'session.expired'
  | 'data.import'
  | 'data.export'
  | 'data.delete'
  | 'data.validation_failed'
  | 'storage.quota_low'
  | 'storage.write_failed'
  | 'pwa.update.available'
  | 'pwa.update.applied'

export interface SecurityEvent {
  ts: string
  type: SecurityEventType
  level: SecurityEventLevel
  detail?: string
}

// Cap the buffer so a long-lived session can't grow it without bound.
export const SECURITY_LOG_CAPACITY = 200

const buffer: SecurityEvent[] = []

function consoleSink(event: SecurityEvent): void {
  const message = `[security] ${event.type}${event.detail ? ` — ${event.detail}` : ''}`
  if (event.level === 'error') {
    console.error(message)
  } else if (event.level === 'warn') {
    console.warn(message)
  } else {
    console.info(message)
  }
}

/**
 * Record a security event. Appends to the in-memory ring buffer (dropping the
 * oldest entry past {@link SECURITY_LOG_CAPACITY}) and emits to the console.
 */
export function recordSecurityEvent(
  type: SecurityEventType,
  level: SecurityEventLevel = 'info',
  detail?: string
): SecurityEvent {
  const event: SecurityEvent = {
    ts: new Date().toISOString(),
    type,
    level,
    ...(detail ? { detail } : {})
  }

  buffer.push(event)
  while (buffer.length > SECURITY_LOG_CAPACITY) {
    buffer.shift()
  }

  consoleSink(event)

  return event
}

/** A copy of the recent events, oldest first. */
export function recentSecurityEvents(): SecurityEvent[] {
  return [...buffer]
}

/** Clear the buffer. Exposed for tests. */
export function clearSecurityLog(): void {
  buffer.length = 0
}
