// import { moment as momentModule } from 'obsidian'
import type { TaskRow } from './classes/task.svelte'
import moment, { type Moment } from 'moment'

// Fix for moment Typescript error when imported from Obsidian:
// "Type typeof moment has no call signatures"
// export const moment = ((momentModule as any).default || momentModule)

export function debug (message: string) {
  if (process.env.NODE_ENV === 'development') console.log(message)
}

export function assignExisting (
  target: TaskRow,
  ...sources: (Partial<TaskRow> | undefined)[]
): TaskRow {
  for (const source of sources) {
    if (!source) continue
    for (const key in source) {
      if (source[key]) {
        target[key] = source[key] as TaskRow[Extract<keyof TaskRow, string>]
      }
    }
  }
  return target
}

export function fromNow (date?: Moment): string {
  if (!date?.isValid()) return ''
  const hours = moment().endOf('day').diff(date, 'hours')
  if (hours <= 24) return 'Today'
  if (hours <= 48) return 'Yesterday'
  return date.fromNow()
}
