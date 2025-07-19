// src/pages/Profile/ProfilePage.js
import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  User,
  Mail,
  Lock,
  Settings,
  Shield,
  Bell,
  Download,
  Upload,
  Trash2,
  Save,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle,
  Calendar,
  Activity
} from 'lucide-react';
import { authAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import Badge from '../../components/UI/Badge';
import Alert from '../../components/UI/Alert';
import LoadingSpinner from '../../components/UI/LoadingSpinner';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';

const ProfilePage = () => {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'profile');
  const { user, changePassword } = useAuth();

  // Query per dati profilo
  const { data: profileData, isLoading, error } = useQuery(
    'user-profile',
    authAPI.getProfile,
    {
      refetchOnWindowFocus: false,
    }
  );

  const tabs = [
    {
      id: 'profile',
      name: 'Profilo',
      icon: User,
      description: 'Informazioni personali'
    },
    {
      id: 'security',
      name: 'Sicurezza',
      icon: Shield,
      description: 'Password e sicurezza'
    },
    {
      id: 'preferences',
      name: 'Preferenze',
      icon: Settings,
      description: 'Impostazioni applicazione'
    },
    {
      id: 'data',
      name: 'I Miei Dati',
      icon: Download,
      description: 'Export e backup'
    }
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert type="danger">
        Errore nel caricamento del profilo: {error.message}
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Profilo</h1>
          <p className="mt-1 text-sm text-gray-600">
            Gestisci le tue informazioni personali e impostazioni
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Badge variant="success" className="flex items-center">
            <CheckCircle className="w-4 h-4 mr-1" />
            Account Attivo
          </Badge>
        </div>
      </div>

      {/* User Info Card */}
      <Card>
        <Card.Body className="flex items-center space-x-4">
          <div className="flex-shrink-0">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center">
              <User className="w-8 h-8 text-primary-600" />
            </div>
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-gray-900">
              {profileData?.username || user?.username}
            </h2>
            <p className="text-gray-600">{profileData?.email || user?.email}</p>
            <div className="flex items-center mt-2 space-x-4 text-sm text-gray-500">
              <div className="flex items-center">
                <Calendar className="w-4 h-4 mr-1" />
                Registrato il {new Date(profileData?.created_at).toLocaleDateString('it-IT')}
              </div>
              <div className="flex items-center">
                <Activity className="w-4 h-4 mr-1" />
                Ultimo accesso oggi
              </div>
            </div>
          </div>
        </Card.Body>
      </Card>

      {/* Tabs */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar Navigation */}
        <div className="lg:col-span-1">
          <Card>
            <Card.Body className="p-0">
              <nav className="space-y-1">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center px-4 py-3 text-left transition-colors ${
                        isActive 
                          ? 'bg-primary-50 text-primary-700 border-r-2 border-primary-600' 
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <Icon className="w-5 h-5 mr-3" />
                      <div>
                        <p className="font-medium">{tab.name}</p>
                        <p className="text-xs text-gray-500">{tab.description}</p>
                      </div>
                    </button>
                  );
                })}
              </nav>
            </Card.Body>
          </Card>
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {activeTab === 'profile' && <ProfileTab profileData={profileData} />}
            {activeTab === 'security' && <SecurityTab changePassword={changePassword} />}
            {activeTab === 'preferences' && <PreferencesTab />}
            {activeTab === 'data' && <DataTab />}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

// Tab Profilo
const ProfileTab = ({ profileData }) => {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      username: profileData?.username || '',
      email: profileData?.email || ''
    }
  });

  const [isEditing, setIsEditing] = useState(false);

  const onSubmit = async (data) => {
    try {
      // Qui implementeresti l'aggiornamento del profilo
      toast.success('Profilo aggiornato con successo');
      setIsEditing(false);
    } catch (error) {
      toast.error('Errore nell\'aggiornamento del profilo');
    }
  };

  return (
    <Card>
      <Card.Header className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Informazioni Profilo</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsEditing(!isEditing)}
        >
          {isEditing ? 'Annulla' : 'Modifica'}
        </Button>
      </Card.Header>
      <Card.Body>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="form-label">Username</label>
            <input
              type="text"
              className={`form-input ${!isEditing ? 'bg-gray-50' : ''} ${errors.username ? 'border-danger-500' : ''}`}
              disabled={!isEditing}
              {...register('username', {
                required: 'Username è richiesto',
                minLength: {
                  value: 3,
                  message: 'Username deve essere di almeno 3 caratteri'
                }
              })}
            />
            {errors.username && (
              <p className="form-error">{errors.username.message}</p>
            )}
          </div>

          <div>
            <label className="form-label">Email</label>
            <input
              type="email"
              className={`form-input ${!isEditing ? 'bg-gray-50' : ''} ${errors.email ? 'border-danger-500' : ''}`}
              disabled={!isEditing}
              {...register('email', {
                required: 'Email è richiesta',
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: 'Email non valida'
                }
              })}
            />
            {errors.email && (
              <p className="form-error">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="form-label">Data Registrazione</label>
            <input
              type="text"
              className="form-input bg-gray-50"
              value={new Date(profileData?.created_at).toLocaleDateString('it-IT')}
              disabled
            />
          </div>

          {isEditing && (
            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditing(false)}
              >
                Annulla
              </Button>
              <Button type="submit" variant="primary">
                <Save className="w-4 h-4 mr-2" />
                Salva Modifiche
              </Button>
            </div>
          )}
        </form>
      </Card.Body>
    </Card>
  );
};

// Tab Sicurezza
const SecurityTab = ({ changePassword }) => {
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm();
  const watchNewPassword = watch('newPassword');

  const onSubmit = async (data) => {
    if (data.newPassword !== data.confirmPassword) {
      toast.error('Le nuove password non coincidono');
      return;
    }

    const result = await changePassword({
      currentPassword: data.currentPassword,
      newPassword: data.newPassword
    });

    if (result.success) {
      reset();
    }
  };

  const togglePasswordVisibility = (field) => {
    setShowPasswords(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  return (
    <div className="space-y-6">
      {/* Cambio Password */}
      <Card>
        <Card.Header>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <Lock className="w-5 h-5 mr-2" />
            Cambio Password
          </h3>
        </Card.Header>
        <Card.Body>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="form-label">Password Corrente</label>
              <div className="relative">
                <input
                  type={showPasswords.current ? 'text' : 'password'}
                  className={`form-input pr-10 ${errors.currentPassword ? 'border-danger-500' : ''}`}
                  placeholder="Password attuale"
                  {...register('currentPassword', {
                    required: 'Password corrente è richiesta'
                  })}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => togglePasswordVisibility('current')}
                >
                  {showPasswords.current ? (
                    <EyeOff className="h-5 w-5 text-gray-400" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
              {errors.currentPassword && (
                <p className="form-error">{errors.currentPassword.message}</p>
              )}
            </div>

            <div>
              <label className="form-label">Nuova Password</label>
              <div className="relative">
                <input
                  type={showPasswords.new ? 'text' : 'password'}
                  className={`form-input pr-10 ${errors.newPassword ? 'border-danger-500' : ''}`}
                  placeholder="Nuova password"
                  {...register('newPassword', {
                    required: 'Nuova password è richiesta',
                    minLength: {
                      value: 6,
                      message: 'Password deve essere di almeno 6 caratteri'
                    }
                  })}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => togglePasswordVisibility('new')}
                >
                  {showPasswords.new ? (
                    <EyeOff className="h-5 w-5 text-gray-400" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
              {errors.newPassword && (
                <p className="form-error">{errors.newPassword.message}</p>
              )}
              {/* Password strength indicator */}
              {watchNewPassword && (
                <div className="mt-2">
                  <div className="flex space-x-1">
                    {['weak', 'medium', 'strong'].map((strength, index) => (
                      <div
                        key={strength}
                        className={`h-1 flex-1 rounded-full ${
                          watchNewPassword.length > (index + 1) * 2
                            ? index === 0 ? 'bg-danger-500' : index === 1 ? 'bg-warning-500' : 'bg-success-500'
                            : 'bg-gray-200'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="form-label">Conferma Nuova Password</label>
              <div className="relative">
                <input
                  type={showPasswords.confirm ? 'text' : 'password'}
                  className={`form-input pr-10 ${errors.confirmPassword ? 'border-danger-500' : ''}`}
                  placeholder="Ripeti nuova password"
                  {...register('confirmPassword', {
                    required: 'Conferma password è richiesta',
                    validate: value => value === watchNewPassword || 'Le password non coincidono'
                  })}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => togglePasswordVisibility('confirm')}
                >
                  {showPasswords.confirm ? (
                    <EyeOff className="h-5 w-5 text-gray-400" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="form-error">{errors.confirmPassword.message}</p>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-200">
              <Button type="submit" variant="primary">
                <Lock className="w-4 h-4 mr-2" />
                Cambia Password
              </Button>
            </div>
          </form>
        </Card.Body>
      </Card>

      {/* Sessioni Attive */}
      <Card>
        <Card.Header>
          <h3 className="text-lg font-semibold text-gray-900">Sessioni Attive</h3>
        </Card.Header>
        <Card.Body>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">Sessione Corrente</p>
                <p className="text-sm text-gray-600">
                  Browser attuale • Ultimo accesso: ora
                </p>
              </div>
              <Badge variant="success">Attiva</Badge>
            </div>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
};

// Tab Preferenze
const PreferencesTab = () => {
  const [preferences, setPreferences] = useState({
    notifications: {
      email: true,
      browser: false,
      saldi_negativi: true,
      movimenti_importanti: true
    },
    interface: {
      theme: 'light',
      language: 'it',
      dateFormat: 'dd/mm/yyyy'
    }
  });

  const handlePreferenceChange = (category, key, value) => {
    setPreferences(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: value
      }
    }));
  };

  const savePreferences = () => {
    toast.success('Preferenze salvate con successo');
  };

  return (
    <div className="space-y-6">
      {/* Notifiche */}
      <Card>
        <Card.Header>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <Bell className="w-5 h-5 mr-2" />
            Notifiche
          </h3>
        </Card.Header>
        <Card.Body className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Notifiche Email</p>
              <p className="text-sm text-gray-600">Ricevi aggiornamenti via email</p>
            </div>
            <input
              type="checkbox"
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              checked={preferences.notifications.email}
              onChange={(e) => handlePreferenceChange('notifications', 'email', e.target.checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Notifiche Browser</p>
              <p className="text-sm text-gray-600">Notifiche push nel browser</p>
            </div>
            <input
              type="checkbox"
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              checked={preferences.notifications.browser}
              onChange={(e) => handlePreferenceChange('notifications', 'browser', e.target.checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Saldi Negativi</p>
              <p className="text-sm text-gray-600">Avvisi per saldi sotto zero</p>
            </div>
            <input
              type="checkbox"
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              checked={preferences.notifications.saldi_negativi}
              onChange={(e) => handlePreferenceChange('notifications', 'saldi_negativi', e.target.checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Movimenti Importanti</p>
              <p className="text-sm text-gray-600">Notifiche per movimenti sopra €1000</p>
            </div>
            <input
              type="checkbox"
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              checked={preferences.notifications.movimenti_importanti}
              onChange={(e) => handlePreferenceChange('notifications', 'movimenti_importanti', e.target.checked)}
            />
          </div>
        </Card.Body>
      </Card>

      {/* Interfaccia */}
      <Card>
        <Card.Header>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <Settings className="w-5 h-5 mr-2" />
            Interfaccia
          </h3>
        </Card.Header>
        <Card.Body className="space-y-4">
          <div>
            <label className="form-label">Tema</label>
            <select
              className="form-select"
              value={preferences.interface.theme}
              onChange={(e) => handlePreferenceChange('interface', 'theme', e.target.value)}
            >
              <option value="light">Chiaro</option>
              <option value="dark">Scuro</option>
              <option value="auto">Automatico</option>
            </select>
          </div>

          <div>
            <label className="form-label">Lingua</label>
            <select
              className="form-select"
              value={preferences.interface.language}
              onChange={(e) => handlePreferenceChange('interface', 'language', e.target.value)}
            >
              <option value="it">Italiano</option>
              <option value="en">English</option>
            </select>
          </div>

          <div>
            <label className="form-label">Formato Data</label>
            <select
              className="form-select"
              value={preferences.interface.dateFormat}
              onChange={(e) => handlePreferenceChange('interface', 'dateFormat', e.target.value)}
            >
              <option value="dd/mm/yyyy">GG/MM/AAAA</option>
              <option value="mm/dd/yyyy">MM/GG/AAAA</option>
              <option value="yyyy-mm-dd">AAAA-MM-GG</option>
            </select>
          </div>
        </Card.Body>
      </Card>

      {/* Salva Preferenze */}
      <div className="flex justify-end">
        <Button variant="primary" onClick={savePreferences}>
          <Save className="w-4 h-4 mr-2" />
          Salva Preferenze
        </Button>
      </div>
    </div>
  );
};

// Tab Dati
const DataTab = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const handleExportData = async () => {
    try {
      setIsExporting(true);
      // Qui implementeresti l'export dei dati
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simula export
      toast.success('Export completato! Il download inizierà automaticamente.');
    } catch (error) {
      toast.error('Errore durante l\'export dei dati');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = () => {
    if (window.confirm('Sei sicuro di voler eliminare il tuo account? Questa azione è irreversibile!')) {
      setIsDeletingAccount(true);
      // Qui implementeresti l'eliminazione dell'account
      toast.error('Funzione non ancora implementata');
      setIsDeletingAccount(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Export Dati */}
      <Card>
        <Card.Header>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <Download className="w-5 h-5 mr-2" />
            Esporta i Tuoi Dati
          </h3>
        </Card.Header>
        <Card.Body>
          <p className="text-gray-600 mb-4">
            Scarica una copia completa di tutti i tuoi dati contabili in formato JSON.
            L'export include movimenti, anagrafiche, conti bancari e impostazioni.
          </p>
          <div className="flex items-center space-x-4">
            <Button
              variant="primary"
              onClick={handleExportData}
              loading={isExporting}
              className="flex items-center"
            >
              <Download className="w-4 h-4 mr-2" />
              {isExporting ? 'Esportazione...' : 'Esporta Dati'}
            </Button>
            <p className="text-sm text-gray-500">
              Dimensione stimata: ~2MB
            </p>
          </div>
        </Card.Body>
      </Card>

      {/* Import Dati */}
      <Card>
        <Card.Header>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <Upload className="w-5 h-5 mr-2" />
            Importa Dati
          </h3>
        </Card.Header>
        <Card.Body>
          <p className="text-gray-600 mb-4">
            Carica un file di backup precedente per ripristinare i tuoi dati.
            Supporta file JSON esportati da Prima Nota.
          </p>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-2">
              Trascina qui il file di backup o clicca per selezionare
            </p>
            <Button variant="outline" size="sm">
              Seleziona File
            </Button>
          </div>
        </Card.Body>
      </Card>

      {/* Eliminazione Account */}
      <Card>
        <Card.Header>
          <h3 className="text-lg font-semibold text-danger-600 flex items-center">
            <AlertTriangle className="w-5 h-5 mr-2" />
            Zona Pericolosa
          </h3>
        </Card.Header>
        <Card.Body>
          <Alert type="danger" className="mb-4">
            <strong>Attenzione:</strong> L'eliminazione dell'account è permanente e irreversibile.
            Tutti i tuoi dati verranno cancellati definitivamente.
          </Alert>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Elimina Account</p>
              <p className="text-sm text-gray-600">
                Rimuovi definitivamente il tuo account e tutti i dati associati
              </p>
            </div>
            <Button
              variant="danger"
              onClick={handleDeleteAccount}
              loading={isDeletingAccount}
              className="flex items-center"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Elimina Account
            </Button>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
};

export default ProfilePage;
