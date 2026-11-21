/*!
 * Copyright (c) 2026 Zakaria Hamdaoui
 * Licensed under the MIT License. See the LICENSE file in the project root.
 * SPDX-License-Identifier: MIT
 */

import {
	isAttachment,
	isSigned,
	isVideoSrc,
	signatureOnly,
	videoThumbnail,
} from './urls'

export const FavoriteFormat = { None: 0, Image: 1, Video: 2 } as const

export interface FavoriteGif {
	url?: string
	src?: string
	format?: number
	[key: string]: unknown
}

export interface ButtonSource {
	isGIFV?: boolean
	uri?: string
	sourceURI?: string
	embedURI?: string
	videoURI?: string
	embedProviderName?: string
	[key: string]: unknown
}

const number = (value: unknown) =>
	typeof value === 'number' ? value : undefined

export function asGifvSource(source: ButtonSource): ButtonSource {
	return {
		...source,
		isGIFV: true,
		embedURI: source.embedURI || source.sourceURI || source.uri,
		videoURI: source.videoURI || source.uri,
		embedProviderName: source.embedProviderName || '',
	}
}

export function fixFormat(src: unknown, format: number | undefined) {
	if (isVideoSrc(src)) return FavoriteFormat.Video
	if (format === FavoriteFormat.Video && isSigned(src))
		return FavoriteFormat.Image

	return format
}

export function normalizeSave(data: FavoriteGif): FavoriteGif {
	const { url, src, format } = data
	if (format === FavoriteFormat.None) return data

	if (isAttachment(url) && isVideoSrc(url) && !isVideoSrc(src))
		return { ...data, src: signatureOnly(url), format: FavoriteFormat.Video }

	const fixed = fixFormat(src, format)
	return fixed === format ? data : { ...data, format: fixed }
}

export function createFavoritesMapper(
	resolve: (url: string) => string,
	version: () => number,
) {
	const resolveField = (value: unknown) =>
		typeof value === 'string' ? resolve(value) : undefined

	function fixItem(item: FavoriteGif): FavoriteGif {
		if (!item || typeof item !== 'object') return item

		const url = resolveField(item.url) ?? item.url
		let src = resolveField(item.src) ?? item.src
		if (isAttachment(src) && isVideoSrc(src))
			src = videoThumbnail(src, number(item.width), number(item.height))

		const format =
			item.format === FavoriteFormat.None
				? FavoriteFormat.None
				: fixFormat(src, item.format)

		if (url === item.url && src === item.src && format === item.format)
			return item

		return { ...item, url, src, format }
	}

	// Fork: cached by what the item holds, not by the object. The picker's hook builds new item
	// objects on many renders, so an identity cache missed and every favorite was re-parsed
	// (several regexes each) on every render.
	const cache = new Map<
		string,
		{ version: number; out: FavoriteGif; unchanged: boolean }
	>()
	let last: FavoriteGif[] | undefined

	const keyOf = (item: FavoriteGif) =>
		`${item.url}\u0000${item.src}\u0000${item.format}\u0000${item.width}\u0000${item.height}`

	function cachedItem(item: FavoriteGif) {
		if (!item || typeof item !== 'object') return item

		const current = version()
		const key = keyOf(item)
		const hit = cache.get(key)
		if (hit && hit.version === current) return hit.unchanged ? item : hit.out

		const out = fixItem(item)
		if (cache.size > 5000) cache.clear()
		cache.set(key, { version: current, out, unchanged: out === item })
		return out
	}

	return function mapFavorites(favorites: FavoriteGif[]) {
		let changed = false
		const out = favorites.map(item => {
			const next = cachedItem(item)
			if (next !== item) changed = true
			return next
		})

		if (!changed) return favorites

		if (
			last &&
			last.length === out.length &&
			last.every((item, i) => item === out[i])
		)
			return last

		last = out
		return out
	}
}
