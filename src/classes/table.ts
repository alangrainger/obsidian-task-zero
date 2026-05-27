import { debounce } from 'obsidian'
import moment from 'moment'
import { debug } from '../functions'
import type TaskZeroPlugin from '../main'
import type { TaskRow } from './task.svelte'

const PLUGIN_FOLDER = '_taskzero'
const DEVICE_FILE_RE = /^_taskzero\/db-[a-z]{2}\.json$/

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

    this.#saveDb = debounce(() => {
      void this.writeOwnFile()
    }, 3000)
  }

  /**
   * Async startup: load this device's sync file (or migrate from legacy
   * settings rows), then merge in all other device files we can see.
   */
  async load () {
    await this.#loadOwnFile()
    await this.#loadOtherDeviceFiles()

    this.#migrateLegacyIds()
    this.#backfillSyncMetadata()
    this.#loaded = true

    // Persist initial state so the file exists and is filtered correctly
    await this.writeOwnFile()
  }

  async #loadOwnFile () {
    const path = this.ownFilePath()
    const adapter = this.#plugin.app.vault.adapter
    try {
      if (await adapter.exists(path)) {
        const contents = await adapter.read(path)
        const data = JSON.parse(contents) as DeviceFileData

        // Collision detection — file claims to be ours but another device
        // wrote it. Re-roll our deviceId and start fresh; the file we just
        // read now belongs to that other device and its rows will come in
        // via #loadOtherDeviceFiles().
        if (data.appId && data.appId !== this.#plugin.app.appId) {
          debug(`Device ID collision on db-${this.#plugin.deviceId}.json; regenerating deviceId`)
          this.#plugin.regenerateDeviceId()
          this.#rows = []
          return
        }

        this.#rows = Array.isArray(data.rows) ? data.rows : []
      } else {
        // First run after upgrade — migrate from legacy settings.database.tasks.rows
        const legacy = this.#plugin.settings.database.tasks
        this.#rows = Array.isArray(legacy?.rows) ? [...legacy.rows] : []
      }
    } catch (e) {
      debug('Failed to load own device file', e)
      this.#rows = []
    }
  }

  async #loadOtherDeviceFiles () {
    const adapter = this.#plugin.app.vault.adapter
    if (!(await adapter.exists(PLUGIN_FOLDER))) return

    const ownPath = this.ownFilePath()
    try {
      const list = await adapter.list(PLUGIN_FOLDER)
      for (const file of list.files) {
        if (file === ownPath) continue
        if (!DEVICE_FILE_RE.test(file)) continue
        await this.#mergeFile(file)
      }
    } catch (e) {
      debug('Failed to list device files', e)
    }
  }

  /**
   * Read a single device file and merge its rows in-memory using per-task LWW.
   * Returns true if anything changed.
   */
  async mergeFile (path: string): Promise<boolean> {
    return this.#mergeFile(path)
  }

  async #mergeFile (path: string): Promise<boolean> {
    try {
      const contents = await this.#plugin.app.vault.adapter.read(path)
      const data = JSON.parse(contents) as DeviceFileData
      return this.#mergeRows(data.rows || [])
    } catch (e) {
      debug('Failed to read device file ' + path, e)
      return false
    }
  }

  #mergeRows (incoming: TaskRow[]): boolean {
    let changed = false
    for (const row of incoming) {
      const index = this.#rows.findIndex(r => r.id === row.id)
      if (index === -1) {
        this.#rows.push(row)
        changed = true
      } else {
        const existing = this.#rows[index]
        if (this.#isNewer(row, existing)) {
          this.#rows[index] = row
          changed = true
        }
      }
    }
    return changed
  }

  /**
   * Is `a` a newer version of the same task than `b`? Per-task LWW by
   * updatedAt, tiebreak by updatedBy lexicographic.
   */
  #isNewer (a: TaskRow, b: TaskRow): boolean {
    const at = a.updatedAt || 0
    const bt = b.updatedAt || 0
    if (at !== bt) return at > bt
    return (a.updatedBy || '') > (b.updatedBy || '')
  }

  ownFilePath () {
    return `${PLUGIN_FOLDER}/db-${this.#plugin.deviceId}.json`
  }

  isDeviceFile (path: string): boolean {
    return DEVICE_FILE_RE.test(path)
  }

  isOwnFile (path: string): boolean {
    return path === this.ownFilePath()
  }

  async #ensureFolder () {
    const adapter = this.#plugin.app.vault.adapter
    if (!(await adapter.exists(PLUGIN_FOLDER))) {
      await adapter.mkdir(PLUGIN_FOLDER)
    }
  }

  /**
   * Write this device's file. Only includes rows where updatedBy === my
   * deviceId — every task lives in exactly one device file (its current
   * owner's file). Ownership transfers naturally on edit.
   */
  async writeOwnFile () {
    if (!this.#loaded) return
    try {
      await this.#ensureFolder()
      const myDeviceId = this.#plugin.deviceId
      const myRows = this.#rows.filter(r => r.updatedBy === myDeviceId)
      const data: DeviceFileData = {
        appId: this.#plugin.app.appId,
        deviceId: myDeviceId,
        rows: myRows
      }
      await this.#plugin.app.vault.adapter.write(this.ownFilePath(), JSON.stringify(data, null, 2))
    } catch (e) {
      debug('Failed to write own device file', e)
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

  /**
   * Insert a row from another device's namespace whose authoritative version
   * hasn't synced yet. The caller pre-fills `updatedBy`/`updatedAt` with low
   * placeholder values so that when the real db file arrives, its row wins on
   * LWW merge. We do NOT call `#stampWrite` here, and we don't write the file
   * either (the row's `updatedBy` won't match our deviceId filter anyway).
   */
  insertSpeculative (data: TaskRow): TaskRow | null {
    if (!data.id) return null
    if (this.#rows.findIndex(x => x.id === data.id) !== -1) return null
    if (!data.created) data.created = moment().format()
    this.#rows.push(data)
    return data
  }

  delete (id: string) {
    const index = this.#rows.findIndex(x => x.id === id)
    if (index !== -1) {
      this.#rows.splice(index, 1)
      debug('Deleted task ' + id)
      this.#saveDb()
    }
  }

  /**
   * Mark an in-memory row as orphaned. Stamps it with our deviceId/now so the
   * orphan state propagates to other devices via LWW, and triggers a debounced
   * save so it persists to disk even if no other write happens.
   *
   * `update()` can't be used here because callers typically pass the same row
   * reference that's already in #rows — fieldsMatch would see them as equal
   * (same object) and skip the save.
   */
  markOrphaned (row: TaskRow, now: number) {
    row.orphaned = now
    this.#stampWrite(row)
    this.#saveDb()
  }
}
