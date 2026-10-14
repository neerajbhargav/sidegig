// Server-sent events, as every model API streams them: "event:" and "data:"
// lines, a blank line between events.

export interface SseEvent {
  event: string;
  data: string;
}

/** Feed text in chunks; get whole events out. */
export class SseParser {
  private buf = '';
  private event = '';
  private data: string[] = [];

  push(chunk: string): SseEvent[] {
    this.buf += chunk;
    const out: SseEvent[] = [];
    let nl: number;
    while ((nl = this.buf.search(/\r?\n/)) >= 0) {
      const line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + (this.buf[nl] === '\r' ? 2 : 1));
      if (line === '') {
        if (this.data.length) out.push({ event: this.event || 'message', data: this.data.join('\n') });
        this.event = '';
        this.data = [];
      } else if (line.startsWith(':')) {
        // comment / keep-alive
      } else {
        const c = line.indexOf(':');
        const field = c < 0 ? line : line.slice(0, c);
        const value = c < 0 ? '' : line.slice(c + 1).replace(/^ /, '');
        if (field === 'event') this.event = value;
        else if (field === 'data') this.data.push(value);
      }
    }
    return out;
  }

  /** Whatever is left when the stream closes. */
  end(): SseEvent[] {
    const out = this.push('\n\n');
    return out;
  }
}

/** Read a fetch response as server-sent events. */
export async function* sseEvents(res: Response, signal?: AbortSignal): AsyncGenerator<SseEvent> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  const p = new SseParser();
  try {
    while (true) {
      if (signal?.aborted) return;
      const { value, done } = await reader.read();
      if (done) break;
      for (const e of p.push(dec.decode(value, { stream: true }))) yield e;
    }
    for (const e of p.end()) yield e;
  } finally {
    reader.releaseLock();
  }
}
