const DB_NAME = 'ReadAppDB'
const DB_VERSION = 3
const READ_STATUS_STORE = 'readStatus'
const POSTS_STORE = 'posts'
const DATES_LIST_STORE = 'datesList'
const KEY_VALUE_STORE = 'keyValue'
const CACHE_TTL = 24 * 60 * 60 * 1000

let db = null

export function openReadDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db)
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(READ_STATUS_STORE)) {
        db.createObjectStore(READ_STATUS_STORE, { keyPath: 'date' })
      }
      if (!db.objectStoreNames.contains(POSTS_STORE)) {
        db.createObjectStore(POSTS_STORE, { keyPath: 'date' })
      }
      if (!db.objectStoreNames.contains(DATES_LIST_STORE)) {
        db.createObjectStore(DATES_LIST_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(KEY_VALUE_STORE)) {
        db.createObjectStore(KEY_VALUE_STORE, { keyPath: 'key' })
      }
    }
  })
}

export async function getCachedPost(date) {
  const database = await openReadDB()
  return new Promise((resolve) => {
    const tx = database.transaction([POSTS_STORE], 'readonly')
    const store = tx.objectStore(POSTS_STORE)
    const request = store.get(date)
    request.onsuccess = () => {
      const record = request.result
      if (record && (Date.now() - record.cachedAt) < CACHE_TTL) {
        resolve(record.data)
      } else {
        resolve(null)
      }
    }
    request.onerror = () => resolve(null)
  })
}

export async function cachePost(date, data) {
  const database = await openReadDB()
  const record = {
    date: date,
    data: data,
    cachedAt: Date.now()
  }
  const tx = database.transaction([POSTS_STORE], 'readwrite')
  const store = tx.objectStore(POSTS_STORE)
  store.put(record)
  return new Promise(resolve => { tx.oncomplete = resolve })
}

export async function fetchPostFromNetwork(date) {
  const API_BASE = 'https://solitudenook.top'
  const response = await fetch(`${API_BASE}/api/posts/${date}`)
  if (!response.ok) throw new Error('No data')
  return await response.json()
}

export async function getCachedDatesList() {
  const database = await openReadDB()
  return new Promise((resolve) => {
    const tx = database.transaction([DATES_LIST_STORE], 'readonly')
    const store = tx.objectStore(DATES_LIST_STORE)
    const request = store.get('dates')
    request.onsuccess = () => {
      const record = request.result
      if (record && (Date.now() - record.cachedAt) < CACHE_TTL) {
        resolve(record.dates)
      } else {
        resolve(null)
      }
    }
    request.onerror = () => resolve(null)
  })
}

export async function cacheDatesList(dates) {
  const database = await openReadDB()
  const record = {
    id: 'dates',
    dates: dates,
    cachedAt: Date.now()
  }
  const tx = database.transaction([DATES_LIST_STORE], 'readwrite')
  const store = tx.objectStore(DATES_LIST_STORE)
  store.put(record)
  return new Promise(resolve => { tx.oncomplete = resolve })
}

export async function getDateReadStatus(date) {
  const database = await openReadDB()
  return new Promise((resolve) => {
    const tx = database.transaction([READ_STATUS_STORE], 'readonly')
    const store = tx.objectStore(READ_STATUS_STORE)
    const request = store.get(date)
    request.onsuccess = () => {
      const record = request.result
      if (record) {
        resolve({
          music: record.music || false,
          sentence: record.sentence || false,
          article: record.article || false
        })
      } else {
        resolve({ music: false, sentence: false, article: false })
      }
    }
    request.onerror = () => resolve({ music: false, sentence: false, article: false })
  })
}

export async function updateReadStatus(date, type, value) {
  if (!date) return
  const database = await openReadDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction([READ_STATUS_STORE], 'readwrite')
    const store = tx.objectStore(READ_STATUS_STORE)
    const getRequest = store.get(date)
    getRequest.onsuccess = () => {
      const record = getRequest.result || { date: date, music: false, sentence: false, article: false }
      if (record[type] === value) {
        resolve()
        return
      }
      record[type] = value
      store.put(record)
      resolve()
    }
    getRequest.onerror = reject
  })
}