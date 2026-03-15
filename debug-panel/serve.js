import { createServer } from 'http';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 3002;

createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(readFileSync(resolve(__dirname, 'index.html'), 'utf-8'));
}).listen(PORT, () => {
  console.log(`Command Debug Panel → http://localhost:${PORT}`);
});
