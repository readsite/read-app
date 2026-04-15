import { Preferences } from '@capacitor/preferences'

let memoryStore = new Map()
let kvStoreReady = false

export async function initKeyValueStore() {
  // 从 Capacitor Preferences 加载所有数据
  try {
    const { keys } = await Preferences.keys()
    for (const key of keys) {
      const { value } = await Preferences.get({ key })
      if (value) {
        memoryStore.set(key, JSON.parse(value))
      }
    }
  } catch (err) {
    console.warn('Failed to load from Preferences', err)
  }
  kvStoreReady = true
}

export function getItem(key, defaultValue = null) {
  if (!kvStoreReady) {
    console.warn('KV store not ready')
    return defaultValue
  }
  return memoryStore.has(key) ? memoryStore.get(key) : defaultValue
}

export async function setItem(key, value) {
  memoryStore.set(key, value)
  if (kvStoreReady) {
    try {
      await Preferences.set({ key, value: JSON.stringify(value) })
    } catch (err) {
      console.warn('Failed to save to Preferences', err)
    }
  }
}

export async function removeItem(key) {
  memoryStore.delete(key)
  if (kvStoreReady) {
    try {
      await Preferences.remove({ key })
    } catch (err) {
      console.warn('Failed to remove from Preferences', err)
    }
  }
}

export async function clearAll() {
  memoryStore.clear()
  if (kvStoreReady) {
    try {
      await Preferences.clear()
    } catch (err) {
      console.warn('Failed to clear Preferences', err)
    }
  }
}

export async function migrateFromLocalStorage() {
  // Capacitor 环境没有 localStorage，跳过
  if (memoryStore.size > 0) return
}