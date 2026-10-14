# sidegig status and handoff

Last updated: 2026-10-14 17:00 EDT (Claude Code session: Gmail in a frame fixed; saved layout survives loading; Reset layout redraws; removing a widget no longer freezes the top bar).
Update this file when you stop work. Keep "Where work stopped" true.
History: [CHANGELOG.md](../CHANGELOG.md) (every commit) and [evolution](evolution/README.md) (screenshots of every milestone).
Full build-session transcript, owner requests verbatim, and test tools: `context/README.md` (local only, not in git).

## Where work stopped

Branch `wip/in-panel-apps`. Goal: open Gmail and X inside sidegig's own sidebar frame instead of a side window. **Both now load signed in, in the frame** (checked live in the owner's Aside, 2026-10-14: Gmail stays in the inbox for 30 s and more, X shows the timeline).

- **X:** `src/content/framefit-main.ts` (MAIN world) adds `SameSite=None; Secure` to cookie writes, merges the site's same-site cookies into `document.cookie` reads (from `pageCookies` in `src/background/framecookies.ts`), and blocks service-worker registration.
- **Gmail, three layers, all fixed:**
  1. Frame-busting: `rewriteFrameChecks` (`src/shared/framecheck.ts`) turns `window!=top` checks in inline scripts into constants (`src/content/framefit.ts`).
  2. "Temporary Error" code 9: Gmail's code uses `top` as its own window (`_.pu(top, …)` for the gmonkey API, `top.document`, `top.js`, `win.top`). In the frame `top` is sidegig's cross-origin page, so module "a" threw a SecurityError and stopped before defining `_.gbg`; the `reading 'Kc'` crash was only the knock-on. Fix: `rewriteTopRefs` turns bare `top` into `self` and `x.top` reads into `__sidegigTop(x)` (the frame's window when x is that window). Inline scripts are rewritten as they stream in; Gmail's own-origin `<script src>` modules are fetched, rewritten and loaded from a blob, in order (`framefit-main.ts`). Only for hosts in `TOP_REWRITE_HOSTS` (Gmail).
  3. CookieMismatch about 4 s after the inbox showed: the DNR rules that appended same-site cookies to the frame's requests (ids 500-699) duplicated cookies the browser already sends. Deleted; X works without them too.
- **The phone layout is never applied to Gmail** (`dnr.ts` skips mail.google.com, and the app bar hides the phone button for Gmail): the owner's Aside had `mobile: true` on Gmail, which sent mobile Gmail into a reload loop and risks Google's re-sign-in prompt.
- No `DIAGNOSTIC (temporary)` code is left. Commit `c2b0ed3` (already on origin) still carries a `_DumpException` diagnostic that another agent's commit swept in; the working tree removes it.
- How it was found (repeatable loop, about 10 s per run): open `panel.html` in an Aside tab, set `chrome.storage.local.panelRequest = {appId:'gmail', ts:Date.now()}`, poll the `sidegig-app-gmail` frame's title and path. Gmail swallows its own errors (`_._DumpException`), so a temporary trap on that setter is how the first error was found.
- Settings are at v10 (Gmail, X and the other `NO_FRAME` apps open in the panel).
- **Saved new-tab layout, folder colours and active space now survive loading.** `mergeSettings` (`src/shared/storage.ts`) kept only keys present in the defaults, so the `{}` defaults of `newtab.layout` and `newtab.folderTones` always came back empty, and `stacks.activeSpace` (no default) was dropped; every unrelated save then wrote the empty value back. An empty-object default now marks a map whose keys are the user's (a stored object replaces it whole; readers such as `layout.ts resolve()` check each entry), and `activeSpace` defaults to `''` (readers use `||`). Not yet checked by hand in the real extension: arrange a widget, reload, see it stay.
- **Customize › Reset layout now redraws the grid.** It saved `{}` but `main.ts` skips rebuilding the page for layout-only saves (it assumes the grid made them), so nothing moved. The grid now follows layout saves made anywhere (`onSettingsChanged` in `src/ui/views/ntgrid.ts`, which also covers a second open new tab); its own saves compare equal and do nothing. No node seam exists for this (UI wiring); it was checked in the preview: a page with fixture settings where the clock sits at x=4,y=6, click Customize › Layout › Reset layout, the clock returns to 1,1; arrange-mode moves still stick.
- **Removing a widget in arrange mode no longer freezes the top bar.** Remove saves settings, which rebuilds the page; the new grid started outside arrange mode while the page-wide `html[data-arranging]` flag (set by the old grid) stayed, so the top bar kept `pointer-events: none` and Escape/Done did nothing. A grid built while that flag is set now resumes arranging (`edit(true, true)`, quiet) in `src/ui/views/ntgrid.ts`. Checked in the preview: red on the old code, green after (Escape and Done both leave arrange mode and free the top bar). The preview loop page needs cache-busted script URLs (`ui.js?v=…`), or the browser runs a stale `ui.js`.

## Open work, in priority order

1. Phone layouts in the side panel and a live check of Calendar, Instagram, Grok and Messenger in frames (Gmail and X done). Watch Gmail for other `top` uses in modules it loads later (compose, settings, chat); `TOP_REWRITE_HOSTS` covers mail.google.com only.
2. Sharp icons: each site's best icon source, fitted (see `src/shared/iconfit.ts`, `src/background/favicons.ts`).
3. AI settings section in `src/options/main.ts`: keys, local server address, browser model status, ChatGPT plan (Codex) toggle, OpenRouter sign-in, custom instructions, MCP servers add/remove (`mcpServers` is read but nothing writes it), bridge status, agent access off/read/full.
4. Agent bridge: run `bridge/sidegig-bridge.mjs` end to end (WebSocket handshake, a `codex.run` prompt). Build the extension side that answers the bridge's `browser_*` tool calls, with an agent-access setting and a visible banner while an agent controls a tab.
5. Sidebar chat: `chatUi(ctx, { where: 'panel' })` exists; wire it into `panel.html` and add a rail button.
6. Settings page redesign (sticky header with search, live slider values, "Saved" chip, Appearance first). A previous script failed near `opt('Delay', ...)` in `src/options/main.ts`; inspect that line first.
7. Size slider in the Customize Theme tab (the Layout tab has one). Check new-tab sizes at 1280x720, 1440x900, 1920x1080.
8. Verify in the real extension after a reload: new-tab grid and Clear mode, arrange mode, chat with a real key, rail plates and single rail, icon fit, the Pomodoro seconds hand, bell and digit bounce.
9. Undecided (ask the owner): Opera-style drawer placement next to the rail; hiding the page rail while Chrome's side panel is open; the product name (sidegig, Ledge or Edgewise); default wallpaper.

## Blocked or limited

- Chrome's side panel shows only extension pages. Sites that refuse frames need the frame work above, or the docked side window.
- Safari project generation needs a Mac: `npm run safari`.
- macOS full screen: a side window gets its own space, so apps open as a tab beside the current one.
- Switching Gmail to a mobile user agent made Google ask for the password again. Do not spoof Gmail's user agent. The code now enforces this.

## Key decisions (keep unless the owner changes them)

- Free and open source (GPL-3.0). No paid tier, donations, sponsors or affiliate links. Ask the owner before adding any income path.
- Design: Chrome/Material 3 look, Google Sans Flex, Material Symbols, accent `#0b57d0`, adaptive page theme. No drop shadows or glows, no sparkle "AI" icon, sentence-case labels, no middle-dot "A · B · C" strings, no arrow glyphs glued to text, ease-out motion without bounce (except the Pomodoro digit bounce), respect reduced motion. Text never sits directly on a busy wallpaper without the readability layer.
- Docking: margin on `html` plus per-element translate for fixed elements. Never `transform` or `contain` on `html`.
- Header stripping (X-Frame-Options, CSP) only for sub_frame requests from the extension; never main_frame.
- New tab: a 12 x 8 grid that fits one screen (`src/shared/layout.ts`); narrow or short windows fall back to one column. Clear mode picks text tone per widget by sampling the wallpaper (`src/shared/legible.ts`, `src/ui/views/ntlegible.ts`).
- Chat: clean-room from public API docs and the MCP spec. Keys stay on the device (`aiKeys`, local storage, never synced). ChatGPT-plan access only through the official Codex CLI via the bridge. Claude and Gemini subscriptions are not supported (their terms forbid third-party use); use API keys. No identity spoofing, no reading other apps' tokens.
- Bridge: one local daemon on `127.0.0.1:47617`; the extension connects over WebSocket; first extension origin is paired; web pages are refused.
- Icons: the site's own icon at screen resolution, measured and fitted to one visual size; bundled CC0 brand glyphs when the browser has none.
- One rail per page: an older rail instance removes itself.

## Commit history (recent)

- `11c528c` Sidebar apps that fit, Arc-style rail plates, one rail per page
- `c3d1162` Steady rendering, and an AI chat built into the new tab
- `44f1e03` Grid, readable Clear widgets, simpler theming, pocket folders, arrange mode
- `05b80da` Add widgets panel, Size setting
