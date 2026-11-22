Hi! Chat Lock 3.5.5 crashed Discord for me with:

```
TypeError: Cannot read property 'length' of undefined
    at updateEffectImpl …
    at updateSyncExternalStore …
    at Ve (Valenced:Plugin:com.coder.chatlock …)
    at ChatView …
```

It comes from the `useChannelContentGate` hook (gate.tsx): `installGateHook` adds `useSyncExternalStore` + `useEffect` inside Discord's hook. That's stable across stop/start thanks to the passthrough bridge, but when the hook is installed for the first time while a chat is already on screen (the plugin started late: enabled, updated or reinstalled without a reload), that ChatView's next render has two more hooks than its last one and React crashes.

A fix that worked for me: in `patchGate`, if `plugin.startedLate` and the gate module was already loaded at start (`lookupModuleWithImportedPath(GATE_PATH)[0]`) and the bridge isn't installed yet, skip `installGateHook` and call `plugin.requireReload()`. The router patch still guards opening locked chats until the reload.
