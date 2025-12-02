import { moment as momentModule } from 'obsidian'
import type { TaskRow } from './classes/task.svelte'
import { type App, TFile } from 'obsidian'
import type { MarkdownTaskElements } from './classes/markdown-task-parser'
import type { Moment } from 'moment'

/*
This is a fix for moment Typescript error when imported from Obsidian:

TS2349: This expression is not callable.
Type typeof moment has no call signatures.

I could not resolve the issue in any other way. I believe the issue comes
when adding Svelte to the sample plugin. I checked other plugin templates
using Svelte and they had the same issue. For example
https://github.com/StevenStavrakis/obsidian-plugin-svelte-template

I do not have the skill or knowledge to solve this problem.
 */
export const moment = momentModule.default || momentModule

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
  for (const source of sources) {
    if (!source) continue
    for (const key in source) {
      if (source[key]) {
        target[key] = source[key]
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
