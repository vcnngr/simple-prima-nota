import React, { useState, useEffect } from 'react';
import { utentiCommercialistaAPI } from '../../services/api';
import Button from '../../components/UI/Button';
import LoadingSpinner from '../../components/UI/LoadingSpinner';
import toast from 'react-hot-toast';

const CommercialistaManagementPage = () => {
  const [data, setData] = useState({
    commercialista: null,
    hasCommercialista: false,
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

      const [commResp, tokensResp] = await Promise.all([
        utentiCommercialistaAPI.getCommercialista(),
        utentiCommercialistaAPI.getTokenInviti()
      ]);

      console.log('Commercialista Response:', commResp);
      console.log('Tokens Response:', tokensResp);

      setData({
        commercialista: commResp.commercialista,
        hasCommercialista: commResp.has_commercialista,
        tokens: tokensResp.tokens || []
      });
    } catch (err) {
      console.error('Load error:', err);
      toast.error(err.response?.data?.error || 'Errore caricamento dati');
    } finally {
      setLoading(false);
    }
  };

  const generateToken = async () => {
    if (!window.confirm('Generare un nuovo token di invito valido 365 giorni?')) return;

    try {
      setProcessing(true);
      await utentiCommercialistaAPI.generaTokenInvito(365);
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

  const disconnect = async () => {
    if (!window.confirm('Sei sicuro di voler disconnettere il commercialista? Questa azione è irreversibile.')) return;

    try {
      setProcessing(true);
      await utentiCommercialistaAPI.disconnectCommercialista();
      toast.success('Commercialista disconnesso!');
      await loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore disconnessione');
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

      {/* STATO COLLEGAMENTO */}
      <div className="bg-white rounded-xl shadow-md border-2 border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 border-b-2 border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Stato Collegamento</h2>
        </div>

        <div className="p-8">
          {data.hasCommercialista && data.commercialista ? (
            // COMMERCIALISTA COLLEGATO
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <div className="inline-block px-4 py-1 bg-green-100 text-green-800 text-sm font-semibold rounded-full mb-2">
                      COLLEGATO
                    </div>
                    <h3 className="text-3xl font-bold text-gray-900">
                      {data.commercialista.ragione_sociale || data.commercialista.username}
                    </h3>
                  </div>
                </div>

                <Button
                  variant="danger"
                  size="lg"
                  onClick={disconnect}
                  disabled={processing}
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  DISCONNETTI
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-6 rounded-lg">
                {data.commercialista.email && (
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <div>
                      <div className="text-xs text-gray-500 uppercase font-semibold">Email</div>
                      <div className="text-gray-900 font-medium">{data.commercialista.email}</div>
                    </div>
                  </div>
                )}

                {data.commercialista.telefono && (
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <div>
                      <div className="text-xs text-gray-500 uppercase font-semibold">Telefono</div>
                      <div className="text-gray-900 font-medium">{data.commercialista.telefono}</div>
                    </div>
                  </div>
                )}

                {data.commercialista.partita_iva && (
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                    <div>
                      <div className="text-xs text-gray-500 uppercase font-semibold">Partita IVA</div>
                      <div className="text-gray-900 font-medium">{data.commercialista.partita_iva}</div>
                    </div>
                  </div>
                )}

                {data.commercialista.data_collegamento && (
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <div>
                      <div className="text-xs text-gray-500 uppercase font-semibold">Collegato dal</div>
                      <div className="text-gray-900 font-medium">{formatDate(data.commercialista.data_collegamento)}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            // NESSUN COMMERCIALISTA
            <div className="text-center py-12">
              <div className="w-24 h-24 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-12 h-12 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                Nessun Commercialista Collegato
              </h3>
              <p className="text-gray-600 text-lg max-w-2xl mx-auto">
                Genera un token di invito qui sotto e comunicalo al tuo commercialista per permettergli di accedere ai tuoi dati.
              </p>
            </div>
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
                const canRevoke = !used && !expired;

                return (
                  <div
                    key={token.id}
                    className={`p-6 rounded-lg border-2 ${
                      used
                        ? 'bg-gray-100 border-gray-400'
                        : expired
                        ? 'bg-red-50 border-red-400'
                        : 'bg-blue-50 border-blue-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        {used && (
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
                          <span className="px-4 py-1 bg-green-600 text-white text-sm font-bold rounded-full">
                            ATTIVO
                          </span>
                        )}
                        <span className="text-gray-600">
                          Scadenza: <strong>{formatDate(token.scadenza)}</strong>
                        </span>
                      </div>

                      {canRevoke && (
                        <Button
                          variant="danger"
                          onClick={() => revokeToken(token.id)}
                          disabled={processing}
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          REVOCA
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
