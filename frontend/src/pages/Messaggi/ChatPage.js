// src/pages/Messaggi/ChatPage.js
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Send,
  RefreshCw,
  Check,
  CheckCheck,
  MessageCircle,
  User as UserIcon,
  Briefcase,
  Paperclip,
  X,
  HelpCircle,
  Download,
  Receipt
} from 'lucide-react';
import { messaggiAPI, utentiCommercialistaAPI, commercialistiAPI } from '../../services/api';
import Button from '../../components/UI/Button';
import Alert from '../../components/UI/Alert';
import LoadingSpinner from '../../components/UI/LoadingSpinner';
import toast from 'react-hot-toast';
import usePollingVisibile from '../../hooks/usePollingVisibile';

// Il limite vero lo applica il server; qui si evita solo di caricare 50 MB per
// sentirsi dire di no.
const MAX_ALLEGATO = 10 * 1024 * 1024;

const ChatPage = () => {
  const { userId } = useParams(); // For commercialista view
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [otherParty, setOtherParty] = useState(null);
  const [chiarimentiAperti, setChiarimentiAperti] = useState(0);
  const [file, setFile] = useState(null);
  const [chiarimento, setChiarimento] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const movimentoRif = parseInt(searchParams.get('movimento'), 10) || null;
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const userType = localStorage.getItem('user_type');

  // Chat aperta: ogni 15 secondi, e solo se la scheda e' visibile.
  usePollingVisibile(() => loadMessages(), 15000, [userId]);

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
      setChiarimentiAperti(response.chiarimenti_aperti || 0);

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

  const togliMovimento = () => {
    searchParams.delete('movimento');
    setSearchParams(searchParams, { replace: true });
  };

  const scegliFile = (e) => {
    const scelto = e.target.files?.[0];
    e.target.value = '';
    if (!scelto) return;
    if (scelto.size > MAX_ALLEGATO) {
      toast.error('File troppo grande (massimo 10 MB)');
      return;
    }
    setFile(scelto);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() && !file) return;

    setIsSending(true);
    try {
      const params = userId ? { userId } : {};
      const extra = { chiarimento, movimento_id: movimentoRif };
      if (file) {
        await messaggiAPI.sendAllegato(file, { messaggio: newMessage.trim(), ...extra }, params);
      } else {
        await messaggiAPI.send(newMessage.trim(), params, extra);
      }
      setNewMessage('');
      setFile(null);
      setChiarimento(false);
      if (movimentoRif) togliMovimento();
      loadMessages(false);
      scrollToBottom();
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Errore nell\'invio del messaggio';
      toast.error(errorMessage);
    } finally {
      setIsSending(false);
    }
  };

  const scaricaAllegato = async (allegato) => {
    try {
      const params = userId ? { userId } : {};
      const blob = await messaggiAPI.scaricaAllegato(allegato.id, params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = allegato.nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Allegato non disponibile');
    }
  };

  const cambiaChiarimento = async (message, stato) => {
    try {
      const params = userId ? { userId } : {};
      await messaggiAPI.setChiarimento(message.id, stato, params);
      loadMessages(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore nell\'aggiornamento della richiesta');
      loadMessages(false);
    }
  };

  const handleMarkAsRead = async (messageId) => {
    try {
      const params = userId ? { userId } : {};
      await messaggiAPI.markAsRead(messageId, params);
      loadMessages(false);
      // Emit event to update sidebar badge
      window.dispatchEvent(new CustomEvent('messagesRead'));
    } catch (err) {
      // Silently fail
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const params = userId ? { userId } : {};
      await messaggiAPI.markAllAsRead(params);
      toast.success('Tutti i messaggi contrassegnati come letti');
      loadMessages(false);
      // Emit event to update sidebar badge
      window.dispatchEvent(new CustomEvent('messagesRead'));
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
            {chiarimentiAperti > 0 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                <HelpCircle className="h-3.5 w-3.5 mr-1" />
                {chiarimentiAperti} da chiarire
              </span>
            )}
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
                    {message.chiarimento_stato && (
                      <div className={`flex items-center text-xs font-semibold mb-1 ${
                        isMine ? 'text-white/90' : 'text-amber-700'
                      }`}>
                        <HelpCircle className="h-3.5 w-3.5 mr-1" />
                        Richiesta di chiarimento · {message.chiarimento_stato === 'aperta' ? 'aperta' : 'risolta'}
                      </div>
                    )}
                    {message.movimento && (
                      <div className={`flex items-center text-xs rounded-lg px-2 py-1 mb-2 ${
                        isMine ? 'bg-primary-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        <Receipt className="h-3.5 w-3.5 mr-1 flex-shrink-0" />
                        <span className="truncate">
                          {new Date(message.movimento.data).toLocaleDateString('it-IT')} · {message.movimento.descrizione} · {message.movimento.tipo === 'Entrata' ? '+' : '-'}{Number(message.movimento.importo).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
                        </span>
                      </div>
                    )}
                    {message.movimento_nascosto && (
                      <div className="text-xs italic mb-2 opacity-80">
                        Movimento non piu' visibile
                      </div>
                    )}
                    {message.messaggio && (
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {message.messaggio}
                      </p>
                    )}
                    {(message.allegati || []).map((allegato) => (
                      <button
                        key={allegato.id}
                        type="button"
                        onClick={() => scaricaAllegato(allegato)}
                        className={`mt-2 flex items-center w-full text-left text-xs rounded-lg px-2 py-1.5 ${
                          isMine ? 'bg-primary-700 hover:bg-primary-800' : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                        }`}
                      >
                        <Download className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
                        <span className="truncate flex-1">{allegato.nome}</span>
                        <span className="ml-2 opacity-75">{Math.max(1, Math.round(allegato.dimensione / 1024))} KB</span>
                      </button>
                    ))}
                  </div>
                  {message.chiarimento_stato && (
                    <div className={`flex mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <button
                        type="button"
                        onClick={() => cambiaChiarimento(message, message.chiarimento_stato === 'aperta' ? 'risolta' : 'aperta')}
                        className="text-xs font-medium text-primary-600 hover:underline"
                      >
                        {message.chiarimento_stato === 'aperta' ? 'Segna risolta' : 'Riapri'}
                      </button>
                    </div>
                  )}
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
      <div className="bg-white border-t border-gray-200 px-6 py-3">
        {(movimentoRif || file) && (
          <div className="flex flex-wrap gap-2 mb-2">
            {movimentoRif && (
              <span className="inline-flex items-center text-xs bg-gray-100 text-gray-700 rounded-full px-2.5 py-1">
                <Receipt className="h-3.5 w-3.5 mr-1" />
                Riferito al movimento #{movimentoRif}
                <button type="button" onClick={togliMovimento} className="ml-1" aria-label="Togli il movimento">
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
            {file && (
              <span className="inline-flex items-center text-xs bg-gray-100 text-gray-700 rounded-full px-2.5 py-1 max-w-full">
                <Paperclip className="h-3.5 w-3.5 mr-1 flex-shrink-0" />
                <span className="truncate">{file.name}</span>
                <button type="button" onClick={() => setFile(null)} className="ml-1" aria-label="Togli l'allegato">
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
          </div>
        )}
        <form onSubmit={handleSendMessage} className="flex items-end space-x-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv"
            className="hidden"
            onChange={scegliFile}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 mb-6 rounded-lg hover:bg-gray-100 text-gray-600"
            aria-label="Allega un file"
            disabled={isSending}
          >
            <Paperclip className="h-5 w-5" />
          </button>
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
              rows="2"
              className="form-input resize-none"
              disabled={isSending}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 mt-1">
              <p className="text-xs text-gray-500">
                Premi Invio per inviare, Shift+Invio per andare a capo
              </p>
              <label className="inline-flex items-center text-xs text-gray-700">
                <input
                  type="checkbox"
                  className="mr-1.5"
                  checked={chiarimento}
                  onChange={(e) => setChiarimento(e.target.checked)}
                />
                Richiesta di chiarimento
              </label>
            </div>
          </div>
          <Button
            type="submit"
            variant="primary"
            disabled={(!newMessage.trim() && !file) || isSending}
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
