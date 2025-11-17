import { EventEmitter } from 'events'
import { debug } from '../functions'

export enum DatabaseEvent {
  TasksExternalChange = 'do:tasks-external-change',
  TasksChanged = 'do:tasks-changed'
}

class DatabaseEventEmitter extends EventEmitter {
  private static instance: DatabaseEventEmitter

  private constructor () {
    super()
  }

  static getInstance (): DatabaseEventEmitter {
    if (!DatabaseEventEmitter.instance) {
      DatabaseEventEmitter.instance = new DatabaseEventEmitter()
    }
    return DatabaseEventEmitter.instance
  }

  emit<T> (event: DatabaseEvent) {
    debug('Event: ' + event)
    return super.emit(event)
  }
}

export const dbEvents = DatabaseEventEmitter.getInstance()
