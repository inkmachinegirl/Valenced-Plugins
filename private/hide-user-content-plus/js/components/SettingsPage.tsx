import { Page } from '@valenced/components'
import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import { refreshActiveChannelRows } from '../state'
import { DEFAULT_SETTINGS } from '../storage'
import type { ImageDisplayMode, PluginSettings } from '../types'
import type { PluginApi } from '@valenced/plugins/types'

const { TableRadioGroup, TableRadioRow, TableRowGroup, TableSwitchRow } = Design

export default function SettingsPage({
  api,
}: {
  api: PluginApi<{ jsonStorage: PluginSettings }>
}) {
  const settings = api.jsonStorage.use() ?? DEFAULT_SETTINGS

  const updateSettings = async (patch: Partial<PluginSettings>) => {
    await api.jsonStorage.set(patch)
    refreshActiveChannelRows()
  }

  return (
    <ScrollView style={{ flex: 1 }}>
      <Page>
        <TableRadioGroup
          title="Image Behavior"
          value={settings.imageMode}
          onChange={(value: string) => {
            void updateSettings({ imageMode: value as ImageDisplayMode })
          }}
        >
          <TableRadioRow
            label="Hidden"
            subLabel="Hide images completely until toggled via the message indicator."
            value="hidden"
          />
          <TableRadioRow
            label="Blurred"
            subLabel="Blur images in place until toggled via the message indicator."
            value="blurred"
          />
        </TableRadioGroup>

        <TableRowGroup title="Filtering Scope">
          <TableSwitchRow
            label="Only in NSFW channels"
            subLabel="Apply hiding only inside age-restricted channels."
            value={settings.nsfwOnly}
            onValueChange={(value: boolean) => {
              void updateSettings({ nsfwOnly: value })
            }}
          />
          <TableSwitchRow
            label="Also hide message text"
            subLabel="Cover the entire message block with a spoiler overlay instead of hiding images only."
            value={settings.hideText}
            onValueChange={(value: boolean) => {
              void updateSettings({ hideText: value })
            }}
          />
        </TableRowGroup>
      </Page>
    </ScrollView>
  )
}
