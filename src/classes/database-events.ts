import { debug } from '../functions'

export enum DatabaseEvent {
  TasksExternalChange = 'tz:tasks-external-change',
  TasksChanged = 'tz:tasks-changed',
  OpenTasklistView = 'tz:open-tasklist-view',
  TaskToggled = 'tz:task-toggled'
}

type Callback = () => void

class DatabaseEventEmitter {
  private static instance: DatabaseEventEmitter
  private readonly listeners = new Map<DatabaseEvent, Set<Callback>>()

  private constructor () {
    Object.values(DatabaseEvent).forEach(event => this.listeners.set(event, new Set()))
  }

  static getInstance (): DatabaseEventEmitter {
    if (!DatabaseEventEmitter.instance) {
      DatabaseEventEmitter.instance = new DatabaseEventEmitter()
    }
    return DatabaseEventEmitter.instance
  }

  emit (event: DatabaseEvent): void {
    debug('Event: ' + event)
    this.listeners.get(event)?.forEach(callback => callback())
  }

  on (event: DatabaseEvent, callback: Callback): void {
    this.listeners.get(event)?.add(callback)
  }

  off (event: DatabaseEvent, callback: Callback): void {
    this.listeners.get(event)?.delete(callback)
  }

  destroy () {
    this.listeners.forEach(set => set.clear())
  }
}

export const dbEvents = DatabaseEventEmitter.getInstance()
