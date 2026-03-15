// Tiny log server — receives POST /log from the frontend, appends to console.log file
import { createServer } from 'http';
import { appendFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_FILE = resolve(__dirname, 'console.log');
const PORT = 5180;

// Clear log on startup
writeFileSync(LOG_FILE, `=== FireSight console log started ${new Date().toISOString()} ===\n`);

const server = createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/log') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { level, args } = JSON.parse(body);
        const ts = new Date().toISOString().slice(11, 23);
        const line = `[${ts}] [${level}] ${args.join(' ')}\n`;
        appendFileSync(LOG_FILE, line);
      } catch (e) {
        appendFileSync(LOG_FILE, `[RAW] ${body}\n`);
      }
      res.writeHead(200);
      res.end('ok');
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`Log server listening on http://localhost:${PORT}`);
  console.log(`Writing to ${LOG_FILE}`);
});
