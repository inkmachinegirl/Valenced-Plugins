import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { useEffect, useMemo, useState } from 'react'
import { Image, ScrollView, View } from 'react-native'
import { installBanner, installGuard, installNicknames } from './chat'
import { DmEditor, openEditor } from './editor'
import { bump, patchLists, refreshLists } from './list'
import { installNameEmoji } from './namerow'
import { installPreview, previewStatus } from './preview'
import { installSheet } from './sheet'
import {
	bindSettings,
	channel,
	DEFAULTS,
	dmData,
	GROUP_DM,
	lastActive,
	nameOf,
	onChange,
	PALETTE,
	recipientOf,
	setFeature,
	setSettings,
	settings,
	user,
} from './state'
import { allTabs, installTabs, moveTab, showTab, tabKey } from './tabs'
import { installEmptyText } from './empty'
import { Chip } from './ui'
import type { Features, Settings } from './state'

const FEATURES: [string, [keyof Features, string, string?][]][] = [
	[
		'DM list',
		[
			[
				'tabs',
				'Tabs',
				'All/DMs, Unread, Friends, Pinned and one per label, above your DMs.',
			],
			[
				'groupTab',
				'Separate Groups tab',
				'Group DMs get their own tab; the first tab shows 1-on-1 DMs.',
			],
			['pins', 'Pin to top', 'Pinned DMs stay at the top.'],
		],
	],
	[
		'On each DM row',
		[
			['colors', 'Colour tags'],
			['labels', 'Labels'],
			['emoji', 'Emoji badges'],
			['groupLook', 'Group DM look', '👥 with the member count.'],
			[
				'unread',
				'Unread emphasis',
				'A bubble with the mention count, or a dot.',
			],
			[
				'lastActive',
				'Last active',
				'Fades DMs you haven’t used in a while (the time shows on the second line).',
			],
			['mutuals', 'Mutual servers', 'Counted from servers this device knows.'],
			['friendMarker', 'Not-a-friend marker'],
			['botLook', 'Bots and apps look', 'Marked 🤖 and dimmed.'],
			['notes', 'Notes preview', 'The first line of your note about them.'],
		],
	],
	[
		'In a DM',
		[
			[
				'banner',
				'Name banner',
				'“To: name” above the message box, in their colour (DMs you customised).',
			],
			['guard', 'Careful chats', 'Asks before sending in DMs marked careful.'],
			['nicknames', 'Private nicknames'],
		],
	],
]

function Avatar({ id }: { id: string }) {
	const c = channel(id)
	let uri = 'https://cdn.discordapp.com/embed/avatars/0.png'
	if (c?.type === GROUP_DM && c.icon)
		uri = `https://cdn.discordapp.com/channel-icons/${id}/${c.icon}.png?size=64`
	else {
		const u = user(recipientOf(c))
		const url = u?.getAvatarURL?.(undefined, 64)
		if (typeof url === 'string' && url.startsWith('http')) uri = url
		else if (u?.avatar)
			uri = `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64`
	}
	const color = dmData(id).color
	return (
		<View
			style={{
				borderRadius: 18,
				borderWidth: color ? 2 : 0,
				borderColor: color,
			}}
		>
			<Image
				source={{ uri }}
				style={{ width: 32, height: 32, borderRadius: 16 }}
			/>
		</View>
	)
}

function conversations(): string[] {
	const S = Stores as any
	const ids: string[] =
		S.PrivateChannelSortStore?.getPrivateChannelIds?.() ?? []
	const all = new Set(ids)
	for (const id of Object.keys(settings().dms)) all.add(id)
	return [...all].filter(id => {
		const t = channel(id)?.type
		return t === 1 || t === GROUP_DM
	})
}

/** Reorder, hide and badge the tabs (shown when Tabs is on). */
function TabSettings() {
	const { Stack, Text, TableRowGroup, TableRow } = Design as any
	const s = settings()
	const hidden = new Set(s.hiddenTabs ?? [])
	const tabs = allTabs()
	const badges: [Settings['tabBadges'], string][] = [
		['every', 'Every tab'],
		['unread', 'Only Unread'],
		['categories', 'Friends, Groups, labels…'],
		['none', 'None'],
	]
	return (
		<Stack spacing={8}>
			<TableRowGroup title="Tabs: order and which to show">
				{tabs.map(([t, label], i) => {
					const shown = !hidden.has(tabKey(t))
					return (
						<TableRow
							key={t}
							label={label}
							subLabel={shown ? undefined : 'Hidden'}
							trailing={
								<View style={{ flexDirection: 'row', alignItems: 'center' }}>
									{i > 0 ? <Chip label="↑" on={false} onPress={() => moveTab(t, -1)} /> : null}
									{i < tabs.length - 1 ? (
										<Chip label="↓" on={false} onPress={() => moveTab(t, 1)} />
									) : null}
									<Chip label={shown ? 'Shown' : 'Hidden'} on={shown} onPress={() => showTab(t, !shown)} />
								</View>
							}
						/>
					)
				})}
			</TableRowGroup>
			<Text variant="text-sm/semibold" color="text-muted">
				Unread counts on tabs
			</Text>
			<ScrollView horizontal showsHorizontalScrollIndicator={false}>
				{badges.map(([mode, label]) => (
					<Chip
						key={mode}
						label={label}
						on={(s.tabBadges ?? 'every') === mode}
						onPress={() => setSettings({ tabBadges: mode })}
					/>
				))}
			</ScrollView>
			<Text variant="text-xs/medium" color="text-muted">
				So one unread DM from a friend isn't counted on All, Unread and Friends at once.
			</Text>
		</Stack>
	)
}

function SettingsPage() {
	const { Stack, Text, TextInput, TableRowGroup, TableRow, TableSwitchRow } =
		Design as any
	const [, tick] = useState(0)
	const [query, setQuery] = useState('')
	const [editing, setEditing] = useState<string>()
	useEffect(() => onChange(() => tick(n => n + 1)), [])
	const s = settings()
	const ids = useMemo(conversations, [])

	if (editing)
		return (
			<ScrollView
				style={{ flex: 1 }}
				contentContainerStyle={{ padding: 16 }}
				keyboardShouldPersistTaps="handled"
			>
				<Stack spacing={16}>
					<TableRowGroup>
						<TableRow label="Back" onPress={() => setEditing(undefined)} />
					</TableRowGroup>
					<DmEditor id={editing} />
				</Stack>
			</ScrollView>
		)

	const q = query.trim().toLowerCase()
	const shown = ids
		.filter(
			id =>
				!q ||
				nameOf(channel(id)).toLowerCase().includes(q) ||
				(dmData(id).label ?? '').toLowerCase().includes(q),
		)
		.sort(
			(a, b) =>
				Number(Object.keys(dmData(b)).length > 0) -
					Number(Object.keys(dmData(a)).length > 0) ||
				lastActive(channel(b)) - lastActive(channel(a)),
		)
		.slice(0, 80)

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ padding: 16 }}
			keyboardShouldPersistTaps="handled"
		>
			<Stack spacing={24}>
				<Text variant="text-sm/medium" color="text-muted">
					Long-press a DM and choose DM options, or pick one below, to set its
					colour, label, emoji, pin, careful mode and nickname.
				</Text>
				{FEATURES.map(([title, rows]) => (
					<TableRowGroup key={title} title={title}>
						{rows.map(([key, label, sub]) => (
							<TableSwitchRow
								key={key}
								label={label}
								subLabel={sub}
								value={s.features[key]}
								onValueChange={(v: boolean) => {
									setFeature(key, v)
									bump()
									refreshLists()
								}}
							/>
						))}
					</TableRowGroup>
				))}
				{s.features.tabs ? <TabSettings /> : null}
				<Stack spacing={8}>
					<Text variant="text-sm/semibold" color="text-muted">
						Unread colour
					</Text>
					<ScrollView horizontal showsHorizontalScrollIndicator={false}>
						{PALETTE.map(([hex, name]) => (
							<Chip
								key={hex}
								label={name}
								color={hex}
								on={s.unreadColor === hex}
								onPress={() => setSettings({ unreadColor: hex })}
							/>
						))}
					</ScrollView>
					<Text variant="text-sm/semibold" color="text-muted">
						Fade DMs not used for
					</Text>
					<ScrollView horizontal showsHorizontalScrollIndicator={false}>
						{[0, 7, 14, 30, 90, 365].map(days => (
							<Chip
								key={days}
								label={
									days ? (days === 365 ? '1 year' : `${days} days`) : 'Never'
								}
								on={s.fadeAfterDays === days}
								onPress={() => setSettings({ fadeAfterDays: days })}
							/>
						))}
					</ScrollView>
				</Stack>
				<TableRowGroup title="Status">
					<TableRow label="DM row hints" subLabel={previewStatus} />
				</TableRowGroup>
				<TableRowGroup>
					<TableSwitchRow
						label="Hints on a second line"
						subLabel="Under the message preview instead of inside it, with how long ago it was active. May be cut off if your Discord version keeps rows short."
						value={s.extraLine}
						onValueChange={(extraLine: boolean) => setSettings({ extraLine })}
					/>
				</TableRowGroup>
				<Stack spacing={12}>
					<TextInput
						placeholder="Search DMs or labels"
						value={query}
						onChange={setQuery}
						isClearable
					/>
					<TableRowGroup title="Your DMs" hasIcons>
						{shown.map(id => {
							const d = dmData(id)
							const sub = [
								d.customEmoji ? `:${d.customEmoji.name}:` : d.emoji,
								d.label,
								d.pinned && '📌 pinned',
								d.careful && 'careful',
								d.nickname && `“${d.nickname}”`,
							]
								.filter(Boolean)
								.join(' · ')
							return (
								<TableRow
									key={id}
									label={nameOf(channel(id))}
									subLabel={
										sub ||
										(channel(id)?.type === GROUP_DM ? 'Group DM' : undefined)
									}
									icon={<Avatar id={id} />}
									arrow
									onPress={() => setEditing(id)}
								/>
							)
						})}
					</TableRowGroup>
				</Stack>
			</Stack>
		</ScrollView>
	)
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DEFAULTS },
	start({ cleanup, jsonStorage }) {
		bindSettings(
			() => jsonStorage.cache as Settings,
			value => jsonStorage.set(value, true),
		)
		cleanup(
			patchLists(),
			installTabs(),
			installEmptyText(),
			installPreview(),
			installNameEmoji(),
			installBanner(),
			installGuard(),
			installNicknames(),
			installSheet({ enabled: () => true, open: (c: any) => openEditor(c.id) }),
			onChange(() => {
				bump()
				refreshLists()
			}),
		)
		jsonStorage.get().then(() => {
			bump()
			refreshLists()
		})
	},
	SettingsComponent: SettingsPage,
})
