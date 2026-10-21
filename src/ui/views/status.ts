// Status cards: quiet until there is something new, like Kitbar's cards.
// Gmail rows add the mail layer: sign-in codes you copy in one click, and
// thread summaries and reply drafts from the model you picked in chat.
import { ext } from '../../shared/api.ts';
import { getLocal, setLocal, onLocalChanged } from '../../shared/storage.ts';
import type { StatusCard } from '../../shared/types.ts';
import { composeUrl, threadPrompt, type MailThread } from '../../shared/mail.ts';
import { md } from '../../shared/ai/md.ts';
import { h, ico, iconButton, ago, toast } from '../dom.ts';
import { type Ctx, openUrl, send, openOptions } from '../ctx.ts';
import { askPicked } from './ntchat.ts';

type Item = StatusCard['items'][number];
/** How long a sign-in code stays on the new tab and the sidebar home. */
const FRESH_MS = 15 * 60_000;

/** The code itself is the button: one click copies it. */
function codeButton(code: string): HTMLButtonElement {
  const b = h('button', { type: 'button', class: 'code-copy', title: 'Copy', 'aria-label': `Copy code ${code}` }, h('span', { class: 'code-digits' }, code), ico('copy', 14)) as HTMLButtonElement;
  b.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      b.dataset.copied = '';
      b.setAttribute('aria-label', `Copied ${code}`);
      b.lastElementChild?.replaceWith(ico('check', 14));
      setTimeout(() => (delete b.dataset.copied, b.setAttribute('aria-label', `Copy code ${code}`), b.lastElementChild?.replaceWith(ico('copy', 14))), 1500);
    } catch {
      toast('Couldn’t copy. Select the code instead.');
    }
  });
  return b;
}

function mailActions(ctx: Ctx, it: Item): HTMLElement[] {
  const out = h('div', { class: 'mail-out', hidden: true, 'aria-live': 'polite' });
  let life: AbortController | null = null;
  const say = (text: string, ...more: Node[]) => out.replaceChildren(h('p', { class: 'subtle' }, text), ...more);
  const run = async (kind: 'summary' | 'reply') => {
    life?.abort();
    const mine = new AbortController();
    life = mine;
    ctx.signal?.addEventListener('abort', () => mine.abort(), { once: true });
    out.hidden = false;
    say('Reading the thread…');
    const t = (await send({ type: 'mail-thread', mid: it.mid! }).catch(() => null)) as MailThread | null;
    if (mine.signal.aborted) return;
    if (!t) return say('Gmail didn’t return this thread. Open it in Gmail instead.');
    const text = h('div', { class: 'mail-text md' });
    out.replaceChildren(text);
    let latest = '';
    const r = await askPicked(threadPrompt(t, kind), (s) => ((latest = s), (text.innerHTML = md(s))), mine.signal);
    if (mine.signal.aborted) return;
    if (r === 'no-model') return say('Connect a model to summarize mail and draft replies.', h('button', { type: 'button', class: 'btn', onclick: () => ctx.go('chat') }, 'Connect a model'));
    if (r) return say(r);
    if (kind !== 'reply') return;
    const to = it.email || t.messages[t.messages.length - 1]?.email || '';
    const box = h('textarea', { class: 'text-input mail-draft', rows: 6, 'aria-label': 'Reply draft' }) as HTMLTextAreaElement;
    box.value = latest.trim();
    out.replaceChildren(
      box,
      h(
        'div',
        { class: 'mail-acts' },
        h('button', { type: 'button', class: 'btn primary', onclick: () => void ext.tabs.create({ url: composeUrl({ to, subject: t.subject, body: box.value }), windowId: ctx.windowId }) }, 'Open in Gmail'),
        h('button', { type: 'button', class: 'btn', onclick: () => void navigator.clipboard.writeText(box.value).then(() => toast('Copied'), () => toast('Couldn’t copy')) }, 'Copy'),
      ),
    );
    box.focus();
  };
  const acts = [
    it.code ? codeButton(it.code) : null,
    it.mid ? h('button', { type: 'button', class: 'btn ghost', onclick: () => void run('summary') }, 'Summarize') : null,
    it.mid ? h('button', { type: 'button', class: 'btn ghost', onclick: () => void run('reply') }, 'Draft reply') : null,
  ].filter(Boolean) as HTMLElement[];
  return acts.length ? [h('div', { class: 'mail-acts' }, ...acts), out] : [];
}

/** The newest sign-in code from Gmail, for 15 minutes; copy it or dismiss it. */
export function codePill(ctx: Ctx): HTMLElement {
  const host = h('div', { class: 'code-pills' });
  if (!ctx.settings.status.gmail) return host;
  const paint = async () => {
    const [cards, seen] = await Promise.all([getLocal<StatusCard[]>('status', []), getLocal<string[]>('codesSeen', [])]);
    const it = cards.find((c) => c.id === 'gmail')?.items.find((i) => i.code && i.at && Date.now() - i.at < FRESH_MS && !seen.includes(`${i.mid}:${i.code}`));
    if (!it) return host.replaceChildren();
    const dismiss = async () => setLocal('codesSeen', [`${it.mid}:${it.code}`, ...(await getLocal<string[]>('codesSeen', []))].slice(0, 50));
    host.replaceChildren(h('div', { class: 'code-pill', role: 'status' }, ico('key', 16), h('span', { class: 'code-from' }, `${it.meta || 'Sign-in'} code`), codeButton(it.code!), iconButton('close', 'Dismiss code', () => void dismiss())));
  };
  void paint();
  const stops = [onLocalChanged('status', () => void paint()), onLocalChanged('codesSeen', () => void paint())];
  const timer = setInterval(() => void paint(), 60_000);
  ctx.signal?.addEventListener('abort', () => (stops.forEach((f) => f()), clearInterval(timer)), { once: true });
  // A code is often why you opened this page: look now if the last look is over a minute old.
  void getLocal<StatusCard[]>('status', []).then((cards) => {
    const g = cards.find((c) => c.id === 'gmail');
    if (!g || Date.now() - g.updatedAt > 60_000) void send({ type: 'refresh-status' }).catch(() => undefined);
  });
  return host;
}

function cardEl(ctx: Ctx, c: StatusCard, isNew: boolean): HTMLElement {
  const card = h('div', { class: `card${isNew ? '' : ' quiet'}` });
  card.append(
    h(
      'div',
      { class: 'card-head' },
      h('span', { class: 'card-title' }, c.title, isNew ? h('span', { class: 'new-dot', title: 'New since you last looked' }) : null),
      c.value ? h('span', { class: 'card-value' }, c.value) : null,
    ),
    h('div', { class: 'card-detail' }, c.error ? c.error : c.detail),
  );
  for (const it of c.items) {
    card.append(
      h(
        'button',
        { class: 'row', type: 'button', title: it.url, onclick: (e: MouseEvent) => openUrl(ctx, it.url, e) },
        h('span', { class: `dot ${it.state ?? ''}` }),
        h('span', { class: 'text' }, h('span', { class: 't' }, it.title), h('span', { class: 'm' }, it.meta)),
      ),
      ...(c.id === 'gmail' ? mailActions(ctx, it) : []),
    );
  }
  if (c.error) {
    card.append(h('div', { style: { marginTop: '8px' } }, h('button', { class: 'btn', type: 'button', onclick: () => openOptions('status') }, 'Open settings')));
  } else {
    card.append(
      h(
        'div',
        { class: 'subtle', style: { marginTop: '6px', display: 'flex' } },
        h('span', { style: { flex: '1' } }, `Updated ${ago(c.updatedAt)}`),
        h('a', { href: c.url, onclick: (e: MouseEvent) => (e.preventDefault(), openUrl(ctx, c.url, e)) }, 'Open'),
      ),
    );
  }
  return card;
}

export async function statusView(ctx: Ctx): Promise<HTMLElement> {
  const root = h('div', { class: 'app' });
  const body = h('div', { class: 'pad' });
  const render = async (cards?: StatusCard[]) => {
    const list = cards ?? (await getLocal<StatusCard[]>('status', []));
    const seen = await getLocal<Record<string, string>>('statusSeen', {});
    body.textContent = '';
    const enabled = ctx.settings.status;
    if (!enabled.github && !enabled.vercel && !enabled.gmail) {
      body.append(
        h(
          'div',
          { class: 'empty' },
          h('div', { style: { marginBottom: '12px' } }, 'See GitHub reviews, Vercel deploys and unread Gmail at a glance. Cards stay quiet until something changes.'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => openOptions('status') }, 'Turn on cards'),
        ),
      );
      return;
    }
    if (!list.length) body.append(h('div', { class: 'empty' }, 'Checking…'));
    const fresh = list.filter((c) => c.signature && seen[c.id] !== c.signature);
    const quiet = list.filter((c) => !fresh.includes(c));
    for (const c of fresh) body.append(cardEl(ctx, c, true));
    for (const c of quiet) body.append(cardEl(ctx, c, false));
    // Looking at the cards counts as seeing them.
    await setLocal('statusSeen', Object.fromEntries(list.map((c) => [c.id, c.signature])));
  };
  const refresh = iconButton('refresh', 'Refresh', async () => {
    refresh.classList.add('spinning');
    refresh.setAttribute('aria-busy', 'true');
    const cards = (await send({ type: 'refresh-status' }).catch(() => undefined)) as StatusCard[] | undefined;
    refresh.classList.remove('spinning');
    refresh.removeAttribute('aria-busy');
    await render(cards);
  });
  root.append(
    h(
      'div',
      { class: 'bar' },
      iconButton('back', 'Back', () => ctx.go('home')),
      h('span', { class: 'title' }, 'Status'),
      refresh,
      ctx.kind === 'drawer' ? iconButton('close', 'Close (Esc)', () => ctx.close()) : null,
    ),
    h('div', { class: 'scroll' }, body),
  );
  await render();
  void ico;
  return root;
}
