import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

// Finestra che sale dal basso (filtri, scelte, nuovo movimento). <dialog> nativo:
// focus dentro la finestra, Esc chiude, il resto della pagina non si tocca.
// Da md in su resta un pannello centrato in basso, largo al massimo come il contenuto.
export default function BottomSheet({ aperto, onChiudi, titolo, children, piede }) {
  const ref = useRef(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aperto && !d.open) d.showModal();
    if (!aperto && d.open) d.close();
  }, [aperto]);

  return (
    <dialog
      ref={ref}
      aria-label={titolo}
      data-sheet={titolo}
      onCancel={e => { e.preventDefault(); onChiudi(); }}
      onClick={e => { if (e.target === ref.current) onChiudi(); }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 mx-auto flex max-h-[92dvh] w-full max-w-xl flex-col rounded-t-2xl bg-superficie p-0 text-testo shadow-2xl backdrop:bg-black/45 [&:not([open])]:hidden"
    >
      <div className="flex items-center justify-between px-4 pb-2 pt-2">
        <span aria-hidden="true" className="absolute left-1/2 top-2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-bordo" />
        <h2 className="mt-3 font-importi text-lg text-secondario">{titolo}</h2>
        <button type="button" onClick={onChiudi} aria-label="Chiudi" className="mt-3 rounded-full p-1 text-tenue">
          <X size={22} aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">{aperto && children}</div>
      {piede && aperto && <div className="border-t border-bordo px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">{piede}</div>}
    </dialog>
  );
}
