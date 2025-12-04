import { App, type Modifier, Scope } from 'obsidian'
import TaskZeroPlugin from '../main'

type Hotkey = {
  key: string,
  modifiers: Modifier[]
}

type HotkeyConfig = [Hotkey, callback: () => void]

export class KeymapScope {
  private readonly app: App
  private readonly plugin: TaskZeroPlugin
  readonly scope: Scope
  private isActive = false

  constructor (plugin: TaskZeroPlugin, parent: Scope) {
    this.plugin = plugin
    this.app = plugin.app
    this.scope = new Scope(parent)
  }

  enable () {
    if (!this.isActive) {
      this.isActive = true
      this.app.keymap.pushScope(this.scope)
    }
  }

  disable () {
    if (this.isActive) {
      this.isActive = false
      this.app.keymap.popScope(this.scope)
    }
  }

  addHotkey (...[hotkey, callback]: HotkeyConfig) {
    this.scope.register(hotkey.modifiers, hotkey.key, _ => {
      this.plugin.userActivity.updateActivity() // Since we preventDefault
      callback()
      // Return false to preventDefault
      return false
    })
  }

  /**
   * Adds an array of hotkey configurations
   */
  addHotkeys (hotkeys: HotkeyConfig[]) {
    hotkeys.forEach(hotkey => this.addHotkey(...hotkey))
  }
}
