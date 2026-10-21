// Optional daily tools using the extension's existing tabs and reading list.
import { ext } from '../../shared/api.ts';
import { getLocal, onLocalChanged } from '../../shared/storage.ts';
import { calculate } from '../../shared/calculate.ts';
import type { SavedItem } from '../../shared/edition/types.ts';
import { h, favicon, iconButton, toast } from '../dom.ts';
import { openUrl, type Ctx } from '../ctx.ts';
import { card } from './ntdash.ts';


export function calculatorCard(): HTMLElement {
  const input = h('input', { class: 'text-input calc-input', 'aria-label': 'Calculation', placeholder: '(24 + 18) / 3', inputmode: 'decimal', maxlength: 200 });
  const output = h('output', { class: 'calc-result', 'aria-live': 'polite' }, '0');
  const run = () => { try { output.textContent = String(calculate(input.value)); } catch (e) { output.textContent = (e as Error).message; } };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
  const keys = h('div', { class: 'calc-keys' }, ['7','8','9','÷','4','5','6','×','1','2','3','−','0','.','=','+'].map((key) => h('button', { type: 'button', class: 'nt-chip', onclick: () => { if (key === '=') run(); else { input.value += key; input.focus(); } } }, key)));
  return card('nt-extra', 'Calculator', [iconButton('undo', 'Clear calculation', () => { input.value = ''; output.textContent = '0'; input.focus(); })], h('div', { class: 'calc-body' }, input, output, keys));
}

export function readingCard(ctx: Ctx): HTMLElement {
  const body = h('div', { class: 'nt-extra-list' });
  let revision = 0;
  const openSaved = () => dispatchEvent(new CustomEvent('nt-open-edition', { detail: 'saved' }));
  const paint = async () => {
    const current = ++revision;
    const items = await getLocal<SavedItem[]>('edSaved', []);
    if (ctx.signal?.aborted || current !== revision) return;
    body.replaceChildren(...items.slice(0, 8).map((item) => h('button', { type: 'button', class: 'extra-link', onclick: (e: MouseEvent) => openUrl(ctx, item.url, e) }, favicon(item.url, item.title, 'fav sm'), h('span', {}, item.title))));
    if (!items.length) body.append(h('p', { class: 'nt-empty' }, 'Save an article, video or book in For you. Find it here later.'));
    body.append(h('button', { type: 'button', class: 'btn', onclick: openSaved }, 'Open reading list'));
  };
  const off = onLocalChanged('edSaved', () => void paint());
  ctx.signal?.addEventListener('abort', off, { once: true });
  void paint();
  return card('nt-extra', 'Reading list', [], body);
}

export function tabsCard(ctx: Ctx): HTMLElement {
  const body = h('div', { class: 'nt-extra-list' });
  let revision = 0;
  const paint = async () => {
    const current = ++revision;
    const tabs = (await ext.tabs.query({ currentWindow: true }).catch(() => [])).filter((tab) => /^https?:/.test(tab.url ?? ''));
    if (ctx.signal?.aborted || current !== revision) return;
    body.replaceChildren(...tabs.map((tab) => h('div', { class: 'extra-tab' }, h('button', { type: 'button', class: 'extra-link', onclick: () => tab.id !== undefined && ext.tabs.update(tab.id, { active: true }) }, favicon(tab.url!, tab.title ?? '', 'fav sm'), h('span', {}, tab.title || tab.url!)), iconButton('close', `Close ${tab.title || 'tab'}`, async () => { if (tab.id !== undefined) { await ext.tabs.remove(tab.id).catch(() => toast('This tab is already closed.')); await paint(); } }))));
    if (!tabs.length) body.append(h('p', { class: 'nt-empty' }, 'Your open web pages appear here.'));
  };
  for (const event of [ext.tabs.onCreated, ext.tabs.onRemoved, ext.tabs.onUpdated, ext.tabs.onActivated]) {
    event?.addListener(paint);
    ctx.signal?.addEventListener('abort', () => event?.removeListener(paint), { once: true });
  }
  void paint();
  return card('nt-extra', 'Open tabs', [], body);
}
