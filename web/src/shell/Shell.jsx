import { NavLink, Outlet, Link, useMatches } from 'react-router';
import { Plus, Settings } from 'lucide-react';
import { useSessione } from '../sessione/Sessione';
import { VOCI } from './voci';

function Voce({ a, etichetta, Icona, esatto }) {
  return (
    <NavLink
      to={a}
      end={esatto}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs md:flex-none md:flex-row md:gap-3 md:rounded-lg md:px-3 md:py-2.5 md:text-[1.0625rem] ${
          isActive ? 'text-principale font-semibold md:bg-principale/10' : 'text-tenue md:text-testo md:hover:bg-principale/5'
        }`}
    >
      <Icona size={22} aria-hidden="true" />
      <span>{etichetta}</span>
    </NavLink>
  );
}

// Mobile (fino a md): intestazione in alto, barra in basso con il «+» al centro.
// Da md in su: colonna a sinistra. Nessuno scroll orizzontale a 390 px.
export default function Shell() {
  const { tipo, account } = useSessione();
  const v = VOCI[tipo];
  const nome = tipo === 'commercialista' ? account?.ragione_sociale || account?.username : account?.username;
  const telefono = v.voci.filter(x => !x.soloLargo);
  const meta = Math.ceil(telefono.length / 2);
  const sinistra = v.nuovo ? telefono.slice(0, meta) : telefono;
  const destra = v.nuovo ? telefono.slice(meta) : [];
  // U7: le pagine con handle.largo (il Registro) usano tutta la larghezza da lg.
  const largo = useMatches().some(m => m.handle?.largo);

  return (
    <div className="min-h-full md:flex" data-shell={tipo}>
      <aside className="hidden md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:gap-1 md:border-r md:border-bordo md:bg-superficie md:p-4 lg:w-64">
        <Link to={v.home} className="mb-6 font-importi text-2xl font-semibold text-secondario">Prima Nota</Link>
        {v.nuovo && (
          <Link to={v.nuovo} data-nuovo-largo className="mb-5 flex items-center justify-center gap-2 rounded-xl bg-accento px-3 py-3 text-[1.0625rem] font-bold text-su-accento shadow-sm">
            <Plus size={20} aria-hidden="true" /> Nuovo movimento
          </Link>
        )}
        {v.voci.map(x => <Voce key={x.a} {...x} />)}
        <Link to={v.impostazioni} className="mt-auto hidden items-center gap-2 px-3 py-2 text-tenue lg:flex" aria-label="Impostazioni" data-impostazioni-largo>
          <Settings size={20} aria-hidden="true" /><span className="truncate">{nome}</span>
        </Link>
      </aside>

      <div className="flex min-h-full min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-bordo bg-superficie/95 px-4 py-3 backdrop-blur md:px-8 lg:hidden">
          <span className="font-importi text-lg text-secondario md:invisible">Prima Nota</span>
          <Link to={v.impostazioni} className="flex items-center gap-2 text-sm text-tenue" aria-label="Impostazioni">
            <span className="max-w-40 truncate">{nome}</span>
            <Settings size={20} aria-hidden="true" />
          </Link>
        </header>

        <main className={`mx-auto w-full flex-1 px-4 pb-28 pt-4 md:px-8 md:pb-8 lg:pt-8 ${largo ? "max-w-3xl lg:max-w-none lg:px-10" : "max-w-3xl"}`}>
          <Outlet />
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-20 flex items-end border-t border-bordo bg-superficie pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Navigazione">
          {sinistra.map(x => <Voce key={x.a} {...x} />)}
          {v.nuovo && (
            <Link
              to={v.nuovo}
              aria-label="Nuovo movimento"
              className="-mt-6 mx-1 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accento text-su-accento shadow-lg"
            >
              <Plus size={28} aria-hidden="true" />
            </Link>
          )}
          {destra.map(x => <Voce key={x.a} {...x} />)}
        </nav>
      </div>
    </div>
  );
}
