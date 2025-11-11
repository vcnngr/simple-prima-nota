// src/pages/Commercialista/ChatListPage.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  MessageCircle,
  User,
  Clock,
  Mail,
  Search
} from 'lucide-react';
import { commercialistiAPI } from '../../services/api';
import LoadingSpinner from '../../components/UI/LoadingSpinner';
import toast from 'react-hot-toast';

const ChatListPage = () => {
  const [clienti, setClienti] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

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

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Proprio ora';
    if (diffMins < 60) return `${diffMins} min fa`;
    if (diffHours < 24) return `${diffHours} ore fa`;
    if (diffDays < 7) return `${diffDays} giorni fa`;

    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(date);
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
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Chat Clienti</h1>
            <p className="text-gray-600 mt-1">Messaggi con i tuoi clienti</p>
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

      {/* Clients List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {filteredClienti.length === 0 ? (
          <div className="p-12 text-center">
            <MessageCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {searchTerm ? 'Nessun cliente trovato' : 'Nessun cliente'}
            </h3>
            <p className="text-gray-600">
              {searchTerm ? 'Prova a modificare i criteri di ricerca' : 'I tuoi clienti appariranno qui'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredClienti.map((cliente, index) => (
              <motion.div
                key={cliente.user_id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Link
                  to={`/commercialista/chat/${cliente.user_id}`}
                  className="block hover:bg-gray-50 transition-colors"
                >
                  <div className="p-6">
                    <div className="flex items-center space-x-4">
                      {/* Avatar */}
                      <div className="h-14 w-14 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <User className="h-7 w-7 text-primary-600" />
                      </div>

                      {/* Client Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="text-lg font-semibold text-gray-900 truncate">
                            {cliente.username}
                          </h3>
                          {cliente.ultimo_movimento && (
                            <div className="flex items-center text-sm text-gray-500 ml-4">
                              <Clock className="h-4 w-4 mr-1" />
                              {formatDate(cliente.ultimo_movimento)}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center text-sm text-gray-600 mb-2">
                          <Mail className="h-4 w-4 mr-1" />
                          {cliente.email}
                        </div>

                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <span>
                            {cliente.numero_conti} {cliente.numero_conti === 1 ? 'conto' : 'conti'}
                          </span>
                          <span>•</span>
                          <span>
                            {cliente.numero_movimenti} {cliente.numero_movimenti === 1 ? 'movimento' : 'movimenti'}
                          </span>
                        </div>
                      </div>

                      {/* Arrow */}
                      <div className="flex-shrink-0">
                        <MessageCircle className="h-6 w-6 text-gray-400" />
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Info Card */}
      <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
        <div className="flex items-start space-x-3">
          <MessageCircle className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-blue-900 mb-1">Chat in tempo reale</h3>
            <p className="text-sm text-blue-700">
              Clicca su un cliente per iniziare una conversazione. I messaggi vengono aggiornati automaticamente ogni 10 secondi.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatListPage;
