// Pilota minimo di Chrome headless via DevTools Protocol, senza dipendenze
// (WebSocket e fetch di Node >= 22). Lo usano gli smoke del frontend (da U3).
//
//   const b = await avvia({ chrome, profilo });  const p = await b.pagina();
//   await p.vai(url); await p.valuta('document.title'); await p.foto(file);
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const attendi = ms => new Promise(r => setTimeout(r, ms));

export async function avvia({ chrome, profilo, porta = 9300 + Math.floor(Math.random() * 500) }) {
  const proc = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', `--remote-debugging-port=${porta}`, `--user-data-dir=${profilo}`, 'about:blank'
  ], { stdio: 'ignore' });
  let versione;
  for (let i = 0; i < 100 && !versione; i++) {
    try { versione = await (await fetch(`http://127.0.0.1:${porta}/json/version`)).json(); } catch { await attendi(100); }
  }
  if (!versione) { proc.kill(); throw new Error('Chrome non risponde'); }
  return {
    async pagina() {
      const t = await (await fetch(`http://127.0.0.1:${porta}/json/new?about:blank`, { method: 'PUT' })).json();
      return apri(t.webSocketDebuggerUrl);
    },
    chiudi() { proc.kill(); }
  };
}

async function apri(url) {
  const ws = new WebSocket(url);
  await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko; });
  let id = 0;
  const attese = new Map();
  const ascolti = [];
  const violazioni = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && attese.has(m.id)) {
      const { ok, ko } = attese.get(m.id); attese.delete(m.id);
      m.error ? ko(new Error(m.error.message)) : ok(m.result);
    } else if (m.method) {
      if (m.method === 'Runtime.consoleAPICalled' && m.params.args?.[0]?.value === '__csp__') {
        violazioni.push(m.params.args[1]?.value);
      }
      for (const f of ascolti) f(m);
    }
  };
  const invia = (method, params = {}) => new Promise((ok, ko) => {
    const n = ++id; attese.set(n, { ok, ko }); ws.send(JSON.stringify({ id: n, method, params }));
  });
  await invia('Page.enable');
  await invia('Runtime.enable');
  // Iniettato da DevTools, non soggetto alla CSP: registra ogni violazione.
  await invia('Page.addScriptToEvaluateOnNewDocument', { source:
    "document.addEventListener('securitypolicyviolation', e => console.log('__csp__', e.violatedDirective + ' ' + (e.blockedURI || '')));" });

  const p = {
    violazioni,
    invia,
    async schermo(larghezza, altezza, scala = 2, mobile = true) {
      await invia('Emulation.setDeviceMetricsOverride', { width: larghezza, height: altezza, deviceScaleFactor: scala, mobile });
    },
    async schemaColori(scuro) {
      await invia('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scuro ? 'dark' : 'light' }] });
    },
    async vai(u) {
      const caricato = new Promise(r => { const f = m => { if (m.method === 'Page.loadEventFired') { ascolti.splice(ascolti.indexOf(f), 1); r(); } }; ascolti.push(f); });
      await invia('Page.navigate', { url: u });
      await caricato;
    },
    async valuta(espr) {
      const r = await invia('Runtime.evaluate', { expression: espr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    // Attende che l'espressione sia vera (o falsa al tempo scaduto).
    async aspetta(espr, ms = 8000) {
      for (let t = 0; t < ms; t += 100) { if (await p.valuta(`!!(${espr})`)) return true; await attendi(100); }
      return false;
    },
    // Scrive in un input controllato da React (setter nativo + evento input).
    async scrivi(selettore, valore) {
      return p.valuta(`(() => { const el = document.querySelector(${JSON.stringify(selettore)});
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        set.call(el, ${JSON.stringify(valore)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    },
    async clic(selettore) {
      return p.valuta(`(() => { const el = document.querySelector(${JSON.stringify(selettore)}); if (!el) return false; el.click(); return true; })()`);
    },
    async foto(file) {
      await p.valuta('document.fonts.ready.then(() => true)');
      await attendi(150);
      const r = await invia('Page.captureScreenshot', { format: 'png' });
      await writeFile(file, Buffer.from(r.data, 'base64'));
    }
  };
  return p;
}
