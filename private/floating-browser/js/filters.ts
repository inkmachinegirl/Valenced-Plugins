/**
 * Ad blocking with uBlock Origin's own filter lists (uBlock filters, uBlock badware, EasyList,
 * Peter Lowe's ad servers, optionally EasyPrivacy). They're downloaded on the phone, the way uBlock
 * gets them, compiled once into the parts this browser can use, and cached for a few days.
 *
 * What's used from the lists:
 * - `||host^` network rules (and hosts-file lines): requests to those hosts are stopped in the
 *   page, and leaving the page for one is refused. `@@||host^` exceptions are honoured.
 * - `##selector` cosmetic rules: a site's own rules go in when it loads; generic ones keyed by a
 *   class or id are added only when that class or id shows up on the page (uBlock's trick for
 *   keeping tens of thousands of them cheap); the rest are always added.
 * - `site##+js(...)` scriptlets, for the ones this browser has (see scriptlets.ts).
 * Procedural filters (:has-text, :upward…), HTML filters and redirects aren't supported.
 */

export interface ListDef {
	id: string
	name: string
	urls: string[]
	defaultOn: boolean
}
export const LISTS: ListDef[] = [
	{
		id: 'ubo',
		name: 'uBlock filters',
		urls: [
			'https://ublockorigin.github.io/uAssets/filters/filters.txt',
			'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
		],
		defaultOn: true,
	},
	{
		id: 'badware',
		name: 'uBlock filters – Badware risks',
		urls: [
			'https://ublockorigin.github.io/uAssets/filters/badware.txt',
			'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/badware.txt',
		],
		defaultOn: true,
	},
	{
		id: 'easylist',
		name: 'EasyList',
		urls: [
			'https://easylist.to/easylist/easylist.txt',
			'https://raw.githubusercontent.com/easylist/easylist/gh-pages/easylist.txt',
		],
		defaultOn: true,
	},
	{
		id: 'pgl',
		name: "Peter Lowe's ad and tracking servers",
		urls: [
			'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=hosts&showintro=0&mimetype=plaintext',
			'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/thirdparties/pgl.yoyo.org/as/serverlist',
		],
		defaultOn: true,
	},
	{
		id: 'easyprivacy',
		name: 'EasyPrivacy (trackers)',
		urls: [
			'https://easylist.to/easylist/easyprivacy.txt',
			'https://raw.githubusercontent.com/easylist/easylist/gh-pages/easyprivacy.txt',
		],
		defaultOn: false,
	},
]

export interface Compiled {
	/** Hosts whose requests are stopped inside pages. */
	hosts: string[]
	/** Hosts the page itself may not go to (no options, or popup / document rules). */
	docHosts: string[]
	allow: string[]
	/** Generic hiding rules by their first class or id (".ad", "#banner"). */
	byToken: Record<string, string[]>
	/** Generic hiding rules with no class or id to key on. */
	always: string[]
	/** Site hiding rules: host (or "name.*") → selectors; exceptions likewise. */
	specific: Record<string, string[]>
	unhide: Record<string, string[]>
	/** Site scriptlets: host → [name, ...args][]. */
	scriptlets: Record<string, string[][]>
	builtAt: number
	lists: string[]
}

const PROCEDURAL =
	/:(has-text|upward|xpath|-abp-|matches-css|matches-attr|matches-path|matches-prop|matches-media|remove|remove-attr|remove-class|style|watch-attr|min-text-length|others|if|if-not|shadow)\b|:has\(.*:has-text/
const NET_SKIP =
	/(^|,)~?(domain|from|to|denyallow|redirect|redirect-rule|removeparam|csp|header|permissions|replace|urltransform|uritransform|badfilter|method|ipaddress|match-case)\b/
const DOC_OPTS = /(^|,)(popup|document|doc|all|popunder)(,|$)/

function push<T>(map: Record<string, T[]>, key: string, value: T) {
	;(map[key] ??= []).push(value)
}

/** Splits +js(...) arguments: commas end an argument unless escaped with a backslash. */
export function scriptletArgs(body: string): string[] {
	const out: string[] = []
	let cur = ''
	for (let i = 0; i < body.length; i++) {
		const ch = body[i]
		if (ch === '\\' && body[i + 1] === ',') {
			cur += ','
			i++
		} else if (ch === ',') {
			out.push(cur.trim())
			cur = ''
		} else cur += ch
	}
	if (cur.trim() || out.length) out.push(cur.trim())
	return out.map(a => a.replace(/^(['"])(.*)\1$/, '$2'))
}

/** First class or id of a selector, when it starts with one (after an optional tag name). */
function tokenOf(selector: string): string | undefined {
	const m = /^[a-z]*([.#])([A-Za-z_][\w-]*)(?=$|[.#:[\s>+~])/i.exec(selector)
	if (!m || selector.includes(',')) return undefined
	return m[1] + m[2]
}

/** FNV-1a, 32-bit, in base 36: the page gets these instead of the hosts (a third of the size). */
export function hash(text: string): string {
	let h = 0x811c9dc5
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i)
		h = Math.imul(h, 0x01000193)
	}
	return (h >>> 0).toString(36)
}
/** The same function, for pages. */
export const HASH_JS =
	'function(t){var h=0x811c9dc5;for(var i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,0x01000193)}return(h>>>0).toString(36)}'

export function compile(texts: Array<[string, string]>): Compiled {
	const hosts = new Set<string>()
	const docHosts = new Set<string>()
	const allow = new Set<string>()
	const byToken: Record<string, string[]> = {}
	const always = new Set<string>()
	const specific: Record<string, string[]> = {}
	const unhide: Record<string, string[]> = {}
	const scriptlets: Record<string, string[][]> = {}
	const genericUnhide = new Set<string>()
	for (const [, text] of texts) {
		for (const raw of text.split('\n')) {
			const line = raw.trim()
			if (
				!line ||
				line[0] === '!' ||
				line[0] === '[' ||
				(line[0] === '#' && !line.startsWith('##'))
			)
				continue
			// hosts-file lines
			const h = /^(?:0\.0\.0\.0|127\.0\.0\.1)\s+([a-z0-9.-]+)\s*$/i.exec(line)
			if (h) {
				if (h[1] !== 'localhost' && h[1].includes('.')) {
					hosts.add(h[1].toLowerCase())
					docHosts.add(h[1].toLowerCase())
				}
				continue
			}
			const cos = /^([^#]*?)#(@?)#(.+)$/.exec(line)
			if (cos && !line.startsWith('||') && !line.startsWith('@@')) {
				const [, domains, except, body] = cos
				if (
					body[0] === '^' ||
					(body.startsWith('+js(') === false && PROCEDURAL.test(body))
				)
					continue
				const sites = domains
					.split(',')
					.map(d => d.trim().toLowerCase())
					.filter(d => d && d[0] !== '~')
				const negated = domains.includes('~')
				if (body.startsWith('+js(')) {
					if (except || !sites.length) continue
					const args = scriptletArgs(body.slice(4, body.lastIndexOf(')')))
					if (!args[0]) continue
					for (const s of sites) push(scriptlets, s, args)
					continue
				}
				if (!sites.length) {
					if (negated) continue
					if (except) genericUnhide.add(body)
					else {
						const t = tokenOf(body)
						if (t) push(byToken, t, body)
						else always.add(body)
					}
					continue
				}
				for (const s of sites) push(except ? unhide : specific, s, body)
				continue
			}
			const exceptNet = line.startsWith('@@')
			const net = /^(?:@@)?\|\|([a-z0-9.*-]+)\^?(?:\$(.*))?$/i.exec(line)
			if (!net || net[1].includes('*')) continue
			const host = net[1].toLowerCase()
			const opts = (net[2] ?? '').toLowerCase()
			if (NET_SKIP.test(opts) || !host.includes('.')) continue
			if (exceptNet) {
				if (
					!opts ||
					/(^|,)(document|all)(,|$)/.test(opts) ||
					!/(^|,)(script|image|xhr|subdocument|stylesheet|media|font|other|ping|websocket|xmlhttprequest)(,|$)/.test(
						opts,
					)
				)
					allow.add(host)
				continue
			}
			hosts.add(host)
			if (!opts || DOC_OPTS.test(opts)) docHosts.add(host)
		}
	}
	for (const sel of genericUnhide) {
		always.delete(sel)
		const t = tokenOf(sel)
		if (t && byToken[t]) byToken[t] = byToken[t].filter(x => x !== sel)
	}
	for (const a of allow) {
		hosts.delete(a)
		docHosts.delete(a)
	}
	return {
		hosts: [...hosts],
		docHosts: [...docHosts],
		allow: [...allow],
		byToken,
		always: [...always],
		specific,
		unhide,
		scriptlets,
		builtAt: Date.now(),
		lists: texts.map(([id]) => id),
	}
}

// ── Lookups ─────────────────────────────────────────────────────────

let current: Compiled | undefined
let hostSet = new Set<string>()
let docSet = new Set<string>()
let allowSet = new Set<string>()
let pageHostsCache: { blocked: string; allow: string } | undefined
export function use(c: Compiled | undefined) {
	current = c
	hostSet = new Set(c?.hosts ?? [])
	docSet = new Set(c?.docHosts ?? [])
	allowSet = new Set(c?.allow ?? [])
	pageHostsCache = undefined
}
export const compiled = () => current

const parents = (host: string): string[] => {
	const out: string[] = []
	let h = host.toLowerCase().replace(/^www\./, '')
	while (h.includes('.')) {
		out.push(h)
		h = h.slice(h.indexOf('.') + 1)
	}
	return out
}

/** The page may not leave for [host] (an ad or malware host). */
export function blocksDocument(host: string): boolean {
	if (!current || !host) return false
	for (const h of parents(host)) {
		if (allowSet.has(h)) return false
		if (docSet.has(h)) return true
	}
	return false
}

/** The host lists, for the script that stops requests inside pages. */
export function pageHosts(): { blocked: string; allow: string } {
	if (!pageHostsCache)
		pageHostsCache = {
			blocked: [...hostSet].map(hash).join(','),
			allow: [...allowSet].map(hash).join(','),
		}
	return pageHostsCache
}

/** Keys a site's rules can be filed under: the host and its parents, and "name.*" forms. */
function siteKeys(host: string): string[] {
	const keys = parents(host)
	for (const h of [...keys]) {
		const labels = h.split('.')
		if (labels.length >= 2) keys.push(`${labels.slice(0, -1).join('.')}.*`)
	}
	return keys
}

/** Hiding rules that always apply on [host]: the site's own, plus generic ones without a key. */
export function cosmeticFor(host: string): string[] {
	if (!current) return []
	const out = new Set<string>(current.always)
	const off = new Set<string>()
	for (const k of siteKeys(host)) {
		for (const s of current.specific[k] ?? []) out.add(s)
		for (const s of current.unhide[k] ?? []) off.add(s)
	}
	for (const s of off) out.delete(s)
	return [...out]
}

/** Generic hiding rules for classes / ids found on the page. */
export function cosmeticForTokens(tokens: string[], host: string): string[] {
	if (!current) return []
	const off = new Set<string>()
	for (const k of siteKeys(host))
		for (const s of current.unhide[k] ?? []) off.add(s)
	const out: string[] = []
	for (const t of tokens)
		for (const s of current.byToken[t] ?? []) if (!off.has(s)) out.push(s)
	return out
}

export function scriptletsFor(host: string): string[][] {
	if (!current) return []
	const out: string[][] = []
	for (const k of siteKeys(host)) out.push(...(current.scriptlets[k] ?? []))
	return out
}

export function counts(c = current) {
	if (!c) return undefined
	return {
		network: c.hosts.length,
		cosmetic:
			c.always.length +
			Object.values(c.byToken).reduce((n, l) => n + l.length, 0) +
			Object.values(c.specific).reduce((n, l) => n + l.length, 0),
		scriptlets: Object.values(c.scriptlets).reduce((n, l) => n + l.length, 0),
	}
}
