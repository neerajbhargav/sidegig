// Hand-drawn 24px stroke icons (original to Margin). Rendered with currentColor.
const P: Record<string, string> = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  stacks: '<path d="M12 3.5l8.5 4.5L12 12.5 3.5 8z"/><path d="M3.5 12L12 16.5 20.5 12"/><path d="M3.5 16L12 20.5 20.5 16"/>',
  pulse: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  sparkle: '<path d="M12 3.5c.6 4.6 3.9 7.9 8.5 8.5-4.6.6-7.9 3.9-8.5 8.5-.6-4.6-3.9-7.9-8.5-8.5 4.6-.6 7.9-3.9 8.5-8.5z"/>',
  pin: '<path d="M9 3.5h6l-.8 5.2 3.3 3.3V14h-11v-2l3.3-3.3z"/><path d="M12 14v6.5"/>',
  pinOff: '<path d="M9 3.5h6l-.8 5.2 3.3 3.3V14h-11v-2l3.3-3.3z"/><path d="M12 14v6.5"/><path d="M4 4l16 16"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M14.5 6l-6 6 6 6"/>',
  forward: '<path d="M9.5 6l6 6-6 6"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
  external: '<path d="M14 4.5h5.5V10"/><path d="M19.5 4.5L11 13"/><path d="M17 13.5v5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 17.5h2"/>',
  window: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M14.5 5v14"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  tab: '<rect x="3.5" y="6" width="17" height="13" rx="2"/><path d="M3.5 10h17M8 6V4.5h6V6"/>',
  history: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/><path d="M12 8v4.5l3 2"/>',
  bookmark: '<path d="M7 4h10v16l-5-3.5L7 20z"/>',
  folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  command: '<path d="M9 6.5V17.5M15 6.5V17.5M6.5 9h11M6.5 15h11"/>',
  moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7"/>',
  up: '<path d="M6 14.5l6-6 6 6"/>',
  down: '<path d="M6 9.5l6 6 6-6"/>',
  sleep: '<path d="M14 4h5l-5 6h5"/><path d="M5 12h4l-4 6h4"/>',
  save: '<path d="M5 4.5h11l3.5 3.5V19a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V5.5a1 1 0 0 1 .5-1z"/><path d="M8 4.5V9h7V4.5M8 20v-5.5h8V20"/>',
  logo: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="M9 7.5v9"/>',
};

export function icon(name: keyof typeof P | string, size = 20, stroke = 1.75): string {
  const body = P[name] ?? P.grid;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export type IconName = keyof typeof P;
