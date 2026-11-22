/**
 * The member list's data (ChannelMemberStore.getProps): `rows` with GROUP headers and MEMBER rows,
 * and `groups` with each header's row `index` and member `count`. Never-talked people get a
 * "Never talked here" status line (a custom-status activity on their row copy), and in servers
 * where they're hidden their rows are dropped and the groups recounted.
 */

export type Answer = 'never' | 'talked' | undefined

const MEMBER = 'MEMBER'
const CUSTOM_STATUS = 4
export const LABEL = 'Never talked here'

function marked(row: any): any {
	const acts: any[] = Array.isArray(row?.activities) ? row.activities : []
	const custom = acts.find(a => a?.type === CUSTOM_STATUS)
	const next = custom
		? acts.map(a =>
				a === custom
					? { ...a, state: a.state ? `${LABEL} · ${a.state}` : LABEL }
					: a,
			)
		: [
				{
					type: CUSTOM_STATUS,
					name: 'Custom Status',
					state: LABEL,
					id: 'never-talked',
				},
				...acts,
			]
	return { ...row, activities: next }
}

export function rework(
	props: any,
	guildId: string,
	answer: (userId: string) => Answer,
	hide: boolean,
	seen: (userId: string) => void,
): any {
	const rows: any[] = props?.rows
	const groups: any[] = props?.groups
	if (!Array.isArray(rows)) return props
	let changed = false
	const keep: any[] = []
	const remap = new Map<number, number>()
	const dropped = new Map<number, number>()
	let currentGroup = -1
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i]
		if (row?.type !== MEMBER) {
			if (row?.type === 'GROUP') currentGroup = i
			remap.set(i, keep.length)
			keep.push(row)
			continue
		}
		const uid = row?.user?.id
		if (!uid) {
			keep.push(row)
			continue
		}
		seen(String(uid))
		const a = answer(String(uid))
		if (a === 'never') {
			changed = true
			if (hide) {
				dropped.set(currentGroup, (dropped.get(currentGroup) ?? 0) + 1)
				continue
			}
			keep.push(marked(row))
			continue
		}
		keep.push(row)
	}
	if (!changed) return props
	const nextGroups = Array.isArray(groups)
		? groups.map(g => {
				const idx = typeof g?.index === 'number' ? g.index : -1
				const at = remap.get(idx)
				const minus = dropped.get(idx) ?? 0
				return at === undefined && !minus
					? g
					: {
							...g,
							index: at ?? g.index,
							count: Math.max(0, (g.count ?? 0) - minus),
						}
			})
		: groups
	return { ...props, rows: keep, groups: nextGroups }
}
