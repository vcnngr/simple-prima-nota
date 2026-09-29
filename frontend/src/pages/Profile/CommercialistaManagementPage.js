import React, { useState, useEffect } from 'react';
import { utentiCommercialistaAPI } from '../../services/api';
import Button from '../../components/UI/Button';
import LoadingSpinner from '../../components/UI/LoadingSpinner';
import toast from 'react-hot-toast';

const ETICHETTE_STATO = {
  in_attesa: { testo: 'RICHIESTA DA ACCETTARE', classe: 'bg-amber-600' },
  attiva: { testo: 'ATTIVO', classe: 'bg-green-600' },
  sospesa: { testo: 'SOSPESO', classe: 'bg-orange-600' },
  rifiutata: { testo: 'RIFIUTATA', classe: 'bg-gray-600' },
  revocata: { testo: 'REVOCATO', classe: 'bg-gray-600' },
  scaduta: { testo: 'SCADUTO', classe: 'bg-gray-600' }
};

const ETICHETTE_TOKEN = {
  attivo:   { testo: 'ATTIVO', classe: 'bg-blue-600' },
  usato:    { testo: 'USATO', classe: 'bg-gray-600' },
  revocato: { testo: 'REVOCATO', classe: 'bg-gray-600' },
  scaduto:  { testo: 'SCADUTO', classe: 'bg-red-600' }
};

const ETICHETTE_ACCESSO = {
  lista_clienti: 'Ha aperto l\'elenco clienti (saldi e totali)',
  dettaglio_cliente: 'Ha consultato conti e movimenti',
  export: 'Ha esportato i movimenti',
  chat: 'Ha letto la chat',
  disconnessione: 'Si e\' disconnesso'
};

// "Cosa ha visto il mio commercialista": il registro scritto dal backend a ogni
// accesso ai dati. Si carica solo quando l'utente lo apre.
const RegistroAccessi = ({ collegamentoId }) => {
  const [aperto, setAperto] = useState(false);
  const [stato, setStato] = useState({ caricamento: false, accessi: [], totale: 0, errore: null });

  const apri = async () => {
    const prossimo = !aperto;
    setAperto(prossimo);
    if (!prossimo) return;
    setStato(s => ({ ...s, caricamento: true, errore: null }));
    try {
      const res = await utentiCommercialistaAPI.getAccessiCollegamento(collegamentoId, { limit: 50 });
      setStato({ caricamento: false, accessi: res.data.accessi || [], totale: res.data.totale || 0, errore: null });
    } catch (e) {
      setStato({ caricamento: false, accessi: [], totale: 0, errore: 'Impossibile caricare il registro' });
    }
  };

  const dettaglio = (a) => {
    if (a.tipo_accesso !== 'export') return null;
    const d = a.dettagli || {};
    const parti = [(d.formato || '').toUpperCase()];
    if (a.numero_record === null || a.numero_record === undefined) parti.push('nessun dato uscito');
    else parti.push(`${a.numero_record} movimenti`);
    return parti.filter(Boolean).join(' · ');
  };

  return (
    <div className="mt-4 pt-4 border-t border-gray-200">
      <button type="button" onClick={apri} className="text-sm font-medium text-primary-600 hover:underline">
        {aperto ? 'Nascondi cosa ha visto' : 'Cosa ha visto'}
      </button>
      {aperto && (
        <div className="mt-3 text-sm">
          {stato.caricamento && <div className="text-gray-500">Caricamento…</div>}
          {stato.errore && <div className="text-red-600">{stato.errore}</div>}
          {!stato.caricamento && !stato.errore && stato.accessi.length === 0 && (
            <div className="text-gray-500">Nessun accesso ai tuoi dati.</div>
          )}
          {stato.accessi.length > 0 && (
            <>
              <div className="text-gray-500 mb-2">
                {stato.totale} accessi registrati{stato.totale > stato.accessi.length ? `, ultimi ${stato.accessi.length}` : ''}
              </div>
              <ul className="divide-y divide-gray-100">
                {stato.accessi.map(a => (
                  <li key={a.id} className="py-2">
                    <div className="text-gray-900">{ETICHETTE_ACCESSO[a.tipo_accesso] || a.tipo_accesso}</div>
                    <div className="text-gray-500 text-xs">
                      {new Date(a.created_at).toLocaleString('it-IT')}
                      {dettaglio(a) && <> · {dettaglio(a)}</>}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const CommercialistaManagementPage = () => {
  const [data, setData] = useState({
    collegamenti: [],
    tokens: [],
    haTokenAttivo: false
  });
  // Il valore in chiaro del token arriva una volta sola, nella risposta alla
  // generazione: il server tiene solo l'hash e non e' in grado di ridarlo.
  // Vive qui finche' l'utente non lo chiude.
  const [tokenAppenaGenerato, setTokenAppenaGenerato] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      setLoading(true);

      const [collResp, tokensResp] = await Promise.all([
        utentiCommercialistaAPI.getCollegamenti(),
        utentiCommercialistaAPI.getTokenInviti()
      ]);

      setData({
        collegamenti: collResp.collegamenti || [],
        tokens: tokensResp.tokens || [],
        haTokenAttivo: !!tokensResp.ha_token_attivo
      });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore caricamento dati');
    } finally {
      setLoading(false);
    }
  };

  const generateToken = async () => {
    if (!window.confirm('Generare un token di invito valido 7 giorni? Lo vedrai una sola volta: copialo subito. Serve al commercialista per inviarti una richiesta, che dovrai comunque accettare.')) return;

    try {
      setProcessing(true);
      const resp = await utentiCommercialistaAPI.generaTokenInvito(7);
      setTokenAppenaGenerato({ valore: resp.token, scadenza: resp.scadenza });
      toast.success('Token generato: copialo ora, non sara\' piu\' visibile');
      await loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore generazione token');
    } finally {
      setProcessing(false);
    }
  };

  const revokeToken = async (tokenId) => {
    if (!window.confirm('Revocare questo token? Chi lo ha ricevuto non potra\' piu\' usarlo.')) return;

    try {
      setProcessing(true);
      await utentiCommercialistaAPI.revokeToken(tokenId);
      toast.success('Token revocato!');
      await loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore revoca token');
    } finally {
      setProcessing(false);
    }
  };

  // Una sola funzione per tutte le transizioni: la regola su cosa e' ammesso
  // sta nel backend, qui c'e' solo la conferma e il ricaricamento.
  const transizione = async (azione, collegamento) => {
    const nome = collegamento.ragione_sociale || collegamento.username;

    const conferme = {
      accetta: `Dare a ${nome} accesso ai tuoi dati contabili?`,
      rifiuta: `Rifiutare la richiesta di ${nome}?`,
      sospendi: `Sospendere l'accesso di ${nome}? Potrai riattivarlo quando vuoi.`,
      riattiva: `Riattivare l'accesso di ${nome}?`,
      revoca: `Revocare il collegamento con ${nome}? La revoca e' definitiva: per ricollegarsi servira' una nuova richiesta.`
    };

    if (!window.confirm(conferme[azione])) return;

    const chiamate = {
      accetta: () => utentiCommercialistaAPI.accettaCollegamento(collegamento.id),
      rifiuta: () => utentiCommercialistaAPI.rifiutaCollegamento(collegamento.id),
      sospendi: () => utentiCommercialistaAPI.sospendiCollegamento(collegamento.id),
      riattiva: () => utentiCommercialistaAPI.riattivaCollegamento(collegamento.id),
      revoca: () => utentiCommercialistaAPI.revocaCollegamento(collegamento.id)
    };

    try {
      setProcessing(true);
      const resp = await chiamate[azione]();
      toast.success(resp.message || 'Operazione completata');
      await loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Operazione non riuscita');
    } finally {
      setProcessing(false);
    }
  };

  const copyToken = (token) => {
    navigator.clipboard.writeText(token);
    toast.success('Token copiato!');
  };

  const formatDate = (d) => {
    if (!d) return 'N/A';
    return new Date(d).toLocaleDateString('it-IT');
  };

  const descriviAmbito = (c) => {
    const parti = [];
    if (c.ambito_dal) parti.push(`dal ${formatDate(c.ambito_dal)}`);
    if (c.ambito_al) parti.push(`al ${formatDate(c.ambito_al)}`);
    if (c.conti_ammessi && c.conti_ammessi.length > 0) {
      parti.push(`${c.conti_ammessi.length} cont${c.conti_ammessi.length === 1 ? 'o' : 'i'}`);
    }
    return parti.length > 0 ? parti.join(', ') : 'Tutti i dati';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">

      {/* HEADER */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white rounded-xl p-8 shadow-lg">
        <h1 className="text-4xl font-bold mb-2">Gestione Commercialista</h1>
        <p className="text-blue-100 text-lg">
          Collega il tuo commercialista per condividere i tuoi dati contabili in sicurezza
        </p>
      </div>

      {/* COLLEGAMENTI */}
      <div className="bg-white rounded-xl shadow-md border-2 border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 border-b-2 border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Collegamenti</h2>
        </div>

        <div className="p-6 space-y-4">
          {data.collegamenti.length === 0 ? (
            <div className="text-center py-12">
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Nessun collegamento</h3>
              <p className="text-gray-600 max-w-2xl mx-auto">
                Genera un token di invito qui sotto e comunicalo al tuo commercialista.
                Con quel token potra' inviarti una richiesta di collegamento: i tuoi dati
                restano invisibili finche' non l'accetti.
              </p>
            </div>
          ) : (
            data.collegamenti.map(c => {
              const badge = ETICHETTE_STATO[c.stato] || { testo: c.stato, classe: 'bg-gray-600' };

              return (
                <div key={c.id} className="p-6 rounded-lg border-2 border-gray-200">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <span className={`inline-block px-3 py-1 text-white text-xs font-bold rounded-full mb-2 ${badge.classe}`}>
                        {badge.testo}
                      </span>
                      <h3 className="text-xl font-bold text-gray-900">
                        {c.ragione_sociale || c.username}
                        {c.studio_eliminato && <span className="ml-2 text-sm font-normal text-gray-500">(account eliminato)</span>}
                      </h3>
                      <div className="text-sm text-gray-600 mt-1 space-y-0.5">
                        {c.email && <div>{c.email}</div>}
                        {c.partita_iva && <div>P.IVA {c.partita_iva}</div>}
                        {c.telefono && <div>{c.telefono}</div>}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {c.stato === 'in_attesa' && (
                        <>
                          <Button variant="primary" onClick={() => transizione('accetta', c)} disabled={processing}>
                            Accetta
                          </Button>
                          <Button variant="outline" onClick={() => transizione('rifiuta', c)} disabled={processing}>
                            Rifiuta
                          </Button>
                        </>
                      )}
                      {c.stato === 'attiva' && (
                        <>
                          <Button variant="outline" onClick={() => transizione('sospendi', c)} disabled={processing}>
                            Sospendi
                          </Button>
                          <Button variant="danger" onClick={() => transizione('revoca', c)} disabled={processing}>
                            Revoca
                          </Button>
                        </>
                      )}
                      {c.stato === 'sospesa' && (
                        <>
                          <Button variant="primary" onClick={() => transizione('riattiva', c)} disabled={processing}>
                            Riattiva
                          </Button>
                          <Button variant="danger" onClick={() => transizione('revoca', c)} disabled={processing}>
                            Revoca
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-4 border-t border-gray-200 text-sm">
                    <div>
                      <div className="text-gray-500">Richiesta</div>
                      <div className="text-gray-900 font-medium">{formatDate(c.data_richiesta)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Accettata</div>
                      <div className="text-gray-900 font-medium">{formatDate(c.data_accettazione)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Ambito</div>
                      <div className="text-gray-900 font-medium">{descriviAmbito(c)}</div>
                    </div>
                  </div>

                  {c.motivo_revoca && (
                    <div className="mt-4 text-sm text-gray-600">
                      Motivo: {c.motivo_revoca}
                    </div>
                  )}

                  {c.stato !== 'in_attesa' && c.stato !== 'rifiutata' && (
                    <RegistroAccessi collegamentoId={c.id} />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* TOKEN */}
      <div className="bg-white rounded-xl shadow-md border-2 border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 border-b-2 border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Token di Invito</h2>
            <p className="text-sm text-gray-600 mt-1">
              Serve solo se il tuo commercialista non e' ancora registrato. Puoi averne uno alla volta.
            </p>
          </div>
          <Button
            variant="primary"
            size="lg"
            onClick={generateToken}
            disabled={processing || data.haTokenAttivo}
            title={data.haTokenAttivo ? 'Hai gia\' un token attivo: revocalo prima' : undefined}
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            GENERA TOKEN
          </Button>
        </div>

        <div className="p-8 space-y-6">
          {/* Il valore in chiaro: una volta sola, qui. */}
          {tokenAppenaGenerato && (
            <div className="p-6 rounded-lg border-2 border-blue-500 bg-blue-50">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-sm font-bold text-blue-900 uppercase">Copialo adesso</div>
                  <p className="text-sm text-blue-800 mt-1">
                    Questo valore non sara' piu' visibile: il sistema ne conserva solo un'impronta.
                    Se lo perdi, revoca il token e generane un altro.
                  </p>
                </div>
                <button
                  className="text-blue-700 hover:text-blue-900 text-sm underline"
                  onClick={() => setTokenAppenaGenerato(null)}
                >
                  Fatto, nascondi
                </button>
              </div>
              <div className="flex items-center space-x-2">
                <code className="flex-1 bg-white px-4 py-3 rounded border-2 border-blue-300 text-sm font-mono break-all">
                  {tokenAppenaGenerato.valore}
                </code>
                <Button variant="outline" onClick={() => copyToken(tokenAppenaGenerato.valore)}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </Button>
              </div>
              <p className="text-xs text-blue-700 mt-2">
                Scade il {formatDate(tokenAppenaGenerato.scadenza)}
              </p>
            </div>
          )}

          {data.tokens.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              <p className="text-lg">Nessun token generato</p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.tokens.map(token => {
                const stato = token.stato;
                const badge = ETICHETTE_TOKEN[stato] || { testo: stato, classe: 'bg-gray-600' };

                return (
                  <div
                    key={token.id}
                    className={`p-6 rounded-lg border-2 ${
                      stato === 'attivo' ? 'bg-blue-50 border-blue-400' : 'bg-gray-50 border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center space-x-3 flex-wrap gap-2">
                        <span className={`px-4 py-1 ${badge.classe} text-white text-sm font-bold rounded-full`}>
                          {badge.testo}
                        </span>
                        {/* Il token non esiste piu' in chiaro: restano i primi caratteri,
                            quanto basta a riconoscere di quale invito si tratta. */}
                        <code className="bg-white px-3 py-1 rounded border border-gray-300 text-sm font-mono">
                          {token.prefisso}&hellip;
                        </code>
                        <span className="text-gray-600 text-sm">
                          Scadenza: <strong>{formatDate(token.scadenza)}</strong>
                        </span>
                        {token.commercialista_nome && (
                          <span className="text-gray-600 text-sm">
                            Usato da <strong>{token.commercialista_nome}</strong> il {formatDate(token.data_utilizzo)}
                          </span>
                        )}
                      </div>

                      {stato === 'attivo' && (
                        <Button
                          variant="danger"
                          onClick={() => revokeToken(token.id)}
                          disabled={processing}
                        >
                          REVOCA
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CommercialistaManagementPage;
