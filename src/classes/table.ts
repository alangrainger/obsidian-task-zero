import { debounce } from 'obsidian'
import { TaskChangeEvent } from './tasks'
import moment from 'moment'
import { debug } from '../functions'
import type TaskZeroPlugin from '../main'
import type { TaskRow } from './task.svelte'

type Data = {
  rows: TaskRow[]
  autoincrement: number
}

export class Database {
  #plugin: TaskZeroPlugin
  #data: Data
  readonly #dataChanged: Event
  readonly #saveDb: () => void

  constructor (plugin: TaskZeroPlugin) {
    this.#plugin = plugin
    this.#dataChanged = new Event(TaskChangeEvent)

    // Load data
    this.#data = this.#plugin.settings.database.tasks as Data

    // Double-check the autoincrement
    const existing = Math.max(...this.#data.rows.map(x => x.id)) || 0
    this.#data.autoincrement = Math.max(this.#data.autoincrement, existing + 1)

    // Set up debounce for database write to disk
    this.#saveDb = debounce(async () => {
      dispatchEvent(this.#dataChanged)
      await this.#plugin.saveSettings()
    }, 3000)
  }

  rows () {
    return this.#data.rows
  }

  getRow (id: number) {
    if (id) return this.#data.rows.find(row => row.id === id)
  }

  #getAutoincrementId () {
    const id = this.#data.autoincrement
    this.#data.autoincrement++
    return id
  }

  insert (data: TaskRow) {
    if (data.id) {
      debug('Insert should not include a row ID', data)
      return null
    } else {
      data.id = this.#getAutoincrementId()
      this.#data.rows.push(data)
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
    // Update the autoincrement in case of imported or manually edited tasks
    this.#data.autoincrement = Math.max(this.#data.autoincrement, data.id + 1)
    const index = this.#data.rows.findIndex(x => x.id === data.id)
    if (index === -1) return null
    const existing = this.#data.rows[index]
    if (Object.keys(data).every(key => existing[key] === data[key])) return null
    this.#data.rows[index] = data
    this.#saveDb()
    return data
  }

  /**
   * Upsert a row with a specific id: update if the id exists, otherwise
   * insert with that id (preserving any caller-supplied `created`).
   */
  upsert (data: TaskRow) {
    if (!data.id) return null
    this.#data.autoincrement = Math.max(this.#data.autoincrement, data.id + 1)
    const index = this.#data.rows.findIndex(x => x.id === data.id)
    if (index === -1) {
      if (!data.created) data.created = moment().format()
      this.#data.rows.push(data)
      this.#saveDb()
      return data
    }
    const existing = this.#data.rows[index]
    if (!Object.keys(data).every(key => existing[key] === data[key])) {
      this.#data.rows[index] = data
      this.#saveDb()
    }
    return data
  }

  /**
   * Insert with auto-generated id (when data.id is 0) or upsert with the given id.
   */
  insertOrUpdate (data: TaskRow) {
    return data.id ? this.upsert(data) : this.insert(data)
  }

  delete (id: number) {
    const index = this.#data.rows.findIndex(x => x.id === id)
    if (index !== -1) {
      this.#data.rows.splice(index, 1)
      debug('Deleted task ' + id)
      this.#saveDb()
    }
  }
}
