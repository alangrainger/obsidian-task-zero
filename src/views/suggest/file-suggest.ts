import { AbstractInputSuggest, type App, TFile } from 'obsidian'

export class FileSuggest extends AbstractInputSuggest<TFile> {
  callback: (file: TFile) => void

  constructor (app: App, inputEl: HTMLInputElement, callback: (file: TFile) => void) {
    super(app, inputEl)
    this.callback = callback
  }

  getSuggestions (inputStr: string): TFile[] {
    const lower = inputStr.toLowerCase()
    return this.app.vault.getMarkdownFiles()
      .filter(file => file.path.toLowerCase().contains(lower))
  }

  renderSuggestion (file: TFile, el: HTMLElement): void {
    el.setText(file.path.slice(0, -3))
  }

  selectSuggestion (file: TFile): void {
    this.setValue(file.path)
    this.callback(file)
    this.close()
  }
}
