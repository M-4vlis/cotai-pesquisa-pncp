import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';

await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
await Promise.all([
  cp('index.html', 'dist/index.html'),
  cp('styles.css', 'dist/styles.css'),
  cp('app.js', 'dist/app.js'),
  cp('.openai/hosting.json', 'dist/.openai/hosting.json'),
]);

const [page, styles, app] = await Promise.all([
  readFile('index.html', 'utf8'),
  readFile('styles.css', 'utf8'),
  readFile('app.js', 'utf8'),
]);

const html = page
  .replace('<link rel="stylesheet" href="styles.css" />', `<style>${styles}</style>`)
  .replace('<script src="app.js"></script>', `<script>${app}</script>`);

const worker = `const html = ${JSON.stringify(html)};
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== '/' && url.pathname !== '/index.html') {
      return new Response('Não encontrado', { status: 404 });
    }
    return new Response(html, {
      headers: {
        'content-type': 'text/html; charset=UTF-8',
        'cache-control': 'public, max-age=300',
      },
    });
  },
};
`;

await writeFile('dist/server/index.js', worker);
