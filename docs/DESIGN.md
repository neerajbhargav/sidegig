# sidegig interface foundations

Updated 2026-10-17. These rules apply to the sidebar, new tab, settings and Customize.

## Controls

Center button captions. Center icon and label groups together. Use the same caption alignment in every appearance.
Use accent fill for the main action. Keep secondary actions quieter. Provide hover, pressed, focus and disabled states.
Keep button padding symmetric. Allow long labels to wrap without cutting off their text.
Keep badges inside reserved space. A count must never depend on overflow outside a scrolling container.

Google’s [Material Web button implementation](https://github.com/material-components/material-web/blob/main/button/internal/_shared.scss) centers its content and allows a flexible minimum height.
Apple’s [button guidance](https://developer.apple.com/design/human-interface-guidelines/buttons) calls for clear labels, visible press feedback and consistent sizing within related choices.
These are references for behavior and structure. sidegig keeps its existing Google Sans Flex typography and Material Symbols.

## Wallpaper and surfaces

Keep the wallpaper continuous behind the desk. Preserve its composition and fit.
Separate widget content with bounded surfaces. Do not add feathered dark patches, drop shadows or text glows.
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
Use stable icon plates. Use an edge marker for the active app and a corner badge for unread activity.
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

Rules kept: no drop shadows or glows, the wallpaper stays the picture, hairlines and spacing separate.
