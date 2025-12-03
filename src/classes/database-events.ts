import { debug } from '../functions'

export enum DatabaseEvent {
  TasksExternalChange = 'tz:tasks-external-change',
  TasksChanged = 'tz:tasks-changed',
  OpenTasklistView = 'tz:open-tasklist-view'
}

class DatabaseEventEmitter {
  private static instance: DatabaseEventEmitter
  private events: { [key: string]: Event } = {}
  private listeners: { event: DatabaseEvent, listener: EventListener }[] = []

  private constructor () {
    Object.values(DatabaseEvent)
      .forEach(event => this.events[event] = new Event(event))
  }

  static getInstance (): DatabaseEventEmitter {
    if (!DatabaseEventEmitter.instance) {
      DatabaseEventEmitter.instance = new DatabaseEventEmitter()
    }
    return DatabaseEventEmitter.instance
  }

  emit (event: DatabaseEvent): void {
    debug('Event: ' + event)
    document.dispatchEvent(this.events[event])
  }

  on (event: DatabaseEvent, callback: () => void): void {
    document.addEventListener(event, () => callback())

    // Store the listener for later removal
    this.listeners.push({ event, listener: () => callback() })
  }

  off (event: DatabaseEvent, callback: () => void): void {
    document.removeEventListener(event, () => callback())
  }

  destroy () {
    this.listeners.forEach(({ event, listener }) =>
      document.removeEventListener(event, listener))
  }
}

export const dbEvents = DatabaseEventEmitter.getInstance()
