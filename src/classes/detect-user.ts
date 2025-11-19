export class DetectUser {
  private lastActivityTime = 0
  private activityListeners: (() => void)[] = []

  constructor () {
    // Keyboard events
    const keyHandler = () => this.updateActivity()
    document.addEventListener('keydown', keyHandler)
    this.activityListeners.push(() =>
      document.removeEventListener('keydown', keyHandler)
    )

    // Mouse events
    const mouseHandler = () => this.updateActivity()
    document.addEventListener('click', mouseHandler)
    this.activityListeners.push(() => {
      document.removeEventListener('click', mouseHandler)
    })
  }

  updateActivity () {
    this.lastActivityTime = Date.now()
  }

  /**
   * If the user has performed an action on this device within the last 10 seconds
   * they are considered as being active and using this specific device.
   */
  isActive () {
    return Date.now() - this.lastActivityTime < 10 * 1000
  }

  unload () {
    this.activityListeners.forEach(cleanup => cleanup())
  }
}
