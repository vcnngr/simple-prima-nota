// src/pages/Commercialista/CommercialistaProfilePage.js
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Briefcase,
  Mail,
  Phone,
  FileText,
  Calendar,
  User,
  Shield,
  Hash
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
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h1 className="text-2xl font-bold text-gray-900">Il Tuo Profilo</h1>
        <p className="text-gray-600 mt-1">
          Visualizza le informazioni del tuo account commercialista
        </p>
      </div>

      {/* Profile Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
      >
        {/* Header with Icon */}
        <div className="bg-gradient-to-r from-success-600 to-success-700 p-8">
          <div className="flex items-center space-x-6">
            <div className="h-20 w-20 bg-white rounded-full flex items-center justify-center flex-shrink-0 shadow-lg">
              <Briefcase className="h-10 w-10 text-success-600" />
            </div>
            <div className="text-white">
              <h2 className="text-3xl font-bold">
                {profile.ragione_sociale || profile.username}
              </h2>
              <p className="text-success-100 mt-1 text-lg">Account Commercialista</p>
            </div>
          </div>
        </div>

        {/* Profile Details */}
        <div className="p-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Informazioni Account</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Username */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center">
                <User className="h-4 w-4 mr-2 text-gray-500" />
                Username
              </label>
              <div className="px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-gray-900 font-medium">{profile.username}</p>
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center">
                <Mail className="h-4 w-4 mr-2 text-gray-500" />
                Email
              </label>
              <div className="px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-gray-900 font-medium">{profile.email}</p>
              </div>
            </div>

            {/* Ragione Sociale */}
            {profile.ragione_sociale && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 flex items-center">
                  <Briefcase className="h-4 w-4 mr-2 text-gray-500" />
                  Ragione Sociale
                </label>
                <div className="px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-gray-900 font-medium">{profile.ragione_sociale}</p>
                </div>
              </div>
            )}

            {/* Partita IVA */}
            {profile.partita_iva && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 flex items-center">
                  <FileText className="h-4 w-4 mr-2 text-gray-500" />
                  Partita IVA
                </label>
                <div className="px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-gray-900 font-medium">{profile.partita_iva}</p>
                </div>
              </div>
            )}

            {/* Telefono */}
            {profile.telefono && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 flex items-center">
                  <Phone className="h-4 w-4 mr-2 text-gray-500" />
                  Telefono
                </label>
                <div className="px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-gray-900 font-medium">{profile.telefono}</p>
                </div>
              </div>
            )}

            {/* Data Registrazione */}
            {profile.created_at && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 flex items-center">
                  <Calendar className="h-4 w-4 mr-2 text-gray-500" />
                  Membro dal
                </label>
                <div className="px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-gray-900 font-medium">{formatDate(profile.created_at)}</p>
                </div>
              </div>
            )}
          </div>

          {/* Info Notice */}
          <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-start space-x-3">
              <Shield className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-blue-900 font-medium">Informazioni protette</p>
                <p className="text-sm text-blue-700 mt-1">
                  Per modificare le informazioni del tuo profilo, contatta l'amministratore del sistema.
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Account Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-6">
          Statistiche Account
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Tipo Account */}
          <div className="flex items-center space-x-4">
            <div className="h-12 w-12 bg-success-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Briefcase className="h-6 w-6 text-success-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Tipo Account</p>
              <p className="text-lg font-semibold text-gray-900">Commercialista</p>
            </div>
          </div>

          {/* Stato */}
          <div className="flex items-center space-x-4">
            <div className="h-12 w-12 bg-success-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Shield className="h-6 w-6 text-success-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Stato</p>
              <div className="flex items-center space-x-2 mt-1">
                <div className="h-2 w-2 bg-success-600 rounded-full"></div>
                <p className="text-lg font-semibold text-success-600">Attivo</p>
              </div>
            </div>
          </div>

          {/* ID Account */}
          <div className="flex items-center space-x-4">
            <div className="h-12 w-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Hash className="h-6 w-6 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">ID Account</p>
              <p className="text-lg font-semibold text-gray-900">#{profile.id}</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default CommercialistaProfilePage;
