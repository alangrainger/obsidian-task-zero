import { debounce } from 'obsidian'
import { TaskChangeEvent } from './tasks'
import moment from 'moment'
import { debug } from '../functions'
import type DoPlugin from '../main'

export enum Tablename {
  TASKS = 'tasks'
}

interface BaseRow {
  [key: string]: any

  id: number
  created: string
}

interface Data<R> {
  autoincrement: number;
  rows: R[]
}

export class Table<R extends BaseRow> {
  plugin: DoPlugin
  name: string
  data: Data<R>
  dataChanged: Event
  initialised = false

  /**
   * Save data to disk. This function is debounced.
   */
  saveDb: () => void

  constructor (plugin: DoPlugin, name: Tablename) {
    this.plugin = plugin
    this.name = name
    this.dataChanged = new Event(TaskChangeEvent)

    // Load data
    this.data = this.plugin.settings.database[name] as unknown as Data<R>

    // Double-check the autoincrement
    const existing = Math.max(...this.data.rows.map(x => x.id)) || 0
    this.data.autoincrement = Math.max(this.data.autoincrement, existing + 1)

    // Set up debounce for database write to disk
    this.saveDb = debounce(async () => {
      dispatchEvent(this.dataChanged)
      await this.plugin.saveSettings()
    }, 3000)
  }

  rows () {
    return this.data.rows
  }

  getRow (id: number) {
    if (id) return this.data.rows.find(row => row.id === id)
  }

  private getAutoincrementId () {
    const id = this.data.autoincrement
    this.data.autoincrement++
    return id
  }

  insert (data: R) {
    if (data.id) {
      debug('Insert should not include a row ID', data)
      return null
    } else {
      data.id = this.getAutoincrementId()
      this.data.rows.push(data)
      this.saveDb()
      return data
    }
  }

  /**
   * Update a row
   * @param data
   */
  update (data: R) {
    if (!data.id) return null
    // Update the autoincrement in case of imported or manually edited tasks
    this.data.autoincrement = Math.max(this.data.autoincrement, data.id + 1)
    const index = this.data.rows.findIndex(x => x.id === data.id)
    if (index !== -1) {
      // Existing row found with this ID
      const existing = this.data.rows[index]
      // Don't update if the data is the same
      if (Object.keys(data).every(key => existing[key] === data[key])) {
        return null
      }
      this.data.rows[index] = data
    } else {
      // A task with this ID was not found in the database
      data.created = moment().format()
      this.data.rows.push(data)
    }
    this.saveDb()
    return data
  }

  /**
   * Insert or Update a row
   */
  insertOrUpdate (data: R) {
    if (data.id) {
      this.update(data)
      return data
    } else {
      return this.insert(data)
    }
  }

  delete (id: number) {
    const index = this.data.rows.findIndex(x => x.id === id)
    if (index !== -1) {
      this.data.rows.splice(index, 1)
      debug('Deleted task ' + id)
      this.saveDb()
    }
  }
}
