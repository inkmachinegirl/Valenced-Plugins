export interface UserScript {
	id: string
	name: string
	/** Sites it runs on: part of the address ("example.com"), several separated by commas, or * for all. */
	match: string
	code: string
	on: boolean
}
export interface Bookmark {
	title: string
	url: string
}
export interface Win {
	x: number
	y: number
	w: number
	h: number
}
export interface Settings {
	popupBlock: boolean
	/** Block ads with uBlock Origin's filter lists. */
	uBlock: boolean
	/** Which lists are on (by id; unset = the list's default). */
	lists: Record<string, boolean>
	filtersBuiltAt: number
	filterLists: string
	/** A page's fullscreen button fills the floating window instead of the whole screen. */
	inWindowFullscreen: boolean
	/** Fullscreen in the window also turns the window into a full-width landscape box. */
	fullscreenSideways: boolean
	adHide: boolean
	dark: boolean
	desktop: boolean
	videoFocus: boolean
	chatButton: boolean
	linksInBrowser: boolean
	home: string
	search: string
	bookmarks: Bookmark[]
	scripts: UserScript[]
	lastUrl: string
	win?: Win
	/** The size you gave the window last time it wasn't big, for ▁ to go back to. */
	winSmall?: Win
	/** Open tabs (addresses) and which one is showing. */
	tabs: string[]
	activeTab: number
}
export const DEFAULTS: Settings = {
	popupBlock: true,
	uBlock: true,
	lists: {},
	filtersBuiltAt: 0,
	filterLists: '',
	inWindowFullscreen: true,
	fullscreenSideways: false,
	adHide: true,
	dark: false,
	desktop: false,
	videoFocus: false,
	chatButton: true,
	linksInBrowser: false,
	home: '',
	search: 'https://duckduckgo.com/?q=',
	bookmarks: [],
	scripts: [],
	lastUrl: '',
	tabs: [],
	activeTab: 0,
}

let storage: any
export const bindStorage = (s: any) => {
	storage = s
}
export const settings = (): Settings => ({
	...DEFAULTS,
	...(storage?.cache ?? {}),
})
export function save(patch: Partial<Settings>) {
	void storage?.set?.({ ...settings(), ...patch })
}
export function useSettings(): Settings {
	try {
		storage?.use?.()
	} catch {}
	return settings()
}

/** What's typed in the address bar → an address (a search when it isn't one). */
export function toUrl(text: string): string {
	const t = text.trim()
	if (!t) return ''
	if (/^https?:\/\//i.test(t)) return t
	if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(t) && !/\s/.test(t))
		return `https://${t}`
	return `${settings().search}${encodeURIComponent(t)}`
}
export const hostOf = (url: string) =>
	/^https?:\/\/([^/?#]+)/i.exec(url)?.[1]?.replace(/^www\./, '') ?? ''
