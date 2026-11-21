import {
	AlertActionCreators,
	ToastActionCreators,
} from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { RootNavigationRef } from '@valenced/discord/modules/main_tabs_v2'
import { instead } from '@valenced/patcher'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { useEffect, useMemo, useState } from 'react'
import { FlatList, Image, View } from 'react-native'
import { findModule } from './find'
import {
	applyAll,
	fetchCounts,
	loadRole,
	type Person,
	peopleWith,
	type Role,
	rolesOf,
} from './members'
import { subscribeRelationships } from './relationships'

/**
 * Ignore everyone (or some) with a role in a server. Long-press a server → Ignore by role opens
 * this plugin's page for that server: pick a role, its members are loaded the way Discord's role
 * settings load them, tick who to ignore and confirm. Ignoring goes through Discord's own Ignore
 * (as Block by ID's Ignore button), one person at a time.
 */

const ID = 'dev.ketsuyumi.ignore-by-role'
const CONTEXT_MENU =
	'design/components/ContextMenu/native/ContextMenuState.native.tsx'
const S = () => Stores as any
const toast = (text: string) =>
	(ToastActionCreators as any).open('ignore-by-role', { text })

/** The server the long-press menu opened the page for. */
let preset: string | undefined

let running = false
let cancel = false

function useStoreTick(stores: any[]): number {
	const [n, tick] = useState(0)
	useEffect(() => {
		const fn = () => tick(x => x + 1)
		for (const s of stores) s?.addChangeListener?.(fn)
		const off = subscribeRelationships(fn)
		return () => {
			for (const s of stores) s?.removeChangeListener?.(fn)
			off()
		}
	}, [])
	return n
}

function Avatar({ url }: { url?: string }) {
	return url ? (
		<Image
			source={{ uri: url }}
			style={{ width: 32, height: 32, borderRadius: 16 }}
		/>
	) : (
		<View
			style={{
				width: 32,
				height: 32,
				borderRadius: 16,
				backgroundColor: '#5865f2',
			}}
		/>
	)
}

function GuildPicker({ onPick }: { onPick: (id: string) => void }) {
	const { TableRowGroup, TableRow } = Design as any
	const guilds = Object.values<any>(S().GuildStore?.getGuilds?.() ?? {}).sort(
		(a, b) => String(a.name).localeCompare(String(b.name)),
	)
	return (
		<TableRowGroup title="Pick a server">
			{guilds.map(g => (
				<TableRow
					key={g.id}
					label={g.name}
					arrow
					onPress={() => onPick(g.id)}
				/>
			))}
		</TableRowGroup>
	)
}

function RolePicker({
	guildId,
	onPick,
}: {
	guildId: string
	onPick: (r: Role) => void
}) {
	const { TableRowGroup, TableRow } = Design as any
	useStoreTick([
		S().GuildRoleMemberCountStore,
		S().GuildRoleStore,
		S().GuildStore,
	])
	useEffect(() => fetchCounts(guildId), [guildId])
	const roles = rolesOf(guildId)
	return (
		<TableRowGroup title="Pick a role">
			{roles.map(r => (
				<TableRow
					key={r.id}
					label={r.name}
					subLabel={r.count !== undefined ? `${r.count} members` : undefined}
					icon={
						<View
							style={{
								width: 14,
								height: 14,
								borderRadius: 7,
								backgroundColor: r.color ?? '#99aab5',
							}}
						/>
					}
					arrow
					onPress={() => onPick(r)}
				/>
			))}
		</TableRowGroup>
	)
}

function Members({ guildId, role }: { guildId: string; role: Role }) {
	const { Stack, Text, TableCheckboxRow, Button, TextInput } = Design as any
	const tick = useStoreTick([S().GuildMemberStore, S().UserStore])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string>()
	const [picked, setPicked] = useState<Set<string>>(new Set())
	const [query, setQuery] = useState('')
	const [progress, setProgress] = useState<string>()
	useEffect(() => {
		setLoading(true)
		loadRole(guildId, role.id).then(e => {
			setError(e)
			// Members arrive over the gateway a moment after the request.
			setTimeout(() => setLoading(false), 1500)
		})
	}, [guildId, role.id])
	const people = useMemo(
		() => peopleWith(guildId, role.id),
		[guildId, role.id, tick],
	)
	const shown = useMemo(() => {
		const q = query.trim().toLowerCase()
		return q
			? people.filter(
					p =>
						p.name.toLowerCase().includes(q) ||
						p.username.toLowerCase().includes(q),
				)
			: people
	}, [people, query])
	const toggle = (id: string) =>
		setPicked(prev => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	const chosen = people.filter(p => picked.has(p.id))
	const toIgnore = chosen.filter(p => !p.ignored)
	const toUnignore = chosen.filter(p => p.ignored)

	const run = (ignore: boolean) => {
		const list = (ignore ? toIgnore : toUnignore).map(p => p.id)
		if (!list.length || running) return
		const { AlertModal, AlertActionButton } = Design as any
		;(AlertActionCreators as any).openAlert(
			'ignore-by-role',
			<AlertModal
				title={`${ignore ? 'Ignore' : 'Unignore'} ${list.length} ${list.length === 1 ? 'person' : 'people'}?`}
				content={
					ignore
						? `Their messages will be hidden and their notifications muted, everywhere (Discord's Ignore). It takes about ${Math.ceil((list.length * 1.3) / 60)} min.`
						: `They will no longer be ignored. It takes about ${Math.ceil((list.length * 1.3) / 60)} min.`
				}
				actions={
					<>
						<AlertActionButton
							text={ignore ? 'Ignore' : 'Unignore'}
							variant={ignore ? 'destructive' : 'primary'}
							onPress={async () => {
								running = true
								cancel = false
								setProgress(`0 / ${list.length}`)
								const r = await applyAll(
									list,
									ignore,
									(d, f) =>
										setProgress(
											`${d + f} / ${list.length}${f ? ` · ${f} failed` : ''}`,
										),
									() => cancel,
								)
								running = false
								setProgress(undefined)
								setPicked(new Set())
								toast(
									`${ignore ? 'Ignored' : 'Unignored'} ${r.done}${r.failed ? `, ${r.failed} failed (${r.lastError})` : ''}`,
								)
							}}
						/>
						<AlertActionButton text="Cancel" variant="secondary" />
					</>
				}
			/>,
		)
	}

	const header = (
		<Stack spacing={10} style={{ paddingBottom: 10 }}>
			<Text variant="heading-md/bold" style={{ color: role.color }}>
				{role.name}
			</Text>
			<Text variant="text-sm/medium" color="text-muted">
				{loading
					? 'Loading members…'
					: error
						? `Showing the members Discord has loaded (${error})`
						: `${people.length} members${role.count && role.count > people.length ? ` of ${role.count} loaded` : ''}`}
			</Text>
			{TextInput ? (
				<TextInput
					placeholder="Search"
					value={query}
					onChange={setQuery}
					isClearable
				/>
			) : null}
			<View style={{ flexDirection: 'row', gap: 8 }}>
				<View style={{ flex: 1 }}>
					<Button
						text="Select all"
						size="sm"
						variant="secondary"
						onPress={() => setPicked(new Set(shown.map(p => p.id)))}
					/>
				</View>
				<View style={{ flex: 1 }}>
					<Button
						text="Clear"
						size="sm"
						variant="secondary"
						onPress={() => setPicked(new Set())}
					/>
				</View>
			</View>
			{progress ? (
				<View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
					<Text variant="text-md/semibold" style={{ flex: 1 }}>
						Working… {progress}
					</Text>
					<Button
						text="Stop"
						size="sm"
						variant="secondary"
						onPress={() => (cancel = true)}
					/>
				</View>
			) : (
				<View style={{ flexDirection: 'row', gap: 8 }}>
					<View style={{ flex: 1 }}>
						<Button
							text={`Ignore ${toIgnore.length}`}
							variant="destructive"
							disabled={!toIgnore.length}
							onPress={() => run(true)}
						/>
					</View>
					{toUnignore.length ? (
						<View style={{ flex: 1 }}>
							<Button
								text={`Unignore ${toUnignore.length}`}
								variant="secondary"
								onPress={() => run(false)}
							/>
						</View>
					) : null}
				</View>
			)}
		</Stack>
	)

	return (
		<FlatList
			data={shown}
			keyExtractor={(p: Person) => p.id}
			ListHeaderComponent={header}
			contentContainerStyle={{ padding: 16 }}
			initialNumToRender={20}
			windowSize={7}
			renderItem={({ item: p }: { item: Person }) => (
				<TableCheckboxRow
					label={p.name}
					subLabel={[
						p.username && `@${p.username}`,
						p.bot && 'bot',
						p.ignored && 'Ignored',
					]
						.filter(Boolean)
						.join(' · ')}
					icon={<Avatar url={p.avatar} />}
					checked={picked.has(p.id)}
					value={p.id}
					onPress={() => toggle(p.id)}
				/>
			)}
			ListEmptyComponent={
				loading ? null : (
					<Text variant="text-md/medium" color="text-muted">
						Nobody with this role is loaded.
					</Text>
				)
			}
		/>
	)
}

function Page() {
	const { Button } = Design as any
	const [guildId, setGuild] = useState<string | undefined>(() => {
		const p = preset
		preset = undefined
		return p
	})
	const [role, setRole] = useState<Role>()
	const back = role
		? () => setRole(undefined)
		: guildId
			? () => setGuild(undefined)
			: undefined
	return (
		<View style={{ flex: 1 }}>
			{back ? (
				<View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
					<Button
						text={role ? '← Roles' : '← Servers'}
						size="sm"
						variant="secondary"
						onPress={back}
					/>
				</View>
			) : null}
			{!guildId ? (
				<FlatList
					data={[0]}
					renderItem={() => (
						<View style={{ padding: 16 }}>
							<GuildPicker onPick={setGuild} />
						</View>
					)}
				/>
			) : !role ? (
				<FlatList
					data={[0]}
					renderItem={() => (
						<View style={{ padding: 16 }}>
							<RolePicker guildId={guildId} onPick={setRole} />
						</View>
					)}
				/>
			) : (
				<Members guildId={guildId} role={role} />
			)}
		</View>
	)
}

function openFor(guildId: string) {
	preset = guildId
	try {
		;(RootNavigationRef.getRootNavigationRef() as any).navigate('settings', {
			screen: ID,
		})
	} catch {
		toast('Open Ignore by Role from Settings → Plugins')
	}
}

export default plugin({
	start({ cleanup }) {
		cleanup(
			findModule(CONTEXT_MENU, ['showContextMenu'], (mod: any) => {
				if (typeof mod?.showContextMenu !== 'function') return
				cleanup(
					instead(
						mod,
						'showContextMenu',
						function (this: unknown, args: any[], orig: (...a: any[]) => any) {
							try {
								const menu = args[0]
								const id = menu?.key
								if (
									Array.isArray(menu?.items) &&
									typeof id === 'string' &&
									/^\d{5,}$/.test(id) &&
									S().GuildStore?.getGuild?.(id) &&
									!menu.items.some((i: any) => i?.ignoreByRole)
								)
									menu.items.push({
										ignoreByRole: true,
										IconComponent:
											lookupGeneratedIconComponent('UserMinusIcon' as any) ??
											lookupGeneratedIconComponent('EyeSlashIcon' as any),
										label: 'Ignore by role',
										action: () => setTimeout(() => openFor(id), 300),
									})
							} catch {}
							return orig.apply(this, args)
						},
					),
				)
			}),
			() => {
				cancel = true
			},
		)
	},
	SettingsComponent: Page,
})
