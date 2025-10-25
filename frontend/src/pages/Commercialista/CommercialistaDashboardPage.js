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

  const commercialista = JSON.parse(localStorage.getItem('commercialista') || '{}');

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setIsLoading(true);
      const response = await commercialistiAPI.getDashboard();
      setDashboardData(response);
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
                    clienti.reduce((sum, c) => sum + (parseFloat(c.saldo_totale) || 0), 0)
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
                          <p className="text-sm text-gray-600">{cliente.email}</p>
                        </div>
                        {cliente.unread_messages > 0 && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-warning-100 text-warning-800">
                            {cliente.unread_messages} nuovi messaggi
                          </span>
                        )}
                      </div>

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
                    </div>

                    <div className="mt-4 md:mt-0 md:ml-6 flex space-x-3">
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
            <h3 className="text-xl font-semibold text-gray-900 mb-4">
              Aggiungi Cliente
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              Inserisci il token di invito fornito dal tuo cliente
            </p>

            <form onSubmit={handleConnectClient} className="space-y-4">
              <div>
                <label htmlFor="token" className="form-label">
                  Token di Invito
                </label>
                <input
                  id="token"
                  type="text"
                  className="form-input"
                  placeholder="Inserisci il token qui"
                  value={clientToken}
                  onChange={(e) => setClientToken(e.target.value)}
                  disabled={isConnectingClient}
                />
              </div>

              <div className="flex space-x-3">
                <Button
                  type="submit"
                  variant="success"
                  className="flex-1"
                  loading={isConnectingClient}
                >
                  Collega Cliente
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowTokenModal(false);
                    setClientToken('');
                  }}
                  disabled={isConnectingClient}
                >
                  Annulla
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
