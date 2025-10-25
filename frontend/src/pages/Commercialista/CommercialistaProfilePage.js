// src/pages/Commercialista/CommercialistaProfilePage.js
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Briefcase,
  Mail,
  Phone,
  FileText,
  Calendar,
  User
} from 'lucide-react';
import { commercialistiAPI } from '../../services/api';
import LoadingSpinner from '../../components/UI/LoadingSpinner';
import toast from 'react-hot-toast';

const CommercialistaProfilePage = () => {
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setIsLoading(true);
      const response = await commercialistiAPI.getProfile();
      setProfile(response.commercialista);
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Errore nel caricamento del profilo';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Profilo non disponibile</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Il Tuo Profilo</h2>
        <p className="text-sm text-gray-600 mt-1">
          Visualizza le informazioni del tuo account commercialista
        </p>
      </div>

      {/* Profile Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card"
      >
        <div className="flex items-center space-x-6 mb-6">
          <div className="h-20 w-20 bg-success-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Briefcase className="h-10 w-10 text-success-600" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-gray-900">
              {profile.ragione_sociale || profile.username}
            </h3>
            <p className="text-gray-600 mt-1">Account Commercialista</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Username */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 flex items-center">
              <User className="h-4 w-4 mr-2 text-gray-400" />
              Username
            </label>
            <div className="form-input bg-gray-50">
              {profile.username}
            </div>
          </div>

          {/* Email */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 flex items-center">
              <Mail className="h-4 w-4 mr-2 text-gray-400" />
              Email
            </label>
            <div className="form-input bg-gray-50">
              {profile.email}
            </div>
          </div>

          {/* Ragione Sociale */}
          {profile.ragione_sociale && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center">
                <Briefcase className="h-4 w-4 mr-2 text-gray-400" />
                Ragione Sociale
              </label>
              <div className="form-input bg-gray-50">
                {profile.ragione_sociale}
              </div>
            </div>
          )}

          {/* Partita IVA */}
          {profile.partita_iva && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center">
                <FileText className="h-4 w-4 mr-2 text-gray-400" />
                Partita IVA
              </label>
              <div className="form-input bg-gray-50">
                {profile.partita_iva}
              </div>
            </div>
          )}

          {/* Telefono */}
          {profile.telefono && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center">
                <Phone className="h-4 w-4 mr-2 text-gray-400" />
                Telefono
              </label>
              <div className="form-input bg-gray-50">
                {profile.telefono}
              </div>
            </div>
          )}

          {/* Data Registrazione */}
          {profile.created_at && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center">
                <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                Membro dal
              </label>
              <div className="form-input bg-gray-50">
                {formatDate(profile.created_at)}
              </div>
            </div>
          )}
        </div>

        {/* Info Notice */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">
            <strong>Nota:</strong> Per modificare le informazioni del tuo profilo,
            contatta l'amministratore del sistema.
          </p>
        </div>
      </motion.div>

      {/* Account Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Statistiche Account
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Tipo Account</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">Commercialista</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Stato</p>
            <p className="text-lg font-semibold text-success-600 mt-1">Attivo</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">ID Account</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">#{profile.id}</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default CommercialistaProfilePage;
