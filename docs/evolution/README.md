# How sidegig evolved

One entry per milestone, oldest first. Each entry names its commit and shows how the product looked then.
Add new entries with `npm run snap -- <image> "<caption>"` (see `AGENTS.md`). Private text (to-do items, emails, chat titles) is blurred or cropped out before an image goes in here.

## 2026-10-11: Margin v0.1, renamed sidegig

Commits `87e183b`, `aaa80a3`. A hover rail on the page edge, apps in the browser's sidebar, one-tap AI, bookmark stacks, search, status cards. Then the Chrome design system (Google Sans Flex, Material Symbols) and the name sidegig.

<img src="2026-10-11-01-drawer-wide.jpg" width="49%" alt="The drawer opened wide: search, apps, bookmark stacks"> <img src="2026-10-11-02-add-to-sidegig.jpg" width="30%" alt="Add to sidegig: turn the current page into a rail app or a bookmark">

## 2026-10-13: Opera-style docking and panel

Commits `e77d3dd`, `43a3ac3`. The rail docks and the page makes room: fixed headers, side navs and sticky bars move clear of it. Apps open in the browser's side panel next to the rail, with a one-click fix when the sides differ.

<img src="2026-10-13-01-docking-test.jpg" width="49%" alt="Docking test page: fixed header, left nav and sticky bar moved clear of the rail"> <img src="2026-10-13-02-opera-panel.jpg" width="30%" alt="Opera-style panel beside the rail">

## 2026-10-13: The edition

Commit `b5f6d12`. A short, finite issue of articles, videos, podcasts and more, picked from your interests. Your own AI writes the interest list.

<img src="2026-10-13-03-morning-edition.jpg" width="49%" alt="Morning edition"> <img src="2026-10-13-04-edition-setup.jpg" width="49%" alt="Edition setup with Ask Claude, ChatGPT or Gemini">

## 2026-10-13: New tab, first looks (NTP-1)

Commit `50376d1`. Looks that match the browser (Chrome, Edge, Aside, Dia, Arc), plus Paper, Ultramarine and an analog clock.

<img src="2026-10-13-05-ntp-paper.jpg" width="32%" alt="Paper look"> <img src="2026-10-13-06-ntp-ultramarine.jpg" width="32%" alt="Ultramarine look"> <img src="2026-10-13-07-ntp-analog-clock.jpg" width="32%" alt="Analog clock">

## 2026-10-13: Eleven themes and the Customize panel

Commit `059eaa5`. Theme cards, backgrounds and uploads.

<img src="2026-10-13-08-customize-themes.jpg" width="49%" alt="Customize panel with theme cards"> <img src="2026-10-13-09-theme-phosphor.jpg" width="49%" alt="Phosphor theme with background controls">
<img src="2026-10-13-10-theme-field.jpg" width="49%" alt="Field theme"> <img src="2026-10-13-11-theme-match-browser.jpg" width="49%" alt="Match-browser theme over a sky wallpaper">

## 2026-10-13: Wallpaper Collections and effects

Commit `ea995e6`. Collections from keywords (keyless sources), treatments such as LED, Film, Mosaic, Print, and themes taken from the picture.

<img src="2026-10-13-12-collections.jpg" width="32%" alt="A collection wallpaper"> <img src="2026-10-13-13-effect-led.jpg" width="32%" alt="LED effect and the collection picker"> <img src="2026-10-13-14-collection-night-sky.jpg" width="32%" alt="Night sky collection">

## 2026-10-13: Readable, centred, your name, setups

Commits `bb979a2`, `ef166c6`, `da1286a`. Larger type and contrast fixes on every theme, a centred layout that scales with the screen, your own name on the page, setups you can save and share as a code, albums from your own pictures.

<img src="2026-10-13-15-readable-paper.jpg" width="49%" alt="Readable Paper look"> <img src="2026-10-13-16-centred-night.jpg" width="49%" alt="Centred layout on Night">
<img src="2026-10-13-17-centred-light.jpg" width="49%" alt="Centred layout, light"> <img src="2026-10-13-18-your-name-analog.jpg" width="49%" alt="Your name on the page with the analog clock">
<img src="2026-10-13-19-setups.jpg" width="49%" alt="Setups in settings">

## 2026-10-13: The dashboard

Commit `e3cac23`. Day widgets (time, weather with a 4-day forecast, month calendar, Pomodoro, to-do, notes), one Search/Ask box, a bookmarks grid with folders.

<img src="2026-10-13-20-dashboard-light.jpg" width="49%" alt="Dashboard, light"> <img src="2026-10-13-21-dashboard-dark.jpg" width="49%" alt="Dashboard, dark">
<img src="2026-10-13-22-widgets-tab.jpg" width="49%" alt="Widgets tab: every card can be switched off"> <img src="2026-10-13-23-calendar-closeup.jpg" width="30%" alt="Calendar with event dots">

## 2026-10-13: Crisp text, fitted icons, the Anatomy timer

Commits `45a0075`, `05b80da`. No shadows or glows, sentence case, each site's own icon fitted to one size, drawn objects on the widgets, an Add widgets list, the settings redesign with a Size control.

<img src="2026-10-13-24-icons-fitted.jpg" width="49%" alt="Site icons before and after fitting, and on dark"> <img src="2026-10-13-25-anatomy-timer.jpg" width="49%" alt="Anatomy-drawn kitchen timer, light and dark">
<img src="2026-10-13-26-frosted-cards.jpg" width="49%" alt="Frosted cards with crisp text"> <img src="2026-10-13-27-working-objects.jpg" width="49%" alt="Watch, weather station, calendar cubes, note spike">
<img src="2026-10-13-28-settings-size.jpg" width="49%" alt="Settings redesign with the Size control">

## 2026-10-13: One grid, Clear mode, arrange mode

Commit `44f1e03`. A 12 x 8 grid that fits one screen and leaves the wallpaper visible. Clear mode drops the boxes and picks light or dark text per widget by sampling the picture. Drag to arrange, resize, remove.

<img src="2026-10-13-29-arrange-mode.jpg" width="49%" alt="Arrange mode"> <img src="2026-10-13-30-clear-light.jpg" width="49%" alt="Clear mode on a light picture">
<img src="2026-10-13-31-clear-dark.jpg" width="49%" alt="Clear mode on a dark picture">

## 2026-10-14: Steady rendering and the built-in chat

Commit `c3d1162`. No flicker on busy photos. A clean-room AI chat with model and effort menus, tool use, MCP, keys kept on the device.

<img src="2026-10-14-01-ask-mode.jpg" width="49%" alt="Ask mode with the model picker and Or ask on"> <img src="2026-10-14-02-chat-tools.jpg" width="49%" alt="Chat answer with a tool step, a table and code">
<img src="2026-10-14-03-steady-busy-photo.jpg" width="49%" alt="Clear widgets on a busy photo">

## 2026-10-14: Sidebar apps that fit, rail plates

Commit `11c528c`. Arc-style plates on the rail with corner badges, one rail per page, phone layouts for apps in the side window.

<img src="2026-10-14-04-rail-plates.jpg" width="12%" alt="Rail plates with badges"> <img src="2026-10-14-05-calendar-side-window.jpg" width="40%" alt="Google Calendar in the side window, phone layout">

## 2026-10-14: Apps inside sidegig frames (work in progress)

Commit `7d83c55`, branch `wip/in-panel-apps`. X loads inside a sidegig frame. Gmail stays in the frame but shows Temporary Error code 9.

<img src="2026-10-14-06-gmail-frame-error-9.jpg" width="40%" alt="Gmail inside a sidegig frame showing Temporary Error, code 9">

## 2026-10-14: Gmail signed in inside the sidebar frame

Commit `51b363d`, branch `wip/in-panel-apps`. Code 9 fixed: Gmail's own scripts used `top` as their window; sidegig rewrites those uses before they run. The inbox stays put, signed in, with no new sign-in prompt. (Inbox rows blurred.)

<img src="2026-10-14-07-gmail-signed-in-inside-the-sidebar-frame.jpg" width="49%" alt="Gmail signed in inside the sidebar frame, inbox blurred">

## 2026-10-16: Migrate older settings without crashing or changing their source

Commit `77bab66` on branch `bugfix/codebase-review` (plus uncommitted work).

<img src="2026-10-16-01-partial-setup-imports-show-a-complete-su.jpg" width="49%" alt="Partial setup imports show a complete summary and parts to apply">

## 2026-10-16: Import partial setups safely and preserve their selected parts

Commit `21559a8` on branch `bugfix/codebase-review` (plus uncommitted work).

<img src="2026-10-16-02-the-new-tab-grid-fits-a-1280-by-720-desk.jpg" width="49%" alt="The new-tab grid fits a 1280 by 720 desktop without extra scrolling">

## 2026-10-16: End new-tab listeners and observers when a render is replaced

Commit `9b754ec` on branch `bugfix/codebase-review` (plus uncommitted work).

<img src="2026-10-16-03-customize-keeps-its-close-button-visible.jpg" width="49%" alt="Customize keeps its close button visible and its widget controls match the dark theme">
<img src="2026-10-16-04-the-narrow-new-tab-uses-one-column-witho.jpg" width="49%" alt="The narrow new tab uses one column without horizontal overflow">
<img src="2026-10-16-05-sidebar-chat-uses-readable-themed-contro.jpg" width="49%" alt="Sidebar chat uses readable themed controls and the full panel width">

## 2026-10-16: Keep stopped chat runs out of new conversations and tool calls

Commit `de6a3b8` on branch `bugfix/codebase-review` (plus uncommitted work).

<img src="2026-10-16-06-ai-settings-connect-providers-and-save-c.jpg" width="49%" alt="AI settings connect providers and save custom instructions and tool servers">

## 2026-10-16: Clarify local model connection failures

Commit `d908f1a` on branch `product/core-experience` (plus uncommitted work).

<img src="2026-10-16-07-first-use-setup-fits-a-1280-by-720-lapto.jpg" width="49%" alt="First-use setup fits a 1280 by 720 laptop">
<img src="2026-10-16-08-first-use-app-choices-on-a-narrow-screen.jpg" width="49%" alt="First-use app choices on a narrow screen">
<img src="2026-10-16-09-native-dashboard-with-visible-daily-tool.jpg" width="49%" alt="Native dashboard with visible daily tools and compact controls">
<img src="2026-10-16-10-native-dashboard-stacks-cleanly-on-a-nar.jpg" width="49%" alt="Native dashboard stacks cleanly on a narrow screen">
<img src="2026-10-16-11-expanded-notes-editor-with-keyboard-clos.jpg" width="49%" alt="Expanded Notes editor with keyboard close and clean fixture text">
<img src="2026-10-16-12-built-in-assistant-reached-through-the-s.jpg" width="49%" alt="Built-in Assistant reached through the sidebar rail">
<img src="2026-10-16-13-settings-show-one-complete-section-with.jpg" width="49%" alt="Settings show one complete section with model and MCP controls">
<img src="2026-10-16-14-narrow-settings-retain-section-navigatio.jpg" width="49%" alt="Narrow settings retain section navigation and readable controls">
<img src="2026-10-16-15-local-model-failure-keeps-connection-set.jpg" width="49%" alt="Local model failure keeps connection settings and offers retry">
<img src="2026-10-16-16-weather-search-failure-has-a-clear-retry.jpg" width="49%" alt="Weather search failure has a clear retry state">
<img src="2026-10-16-17-typed-web-address-leads-search-results-w.jpg" width="49%" alt="Typed web address leads search results with a direct open action">

## 2026-10-17: Refine the adaptive desk, dock and core product flows for 0.3.0

Commit `387d99b` on branch `product/complete-core-flows` (plus uncommitted work).

<img src="2026-10-17-01-adaptive-desk-at-1280-by-720-with-bounde.jpg" width="49%" alt="Adaptive desk at 1280 by 720 with bounded wallpaper surfaces and expandable widgets">
<img src="2026-10-17-02-for-you-has-its-own-compact-page-with-ca.jpg" width="49%" alt="For you has its own compact page with category filters, descriptions and visible save controls">
<img src="2026-10-17-03-for-you-on-a-narrow-screen-with-centered.jpg" width="49%" alt="For you on a narrow screen with centered navigation and readable content">
<img src="2026-10-17-04-optional-calculator-reading-list-and-ope.jpg" width="49%" alt="Optional Calculator, Reading list and Open tabs widgets on the adaptive desk">
<img src="2026-10-17-05-bookmarks-expands-into-a-complete-inline.jpg" width="49%" alt="Bookmarks expands into a complete inline form with room for labels, validation and actions">
<img src="2026-10-17-06-wallpaper-customization-groups-effects-v.jpg" width="49%" alt="Wallpaper customization groups effects, values, reset and widget surfaces with centered controls">
<img src="2026-10-17-07-dock-inspired-page-rail-with-grouped-app.jpg" width="49%" alt="Dock-inspired page rail with grouped app plates, reserved badge space and a rounded gutter">
<img src="2026-10-17-08-taskbar-style-active-marker-and-badge-wi.jpg" width="49%" alt="Taskbar-style active marker and badge with app content starting below one compact toolbar">
<img src="2026-10-17-09-setups-includes-notes-and-optional-chat.jpg" width="49%" alt="Setups includes notes and optional chat history while leaving connection credentials out">

## 2026-10-17: Restore page rails immediately when native panels close

Commit `945a9d1` on branch `bugfix/panel-close-restore` (plus uncommitted work).

<img src="2026-10-17-10-native-panel-closure-restores-the-page-d.jpg" width="49%" alt="Native panel closure restores the page dock; clean fixture view">

## 2026-10-21: Opt-in weekly backup to Downloads that survives removing the extension

Commit `ce7f527` on branch `product/premium-1.0` (plus uncommitted work).

<img src="2026-10-21-01-desk-with-twelve-weeks-of-focus-history.jpg" width="49%" alt="Desk with twelve weeks of focus history, a second time zone and the day summary as a two-tone greeting">
<img src="2026-10-21-02-gmail-rows-with-a-sign-in-code-ticket-su.jpg" width="49%" alt="Gmail rows with a sign-in code ticket, Summarize and Draft reply in the sidebar">
<img src="2026-10-21-03-sidebar-home-with-the-sign-in-code-ticke.jpg" width="49%" alt="Sidebar home with the sign-in code ticket, new stack or space button and outline counts">
<img src="2026-10-21-04-first-run-setup-as-a-numbered-step-rail.jpg" width="49%" alt="First-run setup as a numbered step rail">
<img src="2026-10-21-05-agents-on-this-computer-off-read-only-or.jpg" width="49%" alt="Agents on this computer: off, read only or full, with the bridge pairing code">
<img src="2026-10-21-06-opt-in-weekly-backup-to-downloads-that-s.jpg" width="49%" alt="Opt-in weekly backup to Downloads that survives removing the extension">
