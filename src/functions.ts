// import { moment as momentModule } from 'obsidian'
import type { TaskRow } from './classes/task.svelte'
import moment, { type Moment } from 'moment'
import { type App, TFile } from 'obsidian'

// Fix for moment Typescript error when imported from Obsidian:
// "Type typeof moment has no call signatures"
// export const moment = ((momentModule as any).default || momentModule)

export function debug (...message: any) {
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
  if (hours <= 24) return 'today'
  if (hours <= 48) return 'yesterday'
  return date.fromNow()
}

export function getTFileFromPath (app: App, path: string): TFile | undefined {
  const tfile = app.vault.getAbstractFileByPath(path)
  return tfile instanceof TFile ? tfile : undefined
}

export async function getOrCreateFile (app: App, path: string): Promise<TFile> {
  if (!path.endsWith('.md')) path += '.md'
  let file = getTFileFromPath(app, path)
  if (!file) {
    // File doesn't exist, so create it
    file = await app.vault.create(path, '')
  }
  return file
}
