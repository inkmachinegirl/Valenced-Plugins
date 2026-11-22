# Hide User Content+ (private fork)

Original: Hide User Content by horndogcop (https://github.com/horndogcop/valenced-plugins).
The original repository has **no licence**, so this copy is for personal use only and must never
be published (it lives in `private/`).

Changes (Satou):

- User sheets that are `memo` / `forwardRef` objects are wrapped by their inner render instead of
  being called directly, which threw "Object is not a function" and sent Valenced into Recovery Mode.
- Adding the sheet row and the toast can no longer throw into Discord.
- `RowManager.generate` is called with its own `this`.
