// src/pages/Commercialista/ChatListPage.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  MessageCircle,
  User,
  Clock,
  Mail,
  Search,
  CheckCheck,
  MessageSquare
} from 'lucide-react';
import { messaggiAPI } from '../../services/api';
import LoadingSpinner from '../../components/UI/LoadingSpinner';
import Badge from '../../components/UI/Badge';
import toast from 'react-hot-toast';

const ChatListPage = () => {
  const [clienti, setClienti] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadClienti();
    // Refresh ogni 15 secondi per aggiornare contatori
    const interval = setInterval(loadClienti, 15000);
    return () => clearInterval(interval);
  }, []);

  const loadClienti = async () => {
    try {
      if (clienti.length === 0) setIsLoading(true); // Solo prima volta
      const response = await messaggiAPI.getClientsOverview();
      setClienti(response.clients || []);
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Errore nel caricamento dei clienti';
      if (clienti.length === 0) toast.error(errorMessage); // Solo se lista vuota
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
            {filteredClienti.map((cliente, index) => {
              const hasUnread = parseInt(cliente.unread_count) > 0;
              const unreadCount = parseInt(cliente.unread_count || 0);

              return (
                <motion.div
                  key={cliente.user_id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Link
                    to={`/commercialista/chat/${cliente.user_id}`}
                    className={`block hover:bg-gray-50 transition-colors ${hasUnread ? 'bg-blue-50/30' : ''}`}
                  >
                    <div className="p-6">
                      <div className="flex items-start space-x-4">
                        {/* Avatar with Badge */}
                        <div className="relative flex-shrink-0">
                          <div className={`h-14 w-14 rounded-full flex items-center justify-center ${
                            hasUnread ? 'bg-primary-500' : 'bg-primary-100'
                          }`}>
                            <User className={`h-7 w-7 ${hasUnread ? 'text-white' : 'text-primary-600'}`} />
                          </div>
                          {hasUnread && (
                            <div className="absolute -top-1 -right-1 h-6 w-6 bg-danger-500 rounded-full flex items-center justify-center">
                              <span className="text-xs font-bold text-white">{unreadCount}</span>
                            </div>
                          )}
                        </div>

                        {/* Client Info */}
                        <div className="flex-1 min-w-0">
                          {/* Header Row */}
                          <div className="flex items-center justify-between mb-1">
                            <h3 className={`text-lg font-semibold truncate ${
                              hasUnread ? 'text-gray-900' : 'text-gray-700'
                            }`}>
                              {cliente.username}
                            </h3>
                            {cliente.last_message_at && (
                              <div className={`flex items-center text-sm ml-4 flex-shrink-0 ${
                                hasUnread ? 'text-primary-600 font-medium' : 'text-gray-500'
                              }`}>
                                <Clock className="h-4 w-4 mr-1" />
                                {formatDate(cliente.last_message_at)}
                              </div>
                            )}
                          </div>

                          {/* Email */}
                          <div className="flex items-center text-sm text-gray-600 mb-2">
                            <Mail className="h-4 w-4 mr-1" />
                            {cliente.email}
                          </div>

                          {/* Last Message Preview */}
                          {cliente.last_message ? (
                            <div className={`flex items-start space-x-2 text-sm mb-2 ${
                              hasUnread ? 'font-medium text-gray-900' : 'text-gray-600'
                            }`}>
                              {cliente.last_message_from === 'commercialista' ? (
                                <CheckCheck className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                                  hasUnread ? 'text-gray-500' : 'text-primary-500'
                                }`} />
                              ) : (
                                <MessageSquare className="h-4 w-4 mt-0.5 text-primary-500 flex-shrink-0" />
                              )}
                              <p className="truncate flex-1">
                                {cliente.last_message_from === 'commercialista' && 'Tu: '}
                                {cliente.last_message}
                              </p>
                            </div>
                          ) : (
                            <div className="flex items-center text-sm text-gray-400 italic mb-2">
                              <MessageCircle className="h-4 w-4 mr-1" />
                              Nessun messaggio ancora
                            </div>
                          )}

                          {/* Badge Status */}
                          {hasUnread && (
                            <Badge variant="danger" size="sm">
                              {unreadCount} {unreadCount === 1 ? 'nuovo messaggio' : 'nuovi messaggi'}
                            </Badge>
                          )}
                        </div>

                        {/* Arrow Icon */}
                        <div className="flex-shrink-0">
                          <MessageCircle className={`h-6 w-6 ${hasUnread ? 'text-primary-500' : 'text-gray-400'}`} />
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Info Card - MIGLIORATO */}
      <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-lg border border-primary-200 p-6">
        <div className="flex items-start space-x-3">
          <MessageCircle className="h-6 w-6 text-primary-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-primary-900 mb-2">💬 Chat Intelligente</h3>
            <ul className="text-sm text-primary-700 space-y-1">
              <li className="flex items-center">
                <span className="inline-block w-1.5 h-1.5 bg-primary-500 rounded-full mr-2"></span>
                I clienti con messaggi non letti appaiono <strong>in cima alla lista</strong>
              </li>
              <li className="flex items-center">
                <span className="inline-block w-1.5 h-1.5 bg-primary-500 rounded-full mr-2"></span>
                Vedi l'<strong>anteprima dell'ultimo messaggio</strong> e quando è stato inviato
              </li>
              <li className="flex items-center">
                <span className="inline-block w-1.5 h-1.5 bg-primary-500 rounded-full mr-2"></span>
                La lista si aggiorna automaticamente ogni <strong>15 secondi</strong>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatListPage;
