/**
 * A list with `item` in it or out of it, as a checkbox reports. Returns the
 * same array when nothing changes, so callers can skip a write.
 *
 * Set, never toggle: nldd-checkbox-field fires `change` twice per click (its
 * own event plus the inner nldd-checkbox's, bubbling up), so a handler that
 * flips state undoes itself. Both events carry the same `detail.checked`.
 */
export function withChecked<T>(list: readonly T[], item: T, checked: boolean): T[] {
  const has = list.includes(item)
  if (checked === has) return list as T[]
  return checked ? [...list, item] : list.filter((x) => x !== item)
}
