import { Hono } from 'hono';

export const imageProxy = new Hono();

imageProxy.get('/', async (c) => {
  const url = c.req.query('url');
  if (!url) return c.text('missing url', 400);
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return c.text('invalid protocol', 400);
  } catch {
    return c.text('invalid url', 400);
  }

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'AsterplayHub/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok || !res.body) return c.text('upstream error', 502);
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    return new Response(res.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    return c.text(`proxy error: ${err?.message || 'unknown'}`, 502);
  }
});
