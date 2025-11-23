// src/pages/Commercialista/ClientDetailPage.js
import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  CreditCard,
  TrendingUp,
  TrendingDown,
  Calendar,
  DollarSign,
  User,
  UserMinus,
  ChevronLeft,
  ChevronRight,
  FileText
} from 'lucide-react';
import { commercialistiAPI } from '../../services/api';
import LoadingSpinner from '../../components/UI/LoadingSpinner';
import Button from '../../components/UI/Button';
import toast from 'react-hot-toast';

const ClientDetailPage = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [clientData, setClientData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  useEffect(() => {
    loadClientData();
  }, [userId, currentPage]);

  const loadClientData = async () => {
    try {
      setIsLoading(true);
      const response = await commercialistiAPI.getClientDetails(userId, { page: currentPage, limit: 50 });
      setClientData(response);
      if (response.pagination) {
        setPagination(response.pagination);
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Errore nel caricamento dei dati';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnectClient = async () => {
    if (!window.confirm('Sei sicuro di voler staccare questo cliente? Questa azione è irreversibile.')) {
      return;
    }

    try {
      setIsDisconnecting(true);
      await commercialistiAPI.disconnectClient(userId);
      toast.success('Cliente disconnesso con successo');
      navigate('/commercialista/dashboard');
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Errore nella disconnessione del cliente';
      toast.error(errorMessage);
    } finally {
      setIsDisconnecting(false);
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!clientData) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Cliente non trovato</p>
      </div>
    );
  }

  const { cliente, conti = [], movimenti = [] } = clientData;

  // Calculate totals
  const saldoTotale = conti.reduce((sum, c) => sum + (parseFloat(c.saldo_corrente) || 0), 0);
  const contiAttivi = conti.filter(c => c.attivo).length;

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Link
        to="/commercialista/dashboard"
        className="inline-flex items-center text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Torna alla Dashboard
      </Link>

      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="h-16 w-16 bg-primary-100 rounded-full flex items-center justify-center">
              <User className="h-8 w-8 text-primary-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{cliente.username}</h1>
              <p className="text-gray-600">{cliente.email}</p>
              <p className="text-sm text-gray-500">Cliente dal {formatDate(cliente.created_at)}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Link to={`/commercialista/clienti/${userId}/reports`}>
              <Button variant="primary">
                <FileText className="h-4 w-4 mr-2" />
                Report
              </Button>
            </Link>
            <Button
              variant="danger"
              onClick={handleDisconnectClient}
              loading={isDisconnecting}
              disabled={isDisconnecting}
            >
              <UserMinus className="h-4 w-4 mr-2" />
              Stacca Cliente
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Saldo Totale</p>
              <p className={`text-2xl font-bold ${saldoTotale >= 0 ? 'text-success-600' : 'text-danger-600'}`}>
                {formatCurrency(saldoTotale)}
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
          transition={{ delay: 0.1 }}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Conti Attivi</p>
              <p className="text-2xl font-bold text-gray-900">{contiAttivi}</p>
            </div>
            <div className="h-12 w-12 bg-primary-100 rounded-lg flex items-center justify-center">
              <CreditCard className="h-6 w-6 text-primary-600" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Movimenti Totali</p>
              <p className="text-2xl font-bold text-gray-900">{pagination?.total || movimenti.length}</p>
            </div>
            <div className="h-12 w-12 bg-warning-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-warning-600" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'overview'
                  ? 'border-success-600 text-success-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Panoramica
            </button>
            <button
              onClick={() => setActiveTab('conti')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'conti'
                  ? 'border-success-600 text-success-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Conti Bancari ({conti.length})
            </button>
            <button
              onClick={() => {
                setActiveTab('movimenti');
                setCurrentPage(1);
              }}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'movimenti'
                  ? 'border-success-600 text-success-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Movimenti ({pagination?.total || movimenti.length})
            </button>
          </nav>
        </div>

        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Conti Bancari</h3>
                {conti.length === 0 ? (
                  <p className="text-gray-600">Nessun conto bancario</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {conti.slice(0, 4).map((conto) => (
                      <div
                        key={conto.id}
                        className="border border-gray-200 rounded-lg p-4"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-gray-900">{conto.nome_banca}</h4>
                          {conto.attivo ? (
                            <span className="text-xs bg-success-100 text-success-800 px-2 py-1 rounded">
                              Attivo
                            </span>
                          ) : (
                            <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">
                              Inattivo
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{conto.intestatario}</p>
                        <p className={`text-lg font-semibold ${
                          parseFloat(conto.saldo_corrente) >= 0 ? 'text-success-600' : 'text-danger-600'
                        }`}>
                          {formatCurrency(conto.saldo_corrente)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Ultimi Movimenti</h3>
                {movimenti.length === 0 ? (
                  <p className="text-gray-600">Nessun movimento</p>
                ) : (
                  <div className="space-y-3">
                    {movimenti.slice(0, 5).map((movimento) => (
                      <div
                        key={movimento.id}
                        className="flex items-center justify-between border-b border-gray-100 pb-3"
                      >
                        <div className="flex items-center space-x-3">
                          {movimento.tipo === 'Entrata' ? (
                            <TrendingUp className="h-5 w-5 text-success-600" />
                          ) : (
                            <TrendingDown className="h-5 w-5 text-danger-600" />
                          )}
                          <div>
                            <p className="font-medium text-gray-900">{movimento.descrizione}</p>
                            <p className="text-sm text-gray-600">
                              {movimento.nome_banca} • {formatDate(movimento.data)}
                            </p>
                          </div>
                        </div>
                        <p className={`font-semibold ${
                          movimento.tipo === 'Entrata' ? 'text-success-600' : 'text-danger-600'
                        }`}>
                          {movimento.tipo === 'Entrata' ? '+' : '-'}{formatCurrency(movimento.importo)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Conti Tab */}
          {activeTab === 'conti' && (
            <div className="space-y-4">
              {conti.length === 0 ? (
                <p className="text-gray-600">Nessun conto bancario</p>
              ) : (
                conti.map((conto) => (
                  <div
                    key={conto.id}
                    className="border border-gray-200 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-semibold text-gray-900 text-lg">{conto.nome_banca}</h4>
                        <p className="text-gray-600">{conto.intestatario}</p>
                        {conto.iban && <p className="text-sm text-gray-500 mt-1">{conto.iban}</p>}
                      </div>
                      {conto.attivo ? (
                        <span className="bg-success-100 text-success-800 px-3 py-1 rounded text-sm">
                          Attivo
                        </span>
                      ) : (
                        <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded text-sm">
                          Inattivo
                        </span>
                      )}
                    </div>
                    <div className="border-t border-gray-100 pt-3">
                      <p className="text-sm text-gray-600">Saldo Corrente</p>
                      <p className={`text-2xl font-bold ${
                        parseFloat(conto.saldo_corrente) >= 0 ? 'text-success-600' : 'text-danger-600'
                      }`}>
                        {formatCurrency(conto.saldo_corrente)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Movimenti Tab */}
          {activeTab === 'movimenti' && (
            <div className="space-y-4">
              {movimenti.length === 0 ? (
                <p className="text-gray-600">Nessun movimento</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descrizione</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Conto</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Importo</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {movimenti.map((movimento) => (
                          <tr key={movimento.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {formatDate(movimento.data)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {movimento.descrizione}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {movimento.nome_banca}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {movimento.categoria || '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-right">
                              <span className={`font-semibold ${
                                movimento.tipo === 'Entrata' ? 'text-success-600' : 'text-danger-600'
                              }`}>
                                {movimento.tipo === 'Entrata' ? '+' : '-'}{formatCurrency(movimento.importo)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Controls */}
                  {pagination && pagination.totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-gray-200 pt-4">
                      <div className="flex items-center text-sm text-gray-700">
                        <span>
                          Mostrando <span className="font-medium">{Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total)}</span> - <span className="font-medium">{Math.min(pagination.page * pagination.limit, pagination.total)}</span> di <span className="font-medium">{pagination.total}</span> movimenti
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(currentPage - 1)}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4 mr-1" />
                          Precedente
                        </Button>
                        <div className="flex items-center space-x-1">
                          {[...Array(pagination.totalPages)].map((_, index) => {
                            const pageNum = index + 1;
                            // Show first, last, current and adjacent pages
                            if (
                              pageNum === 1 ||
                              pageNum === pagination.totalPages ||
                              (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
                            ) {
                              return (
                                <button
                                  key={pageNum}
                                  onClick={() => setCurrentPage(pageNum)}
                                  className={`px-3 py-1 text-sm rounded ${
                                    currentPage === pageNum
                                      ? 'bg-primary-600 text-white'
                                      : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                                  }`}
                                >
                                  {pageNum}
                                </button>
                              );
                            } else if (
                              pageNum === currentPage - 2 ||
                              pageNum === currentPage + 2
                            ) {
                              return <span key={pageNum} className="px-2 text-gray-500">...</span>;
                            }
                            return null;
                          })}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(currentPage + 1)}
                          disabled={currentPage === pagination.totalPages}
                        >
                          Successiva
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClientDetailPage;
