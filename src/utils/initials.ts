/**
 * Initials for an nldd-avatar. NLDD derives them from `name` itself, but takes
 * any first character, so "Ontwikkelaar (dev)" would show "O(". Only words that
 * start with a letter count here.
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => /^\p{L}/u.test(w))
  if (!words.length) return '?'
  const first = words[0][0]
  const last = words.length > 1 ? words[words.length - 1][0] : ''
  return (first + last).toUpperCase()
}
