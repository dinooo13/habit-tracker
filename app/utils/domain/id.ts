// Optional-typed view of the global crypto so feature detection doesn't collapse
// the always-present members of `Crypto` during narrowing.
type MaybeCrypto = {
  randomUUID?: () => string
  getRandomValues?: (array: Uint8Array) => Uint8Array
}

export function createId(prefix: string): string {
  const cryptoObj: MaybeCrypto = typeof crypto !== 'undefined' ? crypto : {}

  if (typeof cryptoObj.randomUUID === 'function') {
    return `${prefix}_${cryptoObj.randomUUID()}`
  }

  // crypto.getRandomValues has broader support than randomUUID, so prefer it over
  // the non-cryptographic Math.random fallback where available (issue #1, SEC-04).
  if (typeof cryptoObj.getRandomValues === 'function') {
    const bytes = cryptoObj.getRandomValues(new Uint8Array(10))
    return `${prefix}_${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`
  }

  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}
