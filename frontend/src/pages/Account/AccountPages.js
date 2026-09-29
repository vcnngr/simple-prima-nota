// src/pages/Account/AccountPages.js
// Pagine pubbliche dell'account (blocco W6): password dimenticata, reimposta
// password, conferma del nuovo indirizzo email. Una sola implementazione per
// utenti e commercialisti: cambia l'API e il percorso del login.
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { KeyRound, Mail, CheckCircle } from 'lucide-react';
import { authAPI, commercialistiAPI } from '../../services/api';
import Button from '../../components/UI/Button';
import Alert from '../../components/UI/Alert';
import LoadingSpinner from '../../components/UI/LoadingSpinner';

const TIPI = {
  user: { api: authAPI, login: '/login/utente', base: '' },
  commercialista: { api: commercialistiAPI, login: '/login/commercialista', base: '/commercialista' }
};

// Il token arriva dopo '#': non passa dal server ne' dal Referer. Si legge una
// volta e si toglie dalla barra degli indirizzi (e dalla cronologia).
function useTokenDalLink() {
  const token = useRef(null);
  if (token.current === null) {
    const m = window.location.hash.match(/token=([0-9a-f]{64})/);
    token.current = m ? m[1] : '';
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }
  return token.current;
}

const errore = (err, predefinito) => err.response?.data?.details?.[0]?.message
  || err.response?.data?.error || predefinito;

const Scheda = ({ icona: Icona, titolo, sottotitolo, children }) => (
  <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 py-12 px-4">
    <div className="max-w-md w-full space-y-6">
      <div className="text-center">
        <div className="mx-auto h-14 w-14 bg-primary-600 rounded-xl flex items-center justify-center shadow-lg">
          <Icona className="h-7 w-7 text-white" />
        </div>
        <h2 className="mt-4 text-2xl font-bold text-gray-900">{titolo}</h2>
        {sottotitolo && <p className="mt-2 text-sm text-gray-600">{sottotitolo}</p>}
      </div>
      <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 space-y-6">{children}</div>
    </div>
  </div>
);

export const PasswordDimenticataPage = ({ tipo }) => {
  const t = TIPI[tipo];
  const [inviata, setInviata] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm();

  const onSubmit = async ({ identificativo }) => {
    setErrMsg('');
    try {
      await t.api.passwordDimenticata(identificativo.trim());
      setInviata(true);
    } catch (err) {
      setErrMsg(errore(err, 'Richiesta non riuscita, riprova'));
    }
  };

  return (
    <Scheda icona={KeyRound} titolo="Password dimenticata"
      sottotitolo={tipo === 'commercialista' ? 'Account dello studio' : undefined}>
      {inviata ? (
        <Alert type="success">
          Se l'account esiste, riceverai a breve una mail con un link per reimpostare la password.
          Il link vale un'ora e si usa una volta sola.
        </Alert>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {errMsg && <Alert type="danger">{errMsg}</Alert>}
          <div>
            <label htmlFor="identificativo" className="form-label">Username o email</label>
            <input id="identificativo" type="text" autoComplete="username"
              className={`form-input ${errors.identificativo ? 'border-danger-500' : ''}`}
              {...register('identificativo', { required: 'Indica username o email' })} />
            {errors.identificativo && <p className="form-error">{errors.identificativo.message}</p>}
          </div>
          <Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="w-full">
            Invia il link
          </Button>
        </form>
      )}
      <div className="text-center">
        <Link to={t.login} className="text-sm text-primary-600 hover:text-primary-500 font-medium">
          ← Torna all'accesso
        </Link>
      </div>
    </Scheda>
  );
};

export const ReimpostaPasswordPage = ({ tipo }) => {
  const t = TIPI[tipo];
  const token = useTokenDalLink();
  const [fatto, setFatto] = useState(false);
  const [errMsg, setErrMsg] = useState(token ? '' : 'Link non valido o scaduto');
  const { register, handleSubmit, getValues, formState: { errors, isSubmitting } } = useForm();

  const onSubmit = async ({ password }) => {
    setErrMsg('');
    try {
      await t.api.passwordReimposta(token, password);
      setFatto(true);
    } catch (err) {
      setErrMsg(errore(err, 'Reimpostazione non riuscita'));
    }
  };

  return (
    <Scheda icona={KeyRound} titolo="Nuova password">
      {fatto ? (
        <Alert type="success">
          Password reimpostata. Tutte le sessioni aperte sono state chiuse: accedi con la nuova password.
        </Alert>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {errMsg && <Alert type="danger">{errMsg}</Alert>}
          <div>
            <label htmlFor="password" className="form-label">Nuova password</label>
            <input id="password" type="password" autoComplete="new-password" disabled={!token}
              className={`form-input ${errors.password ? 'border-danger-500' : ''}`}
              {...register('password', {
                required: 'La nuova password e\' richiesta',
                minLength: { value: 8, message: 'Almeno 8 caratteri' }
              })} />
            {errors.password && <p className="form-error">{errors.password.message}</p>}
          </div>
          <div>
            <label htmlFor="conferma" className="form-label">Ripeti la password</label>
            <input id="conferma" type="password" autoComplete="new-password" disabled={!token}
              className={`form-input ${errors.conferma ? 'border-danger-500' : ''}`}
              {...register('conferma', {
                validate: v => v === getValues('password') || 'Le password non coincidono'
              })} />
            {errors.conferma && <p className="form-error">{errors.conferma.message}</p>}
          </div>
          <Button type="submit" variant="primary" size="lg" loading={isSubmitting} disabled={!token} className="w-full">
            Salva la password
          </Button>
        </form>
      )}
      <div className="text-center space-y-2">
        <Link to={t.login} className="block text-sm text-primary-600 hover:text-primary-500 font-medium">
          Vai all'accesso
        </Link>
        {!fatto && (
          <Link to={`${t.base}/password-dimenticata`} className="block text-sm text-gray-500 hover:text-gray-700">
            Chiedi un nuovo link
          </Link>
        )}
      </div>
    </Scheda>
  );
};

export const ConfermaEmailPage = ({ tipo }) => {
  const t = TIPI[tipo];
  const token = useTokenDalLink();
  const [stato, setStato] = useState(token ? 'attesa' : 'errore');
  const [msg, setMsg] = useState(token ? '' : 'Link non valido o scaduto');
  const inviato = useRef(false);

  useEffect(() => {
    if (!token || inviato.current) return;
    inviato.current = true; // StrictMode monta due volte: il link si usa una volta
    t.api.confermaEmail(token)
      .then(r => { setStato('ok'); setMsg(`Da ora le mail arrivano a ${r.email}.`); })
      .catch(err => { setStato('errore'); setMsg(errore(err, 'Conferma non riuscita')); });
  }, [token, t.api]);

  return (
    <Scheda icona={stato === 'ok' ? CheckCircle : Mail} titolo="Conferma indirizzo email">
      {stato === 'attesa' && <div className="flex justify-center"><LoadingSpinner size="lg" /></div>}
      {stato === 'ok' && <Alert type="success">Indirizzo aggiornato. {msg}</Alert>}
      {stato === 'errore' && <Alert type="danger">{msg}</Alert>}
      <div className="text-center">
        <Link to={t.login} className="text-sm text-primary-600 hover:text-primary-500 font-medium">
          Vai all'accesso
        </Link>
      </div>
    </Scheda>
  );
};
