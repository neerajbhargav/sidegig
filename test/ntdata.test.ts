import { test } from 'node:test';
import assert from 'node:assert/strict';
import { navigationUrl, engineUrl, greetingFor, dailyReset, sortTodos, weatherLabel, weatherUrl, parseWeather, type Todo } from '../src/shared/ntdata.ts';

test('engines: default defers to the browser, others build a URL', () => {
  assert.equal(engineUrl('default', 'x'), null);
  assert.equal(engineUrl('duckduckgo', 'a b'), 'https://duckduckgo.com/?q=a%20b');
  assert.equal(engineUrl('nope', 'x'), null);
});

test('greeting follows the time of day', () => {
  assert.equal(greetingFor(8), 'Good morning');
  assert.equal(greetingFor(13), 'Good afternoon');
  assert.equal(greetingFor(19), 'Good evening');
  assert.equal(greetingFor(2), 'Good night');
});

const t = (id: string, done: boolean, pinned: boolean, created = 0): Todo => ({ id, text: id, done, pinned, created });

test('to-do daily reset: done clears, pinned comes back, unfinished carries over', () => {
  const list = [t('done', true, false), t('open', false, false), t('habit', true, true)];
  assert.equal(dailyReset(list, '2026-10-13', '2026-10-13'), list, 'same day: untouched');
  const next = dailyReset(list, '2026-10-13', '2026-10-14');
  assert.deepEqual(next.map((x) => [x.id, x.done]), [['open', false], ['habit', false]]);
});

test('to-do order: pinned, then open, then done', () => {
  const s = sortTodos([t('d', true, false, 1), t('o', false, false, 2), t('p', false, true, 3)]);
  assert.deepEqual(s.map((x) => x.id), ['p', 'o', 'd']);
});

test('weather: codes, URL and parsing (Open-Meteo shape)', () => {
  assert.equal(weatherLabel(0, false).icon, 'wxNight');
  assert.equal(weatherLabel(63).label, 'Rain');
  assert.equal(weatherLabel(95).icon, 'wxStorm');
  assert.match(weatherUrl(40.728, -74.077, 'f'), /latitude=40\.728.*temperature_unit=fahrenheit/);
  const w = parseWeather(
    { current: { temperature_2m: 57.6, relative_humidity_2m: 71, apparent_temperature: 55.2, weather_code: 3, is_day: 1 }, daily: { temperature_2m_max: [62.1], temperature_2m_min: [49.4] } },
    'f',
    'Jersey City',
    1,
  );
  assert.deepEqual(w, { temp: 58, feels: 55, humidity: 71, code: 3, isDay: true, hi: 62, lo: 49, units: 'f', place: 'Jersey City', at: 1, days: [] });
  assert.equal(parseWeather({}, 'c', 'x'), null);
});

// Addresses and search phrases share one input in the new tab and sidebar.
// Explicit addresses must not become web searches or executable schemes.
test('navigation opens real web addresses and leaves phrases and unsafe schemes as search text', () => {
  for (const [input, expected] of [
    ['example.com', 'https://example.com/'],
    ['https://example.com/docs?q=hello#part', 'https://example.com/docs?q=hello#part'],
    ['http://localhost:8765/preview/', 'http://localhost:8765/preview/'],
    ['localhost:3000', 'http://localhost:3000/'],
    ['127.0.0.1:8765/check', 'https://127.0.0.1:8765/check'],
    [' EXAMPLE.com/path ', 'https://example.com/path'],
  ]) assert.equal(navigationUrl(input), expected);
  for (const input of ['', 'new tab ideas', 'how to use example.com', 'javascript:alert(1)', 'data:text/html,test', 'file:///tmp/test', 'https://user:password@example.com', 'https://', 'example.com:99999']) assert.equal(navigationUrl(input), null, input);
});
