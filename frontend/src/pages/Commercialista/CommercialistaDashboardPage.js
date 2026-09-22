// src/pages/Commercialista/CommercialistaDashboardPage.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Users,
  TrendingUp,
  TrendingDown,
  Calendar,
  Eye,
  Mail,
  AlertCircle,
  Briefcase,
  DollarSign
} from 'lucide-react';
import { commercialistiAPI } from '../../services/api';
import Button from '../../components/UI/Button';
import LoadingSpinner from '../../components/UI/LoadingSpinner';
import toast from 'react-hot-toast';

const CommercialistaDashboardPage = () => {
  const [dashboardData, setDashboardData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [clientToken, setClientToken] = useState('');
  const [isConnectingClient, setIsConnectingClient] = useState(false);
  const [identificativoCliente, setIdentificativoCliente] = useState('');
  const [isRichiedendo, setIsRichiedendo] = useState(false);
  const [richieste, setRichieste] = useState([]);

  const commercialista = JSON.parse(localStorage.getItem('commercialista') || '{}');

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setIsLoading(true);
      const [response, richiesteResp] = await Promise.all([
        commercialistiAPI.getDashboard(),
        commercialistiAPI.getRichieste()
      ]);
      setDashboardData(response);
      setRichieste(richiesteResp.richieste || []);
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Errore nel caricamento della dashboard';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnectClient = async (e) => {
    e.preventDefault();
    if (!clientToken.trim()) {
      toast.error('Inserisci un token valido');
      return;
    }

    setIsConnectingClient(true);
    try {
      const response = await commercialistiAPI.collegaCliente(clientToken);
      toast.success(`Cliente ${response.cliente?.username} collegato con successo!`);
      setShowTokenModal(false);
      setClientToken('');
      loadDashboard(); // Reload dashboard
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Errore nel collegamento del cliente';
      toast.error(errorMessage);
    } finally {
      setIsConnectingClient(false);
    }
  };

  // Percorso principale: si nomina il cliente, lui accetta. Il token resta solo
  // per il caso "non sono ancora registrato su questo portale".
  const handleRichiediCollegamento = async (e) => {
    e.preventDefault();
    if (!identificativoCliente.trim()) {
      toast.error('Inserisci username o email del cliente');
      return;
    }

    setIsRichiedendo(true);
    try {
      const response = await commercialistiAPI.richiediCollegamento(identificativoCliente.trim());
      // Il messaggio non dice se il cliente esiste: la risposta del server e'
      // volutamente la stessa nei due casi.
      toast.success(response.message || 'Richiesta inviata');
      setShowTokenModal(false);
      setIdentificativoCliente('');
      loadDashboard();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore nell\'invio della richiesta');
    } finally {
      setIsRichiedendo(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR'
    }).format(value);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Mai';
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(dateString));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const { clienti = [], totale_clienti = 0 } = dashboardData || {};

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            Benvenuto, {commercialista.ragione_sociale || commercialista.username}
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Gestisci i tuoi clienti e monitora la loro attività
          </p>
        </div>
        <div className="mt-4 md:mt-0">
          <Button
            variant="success"
            size="md"
            onClick={() => setShowTokenModal(true)}
          >
            Aggiungi Cliente
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl shadow-sm p-6 border border-gray-200"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Clienti Totali</p>
                <p className="text-3xl font-bold text-gray-900">{totale_clienti}</p>
              </div>
              <div className="h-12 w-12 bg-primary-100 rounded-lg flex items-center justify-center">
                <Users className="h-6 w-6 text-primary-600" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl shadow-sm p-6 border border-gray-200"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Saldo Totale</p>
                <p className="text-3xl font-bold text-gray-900">
                  {formatCurrency(
                    clienti.reduce((sum, c) => sum + (c.stato === 'attiva' ? parseFloat(c.saldo_totale) || 0 : 0), 0)
                  )}
                </p>
              </div>
              <div className="h-12 w-12 bg-success-100 rounded-lg flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-success-600" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-xl shadow-sm p-6 border border-gray-200"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Messaggi Non Letti</p>
                <p className="text-3xl font-bold text-gray-900">
                  {clienti.reduce((sum, c) => sum + (c.unread_messages || 0), 0)}
                </p>
              </div>
              <div className="h-12 w-12 bg-warning-100 rounded-lg flex items-center justify-center">
                <Mail className="h-6 w-6 text-warning-600" />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Richieste in attesa: inviate e non ancora accettate dal cliente.
            Finche' sono qui il commercialista non vede alcun dato contabile. */}
        {richieste.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="bg-white rounded-xl shadow-sm border border-amber-300"
          >
            <div className="p-6 border-b border-amber-200 bg-amber-50 rounded-t-xl">
              <h2 className="text-xl font-semibold text-gray-900">
                Richieste in attesa ({richieste.length})
              </h2>
              <p className="text-sm text-gray-700 mt-1">
                Il cliente deve accettare prima che i suoi dati siano visibili.
              </p>
            </div>
            <div className="divide-y divide-gray-200">
              {richieste.map((r) => (
                <div key={r.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{r.username}</p>
                    <p className="text-sm text-gray-600">{r.email}</p>
                  </div>
                  <p className="text-sm text-gray-500">
                    Richiesta del {formatDate(r.data_richiesta)}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Clients List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-xl shadow-sm border border-gray-200"
        >
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">
              I Tuoi Clienti
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Gestisci e monitora i tuoi clienti
            </p>
          </div>

          {clienti.length === 0 ? (
            <div className="p-12 text-center">
              <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Nessun cliente collegato
              </h3>
              <p className="text-gray-600 mb-6">
                Inizia aggiungendo il tuo primo cliente con un token di invito
              </p>
              <Button
                variant="success"
                onClick={() => setShowTokenModal(true)}
              >
                Aggiungi Primo Cliente
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {clienti.map((cliente, index) => (
                <motion.div
                  key={cliente.user_id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * index }}
                  className="p-6 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <div className="h-10 w-10 bg-primary-100 rounded-full flex items-center justify-center">
                          <span className="text-primary-600 font-semibold">
                            {cliente.username?.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">
                            {cliente.username}
                          </h3>
                          <p className="text-sm text-gray-600">{cliente.email || '—'}</p>
                        </div>
                        {cliente.stato === 'sospesa' && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-700">
                            Sospeso dal cliente
                          </span>
                        )}
                        {cliente.unread_messages > 0 && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-warning-100 text-warning-800">
                            {cliente.unread_messages} nuovi messaggi
                          </span>
                        )}
                      </div>

                      {/* Un collegamento sospeso non porta dati: il riquadro lo dice,
                          invece di mostrare zeri che sembrerebbero una contabilita' vuota. */}
                      {cliente.stato !== 'attiva' ? (
                      <p className="mt-4 text-sm text-gray-600">
                        Il cliente ha sospeso il collegamento. I dati contabili non sono
                        consultabili finche' non lo riattiva.
                      </p>
                      ) : (
                      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs text-gray-600">Saldo Totale</p>
                          <p className={`text-sm font-semibold ${
                            parseFloat(cliente.saldo_totale) >= 0
                              ? 'text-success-600'
                              : 'text-danger-600'
                          }`}>
                            {formatCurrency(cliente.saldo_totale)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Conti Bancari</p>
                          <p className="text-sm font-semibold text-gray-900">
                            {cliente.numero_conti}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Movimenti</p>
                          <p className="text-sm font-semibold text-gray-900">
                            {cliente.numero_movimenti}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Ultimo Aggiornamento</p>
                          <p className="text-sm font-semibold text-gray-900">
                            {formatDate(cliente.ultimo_movimento)}
                          </p>
                        </div>
                      </div>
                      )}
                    </div>

                    <div className={`mt-4 md:mt-0 md:ml-6 flex space-x-3 ${cliente.stato !== 'attiva' ? 'hidden' : ''}`}>
                      <Link to={`/commercialista/clienti/${cliente.user_id}`}>
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4 mr-2" />
                          Dettagli
                        </Button>
                      </Link>
                      <Link to={`/commercialista/chat/${cliente.user_id}`}>
                        <Button variant="outline" size="sm">
                          <Mail className="h-4 w-4 mr-2" />
                          Chat
                        </Button>
                      </Link>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

      {/* Token Modal */}
      {showTokenModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
          >
            <h3 className="text-xl font-semibold text-gray-900 mb-1">
              Aggiungi Cliente
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              Chiedi il collegamento al cliente: sara' lui ad accettarlo e a decidere
              quali conti e quale periodo puoi vedere.
            </p>

            <form onSubmit={handleRichiediCollegamento} className="space-y-4">
              <div>
                <label htmlFor="identificativo" className="form-label">
                  Username o email del cliente
                </label>
                <input
                  id="identificativo"
                  type="text"
                  className="form-input"
                  placeholder="mario.rossi oppure mario@esempio.it"
                  value={identificativoCliente}
                  onChange={(e) => setIdentificativoCliente(e.target.value)}
                  disabled={isRichiedendo}
                />
              </div>

              <Button
                type="submit"
                variant="success"
                className="w-full"
                loading={isRichiedendo}
              >
                Invia Richiesta
              </Button>
            </form>

            <div className="border-t border-gray-200 my-6" />

            <h4 className="text-sm font-semibold text-gray-900 mb-1">
              Hai un token di invito?
            </h4>
            <p className="text-xs text-gray-600 mb-4">
              Serve solo se il cliente te lo ha consegnato prima che ti registrassi.
              Anche in questo caso dovra' accettare la richiesta.
            </p>

            <form onSubmit={handleConnectClient} className="space-y-4">
              <div>
                <input
                  id="token"
                  type="text"
                  className="form-input"
                  placeholder="Token di invito"
                  value={clientToken}
                  onChange={(e) => setClientToken(e.target.value)}
                  disabled={isConnectingClient}
                />
              </div>

              <div className="flex space-x-3">
                <Button
                  type="submit"
                  variant="outline"
                  className="flex-1"
                  loading={isConnectingClient}
                >
                  Usa Token
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowTokenModal(false);
                    setClientToken('');
                    setIdentificativoCliente('');
                  }}
                  disabled={isConnectingClient || isRichiedendo}
                >
                  Chiudi
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default CommercialistaDashboardPage;
