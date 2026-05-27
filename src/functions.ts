import { moment as momentModule } from 'obsidian'
import type { TaskRow } from './classes/task.svelte'
import { type App, TFile } from 'obsidian'
import type { MarkdownTaskElements } from './classes/markdown-task-parser'

/*
 Obsidian's TypeScript declaration types `moment` with the type of the moment
 module namespace (`typeof Moment` from `import * as Moment from 'moment'`),
 which TypeScript considers non-callable. At runtime it IS the callable
 moment function. The `.default || ` fallback handles either shape (bundlers
 sometimes wrap CJS exports under `.default`).
*/
export const moment = momentModule.default || momentModule
export type Moment = ReturnType<typeof moment>

export const debug: { (...message: unknown[]): void, enabled: boolean } = Object.assign(
  function (...message: unknown[]) {
    if (debug.enabled) console.debug(...message)
  },
  { enabled: false }
)

export function assignExisting (
  target: TaskRow,
  ...sources: (TaskRow | MarkdownTaskElements | undefined)[]
): TaskRow {
  const dst = target as unknown as Record<string, unknown>
  for (const source of sources) {
    if (!source) continue
    for (const [key, value] of Object.entries(source)) {
      if (value !== undefined && value !== null) {
        dst[key] = value
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

export async function getOrCreateFile (app: App, path: string): Promise<TFile> {
  if (!path.endsWith('.md')) path += '.md'
  let file = app.vault.getFileByPath(path)
  if (!file) {
    // File doesn't exist, so create it
    file = await app.vault.create(path, '')
  }
  return file
}
