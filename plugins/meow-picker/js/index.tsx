import { Design } from '@valenced/discord/design'
import { useState } from 'react'
import { ScrollView } from 'react-native'
import { chatbarStatus, installChatbar } from './chatbar'
import { inputStatus, patchInput } from './input'
import { TOTAL } from './meows'
import { openPicker, PickerHost, type PickerOptions } from './sheet'

interface Settings {
	button: boolean
	tapSends: boolean
	keepOpen: boolean
	animations: boolean
	size: 'small' | 'medium' | 'large'
	recent: string[]
}
const DEFAULTS: Settings = {
	button: true,
	tapSends: false,
	keepOpen: false,
	animations: true,
	size: 'small',
	recent: [],
}
let storage: any
const settings = (): Settings => ({ ...DEFAULTS, ...(storage?.cache ?? {}) })
const save = (patch: Partial<Settings>) =>
	storage?.set?.({ ...settings(), ...patch }, true)

const options: PickerOptions = {
	recent: () => settings().recent,
	remember: text =>
		save({
			recent: [text, ...settings().recent.filter(t => t !== text)].slice(0, 24),
		}),
	tapSends: () => settings().tapSends,
	keepOpen: () => settings().keepOpen,
	animations: () => settings().animations !== false,
	size: () => settings().size,
}

function SettingsPage() {
	const { Stack, Text, TableRowGroup, TableRow, TableSwitchRow, Button } =
		Design as any
	const [s, setS] = useState(settings)
	const set = (patch: Partial<Settings>) => {
		save(patch)
		setS({ ...s, ...patch })
	}
	return (
		<ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
			<Stack spacing={16}>
				<Text variant="text-md/normal">
					The cat button by the emoji button opens {TOTAL} meows, mrrps, purrs,
					hisses, cat actions and cat kaomoji. Tap one to add it to your
					message, hold one to send it straight away.
				</Text>
				<TableRowGroup title="Options">
					<TableSwitchRow
						label="Cat button in the chat bar"
						value={s.button}
						onValueChange={(button: boolean) => set({ button })}
					/>
					<TableSwitchRow
						label="Tap sends right away"
						subLabel="Instead of adding it to your message"
						value={s.tapSends}
						onValueChange={(tapSends: boolean) => set({ tapSends })}
					/>
					<TableSwitchRow
						label="Keep the picker open"
						subLabel="To pick several in a row"
						value={s.keepOpen}
						onValueChange={(keepOpen: boolean) => set({ keepOpen })}
					/>
					<TableSwitchRow
						label="Animations"
						subLabel="The picker slides up. Turn off for less load: it just appears."
						value={s.animations !== false}
						onValueChange={(animations: boolean) => set({ animations })}
					/>
					<TableRow
						label="Picker size"
						subLabel={
							{
								small: 'Small (like the keyboard)',
								medium: 'Medium',
								large: 'Large',
							}[s.size]
						}
						arrow
						onPress={() =>
							set({
								size:
									s.size === 'small'
										? 'medium'
										: s.size === 'medium'
											? 'large'
											: 'small',
							})
						}
					/>
					<TableRow
						label="Clear recent"
						subLabel={`${s.recent.length} remembered`}
						onPress={() => set({ recent: [] })}
					/>
				</TableRowGroup>
				<TableRowGroup title="Status">
					<TableRow
						label="Chat bar"
						subLabel={
							chatbarStatus.hooked ? 'Hooked' : 'Waiting for a chat to open'
						}
					/>
					<TableRow
						label="Adding to your message"
						subLabel={
							inputStatus.hooked ? 'Ready' : 'Not found yet (it sends instead)'
						}
					/>
				</TableRowGroup>
				{Button ? (
					<Button text="Open the picker" onPress={() => openPicker(options)} />
				) : null}
				<PickerHost />
			</Stack>
		</ScrollView>
	)
}

export default plugin({
	start({ cleanup, jsonStorage }) {
		storage = jsonStorage
		cleanup(
			patchInput(),
			installChatbar({
				onPress: () => openPicker(options),
				enabled: () => settings().button,
			}),
			() => (storage = undefined),
		)
	},
	SettingsComponent: SettingsPage,
})
