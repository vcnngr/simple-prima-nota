// src/pages/Messaggi/ChatPage.js
import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Send,
  RefreshCw,
  Check,
  CheckCheck,
  MessageCircle,
  User as UserIcon,
  Briefcase
} from 'lucide-react';
import { messaggiAPI, utentiCommercialistaAPI, commercialistiAPI } from '../../services/api';
import Button from '../../components/UI/Button';
import Alert from '../../components/UI/Alert';
import LoadingSpinner from '../../components/UI/LoadingSpinner';
import toast from 'react-hot-toast';

const ChatPage = () => {
  const { userId } = useParams(); // For commercialista view
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [otherParty, setOtherParty] = useState(null);
  const messagesEndRef = useRef(null);
  const userType = localStorage.getItem('user_type');

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 10000); // Poll every 10 seconds
    return () => clearInterval(interval);
  }, [userId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadMessages = async (showLoader = true) => {
    try {
      if (showLoader) setIsLoading(true);

      const params = userId ? { userId } : {};
      const response = await messaggiAPI.getAll(params);

      setMessages(response.messaggi || []);
      setUnreadCount(response.unread_count || 0);

      // Load other party info
      if (userType === 'commercialista' && !otherParty) {
        // Load client info
        const clientResponse = await commercialistiAPI.getClientDetails(userId);
        setOtherParty({
          name: clientResponse.cliente.username,
          email: clientResponse.cliente.email,
          type: 'user'
        });
      } else if (userType !== 'commercialista' && !otherParty) {
        // Load commercialista info
        const commercialistaResponse = await utentiCommercialistaAPI.getCommercialista();
        if (commercialistaResponse.has_commercialista) {
          setOtherParty({
            name: commercialistaResponse.commercialista.ragione_sociale || commercialistaResponse.commercialista.username,
            email: commercialistaResponse.commercialista.email,
            type: 'commercialista'
          });
        }
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Errore nel caricamento dei messaggi';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadMessages(false);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    setIsSending(true);
    try {
      await messaggiAPI.send(newMessage.trim());
      setNewMessage('');
      loadMessages(false);
      scrollToBottom();
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Errore nell\'invio del messaggio';
      toast.error(errorMessage);
    } finally {
      setIsSending(false);
    }
  };

  const handleMarkAsRead = async (messageId) => {
    try {
      await messaggiAPI.markAsRead(messageId);
      loadMessages(false);
    } catch (err) {
      // Silently fail
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await messaggiAPI.markAllAsRead();
      toast.success('Tutti i messaggi contrassegnati come letti');
      loadMessages(false);
    } catch (err) {
      toast.error('Errore nell\'aggiornamento dei messaggi');
    }
  };

  const formatTime = (dateString) => {
    return new Intl.DateTimeFormat('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(new Date(dateString));
  };

  const isMyMessage = (message) => {
    return message.mittente_tipo === userType ||
           (userType !== 'commercialista' && message.mittente_tipo === 'user');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!otherParty) {
    return (
      <div className="space-y-6">
        <Alert type="warning">
          {userType === 'commercialista'
            ? 'Cliente non trovato'
            : 'Non hai un commercialista collegato. Vai alla pagina Gestione Commercialista per collegarne uno.'}
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Chat Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
              otherParty.type === 'commercialista' ? 'bg-success-100' : 'bg-primary-100'
            }`}>
              {otherParty.type === 'commercialista' ? (
                <Briefcase className={`h-6 w-6 ${otherParty.type === 'commercialista' ? 'text-success-600' : 'text-primary-600'}`} />
              ) : (
                <UserIcon className="h-6 w-6 text-primary-600" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {otherParty.name}
              </h2>
              <p className="text-sm text-gray-600">{otherParty.email}</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkAllAsRead}
              >
                <CheckCheck className="h-4 w-4 mr-2" />
                Segna tutto come letto
              </Button>
            )}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RefreshCw className={`h-5 w-5 text-gray-600 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto bg-gray-50 px-6 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <MessageCircle className="h-16 w-16 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Nessun messaggio
            </h3>
            <p className="text-gray-600 text-center">
              Inizia una conversazione inviando il primo messaggio
            </p>
          </div>
        ) : (
          messages.map((message, index) => {
            const isMine = isMyMessage(message);

            return (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * index }}
                className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                onMouseEnter={() => {
                  if (!isMine && !message.letto) {
                    handleMarkAsRead(message.id);
                  }
                }}
              >
                <div className={`max-w-[70%] ${isMine ? 'order-2' : 'order-1'}`}>
                  <div
                    className={`rounded-2xl px-4 py-3 ${
                      isMine
                        ? 'bg-primary-600 text-white'
                        : 'bg-white border border-gray-200 text-gray-900'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {message.messaggio}
                    </p>
                  </div>
                  <div className={`flex items-center mt-1 space-x-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <span className="text-xs text-gray-500">
                      {formatTime(message.created_at)}
                    </span>
                    {isMine && (
                      <span>
                        {message.letto ? (
                          <CheckCheck className="h-4 w-4 text-success-600" />
                        ) : (
                          <Check className="h-4 w-4 text-gray-400" />
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <form onSubmit={handleSendMessage} className="flex items-end space-x-3">
          <div className="flex-1">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e);
                }
              }}
              placeholder="Scrivi un messaggio..."
              rows="3"
              className="form-input resize-none"
              disabled={isSending}
            />
            <p className="text-xs text-gray-500 mt-1">
              Premi Invio per inviare, Shift+Invio per andare a capo
            </p>
          </div>
          <Button
            type="submit"
            variant="primary"
            disabled={!newMessage.trim() || isSending}
            loading={isSending}
          >
            <Send className="h-5 w-5" />
          </Button>
        </form>
      </div>
    </div>
  );
};

export default ChatPage;
