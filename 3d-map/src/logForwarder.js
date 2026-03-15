// Intercepts console.log/warn/error and forwards to log-server
const LOG_URL = 'http://localhost:5180/log';

function send(level, args) {
  const cleaned = args.map(a => {
    if (typeof a === 'string') return a.replace(/%c/g, '');
    if (a instanceof Error) return `${a.message}\n${a.stack}`;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).filter(s => !s.startsWith('color:') && !s.startsWith('font-'));

  // Fire and forget
  fetch(LOG_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level, args: cleaned }),
  }).catch(() => {}); // silently ignore if log server is down
}

const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;

console.log = (...args) => { origLog(...args); send('LOG', args); };
console.warn = (...args) => { origWarn(...args); send('WARN', args); };
console.error = (...args) => { origError(...args); send('ERR', args); };
