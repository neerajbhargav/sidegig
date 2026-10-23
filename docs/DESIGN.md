# sidegig interface foundations

Updated 2026-10-23. These rules apply to the sidebar, rail, new tab, settings and Customize.

## After Arc (owner, 2026-10-23)

Arc is sunsetting on December 22, 2026 (arc.net, read 2026-10-23). The owner asked for sidegig's components to take "full inspiration from the design system of Arc". The values below were measured from the window mock on arc.net, which The Browser Company built in HTML and CSS (local copy and notes: `context/arc-study-2026-10-23/`). sidegig draws its own versions; it copies no Arc asset, font or code.

Three layers, as in Arc's window:

```
┌ frame: the space colour, a 1–3 colour gradient with grain ─────────────┐
│  navigation sits on it: address pill, favorites, folders, tabs, rail   │
│  ┌ card: the content palette (white, or near-black in dark) ─────────┐  │
│  │  pages, apps, settings, widgets                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│  floating layers lift: menus, the command bar, sheets, toasts          │
└──────────────────────────────────────────────────────────────────────────┘
```

| Part | Arc (arc.net mock) | sidegig |
|---|---|---|
| Frame | one colour per space (`#ff8a91` in the mock), wells `#f47b82` | `--sp-frame`: 1–3 colours from the picker, mode-fitted, grain 0–100 |
| Wells (address pill, favorites) | a few points darker than the frame | `--sp-card`: the hue's dark shade at 7.5% (light), white at 8% (dark) |
| Text | ink at 86% black; muted is a dark shade of the hue | `--sp-ink` (7:1 on every stop and well), `--sp-mute` (hue-tinted, 4.5:1) |
| Tab row | 38px, 9px corners, 14px weight 500 | `.row` 36px, `--r-2`, 14px weight 500 |
| Open tab | `#fff5f4` with a hue-tinted 1px shadow | `--sp-sel` with `--lift-1` |
| Favorites | grid, 45px tiles, 10px corners | `.tiles.icons`, 44px, `--r-3` |
| Space name | 11.5px, weight 600, muted | `.label` |
| Spaces | 6px dots in the footer | `.space-dot` |
| Page | inset ~10px, 8px corners, hairline | `.frames`, settings `main` |
| Type | the system face (SF Pro Text) | `--f-text`, the system face |

## Design system

Every surface uses one set of tokens and components. Each surface keeps its own colour theme (owner, 2026-10-14). `test/design.test.ts` fails when a style leaves the system, so `npm test` keeps it.

### Tokens

The values live once, in `:root` at the top of `src/ui/ui.css`. `src/content/rail.css` repeats them in px, because rem there follows the page the rail sits on. The theme engine (`src/shared/theme.ts`) writes the colour tokens: `--m-*` for content, `--sp-*` for the space colour, and the two lifts. Pick a token by its role:

| Tokens | Role |
|---|---|
| `--t-1` … `--t-7` | Type: badges and captions, secondary text, body and controls, sheet titles, section heads, numbers, display numbers. The clock and timer may use fluid sizes (clamp, container units). |
| `--r-0` … `--r-4`, `--r-full` | Corners (3, 6, 8, 10, 14px): tiny marks, small marks, rows and fields, tiles and menus, cards and sheets. Pills for chips and counts. A theme may retune `--r-card`, `--r-key` and `--r-btn`. |
| `--dur-press`, `--dur-change`, `--dur-open`, `--dur-scene`, `--ease` | Motion: the duration names what changed. `--ease` is a spring that settles without overshoot (critically damped, sampled into `linear()`; owner, 2026-10-23). `--ease-bounce` is only for digits that change (owner, 2026-10-14). Scripts use `DUR` and `EASE` from `src/ui/dom.ts`. |
| `--lift-1`, `--lift-2` | Soft shadows in the space colour's hue: `--lift-1` for the selected row, tile or segment; `--lift-2` for menus, the command bar, sheets and toasts. Nothing else casts a shadow (owner, 2026-10-23). |
| `--ico-s`, `--ico-m`, `--ico-l`, `--ico-xl` | Icons, drawn with `icon(name, 16 \| 20 \| 24 \| 32)`. |
| `--c-bg`, `--c-card`, `--c-panel`, `--c-ink`, `--c-mute`, `--c-line` | Colour roles. `--c-signal-fill` with `--c-on-signal` for accent fills. |
| `--sp-frame`, `--sp-1`…`--sp-3`, `--sp-ink`, `--sp-mute`, `--sp-accent`, `--sp-card`, `--sp-hover`, `--sp-sel`, `--sp-line`, `--sp-grain` | The space colour and what sits on it. Pages on the frame remap `--m-*` to these; a content card takes the content palette back from `--k-*`. |

Spacing sits on a 2px grid (0.125rem steps). Widgets use `--gw-pad` for their inset.

### Space colour

`spaceTokens()` in `src/shared/theme.ts` keeps each picked hue and sets its lightness from the mode: lighter in light mode, deep in dark mode. Intensity adds colour. The accent follows the most colourful of the space's colours unless you pick one. The picker (`src/ui/spacepick.ts`) appears in the sidebar's settings, on the settings page and in Customize › Colours › Space. Dragging previews at once; letting go saves. `test/theme.test.ts` checks every preset and odd input: ink 7:1 and muted text and accent 4.5:1, on every stop and in every well.

### Colour roles

A surface that changes the ink also sets the background, card, panel and muted roles. Text then always lands on a surface made for it (the white-on-white "Find" button and notes came from a partial set). Accent fills use `--c-signal-fill`: `accentFill()` in `src/shared/legible.ts` nudges any accent until its text reaches 4.5:1. Toned widget cards set `color-scheme`, so native checkboxes and fields follow the card.

### Components

- **Button**, `.btn`: a well by default, `.primary` (accent fill) for the one main action in a view, `.ghost` for a way out. Rounded like a row (`--r-btn`), as wide as its label.
- **Icon button**, `iconButton()` (`.iconbtn`): quiet until hovered. It is the only icon-only control.
- **Field**, `.text-input`: control corners and the button height.
- **Chip**, `.nt-chip`: toggles and keypad keys. Actions use a button.
- **Row**, `.row`: one line, a 16px icon, the open one white and lifted (`.row.current`).
- **Segmented control**, `.seg` and `.nt-seg`: a sunken track; the chosen segment is white and lifted.
- **Address pill**, `.field .input`: a well on the frame; focused, it turns white and lifts.
- **Sheet**, `.nt-cz`: floats inside the window with `--r-4` corners and `--lift-2`.
- **Widget card**, `card()` in `src/ui/views/ntdash.ts`: the section, header row and body for every widget.
- **Empty state**: one `.nt-empty` line, then at most one button.

### Widget anatomy

- One inset, `--gw-pad`, for every widget and size.
- One header row: the title (600, `--t-3`) and its icon actions, at the same height in every widget. Compact figure-led layouts lead with their object or number instead: the clock, and the small calendar and pomodoro.
- One corner control, top right. Expand shows on hover and focus, and always on touch screens. Close takes the same place once the widget is open. Widgets narrower than 13rem drop it; their surface and Enter still open them.
- Figures sit beside the header or on the leading side of the body, never over a control.

### Motion

Motion answers what the person did: a press, a state change, an opening. The wallpaper and the first reveal of the desk use `--dur-scene`. Hover changes colour only. Reduced motion removes movement.

### Checks

- `npm test` runs `test/design.test.ts`: type, corners, motion, spacing, no blurred shadows outside the two lifts, lifts only on floating layers and selected items, no text glows, complete colour roles, defined tokens, icon sizes, scripted motion and accent fills.
- `scripts/contrast-probe.js` runs in a preview page (evaluate it through DevTools or a smoke script). It lists text under 4.5:1 (3:1 when large) and text that sits straight on the wallpaper. Check `qa-newtab.html` (the Space look; add `?mode=dark`), `qa-desk.html`, `qa-full.html?look=picture` (also `night`, `paper`, `auto`), `qa-panel.html` (add `?spaces=1`, `?app=1`, `?mode=dark`), `qa-setups.html` (also `#welcome`), `qa-edition.html` and `qa-mail.html`.

### Adding a widget

1. Build it with `card(cls, title, actions, ...body)`. Put its actions in the header as icon buttons and its empty state in one `.nt-empty` line.
2. Style it with tokens only. Use `.btn` and `.text-input` as they are.
3. Run `npm test`, then the contrast probe on `qa-full.html` in every look. Done means both pass and its header lines up with its neighbours.

## Controls

Center button captions. Center icon and label groups together. Use the same caption alignment in every appearance.
Use accent fill for the main action. Keep secondary actions quieter. Provide hover, pressed, focus and disabled states.
Keep button padding symmetric. Allow long labels to wrap without cutting off their text.
Keep badges inside reserved space. A count must never depend on overflow outside a scrolling container.

Google’s [Material Web button implementation](https://github.com/material-components/material-web/blob/main/button/internal/_shared.scss) centers its content and allows a flexible minimum height.
Apple’s [button guidance](https://developer.apple.com/design/human-interface-guidelines/buttons) calls for clear labels, visible press feedback and consistent sizing within related choices.
These are references for behavior and structure. sidegig uses the system face (owner, 2026-10-23) and Material Symbols Rounded.

## Wallpaper and surfaces

Keep the wallpaper continuous behind the desk. Preserve its composition and fit.
Separate widget content with bounded surfaces. Do not add feathered dark patches or text glows; only floating layers and the selected item lift.
Clear uses a bounded tint with a sampled text tone. Glass uses a consistent frosted surface. Solid uses the selected theme’s surface.
Use the paired foreground and surface colors together. Follow the selected theme for interactive controls.
Keep navigation visually distinct from widget content. A widget opening must not resize through clipped intermediate states.

Apple’s [material guidance](https://developer.apple.com/design/human-interface-guidelines/materials) separates navigation materials from content surfaces and advises using glass effects sparingly.
Google’s [color roles](https://m3.material.io/styles/color/the-color-system) pair foreground colors with surfaces to preserve contrast.

## Customization

Wallpaper owns pictures, effects, Fade, Soften and widget surfaces. Show slider values and provide Reset picture effects.
Colours owns appearance, accent and custom colors. Layout owns widgets, placement and interface size.
Preview changes while adjusting controls. Save the chosen values without resetting the wallpaper, layout or other preferences.
Keep Customize open while a choice redraws the desk. Keep it closed after a reload.

The archived owner references favor a coherent control system, rounded folder tiles, small functional objects and restrained content layouts.
The reference images stay in the local transcript archive. They are not shipped assets.

## Adaptive behavior

Use the available desktop grid. Preserve saved arrangements. Switch to a scrolling layout before controls clip at a small window or large interface size.
Show every enabled widget in that layout. Keep the wallpaper, theme, labels and controls consistent across sizes.
Use short ease-out transitions. Respect reduced motion. Reserve enough space for the small digit animation.

## Review

Check a busy wallpaper, a quiet wallpaper and no wallpaper. Check light and dark appearances.
Check desktop, narrow sidebar and narrow new-tab sizes. Check 80%, 100% and 140% interface sizes.
Check button captions, badge bounds, widget expansion, keyboard focus and Customize persistence in a real browser.

## Sidebar dock

Keep pinned apps together, separated from search and utilities. Fit the floating page rail to its contents and center it vertically.
Use stable icon plates (wells on the space colour). The active app's plate turns white and lifts, with an edge marker; a corner badge shows unread activity.
Keep the same plates and spacing inside the native panel. Scroll long app lists and short rails.
Use the [macOS Dock](https://support.apple.com/guide/mac-help/mh35859/mac) for grouping and location continuity.
Use the [Windows taskbar](https://support.microsoft.com/windows/experience/personalization/customize-the-taskbar-in-windows) for clear app state and notification badges.

## Owner references, 2026-10-21

The owner's X bookmarks were reviewed again (66 posts, read only; 38 are design references). The frames stay in the local `context/design-refs-2026-10-21/` folder. What was taken, and where:

- Folders with their contents peeking out, in soft tones with a count: [@david_visuals_](https://x.com/david_visuals_/status/2110699870600515737), [@nikolay_dp](https://x.com/nikolay_dp/status/2110040572987654357). New tab folders keep the stitched pocket and gain mint, lavender and butter. Sidebar stack counts are outline pills.
- A commit-grid card with mono labels over a photo: [@piyushsphere](https://x.com/piyushsphere/status/2111710975074422816). The focus timer shows twelve weeks of focus as a dot grid.
- A world-time watch: [@kotecinho](https://x.com/kotecinho/status/2104947305275417051). The clock can show a second time zone.
- Two-tone headlines, ink then grey: [@uisabor](https://x.com/uisabor/status/2109916314450157942). The day summary is the greeting's quieter second sentence.
- A perforated ticket with a mono code: [@mightbe_dg](https://x.com/mightbe_dg/status/2112551917545205793). Sign-in codes are notched tickets.
- Steps on a rail: [@irfannnnali](https://x.com/irfannnnali/status/2109792475241972179). First-run setup numbers its three choices on a hairline.

Rules kept then: no drop shadows or glows, the wallpaper stays the picture, hairlines and spacing separate. Since 2026-10-23, floating layers and the selected item may lift (see "After Arc").
