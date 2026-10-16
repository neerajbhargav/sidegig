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
