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

const CommercialistaManagementPage = () => {
  const [data, setData] = useState({
    collegamenti: [],
    tokens: []
  });
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
        tokens: tokensResp.tokens || []
      });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore caricamento dati');
    } finally {
      setLoading(false);
    }
  };

  const generateToken = async () => {
    if (!window.confirm('Generare un token di invito valido 7 giorni? Serve al commercialista per inviarti una richiesta, che dovrai comunque accettare.')) return;

    try {
      setProcessing(true);
      await utentiCommercialistaAPI.generaTokenInvito(7);
      toast.success('Token generato!');
      await loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore generazione token');
    } finally {
      setProcessing(false);
    }
  };

  const revokeToken = async (tokenId) => {
    if (!window.confirm('Revocare questo token?')) return;

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

  const isExpired = (d) => new Date(d) < new Date();

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
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* TOKEN */}
      <div className="bg-white rounded-xl shadow-md border-2 border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 border-b-2 border-gray-200 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Token di Invito</h2>
          <Button
            variant="primary"
            size="lg"
            onClick={generateToken}
            disabled={processing}
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            GENERA TOKEN
          </Button>
        </div>

        <div className="p-8">
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
                const expired = isExpired(token.scadenza);
                const used = token.usato;
                const hasActiveConnection = used && ['attiva', 'sospesa', 'in_attesa'].includes(token.collegamento_stato);
                const canDelete = !expired && !hasActiveConnection;

                return (
                  <div
                    key={token.id}
                    className={`p-6 rounded-lg border-2 ${
                      hasActiveConnection
                        ? 'bg-green-50 border-green-400'
                        : used
                        ? 'bg-gray-100 border-gray-400'
                        : expired
                        ? 'bg-red-50 border-red-400'
                        : 'bg-blue-50 border-blue-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        {hasActiveConnection && (
                          <span className="px-4 py-1 bg-green-600 text-white text-sm font-bold rounded-full">
                            COLLEGATO
                          </span>
                        )}
                        {!hasActiveConnection && used && (
                          <span className="px-4 py-1 bg-gray-600 text-white text-sm font-bold rounded-full">
                            USATO
                          </span>
                        )}
                        {!used && expired && (
                          <span className="px-4 py-1 bg-red-600 text-white text-sm font-bold rounded-full">
                            SCADUTO
                          </span>
                        )}
                        {!used && !expired && (
                          <span className="px-4 py-1 bg-blue-600 text-white text-sm font-bold rounded-full">
                            ATTIVO
                          </span>
                        )}
                        <span className="text-gray-600">
                          Scadenza: <strong>{formatDate(token.scadenza)}</strong>
                        </span>
                      </div>

                      {canDelete && (
                        <Button
                          variant="danger"
                          onClick={() => revokeToken(token.id)}
                          disabled={processing}
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          ELIMINA
                        </Button>
                      )}
                    </div>

                    <div className="flex items-center space-x-2">
                      <code className="flex-1 bg-white px-4 py-3 rounded border-2 border-gray-300 text-sm font-mono overflow-x-auto">
                        {token.token}
                      </code>
                      <Button
                        variant="outline"
                        onClick={() => copyToken(token.token)}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </Button>
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
