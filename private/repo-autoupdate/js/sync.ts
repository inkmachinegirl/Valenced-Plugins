/**
 * One check of Satou's repository: refresh only that repository, update the installed plugins it
 * has newer versions of, and install plugins that appeared in it since the last check.
 */

export interface RepoApi {
	listRepos(): Promise<{ url: string; enabled: boolean }[]>
	refreshRepo(url: string): Promise<unknown>
	listRepoPlugins(url: string): Promise<{ id: string; name: string }[]>
	listUpdates(): Promise<
		{ id: string; repo: string; available: string; blocker: unknown }[]
	>
	updatePlugins(
		ids: Iterable<string>,
	): Promise<{
		installed: string[]
		pending: string[]
		errors: { id: string; error: unknown }[]
	}>
	planInstall(id: string, options?: any): Promise<any>
	installFromRepo(
		plan: any,
	): Promise<{ installed: string[]; pending: string[]; skipped: string[] }>
}

/** How this repository's URL looks, whatever was typed when it was added. */
export const OWN =
	/inkmachinegirl\.github\.io\/Valenced-Plugins|ketsuyumi\.github\.io\/Valenced-Plugins/i
const same = (a: string, b: string) =>
	a.replace(/\/(index\.json)?$/i, '') === b.replace(/\/(index\.json)?$/i, '')

export interface SyncState {
	/** Plugin ids seen in the repository, so only ones that appear later count as new. Undefined before the first check. */
	known?: string[]
}

export interface SyncResult {
	repo?: string
	updated: string[]
	installed: string[]
	pending: string[]
	errors: string[]
}

export async function syncOnce(
	api: RepoApi,
	state: SyncState,
	opts: {
		update: boolean
		installNew: boolean
		isInstalled: (id: string) => boolean
	},
): Promise<{ result: SyncResult; state: SyncState }> {
	const result: SyncResult = {
		updated: [],
		installed: [],
		pending: [],
		errors: [],
	}
	const repo = (await api.listRepos()).find(r => r.enabled && OWN.test(r.url))
	if (!repo) {
		result.errors.push(
			"Satou's repository isn't added (or is turned off) in Valenced's repositories",
		)
		return { result, state }
	}
	result.repo = repo.url
	await api.refreshRepo(repo.url)
	const listing = await api.listRepoPlugins(repo.url)
	const ids = listing.map(p => p.id)

	if (opts.update) {
		const ours = (await api.listUpdates()).filter(
			u => same(u.repo, repo.url) && !u.blocker,
		)
		if (ours.length) {
			const r = await api.updatePlugins(ours.map(u => u.id))
			result.updated.push(...r.installed)
			result.pending.push(...r.pending)
			for (const e of r.errors)
				result.errors.push(`${e.id}: ${(e.error as any)?.message ?? e.error}`)
		}
	}

	// First check: remember what's there, install nothing (no mass install, no reinstalling
	// plugins removed on purpose before).
	const known = new Set(state.known ?? ids)
	if (opts.installNew && state.known)
		for (const id of ids) {
			if (known.has(id) || opts.isInstalled(id)) continue
			try {
				const plan = await api.planInstall(id, {
					targets: { [id]: { repo: repo.url } },
					repos: [repo.url],
				})
				const r = await api.installFromRepo(plan)
				result.installed.push(...r.installed)
				result.pending.push(...r.pending)
			} catch (e: any) {
				result.errors.push(`${id}: ${e?.message ?? e}`)
			}
		}
	for (const id of ids) known.add(id)
	return { result, state: { known: [...known] } }
}
