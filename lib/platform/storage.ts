export function getStoredValue(key: string) {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage.getItem(key)
}

export function setStoredValue(key: string, value: string) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(key, value)
}

export function getStoredBoolean(key: string, fallback = false) {
  const rawValue = getStoredValue(key)

  if (rawValue === null) {
    return fallback
  }

  return rawValue === 'true'
}

export function setStoredBoolean(key: string, value: boolean) {
  setStoredValue(key, String(value))
}
