// src/pages/Profile/CommercialistaManagementPage.js
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Briefcase,
  Plus,
  Copy,
  Check,
  X,
  Mail,
  Phone,
  Calendar,
  AlertCircle,
  Trash2,
  ExternalLink
} from 'lucide-react';
import { utentiCommercialistaAPI } from '../../services/api';
import Button from '../../components/UI/Button';
import Alert from '../../components/UI/Alert';
import LoadingSpinner from '../../components/UI/LoadingSpinner';
import toast from 'react-hot-toast';

const CommercialistaManagementPage = () => {
  const [commercialista, setCommercialista] = useState(null);
  const [hasCommercialista, setHasCommercialista] = useState(false);
  const [tokens, setTokens] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isRevokingToken, setIsRevokingToken] = useState(null);
  const [copiedToken, setCopiedToken] = useState(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [commercialistaResponse, tokensResponse] = await Promise.all([
        utentiCommercialistaAPI.getCommercialista(),
        utentiCommercialistaAPI.getTokenInviti()
      ]);

      setHasCommercialista(commercialistaResponse.has_commercialista);
      setCommercialista(commercialistaResponse.commercialista);
      setTokens(tokensResponse.tokens || []);
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Errore nel caricamento dei dati';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateToken = async (e) => {
    e.preventDefault();
    setIsGeneratingToken(true);

    try {
      // Validità indeterminata (36500 giorni = ~100 anni)
      const response = await utentiCommercialistaAPI.generaTokenInvito(36500);
      toast.success('Token generato con successo!');
      setShowGenerateModal(false);
      loadData(); // Reload tokens
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Errore nella generazione del token';
      toast.error(errorMessage);
    } finally {
      setIsGeneratingToken(false);
    }
  };

  const handleCopyToken = (token) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(token);
    toast.success('Token copiato negli appunti!');
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);

    try {
      await utentiCommercialistaAPI.disconnectCommercialista();
      toast.success('Collegamento con il commercialista rimosso');
      setShowDisconnectModal(false);
      loadData(); // Reload data
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Errore nella rimozione del collegamento';
      toast.error(errorMessage);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleRevokeToken = async (tokenId) => {
    setIsRevokingToken(tokenId);

    try {
      await utentiCommercialistaAPI.revokeTokenInvito(tokenId);
      toast.success('Token revocato con successo');
      loadData(); // Reload tokens
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Errore nella revoca del token';
      toast.error(errorMessage);
    } finally {
      setIsRevokingToken(null);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(dateString));
  };

  const isTokenExpired = (scadenza) => {
    return new Date(scadenza) < new Date();
  };

  const getTokenStatus = (token) => {
    if (token.usato) {
      return { text: 'Utilizzato', color: 'success', icon: Check };
    } else if (isTokenExpired(token.scadenza)) {
      return { text: 'Scaduto', color: 'danger', icon: X };
    } else {
      return { text: 'Attivo', color: 'primary', icon: Check };
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Gestione Commercialista</h1>
        <p className="text-gray-600 mt-1">
          Gestisci il collegamento con il tuo commercialista
        </p>
      </div>

      {/* Commercialista Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            {hasCommercialista ? 'Il Tuo Commercialista' : 'Nessun Commercialista Collegato'}
          </h2>
          {hasCommercialista && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowDisconnectModal(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Scollega
            </Button>
          )}
        </div>

        {hasCommercialista && commercialista ? (
          <div className="space-y-4">
            <div className="flex items-start space-x-4">
              <div className="h-16 w-16 bg-success-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Briefcase className="h-8 w-8 text-success-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">
                  {commercialista.ragione_sociale || commercialista.username}
                </h3>
                <div className="mt-2 space-y-2">
                  {commercialista.email && (
                    <div className="flex items-center text-sm text-gray-600">
                      <Mail className="h-4 w-4 mr-2" />
                      {commercialista.email}
                    </div>
                  )}
                  {commercialista.telefono && (
                    <div className="flex items-center text-sm text-gray-600">
                      <Phone className="h-4 w-4 mr-2" />
                      {commercialista.telefono}
                    </div>
                  )}
                  {commercialista.partita_iva && (
                    <div className="flex items-center text-sm text-gray-600">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      P.IVA: {commercialista.partita_iva}
                    </div>
                  )}
                  {commercialista.data_collegamento && (
                    <div className="flex items-center text-sm text-gray-600">
                      <Calendar className="h-4 w-4 mr-2" />
                      Collegato dal {formatDate(commercialista.data_collegamento)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">
              Non hai ancora collegato un commercialista al tuo account.
              <br />
              Genera un token di invito nella sezione sottostante e comunicalo al tuo commercialista.
            </p>
          </div>
        )}
      </motion.div>

      {/* Tokens List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Token di Invito</h2>
            <p className="text-sm text-gray-600 mt-1">
              Gestisci i tuoi token di invito per il commercialista
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowGenerateModal(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Nuovo Token
          </Button>
        </div>

        {tokens.length === 0 ? (
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Nessun token generato</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tokens.map((token, index) => {
              const status = getTokenStatus(token);
              const StatusIcon = status.icon;

              return (
                <motion.div
                  key={token.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * index }}
                  className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <code className="px-3 py-1 bg-gray-100 rounded text-sm font-mono text-gray-700">
                          {token.token.substring(0, 20)}...
                        </code>
                        <button
                          onClick={() => handleCopyToken(token.token)}
                          className="p-1 hover:bg-gray-100 rounded transition-colors"
                          title="Copia token"
                        >
                          {copiedToken === token.token ? (
                            <Check className="h-4 w-4 text-success-600" />
                          ) : (
                            <Copy className="h-4 w-4 text-gray-600" />
                          )}
                        </button>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-${status.color}-100 text-${status.color}-800`}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {status.text}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-gray-600">
                        <div className="flex items-center">
                          <Calendar className="h-4 w-4 mr-2" />
                          Creato: {formatDate(token.created_at)}
                        </div>
                        <div className="flex items-center">
                          <Calendar className="h-4 w-4 mr-2" />
                          Scade: {formatDate(token.scadenza)}
                        </div>
                        {token.usato && token.commercialista_nome && (
                          <div className="flex items-center">
                            <Briefcase className="h-4 w-4 mr-2" />
                            Usato da: {token.commercialista_nome}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Revoke button - only for unused and non-expired tokens */}
                    {!token.usato && !isTokenExpired(token.scadenza) && (
                      <div className="mt-3 md:mt-0 md:ml-4">
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleRevokeToken(token.id)}
                          loading={isRevokingToken === token.id}
                          disabled={isRevokingToken !== null}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Revoca
                        </Button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Generate Token Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
          >
            <h3 className="text-xl font-semibold text-gray-900 mb-4">
              Genera Token di Invito
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              Genera un token per invitare il tuo commercialista. Il token ha validità indeterminata fino a quando non viene utilizzato o revocato.
            </p>

            <form onSubmit={handleGenerateToken} className="space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-sm text-gray-700">
                  <strong>Validità:</strong> Indeterminata
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Il token rimarrà attivo fino al primo utilizzo o fino alla revoca manuale
                </p>
              </div>

              <div className="flex space-x-3">
                <Button
                  type="submit"
                  variant="primary"
                  className="flex-1"
                  loading={isGeneratingToken}
                >
                  Genera Token
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowGenerateModal(false)}
                  disabled={isGeneratingToken}
                >
                  Annulla
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Disconnect Confirmation Modal */}
      {showDisconnectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
          >
            <div className="flex items-center space-x-3 mb-4">
              <div className="h-12 w-12 bg-danger-100 rounded-full flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-danger-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">
                Conferma Disconnessione
              </h3>
            </div>

            <p className="text-gray-600 mb-6">
              Sei sicuro di voler rimuovere il collegamento con {commercialista?.ragione_sociale || commercialista?.username}?
              Questa azione non può essere annullata.
            </p>

            <div className="flex space-x-3">
              <Button
                variant="danger"
                className="flex-1"
                onClick={handleDisconnect}
                loading={isDisconnecting}
              >
                Conferma Disconnessione
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowDisconnectModal(false)}
                disabled={isDisconnecting}
              >
                Annulla
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default CommercialistaManagementPage;
