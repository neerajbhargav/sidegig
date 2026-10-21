/** Up/Down move focus between a vertical list's buttons; Home/End jump to the ends. */
export function arrowNav(list: HTMLElement): void {
  list.addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const items = [...list.querySelectorAll<HTMLElement>('button')].filter((b) => b.offsetParent !== null);
    const at = items.indexOf(e.target as HTMLElement);
    if (at < 0) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  });
}
