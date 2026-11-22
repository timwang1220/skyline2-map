const mapPath = 'online-city/map.cs2map.enc';

export function onlineCitySources(base: string, revision?: string, repository?: string) {
  const primary = base + mapPath + (revision ? `?v=${encodeURIComponent(revision)}` : '');
  const match = repository?.match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/?$/);
  const backup = match && revision && /^[a-f0-9]{40}$/i.test(revision)
    ? `https://raw.githubusercontent.com/${match[1]}/${revision}/public/${mapPath}`
    : primary;
  return [primary, backup];
}

export async function downloadOnlineCity(
  sources: string[],
  signal: AbortSignal,
  status: (message: string) => void,
  idleMs = 30_000,
): Promise<ArrayBuffer> {
  for (const [attempt, url] of sources.entries()) {
    signal.throwIfAborted();
    status(attempt ? 'Retrying download…' : 'Connecting…');
    const connection = new AbortController();
    const cancel = () => connection.abort(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const resetTimeout = () => {
      clearTimeout(timer);
      timer = setTimeout(() => connection.abort(new DOMException('Map download stalled', 'TimeoutError')), idleMs);
    };
    resetTimeout();

    try {
      const isRetry = attempt > 0 && url === sources[0];
      const cache = isRetry ? 'reload' : url.includes('?v=') || attempt > 0 ? 'default' : 'no-cache';
      const response = await fetch(url, { signal: connection.signal, cache });
      if (response.status !== 200) throw new Error(`Map download returned HTTP ${response.status}`);
      resetTimeout();
      status('Downloading map…');
      if (!response.body) return await response.arrayBuffer();

      const encoding = response.headers.get('content-encoding');
      const total = !encoding || encoding === 'identity' ? Number(response.headers.get('content-length')) : 0;
      const reader = response.body.getReader();
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let received = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value.byteLength) continue;
          resetTimeout();
          chunks.push(value);
          received += value.byteLength;
          const progress = total > 0 ? `${Math.min(100, Math.floor(received * 20 / total) * 5)}%`
            : `${(received / 1_000_000).toFixed(1)} MB`;
          status(`Downloading map… ${progress}`);
        }
      } finally {
        reader.releaseLock();
      }
      if (!received || (total > 0 && received !== total)) throw new Error('Incomplete map download');
      return await new Blob(chunks).arrayBuffer();
    } catch (error) {
      signal.throwIfAborted();
      if (attempt === sources.length - 1) throw error;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      connection.abort();
    }
  }
  throw new Error('No map source available');
}
