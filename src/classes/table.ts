import { debounce } from 'obsidian'
import moment from 'moment'
import { debug } from '../functions'
import type TaskZeroPlugin from '../main'
import type { TaskRow } from './task.svelte'

const SYNC_FOLDER = '_taskzero'

type DeviceFileData = {
  appId: string
  deviceId: string
  rows: TaskRow[]
}

export class Database {
  #plugin: TaskZeroPlugin
  #rows: TaskRow[] = []
  #loaded = false
  readonly #saveDb: () => void

  constructor (plugin: TaskZeroPlugin) {
    this.#plugin = plugin

    // Set up debounce for database write to disk
    this.#saveDb = debounce(() => {
      void this.#writeDeviceFile()
    }, 3000)
  }

  /**
   * Async load step: read this device's sync file, or migrate from the legacy
   * data.json rows if no device file exists yet.
   */
  async load () {
    const path = this.#filePath()
    const adapter = this.#plugin.app.vault.adapter
    try {
      if (await adapter.exists(path)) {
        const contents = await adapter.read(path)
        const data = JSON.parse(contents) as DeviceFileData
        this.#rows = Array.isArray(data.rows) ? data.rows : []
      } else {
        // Legacy migration: copy rows out of settings.database.tasks.rows
        const legacy = this.#plugin.settings.database.tasks
        this.#rows = Array.isArray(legacy?.rows) ? [...legacy.rows] : []
      }
    } catch (e) {
      debug('Failed to load device file, starting empty', e)
      this.#rows = []
    }

    this.#migrateLegacyIds()
    this.#backfillSyncMetadata()
    this.#loaded = true

    // Persist the initial state so the device file exists going forward
    await this.#writeDeviceFile()
  }

  #filePath () {
    return `${SYNC_FOLDER}/db-${this.#plugin.deviceId}.json`
  }

  async #ensureFolder () {
    const adapter = this.#plugin.app.vault.adapter
    if (!(await adapter.exists(SYNC_FOLDER))) {
      await adapter.mkdir(SYNC_FOLDER)
    }
  }

  async #writeDeviceFile () {
    if (!this.#loaded) return
    try {
      await this.#ensureFolder()
      const data: DeviceFileData = {
        appId: this.#plugin.app.appId,
        deviceId: this.#plugin.deviceId,
        rows: this.#rows
      }
      await this.#plugin.app.vault.adapter.write(this.#filePath(), JSON.stringify(data, null, 2))
    } catch (e) {
      debug('Failed to write device file', e)
    }
  }

  #migrateLegacyIds () {
    for (const row of this.#rows) {
      if (typeof row.id === 'number') row.id = String(row.id)
      if (typeof row.parent === 'number') {
        row.parent = row.parent === 0 ? '' : String(row.parent)
      }
    }
  }

  #backfillSyncMetadata () {
    const now = Date.now()
    const deviceId = this.#plugin.deviceId
    for (const row of this.#rows) {
      if (row.updatedAt === undefined) row.updatedAt = now
      if (row.updatedBy === undefined) row.updatedBy = deviceId
    }
  }

  /**
   * Compare two rows ignoring sync-metadata fields that are managed by
   * the write methods themselves.
   */
  #fieldsMatch (a: TaskRow, b: TaskRow) {
    return Object.keys(a).every(key =>
      key === 'updatedAt' || key === 'updatedBy' || a[key] === b[key])
  }

  #stampWrite (data: TaskRow) {
    data.updatedAt = Date.now()
    data.updatedBy = this.#plugin.deviceId
  }

  rows () {
    return this.#rows
  }

  getRow (id: string) {
    if (id) return this.#rows.find(row => row.id === id)
  }

  /**
   * Generate the next task id for this device: `<deviceId><n>` where n is
   * the highest existing numeric suffix among this device's tasks, plus 1.
   */
  #nextTaskId (): string {
    const deviceId = this.#plugin.deviceId
    let max = 0
    for (const row of this.#rows) {
      if (typeof row.id !== 'string' || !row.id.startsWith(deviceId)) continue
      const suffix = row.id.slice(deviceId.length)
      if (!/^\d+$/.test(suffix)) continue
      const num = parseInt(suffix, 10)
      if (num > max) max = num
    }
    return deviceId + (max + 1)
  }

  insert (data: TaskRow) {
    if (data.id) {
      debug('Insert should not include a row ID', data)
      return null
    } else {
      data.id = this.#nextTaskId()
      this.#stampWrite(data)
      this.#rows.push(data)
      this.#saveDb()
      return data
    }
  }

  /**
   * Update an existing row. Returns the row if anything changed; null if
   * the id wasn't found or no fields differ.
   */
  update (data: TaskRow) {
    if (!data.id) return null
    const index = this.#rows.findIndex(x => x.id === data.id)
    if (index === -1) return null
    const existing = this.#rows[index]
    if (this.#fieldsMatch(existing, data)) return null
    this.#stampWrite(data)
    this.#rows[index] = data
    this.#saveDb()
    return data
  }

  /**
   * Upsert a row with a specific id: update if the id exists, otherwise
   * insert with that id (preserving any caller-supplied `created`).
   */
  upsert (data: TaskRow) {
    if (!data.id) return null
    const index = this.#rows.findIndex(x => x.id === data.id)
    if (index === -1) {
      if (!data.created) data.created = moment().format()
      this.#stampWrite(data)
      this.#rows.push(data)
      this.#saveDb()
      return data
    }
    const existing = this.#rows[index]
    if (!this.#fieldsMatch(existing, data)) {
      this.#stampWrite(data)
      this.#rows[index] = data
      this.#saveDb()
    }
    return data
  }

  /**
   * Insert with auto-generated id (when data.id is empty) or upsert with the given id.
   */
  insertOrUpdate (data: TaskRow) {
    return data.id ? this.upsert(data) : this.insert(data)
  }

  delete (id: string) {
    const index = this.#rows.findIndex(x => x.id === id)
    if (index !== -1) {
      this.#rows.splice(index, 1)
      debug('Deleted task ' + id)
      this.#saveDb()
    }
  }
}
