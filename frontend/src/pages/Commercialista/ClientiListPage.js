// src/pages/Commercialista/ClientiListPage.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  User,
  Mail,
  DollarSign,
  CreditCard,
  TrendingUp,
  Eye,
  UserMinus,
  Search
} from 'lucide-react';
import { commercialistiAPI } from '../../services/api';
import LoadingSpinner from '../../components/UI/LoadingSpinner';
import Button from '../../components/UI/Button';
import toast from 'react-hot-toast';

const ClientiListPage = () => {
  const [clienti, setClienti] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [disconnectingId, setDisconnectingId] = useState(null);

  useEffect(() => {
    loadClienti();
  }, []);

  const loadClienti = async () => {
    try {
      setIsLoading(true);
      const response = await commercialistiAPI.getDashboard();
      setClienti(response.clienti || []);
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Errore nel caricamento dei clienti';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnectClient = async (userId, username) => {
    if (!window.confirm(`Sei sicuro di voler staccare il cliente ${username}? Questa azione è irreversibile.`)) {
      return;
    }

    try {
      setDisconnectingId(userId);
      await commercialistiAPI.disconnectClient(userId);
      toast.success('Cliente disconnesso con successo');
      // Ricarica la lista
      await loadClienti();
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Errore nella disconnessione del cliente';
      toast.error(errorMessage);
    } finally {
      setDisconnectingId(null);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR'
    }).format(value || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(new Date(dateString));
  };

  const filteredClienti = clienti.filter(cliente =>
    cliente.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cliente.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link
          to="/commercialista/dashboard"
          className="inline-flex items-center text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Torna alla Dashboard
        </Link>
      </div>

      {/* Title and Search */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Lista Clienti</h1>
            <p className="text-gray-600 mt-1">Gestisci tutti i tuoi clienti</p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Cerca cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Totale Clienti</p>
              <p className="text-2xl font-bold text-gray-900">{clienti.length}</p>
            </div>
            <div className="h-12 w-12 bg-primary-100 rounded-lg flex items-center justify-center">
              <User className="h-6 w-6 text-primary-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Saldo Totale</p>
              <p className="text-2xl font-bold text-success-600">
                {formatCurrency(clienti.reduce((sum, c) => sum + (parseFloat(c.saldo_totale) || 0), 0))}
              </p>
            </div>
            <div className="h-12 w-12 bg-success-100 rounded-lg flex items-center justify-center">
              <DollarSign className="h-6 w-6 text-success-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Totale Conti</p>
              <p className="text-2xl font-bold text-gray-900">
                {clienti.reduce((sum, c) => sum + (parseInt(c.numero_conti) || 0), 0)}
              </p>
            </div>
            <div className="h-12 w-12 bg-info-100 rounded-lg flex items-center justify-center">
              <CreditCard className="h-6 w-6 text-info-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Clients List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {filteredClienti.length === 0 ? (
          <div className="p-12 text-center">
            <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {searchTerm ? 'Nessun cliente trovato' : 'Nessun cliente'}
            </h3>
            <p className="text-gray-600">
              {searchTerm ? 'Prova a modificare i criteri di ricerca' : 'I tuoi clienti appariranno qui'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Saldo Totale
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Conti
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Movimenti
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ultimo Movimento
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Azioni
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredClienti.map((cliente, index) => (
                  <motion.tr
                    key={cliente.user_id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="hover:bg-gray-50"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <User className="h-5 w-5 text-primary-600" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{cliente.username}</div>
                          <div className="text-sm text-gray-500 flex items-center">
                            <Mail className="h-3 w-3 mr-1" />
                            {cliente.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <TrendingUp className={`h-4 w-4 mr-1 ${parseFloat(cliente.saldo_totale) >= 0 ? 'text-success-600' : 'text-danger-600'}`} />
                        <span className={`text-sm font-semibold ${parseFloat(cliente.saldo_totale) >= 0 ? 'text-success-600' : 'text-danger-600'}`}>
                          {formatCurrency(cliente.saldo_totale)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <CreditCard className="h-4 w-4 text-gray-400 mr-1" />
                        <span className="text-sm text-gray-900">{cliente.numero_conti}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {cliente.numero_movimenti}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(cliente.ultimo_movimento)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <Link to={`/commercialista/clienti/${cliente.user_id}`}>
                          <Button variant="outline" size="sm">
                            <Eye className="h-4 w-4 mr-1" />
                            Dettagli
                          </Button>
                        </Link>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDisconnectClient(cliente.user_id, cliente.username)}
                          loading={disconnectingId === cliente.user_id}
                          disabled={disconnectingId !== null}
                        >
                          <UserMinus className="h-4 w-4 mr-1" />
                          Stacca
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientiListPage;
