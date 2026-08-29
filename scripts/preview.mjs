import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, normalize, resolve } from 'node:path';

const root = resolve('html');
const settings = JSON.parse(await readFile(resolve(root, 'annual-wheel-locales.json'), 'utf8'));
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.po': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

const negotiateLocale = header => {
  const requested = String(header || '')
    .split(',')
    .map(value => {
      const [language, ...parameters] = value.trim().split(';');
      const quality = Number(parameters.find(parameter => parameter.trim().startsWith('q='))?.trim().slice(2) || 1);
      return { language, quality };
    })
    .filter(({ language, quality }) => language && quality > 0)
    .sort((left, right) => right.quality - left.quality);
  for (const { language } of requested) {
    const exact = settings.locales.find(locale => locale.toLowerCase() === language.toLowerCase());
    if (exact) return exact;
    const base = language.toLowerCase().split('-')[0];
    const related = settings.locales.find(locale => locale.toLowerCase().split('-')[0] === base);
    if (related) return related;
  }
  return settings.fallback;
};

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const requested = pathname === '/' ? '/' + negotiateLocale(request.headers['accept-language']) + '/index.html' : pathname;
  const file = resolve(root, '.' + normalize(requested));
  if (!file.startsWith(root + '/')) {
    response.writeHead(403).end();
    return;
  }
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Not a file');
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(file)] || 'application/octet-stream',
      ...(pathname === '/' ? { Vary: 'Accept-Language' } : {}),
    });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

server.listen(8767, '127.0.0.1', () => {
  console.log('Annual wheel preview: http://127.0.0.1:8767/');
});
