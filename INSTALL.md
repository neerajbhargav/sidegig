# Install sidegig

This build installs locally. A signed browser-store release is not available yet.
You do not need a sidegig account. AI connections are optional.

## Chrome, Edge, Brave, Arc, Dia, Vivaldi and Aside

1. Unzip `sidegig-chrome.zip` into a folder you will keep. Do not delete this folder after installing.
2. Open your browser’s extensions page. In Chrome, use `chrome://extensions`. In Edge, use `edge://extensions`.
3. Turn on **Developer mode**, then choose **Load unpacked**.
4. Select the extracted folder that contains `manifest.json`.
5. The setup page opens. Choose your pinned apps, sidebar position and whether to use the sidegig new tab.
6. Select **Start using sidegig**. Refresh any web pages that were already open before installation.

Use the browser’s extension menu to pin sidegig’s toolbar button.
The rail appears on normal web pages. Browser settings, extension stores and other protected pages cannot show it.
Use the toolbar button on those pages.

The Chromium build requires Chrome 130 or a compatible browser version.

## Your first few minutes

- Click an app on the rail to open it beside your page. Sign in to that site if needed.
- Use **+** to add another app or the current site.
- Open a new tab. Search or enter a web address. Add bookmarks, a task or a note.
- Use **Customize** to change colours, wallpaper and widgets. Use **Arrange** to move and resize widgets.
- Open **Assistant** in the sidebar for built-in chat. Connect a browser model, local model or API provider in **Settings → Ask AI**.
- Use **Settings → New tab** to return to your browser’s own new tab. All settings remain available through the toolbar button.

Some websites restrict embedding. Use the app bar’s **Open in a tab** or **Open as mini window** if a site cannot load in the sidebar.

## Updates and removal

For a local update, replace the files in the same installation folder, then press **Reload** on the browser’s extensions page.
Reopen sidegig pages and refresh existing web pages. Your saved settings and notes remain in browser storage.

To remove sidegig, use **Remove** on the extensions page. Your real browser bookmarks remain yours.
Export a setup in **Settings → Setups** before removing the extension if you want to keep a backup.
Setups include preferences, tasks and notes. Select **Include chat history and attached page text** to keep conversations too.
API keys, passwords and connection tokens stay out of setup files and codes. Keep connection credentials separately.

## Other browser builds

- **Opera:** extract `sidegig-opera.zip`, then load the folder from `opera://extensions` in Developer mode.
- **Firefox:** `sidegig-firefox.zip` is an unsigned development build. Load its extracted `manifest.json` through `about:debugging#/runtime/this-firefox` for temporary testing. A signed Firefox release is still needed for normal distribution.
- **Safari:** the web-extension files require conversion and signing with Xcode. Follow `npm run safari` in the source repository. The Safari zip alone is not an installable Safari application.

Privacy details: [PRIVACY.md](PRIVACY.md). Source and build instructions: [README.md](README.md).
