const DB_NAME = 'foliate4w-library'
const DB_VERSION = 1
const STORE_NAME = 'books'
const CHANNEL_NAME = 'foliate4w-library'
const SAMPLE_SIZE = 256 * 1024

const requestResult = request => new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true })
    request.addEventListener('error', () => reject(request.error), { once: true })
})

const transactionDone = transaction => new Promise((resolve, reject) => {
    transaction.addEventListener('complete', resolve, { once: true })
    transaction.addEventListener('abort',
        () => reject(transaction.error ?? new Error('Database transaction was aborted')), { once: true })
    transaction.addEventListener('error',
        () => reject(transaction.error ?? new Error('Database transaction failed')), { once: true })
})

const hash = async value => {
    const bytes = value instanceof ArrayBuffer
        ? value
        : value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest), byte =>
        byte.toString(16).padStart(2, '0')).join('')
}

const languageMapValue = value => {
    if (!value) return ''
    if (typeof value === 'string' || typeof value === 'number') return String(value)
    if (Array.isArray(value)) return value.map(languageMapValue).filter(Boolean).join('; ')
    return languageMapValue(value['zh-CN'] ?? value.zh ?? value.en
        ?? value.name ?? Object.values(value)[0])
}

export const normalizeIdentifier = value =>
    languageMapValue(value).trim().replace(/\s+/g, ' ')

export const cloneMetadata = metadata => {
    try {
        return JSON.parse(JSON.stringify(metadata ?? {}))
    } catch {
        return {}
    }
}

export const getBookIdentity = async (file, metadata = {}) => {
    const identifier = normalizeIdentifier(metadata.identifier)
    if (identifier) {
        const digest = await hash(new TextEncoder().encode(identifier))
        return { id: `identifier:${digest}`, identifier, fingerprint: '' }
    }

    const firstEnd = Math.min(file.size, SAMPLE_SIZE)
    const lastStart = Math.max(firstEnd, file.size - SAMPLE_SIZE)
    const [first, last] = await Promise.all([
        file.slice(0, firstEnd).arrayBuffer(),
        file.slice(lastStart, file.size).arrayBuffer(),
    ])
    const size = new BigUint64Array([BigInt(file.size)])
    const bytes = new Uint8Array(size.byteLength + first.byteLength + last.byteLength)
    bytes.set(new Uint8Array(size.buffer), 0)
    bytes.set(new Uint8Array(first), size.byteLength)
    bytes.set(new Uint8Array(last), size.byteLength + first.byteLength)
    const fingerprint = await hash(bytes)
    return { id: `fingerprint:${fingerprint}`, identifier: '', fingerprint }
}

export class LibraryStore extends EventTarget {
    #database
    #channel

    constructor() {
        super()
        this.#channel = 'BroadcastChannel' in globalThis
            ? new BroadcastChannel(CHANNEL_NAME)
            : null
        this.#channel?.addEventListener('message', event => {
            this.dispatchEvent(new CustomEvent('change', { detail: event.data }))
        })
    }

    async open() {
        if (this.#database) return this.#database
        const request = indexedDB.open(DB_NAME, DB_VERSION)
        request.addEventListener('upgradeneeded', () => {
            const database = request.result
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' })
                store.createIndex('lastOpened', 'lastOpened')
                store.createIndex('importedAt', 'importedAt')
            }
        })
        this.#database = await requestResult(request)
        this.#database.addEventListener('versionchange', () => {
            this.#database.close()
            this.#database = null
        })
        return this.#database
    }

    async #store(mode = 'readonly') {
        const database = await this.open()
        const transaction = database.transaction(STORE_NAME, mode)
        return { transaction, store: transaction.objectStore(STORE_NAME) }
    }

    #notify(detail) {
        this.#channel?.postMessage(detail)
        this.dispatchEvent(new CustomEvent('change', { detail }))
    }

    async list() {
        const { store } = await this.#store()
        const records = await requestResult(store.getAll())
        return records.sort((a, b) =>
            String(b.lastOpened ?? b.importedAt).localeCompare(String(a.lastOpened ?? a.importedAt)))
    }

    async get(id) {
        const { store } = await this.#store()
        return requestResult(store.get(id))
    }

    async put(record, notify = true) {
        const { transaction, store } = await this.#store('readwrite')
        store.put(record)
        await transactionDone(transaction)
        if (notify) this.#notify({ type: 'put', id: record.id, modified: record.modified })
        return record
    }

    async patch(id, patch) {
        const record = await this.get(id)
        if (!record) return null
        Object.assign(record, patch, { modified: new Date().toISOString() })
        return this.put(record)
    }

    async remove(id) {
        const { transaction, store } = await this.#store('readwrite')
        store.delete(id)
        await transactionDone(transaction)
        this.#notify({ type: 'remove', id })
    }

    async import(file, inspect) {
        const inspected = await inspect(file)
        const metadata = cloneMetadata(inspected.metadata)
        const identity = await getBookIdentity(file, metadata)
        const existing = await this.get(identity.id)
        let localData = {}
        try {
            localData = JSON.parse(localStorage.getItem(`reader-data:${identity.id}`)) ?? {}
        } catch {
            localData = {}
        }
        const localPosition = localStorage.getItem(`position:${identity.id}`)
        const now = new Date().toISOString()
        const record = {
            id: identity.id,
            identifier: identity.identifier,
            fingerprint: identity.fingerprint,
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size,
            lastModified: file.lastModified || 0,
            sourcePath: file.sourcePath || '',
            cover: inspected.cover ?? existing?.cover ?? null,
            metadata,
            title: inspected.title,
            author: inspected.author,
            description: inspected.description,
            progress: existing?.progress ?? 0,
            position: existing?.position ?? localPosition ?? null,
            annotations: existing?.annotations ?? localData.annotations ?? [],
            bookmarks: existing?.bookmarks ?? localData.bookmarks ?? [],
            importedAt: existing?.importedAt ?? now,
            lastOpened: existing?.lastOpened ?? '',
            modified: now,
        }
        // Desktop builds keep only the original Windows path. If this record
        // came from an older version, importing the original file again also
        // removes the embedded Blob copy.
        if (!record.sourcePath && !globalThis.__TAURI__) record.blob = file
        await this.put(record)
        localStorage.removeItem(`reader-data:${identity.id}`)
        localStorage.removeItem(`position:${identity.id}`)
        return record
    }

    close() {
        this.#channel?.close()
        this.#database?.close()
    }
}
