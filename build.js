import { cp, mkdir } from 'node:fs/promises';

await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
await Promise.all([
  cp('index.html', 'dist/index.html'),
  cp('styles.css', 'dist/styles.css'),
  cp('app.js', 'dist/app.js'),
  cp('server.js', 'dist/server/index.js'),
  cp('.openai/hosting.json', 'dist/.openai/hosting.json'),
]);
