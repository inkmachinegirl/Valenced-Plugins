# Sekai Stickers (Valenced fork)

A private fork of bleelblep's Sekai Stickers (revenge-next-plugins, CC0-1.0), ported to Valenced by Satou.
Upstream draws stickers with a Kotlin class; Valenced can't load native code, so this fork draws
them on a canvas in a hidden WebView (`js/ui/Renderer.tsx`, `js/lib/native.ts`).

Third-party material:

- `js/data/characters.ts` is the sticker list from
  [TheOriginalAyaka/sekai-stickers](https://github.com/TheOriginalAyaka/sekai-stickers)
  (`src/characters.json`), MIT; see `THIRD_PARTY_LICENSES/sekai-stickers-MIT.txt`.
- `js/ui/webview.ts` comes from dxckie's Spotify Preview (GPL-3.0), via Floating Browser.
- The character pictures (SEGA / Colorful Palette) and the fonts (YurukaStd, ShangShouFangTangTi)
  are not bundled. They are downloaded from the TheOriginalAyaka/sekai-stickers repository on
  GitHub when used, and belong to their owners.
