// Runs before the new tab paints. Two jobs:
//   1. If you turned sidegig's new tab off, hand this tab straight back to the
//      browser's own new tab (extensions can't un-override at runtime).
//   2. Otherwise pick the look from the last visit so nothing flashes.
// (Extension pages can't run inline scripts, hence this file.)
(function () {
  function ls(k) {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  }
  var root = document.documentElement;
  if (ls('sidegig.ntOff') === '1') {
    var url = ls('sidegig.ntFallback') || 'chrome://new-tab-page/';
    root.dataset.off = '1';
    root.style.visibility = 'hidden';
    try {
      chrome.tabs.getCurrent(function (t) {
        if (t && t.id != null) chrome.tabs.update(t.id, { url: url });
        else location.replace(url);
      });
    } catch (e) {
      location.replace(url);
    }
    return;
  }
  // Your size, before the first paint.
  var size = parseFloat(ls('sidegig.uiScale') || '');
  if (size >= 0.6 && size <= 1.6) root.style.setProperty('--ui-s', String(size));
  var look = ls('sidegig.ntLook') || 'space';
  var dark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.look = look === 'auto' ? 'native' : look;
  if (look === 'custom') {
    try {
      var c = JSON.parse(ls('sidegig.ntCustom') || '{}');
      if (c.bg) root.style.setProperty('--c-bg', c.bg);
      if (c.ink) root.style.setProperty('--c-ink', c.ink);
      if (c.accent) root.style.setProperty('--c-signal', c.accent);
    } catch (e) {}
  }
  var space = null;
  if (look === 'space') {
    try {
      space = JSON.parse(ls('sidegig.ntSpace') || 'null');
      if (space && space.frame) {
        root.style.setProperty('--sp-frame', space.frame);
        root.style.setProperty('--sp-1', space.bg);
        root.style.setProperty('--sp-ink', space.ink);
      }
    } catch (e) {}
  }
  if (look === 'picture') {
    try {
      var p = JSON.parse(ls('sidegig.ntPicture') || '{}');
      if (p.bg) {
        root.style.setProperty('--c-bg', p.bg);
        root.style.setProperty('--c-ink', p.ink);
        root.style.setProperty('--c-signal', p.accent);
        root.dataset.pal = p.dark ? 'dark' : 'light';
      }
    } catch (e) {}
  }
  root.dataset.scheme = space && space.scheme ? space.scheme : dark ? 'dark' : 'light';
  root.dataset.browser = ls('sidegig.ntBrowser') || 'chromium';
  root.dataset.mode = ls('sidegig.ntMode') === 'ai' ? 'ai' : 'home';
})();
