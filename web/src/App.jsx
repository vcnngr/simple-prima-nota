import { Navigate, Outlet, createBrowserRouter, RouterProvider } from 'react-router';
import { useSessione } from './sessione/Sessione';
import { VOCI } from './shell/voci';
import Shell from './shell/Shell';
import Accedi from './pagine/Accedi';
import Archivio from './pagine/Archivio';
import Categorie from './pagine/Categorie';
import Account from './pagine/Account';
import { ConfermaEmail, PasswordDimenticata, Registrati, Reimposta } from './pagine/Pubbliche';
import Impostazioni from './pagine/Impostazioni';
import Segnaposto from './pagine/Segnaposto';
import Estratto from './pagine/Estratto';
import NuovoMovimento from './pagine/NuovoMovimento';
import Movimenti from './pagine/Movimenti';
import Controparti from './pagine/Controparti';
import Controparte from './pagine/Controparte';
import { Report, ReportMese } from './pagine/Report';
import { Chat, Studio } from './pagine/Studio';
import Permessi from './pagine/Permessi';
import Conti from './pagine/Conti';
import Conto from './pagine/Conto';

function Attesa() {
  return <div className="flex min-h-full items-center justify-center text-tenue" role="status">Caricamento…</div>;
}

// Le pagine di un tipo di account si aprono solo con una sessione di quel tipo.
function Richiede({ tipo }) {
  const s = useSessione();
  if (s.fase === 'caricamento') return <Attesa />;
  if (s.fase === 'errore') {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3 p-4 text-center">
        <p>Il server non risponde.</p>
        <button type="button" onClick={s.ricarica} className="rounded-lg bg-principale px-4 py-2 text-su-principale">Riprova</button>
      </div>
    );
  }
  if (s.fase !== 'attiva') return <Navigate to={tipo === 'commercialista' ? '/studio/accedi' : '/accedi'} replace />;
  if (s.tipo !== tipo) return <Navigate to={VOCI[s.tipo].home} replace />;
  return <Outlet />;
}

function Pubblica() {
  const s = useSessione();
  return s.fase === 'caricamento' ? <Attesa /> : <Outlet />;
}

const router = createBrowserRouter([
  {
    element: <Pubblica />,
    children: [
      { path: '/accedi', element: <Accedi tipo="user" /> },
      { path: '/studio/accedi', element: <Accedi tipo="commercialista" /> },
      { path: '/registrati', element: <Registrati tipo="user" /> },
      { path: '/studio/registrati', element: <Registrati tipo="commercialista" /> },
      { path: '/password-dimenticata', element: <PasswordDimenticata tipo="user" /> },
      { path: '/studio/password-dimenticata', element: <PasswordDimenticata tipo="commercialista" /> },
      // Link delle mail (AccountService): /reimposta-password e /commercialista/... (W6).
      { path: '/reimposta-password', element: <Reimposta tipo="user" /> },
      { path: '/commercialista/reimposta-password', element: <Reimposta tipo="commercialista" /> },
      { path: '/conferma-email', element: <ConfermaEmail tipo="user" /> },
      { path: '/commercialista/conferma-email', element: <ConfermaEmail tipo="commercialista" /> }
    ]
  },
  {
    element: <Richiede tipo="user" />,
    children: [{
      element: <Shell />,
      children: [
        { path: '/', element: <Estratto /> },
        { path: '/movimenti', element: <Movimenti /> },
        { path: '/nuovo', element: <NuovoMovimento /> },
        { path: '/controparti', element: <Controparti /> },
        { path: '/controparti/:id', element: <Controparte /> },
        { path: '/report', element: <Report /> },
        { path: '/report/:mese', element: <ReportMese /> },
        { path: '/studio', element: <Studio /> },
        { path: '/chat', element: <Chat /> },
        { path: '/studio/permessi/:id', element: <Permessi /> },
        { path: '/conti', element: <Conti /> },
        { path: '/conti/:id', element: <Conto /> },
        { path: '/impostazioni', element: <Impostazioni /> },
        { path: '/account', element: <Account /> },
        { path: '/categorie', element: <Categorie /> },
        { path: '/archivio', element: <Archivio /> }
      ]
    }]
  },
  {
    element: <Richiede tipo="commercialista" />,
    children: [{
      element: <Shell />,
      children: [
        { path: '/studio/clienti', element: <Segnaposto titolo="Clienti" blocco="U6" /> },
        { path: '/studio/messaggi', element: <Segnaposto titolo="Messaggi" blocco="U6" /> },
        { path: '/studio/impostazioni', element: <Impostazioni /> },
        { path: '/studio/account', element: <Account /> }
      ]
    }]
  },
  { path: '*', element: <Navigate to="/" replace /> }
]);

export default function App() {
  return <RouterProvider router={router} />;
}
