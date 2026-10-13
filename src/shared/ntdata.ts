// Small pure pieces behind the new tab's everyday tools: search engines, the
// greeting, the to-do list's daily reset, and weather codes. Unit-tested.

export const ENGINES: Record<string, { name: string; url?: (q: string) => string }> = {
  default: { name: 'Browser default' },
  google: { name: 'Google', url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  duckduckgo: { name: 'DuckDuckGo', url: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
  bing: { name: 'Bing', url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
  brave: { name: 'Brave Search', url: (q) => `https://search.brave.com/search?q=${encodeURIComponent(q)}` },
  kagi: { name: 'Kagi', url: (q) => `https://kagi.com/search?q=${encodeURIComponent(q)}` },
  perplexity: { name: 'Perplexity', url: (q) => `https://www.perplexity.ai/search?q=${encodeURIComponent(q)}` },
  youtube: { name: 'YouTube', url: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}` },
  wikipedia: { name: 'Wikipedia', url: (q) => `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}` },
};

/** null means "let the browser use its own default engine". */
export function engineUrl(id: string, q: string): string | null {
  return ENGINES[id]?.url?.(q) ?? null;
}

export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 22) return 'Good evening';
  return 'Good night';
}

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  pinned: boolean;
  created: number;
}

export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * A new day: finished tasks clear away, pinned tasks come back as to-dos
 * (daily habits), and anything unfinished carries over.
 */
export function dailyReset(todos: Todo[], lastDay: string, today: string): Todo[] {
  if (lastDay === today) return todos;
  return todos.filter((t) => t.pinned || !t.done).map((t) => (t.pinned ? { ...t, done: false } : t));
}

/** Pinned first, then open before done, then oldest first. */
export function sortTodos(todos: Todo[]): Todo[] {
  return [...todos].sort((a, b) => Number(b.pinned) - Number(a.pinned) || Number(a.done) - Number(b.done) || a.created - b.created);
}

/** WMO weather codes (Open-Meteo) to a short label and an icon name. */
export function weatherLabel(code: number, isDay = true): { label: string; icon: string } {
  if (code === 0) return { label: isDay ? 'Clear' : 'Clear night', icon: isDay ? 'wxSun' : 'wxNight' };
  if (code === 1 || code === 2) return { label: code === 1 ? 'Mostly clear' : 'Partly cloudy', icon: isDay ? 'wxPartly' : 'wxPartlyNight' };
  if (code === 3) return { label: 'Overcast', icon: 'wxCloud' };
  if (code === 45 || code === 48) return { label: 'Fog', icon: 'wxFog' };
  if (code >= 51 && code <= 57) return { label: 'Drizzle', icon: 'wxRain' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: code >= 80 ? 'Showers' : 'Rain', icon: 'wxRain' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: 'Snow', icon: 'wxSnow' };
  if (code >= 95) return { label: 'Thunderstorm', icon: 'wxStorm' };
  return { label: 'Weather', icon: 'wxCloud' };
}

export interface WeatherNow {
  temp: number;
  feels: number;
  humidity: number;
  code: number;
  isDay: boolean;
  hi: number;
  lo: number;
  units: 'f' | 'c';
  place: string;
  at: number;
  /** The next few days. */
  days?: { date: string; code: number; hi: number; lo: number }[];
  /** Wind now: speed (mph or km/h, matching the units) and the compass direction it comes from. */
  wind?: { speed: number; dir: number };
}

export function weatherUrl(lat: number, lon: number, units: 'f' | 'c'): string {
  const q = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,wind_direction_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    temperature_unit: units === 'f' ? 'fahrenheit' : 'celsius',
    wind_speed_unit: units === 'f' ? 'mph' : 'kmh',
    timezone: 'auto',
    forecast_days: '5',
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

export function parseWeather(raw: unknown, units: 'f' | 'c', place: string, now = Date.now()): WeatherNow | null {
  const d = raw as any;
  const c = d?.current;
  if (!c || typeof c.temperature_2m !== 'number') return null;
  return {
    temp: Math.round(c.temperature_2m),
    feels: Math.round(c.apparent_temperature ?? c.temperature_2m),
    humidity: Math.round(c.relative_humidity_2m ?? 0),
    code: Number(c.weather_code ?? 0),
    isDay: c.is_day !== 0,
    hi: Math.round(d.daily?.temperature_2m_max?.[0] ?? c.temperature_2m),
    lo: Math.round(d.daily?.temperature_2m_min?.[0] ?? c.temperature_2m),
    units,
    place,
    at: now,
    days: Array.isArray(d.daily?.time)
      ? d.daily.time.slice(1, 5).map((date: string, i: number) => ({
          date,
          code: Number(d.daily.weather_code?.[i + 1] ?? 0),
          hi: Math.round(d.daily.temperature_2m_max?.[i + 1] ?? 0),
          lo: Math.round(d.daily.temperature_2m_min?.[i + 1] ?? 0),
        }))
      : [],
    ...(typeof c.wind_speed_10m === 'number' ? { wind: { speed: Math.round(c.wind_speed_10m), dir: Math.round(c.wind_direction_10m ?? 0) } } : {}),
  };
}

/**
 * A wallpaper credit short enough for the top bar: the photographer's initials
 * ("Photo: Austin Neill on Unsplash" -> "AN"), the source's initials for
 * "Title · Source · licence" ("AIC"), or a one-word source ("NASA"). Your own
 * pictures need no credit.
 */
export function shortCredit(credit: string): string {
  const c = credit.replace(/\s+/g, ' ').trim();
  if (!c || /^your pictures?$/i.test(c) || /·\s*your pictures$/i.test(c)) return '';
  const initials = (s: string) =>
    s
      .split(' ')
      .filter((w) => /^\p{Lu}/u.test(w))
      .slice(0, 3)
      .map((w) => w[0])
      .join('');
  const by = c.match(/^(?:(?:photo|picture|image)\s*(?:by|:)\s*)?(.+?)\s+(?:on|via)\s+\S/i);
  if (by) return initials(by[1]) || by[1].slice(0, 3);
  const parts = c.split(' · ');
  const source = parts.length > 1 ? parts[parts.length > 2 ? 1 : parts.length - 1] : parts[0];
  if (!source.includes(' ') && source.length <= 10) return source;
  return initials(source) || source.slice(0, 3);
}
