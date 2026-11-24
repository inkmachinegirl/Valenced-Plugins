/*
 * Finding Discord's WebView component: from dxckie's Spotify Preview (GPL-3.0), unchanged in
 * behaviour. Discord loads react-native-webview lazily, so a plain `withProps('WebView')` misses it
 * until something has shown one; this initializes modules shaped like the package's index (a few
 * dependencies, one of which imports react-native) until one exports a `WebView`.
 */

import { lookupModule } from '@valenced/modules/finders'
import {
	createFilterGenerator,
	FilterScopes,
	withProps,
} from '@valenced/modules/finders/filters'
import {
	getModuleDependencies,
	isModuleExportBad,
} from '@valenced/modules/metro'
import type { ComponentType } from 'react'

export type WebViewComponent = ComponentType<any>

const ComponentObjectTypeof = /^Symbol\(react\.(forward_ref|memo|lazy)\)$/

const isComponent = (value: unknown): value is WebViewComponent => {
	if (typeof value === 'function') return true
	if (typeof value !== 'object' || value === null) return false
	try {
		return ComponentObjectTypeof.test(
			String((value as { $$typeof?: unknown }).$$typeof),
		)
	} catch {
		return false
	}
}

function resolveWebView(mod: unknown): WebViewComponent | undefined {
	if (isModuleExportBad(mod)) return
	const m = mod as {
		default?: { render?: unknown }
		WebView?: { render?: unknown }
	}
	try {
		// The forwardRef itself first: it passes the ref through, which the player needs.
		return [m.WebView, m.default, m.WebView?.render, m.default?.render, m].find(
			isComponent,
		)
	} catch {
		return
	}
}

interface LookupState {
	native?: number
	loose: number
}

const MaxLooseCandidates = 400

const withWebViewModule = createFilterGenerator<
	[loose: boolean, state: LookupState]
>(
	([loose, state], id, exports, initialized) => {
		if (initialized) {
			if (isModuleExportBad(exports)) return false
			if (typeof exports !== 'object' && typeof exports !== 'function')
				return false
			return (
				'WebView' in (exports as object) &&
				resolveWebView(exports) !== undefined
			)
		}
		const own = getModuleDependencies(id)
		if (!own || own.length > 4) return false
		const matches = own.some(dep => {
			const deps = getModuleDependencies(dep)
			if (!deps || deps.length < 4 || deps.length > 24) return false
			return (
				loose || (state.native !== undefined && deps.includes(state.native))
			)
		})
		if (!matches) return false
		if (loose) {
			if (state.loose >= MaxLooseCandidates) return false
			state.loose++
		}
		return true
	},
	([loose]) => `floating-browser.webview(${loose ? 'loose' : 'strict'})`,
	FilterScopes.Uninitialized | FilterScopes.Initialized,
)

const state: LookupState = { loose: 0 }
let found: WebViewComponent | undefined

export function findWebView(): WebViewComponent | undefined {
	if (found) return found
	const [, native] = lookupModule(withProps('AppRegistry', 'Linking')) as [
		unknown,
		number | undefined,
	]
	state.native = native
	for (const loose of [false, true]) {
		if (!loose && native === undefined) continue
		const mod = lookupModule(withWebViewModule(loose, state), {
			returnNamespace: true,
		}) as unknown[]
		const WebView = resolveWebView(mod[0])
		if (WebView) return (found = WebView)
	}
	return undefined
}
