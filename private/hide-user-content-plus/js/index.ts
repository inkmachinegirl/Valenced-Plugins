import SettingsPage from './components/SettingsPage'
import { patchMessageHiding } from './patches/messageHiding'
import { patchUserContextMenu } from './patches/userContextMenu'
import { resetTransientMessageState } from './state'
import { bindSettingsStorage, DEFAULT_SETTINGS } from './storage'
import type { PluginSettings } from './types'

export default plugin<{ jsonStorage: PluginSettings }>({
  jsonStorage: {
    load: true,
    default: DEFAULT_SETTINGS,
  },

  async start(api) {
    bindSettingsStorage(api.jsonStorage)
    await api.jsonStorage.get()

    api.cleanup(
      patchUserContextMenu(),
      patchMessageHiding(),
      () => resetTransientMessageState(),
    )
  },

  stop() {
    resetTransientMessageState()
  },

  SettingsComponent: SettingsPage,
})
