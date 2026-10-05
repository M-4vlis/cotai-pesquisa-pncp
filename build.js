import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';

await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
await Promise.all([
  cp('index.html', 'dist/index.html'),
  cp('styles.css', 'dist/styles.css'),
  cp('app.js', 'dist/app.js'),
  cp('public/og-v2.png', 'dist/og.png'),
  cp('public/logo-cotai.ico', 'dist/logo-cotai.ico'),
  cp('.openai/hosting.json', 'dist/.openai/hosting.json'),
]);

const [page, styles, app, server, ogImage, logoIcon] = await Promise.all([
  readFile('index.html', 'utf8'),
  readFile('styles.css', 'utf8'),
  readFile('app.js', 'utf8'),
  readFile('server.js', 'utf8'),
  readFile('public/og-v2.png'),
  readFile('public/logo-cotai.ico'),
]);

const html = page
  .replace('<link rel="stylesheet" href="styles.css" />', `<style>${styles}</style>`)
  .replace('<script src="app.js"></script>', `<script>${app}</script>`);

const worker = server
  .replace('"__COTAI_HTML__"', JSON.stringify(html))
  .replace('"__COTAI_OG_BASE64__"', JSON.stringify(ogImage.toString('base64')))
  .replace('"__COTAI_LOGO_ICO_BASE64__"', JSON.stringify(logoIcon.toString('base64')));
await writeFile('dist/server/index.js', worker);
