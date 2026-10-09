/** Tiny IndexedDB key/value store. Falls back to memory during SSR/tests. */
export type Kv = {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
}

const DB_NAME = "studio"
const STORE = "kv"

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE))
        req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function run<T>(
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest<T>
) {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = op(tx.objectStore(STORE))
        tx.oncomplete = () => resolve(req.result)
        tx.onabort = () => reject(tx.error ?? req.error)
        tx.onerror = () => reject(tx.error ?? req.error)
      })
  )
}

function memoryKv(): Kv {
  const map = new Map<string, unknown>()
  return {
    async get<T>(key: string) {
      return map.get(key) as T | undefined
    },
    async set(key, value) {
      map.set(key, value)
    },
  }
}

let browser: Kv | undefined

export function defaultKv(): Kv {
  if (typeof indexedDB === "undefined") return memoryKv()
  browser ??= {
    get: <T>(key: string) =>
      run("readonly", (s) => s.get(key)) as Promise<T | undefined>,
    set: async (key, value) => {
      await run("readwrite", (s) => s.put(value, key))
    },
  }
  return browser
}
