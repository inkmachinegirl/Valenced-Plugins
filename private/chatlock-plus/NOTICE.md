# Chat Lock+ (private fork)

Original: Chat Lock by coder.gg (il1ll), https://github.com/il1ll/ValencedPlugins, GPL-3.0 (see LICENSE).
`plugin.jar` is the original's published build of `src/` (3.5.5), unchanged.

Changes (Satou): when the plugin starts late (enabled, updated or reinstalled without a reload)
and Discord has already loaded `useChannelContentGate`, the gate hook is not installed until the
next reload, because adding hooks to a chat already on screen crashes React. Opening a locked chat
is still guarded by the router patch meanwhile.
