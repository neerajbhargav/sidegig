// Google apps keep one address per signed-in account (/mail/u/0/, /calendar/u/1/…).
// sidegig switches between them with the browser's own Google sign-ins: no sign-in
// of its own and no Google app registration. Pure functions, unit-tested.

/** Which signed-in account a Google app address shows, or null when it has no /u/N/. */
export function accountIndex(url: string): number | null {
  const m = url.match(/^https:\/\/[a-z]+\.google\.com\/(?:[a-z]+\/)?u\/(\d+)\//);
  return m ? Number(m[1]) : null;
}

/** The same address for another account. */
export const withAccount = (url: string, i: number) => url.replace(/\/u\/\d+\//, `/u/${i}/`);

/** The account an inbox feed belongs to: its title ends with the address, in any language. */
export const feedAccount = (xml: string) => xml.match(/<title>[^<]*?([^\s<>]+@[^\s<>]+)\s*<\/title>/)?.[1] ?? null;
