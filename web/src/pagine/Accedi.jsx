import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import { useSessione } from '../sessione/Sessione';
import { VOCI } from '../shell/voci';
import { PERCORSI } from './Pubbliche';

const TESTI = {
  user: { titolo: 'Accedi', altro: { a: '/studio/accedi', testo: 'Sei uno studio? Accedi qui' } },
  commercialista: { titolo: 'Accesso studio', altro: { a: '/accedi', testo: 'Sei un cliente? Accedi qui' } }
};

export default function Accedi({ tipo }) {
  const s = useSessione();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const t = TESTI[tipo];

  if (s.fase === 'attiva') return <Navigate to={VOCI[s.tipo].home} replace />;

  async function invia(e) {
    e.preventDefault();
    setErrore('');
    setInvio(true);
    try {
      await s.accedi(tipo, username.trim(), password);
    } catch (err) {
      setErrore(err.stato === 400 || err.stato === 401 ? 'Credenziali non valide' : 'Accesso non riuscito, riprova');
    } finally {
      setInvio(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form onSubmit={invia} className="w-full max-w-sm space-y-4 rounded-2xl border border-bordo bg-superficie p-6 shadow-sm">
        <h1 className="font-importi text-2xl text-secondario">{t.titolo}</h1>
        <label className="block text-sm">
          <span className="text-tenue">Username</span>
          <input name="username" autoComplete="username" required value={username} onChange={e => setUsername(e.target.value)}
            className="mt-1 w-full rounded-lg border border-bordo bg-fondo px-3 py-2 text-base text-testo" />
        </label>
        <label className="block text-sm">
          <span className="text-tenue">Password</span>
          <input name="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-bordo bg-fondo px-3 py-2 text-base text-testo" />
        </label>
        {errore && <p role="alert" className="text-sm text-uscita">{errore}</p>}
        <button type="submit" disabled={invio}
          className="w-full rounded-lg bg-principale px-4 py-2.5 font-semibold text-su-principale disabled:opacity-60">
          {invio ? 'Accesso…' : 'Entra'}
        </button>
        <p className="flex justify-between text-sm">
          <Link className="text-principale underline" to={PERCORSI[tipo].registrati} data-link-registrati>Crea un account</Link>
          <Link className="text-principale underline" to={PERCORSI[tipo].dimenticata} data-link-dimenticata>Password dimenticata?</Link>
        </p>
        <p className="text-center text-sm"><Link className="text-principale underline" to={t.altro.a}>{t.altro.testo}</Link></p>
      </form>
    </div>
  );
}
