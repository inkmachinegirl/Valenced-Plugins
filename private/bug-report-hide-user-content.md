Hi! Hide User Content 1.0.0 crashes Discord into Recovery Mode for me as soon as a user sheet opens:

```
TypeError: Object is not a function
    at n (Valenced:Plugin:com.valenced.hide-user-content:1:11544)
    at renderWithHooks …
```

It's in `patches/userContextMenu.tsx`: `WrappedSheet` calls `OriginalSheet(sheetProps)` directly, but on current Discord many lazy sheets' `default` is a `React.memo` (or `forwardRef`) object, not a function, so calling it throws while React renders. Unwrapping it first fixes the crash, e.g.:

```ts
const C = mod.default as any
const render =
  typeof C === 'function' ? C
  : typeof C?.type === 'function' ? C.type
  : typeof C?.type?.render === 'function' ? C.type.render
  : typeof C?.render === 'function' ? C.render
  : undefined
if (!render) return mod // unknown shape: leave the sheet alone
const WrappedSheet = (sheetProps: any, ref?: any) => {
  const rendered = render(sheetProps, ref)
  …
}
```

A try/catch around the injection that falls back to `React.createElement(C, sheetProps)` would also stop one bad sheet from sending the whole app into Recovery Mode.

(Also: the repo has no licence file, so others can't legally fork or fix it. Adding one, like MIT or GPL-3.0, would make that clear.)
