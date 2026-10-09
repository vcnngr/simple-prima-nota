import { useEffect, useRef } from 'react';

// Carica la pagina successiva quando la fine della lista entra nello schermo.
// Il pulsante resta per chi non scorre (tastiera, lettori di schermo).
export default function ListaInfinita({ altre, caricando, onAltre, children, vuota }) {
  const fine = useRef(null);

  useEffect(() => {
    const el = fine.current;
    if (!el || !altre) return;
    const o = new IntersectionObserver(v => { if (v[0].isIntersecting && !caricando) onAltre(); }, { rootMargin: '400px' });
    o.observe(el);
    return () => o.disconnect();
  }, [altre, caricando, onAltre]);

  return (
    <div>
      {children}
      {vuota}
      <div ref={fine} className="py-4 text-center text-sm text-tenue" data-fine-lista={altre ? 'altre' : 'fine'}>
        {altre && (
          <button type="button" onClick={onAltre} disabled={caricando} className="rounded-lg border border-bordo px-4 py-2">
            {caricando ? 'Caricamento…' : 'Carica altri'}
          </button>
        )}
      </div>
    </div>
  );
}
