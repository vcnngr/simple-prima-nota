// src/pages/Profile/ProfilePage.js
import React, { useState, useRef } from 'react';
import { useQuery } from 'react-query';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  User,
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
import Modal from '../../components/UI/Modal';
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
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [accountStats, setAccountStats] = useState(null);
  const { logout } = useAuth();

  // Carica statistiche account quando si apre il modal
  const handleOpenDeleteModal = async () => {
    try {
      console.log('🔄 Caricamento statistiche account...');
      const stats = await authAPI.getAccountStats();
      console.log('📊 Statistiche ricevute:', stats);
      setAccountStats(stats);
      setShowDeleteModal(true);
    } catch (error) {
      console.error('❌ Error loading account stats:', error);
      toast.error('Errore nel caricamento delle statistiche account');
    }
  };

  // Export backup completo
  const handleExportBackup = async () => {
    try {
      setIsExporting(true);
      console.log('📦 Inizio export backup...');
      
      const result = await authAPI.exportBackup();
      console.log('✅ Backup ricevuto:', result);
      
      // Crea il file e avvia il download
      const blob = new Blob([JSON.stringify(result.data, null, 2)], {
        type: 'application/json'
      });
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prima_nota_backup_${result.username || 'user'}_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      // Mostra messaggio di successo con statistiche
      if (result.stats) {
        toast.success(
          `Backup completato! Esportati: ${result.stats.movimenti} movimenti, ${result.stats.anagrafiche} anagrafiche, ${result.stats.conti} conti. Dimensione: ${result.size} MB`
        );
      } else {
        toast.success(`Backup completato! Dimensione: ${result.size} MB`);
      }
      
    } catch (error) {
      console.error('❌ Error exporting backup:', error);
      
      if (error.message?.includes('401')) {
        toast.error('Sessione scaduta. Effettua nuovamente il login.');
      } else if (error.message?.includes('500')) {
        toast.error('Errore del server durante l\'export');
      } else {
        toast.error('Errore durante l\'export del backup');
      }
    } finally {
      setIsExporting(false);
    }
  };

  // Import backup
  const handleImportBackup = async (backupData, mode) => {
    try {
      setIsImporting(true);
      console.log('📥 Inizio import backup, modalità:', mode);
      
      const result = await authAPI.importBackup(backupData, mode);
      console.log('✅ Import completato:', result);
      
      if (result.success) {
        const { imported, errors } = result.results;
        const totalImported = Object.values(imported).reduce((sum, count) => sum + count, 0);
        
        if (errors.length > 0) {
          toast.success(
            `Import completato con ${errors.length} avvisi. Importati ${totalImported} elementi.`,
            { duration: 5000 }
          );
          console.warn('Import warnings:', errors);
        } else {
          toast.success(
            `Import completato con successo! Importati: ${imported.movimenti} movimenti, ${imported.anagrafiche} anagrafiche, ${imported.conti_correnti} conti.`
          );
        }
        
        setShowImportModal(false);
        
        // Suggerisci refresh della pagina per vedere i nuovi dati
        setTimeout(() => {
          if (window.confirm('Import completato! Vuoi ricaricare la pagina per vedere i nuovi dati?')) {
            window.location.reload();
          }
        }, 1000);
      }
      
    } catch (error) {
      console.error('❌ Error importing backup:', error);
      
      if (error.response?.data?.error?.includes('Backup non valido')) {
        toast.error('File backup non valido o corrotto');
      } else if (error.response?.data?.error?.includes('versione non supportata')) {
        toast.error('Versione del backup non compatibile');
      } else if (error.response?.data?.error) {
        toast.error(`Errore: ${error.response.data.error}`);
      } else {
        toast.error('Errore durante l\'import del backup');
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleDeleteAccount = async (password) => {
    try {
      setIsDeletingAccount(true);
      console.log('🗑️ Inizio eliminazione account...');
      
      const result = await authAPI.deleteAccount(password);
      console.log('✅ Risultato eliminazione:', result);
      
      if (result.success) {
        toast.success('Account eliminato con successo');
        setShowDeleteModal(false);
        
        // Logout dopo 2 secondi
        setTimeout(() => {
          console.log('👋 Logout automatico...');
          logout();
        }, 2000);
      }
    } catch (error) {
      console.error('❌ Error deleting account:', error);
      
      // Gestisci errori specifici
      if (error.response?.data?.error?.includes('Password non corretta')) {
        toast.error('Password non corretta');
      } else if (error.response?.data?.error?.includes('Utente non trovato')) {
        toast.error('Account non trovato');
      } else {
        toast.error('Errore durante l\'eliminazione dell\'account');
      }
    } finally {
      setIsDeletingAccount(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Export Backup Completo */}
      <Card>
        <Card.Header>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <Download className="w-5 h-5 mr-2" />
            Backup Completo
          </h3>
        </Card.Header>
        <Card.Body>
          <p className="text-gray-600 mb-4">
            Scarica una copia completa di tutti i tuoi dati in formato JSON. 
            Include movimenti, anagrafiche, conti, tipologie, categorie e impostazioni.
            Il backup può essere utilizzato per ripristinare completamente il tuo account.
          </p>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <h4 className="font-semibold text-blue-900 mb-2">Il backup include:</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Tutti i movimenti contabili con date e importi</li>
              <li>• Anagrafiche complete con tipologie e categorie</li>
              <li>• Conti correnti e saldi iniziali</li>
              <li>• Tipologie personalizzate create</li>
              <li>• Categorie di movimenti e anagrafiche</li>
              <li>• Metadata per la compatibilità</li>
            </ul>
          </div>
          
          <div className="flex items-center space-x-4">
            <Button
              variant="primary"
              onClick={handleExportBackup}
              loading={isExporting}
              className="flex items-center"
              disabled={isDeletingAccount || isImporting}
            >
              <Download className="w-4 h-4 mr-2" />
              {isExporting ? 'Creazione Backup...' : 'Scarica Backup Completo'}
            </Button>
            <div className="text-sm text-gray-500">
              <p>Formato: JSON</p>
              <p>Dimensione stimata: 2-5 MB</p>
            </div>
          </div>
        </Card.Body>
      </Card>

      {/* Import/Restore Backup */}
      <Card>
        <Card.Header>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <Upload className="w-5 h-5 mr-2" />
            Ripristina da Backup
          </h3>
        </Card.Header>
        <Card.Body>
          <p className="text-gray-600 mb-4">
            Carica un file di backup precedente per ripristinare i tuoi dati.
            Puoi scegliere di sostituire tutti i dati attuali o unirli con quelli esistenti.
          </p>
          
          <Alert type="info" className="mb-4">
            <div className="flex items-start">
              <Settings className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
              <div>
                <h4 className="font-semibold text-blue-800">Due modalità disponibili:</h4>
                <ul className="text-blue-700 mt-1 space-y-1 text-sm">
                  <li><strong>Sostituisci:</strong> Elimina tutti i dati attuali e importa quelli dal backup</li>
                  <li><strong>Unisci:</strong> Mantieni i dati attuali e aggiungi quelli dal backup</li>
                </ul>
              </div>
            </div>
          </Alert>
          
          <Button
            variant="outline"
            onClick={() => setShowImportModal(true)}
            className="flex items-center"
            disabled={isExporting || isDeletingAccount}
          >
            <Upload className="w-4 h-4 mr-2" />
            Carica Backup
          </Button>
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
          
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <h4 className="font-semibold text-gray-900 mb-2">Prima di eliminare l'account:</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Scarica un backup completo dei tuoi dati</li>
              <li>• Verifica di non avere operazioni in sospeso</li>
              <li>• Considera di contattare il supporto se hai dubbi</li>
            </ul>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Elimina Account</p>
              <p className="text-sm text-gray-600">
                Rimuovi definitivamente il tuo account e tutti i dati associati
              </p>
            </div>
            <Button
              variant="danger"
              onClick={handleOpenDeleteModal}
              className="flex items-center"
              disabled={isDeletingAccount || isExporting || isImporting}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Elimina Account
            </Button>
          </div>
        </Card.Body>
      </Card>

      {/* Modal Import */}
      <ImportBackupModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={handleImportBackup}
        isLoading={isImporting}
      />

      {/* Modal Eliminazione */}
      <DeleteAccountModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteAccount}
        accountStats={accountStats}
        isLoading={isDeletingAccount}
      />
    </div>
  );
};

// Aggiungi questo componente nel file ProfilePage.js
const DeleteAccountModal = ({ isOpen, onClose, onConfirm, accountStats, isLoading }) => {
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const isConfirmValid = confirmText.toLowerCase() === 'elimina il mio account';
  const canDelete = password.length >= 6 && isConfirmValid;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (canDelete) {
      onConfirm(password);
    }
  };

  const resetForm = () => {
    setPassword('');
    setConfirmText('');
    setShowPassword(false);
  };

  React.useEffect(() => {
    if (!isOpen) {
      resetForm();
    }
  }, [isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Elimina Account"
      size="lg"
    >
      <div className="space-y-6">
        {/* Warning */}
        <Alert type="danger">
          <div className="flex items-start">
            <AlertTriangle className="w-5 h-5 text-danger-600 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h4 className="font-semibold text-danger-800">Azione Irreversibile</h4>
              <p className="text-danger-700 mt-1">
                Questa azione eliminerà permanentemente il tuo account e tutti i dati associati. 
                Non sarà possibile recuperare i dati una volta eliminati.
              </p>
            </div>
          </div>
        </Alert>

        {/* Statistiche Account */}
        {accountStats && (
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-3">Dati che verranno eliminati:</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Movimenti:</span>
                <span className="font-medium">{accountStats.movimenti || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Anagrafiche:</span>
                <span className="font-medium">{accountStats.anagrafiche || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Conti:</span>
                <span className="font-medium">{accountStats.conti || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Tipologie:</span>
                <span className="font-medium">{accountStats.tipologie || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Categorie:</span>
                <span className="font-medium">{accountStats.categorie_totali || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Account:</span>
                <span className="font-medium">{accountStats.username || 'N/A'}</span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Account creato:</span>
                <span className="font-medium">
                  {new Date(accountStats.account_created).toLocaleDateString('it-IT')}
                </span>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Conferma Testuale */}
          <div>
            <label className="form-label">
              Scrivi "<strong>elimina il mio account</strong>" per confermare:
            </label>
            <input
              type="text"
              className={`form-input ${!isConfirmValid && confirmText ? 'border-danger-500' : ''}`}
              placeholder="elimina il mio account"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={isLoading}
            />
            {!isConfirmValid && confirmText && (
              <p className="form-error">Il testo non corrisponde</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="form-label">Inserisci la tua password per confermare:</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-input pr-10"
                placeholder="Password corrente"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                minLength={6}
                required
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5 text-gray-400" />
                ) : (
                  <Eye className="h-5 w-5 text-gray-400" />
                )}
              </button>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
            >
              Annulla
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={!canDelete}
              loading={isLoading}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Elimina Account Definitivamente
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

// Aggiungi questo componente nel file ProfilePage.js
const ImportBackupModal = ({ isOpen, onClose, onImport, isLoading }) => {
  const [file, setFile] = useState(null);
  const [validation, setValidation] = useState(null);
  const [importMode, setImportMode] = useState('replace');
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef(null);

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;
    
    if (!selectedFile.name.toLowerCase().endsWith('.json')) {
      toast.error('Seleziona un file JSON valido');
      return;
    }
    
    setFile(selectedFile);
    
    // Leggi e valida il file
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      const validationResult = authAPI.validateBackupFile(content);
      setValidation(validationResult);
      
      if (!validationResult.isValid) {
        toast.error(validationResult.error);
      }
    };
    reader.readAsText(selectedFile);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragActive(false);
  };

  const handleImport = () => {
    if (validation?.isValid && validation.backup) {
      onImport(validation.backup, importMode);
    }
  };

  const resetForm = () => {
    setFile(null);
    setValidation(null);
    setImportMode('replace');
    setDragActive(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  React.useEffect(() => {
    if (!isOpen) {
      resetForm();
    }
  }, [isOpen]);

  const canImport = validation?.isValid && !isLoading;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Importa Backup"
      size="lg"
    >
      <div className="space-y-6">
        {/* File Upload Area */}
        <div>
          <label className="form-label">Seleziona File Backup</label>
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              dragActive 
                ? 'border-primary-500 bg-primary-50' 
                : validation?.isValid 
                ? 'border-success-300 bg-success-50'
                : validation === null
                ? 'border-gray-300'
                : 'border-danger-300 bg-danger-50'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={(e) => handleFileSelect(e.target.files[0])}
              className="hidden"
            />
            
            {!file ? (
              <>
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-2">
                  Trascina qui il file di backup o clicca per selezionare
                </p>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                >
                  Seleziona File JSON
                </Button>
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-center space-x-2">
                  {validation?.isValid ? (
                    <CheckCircle className="w-8 h-8 text-success-600" />
                  ) : validation ? (
                    <AlertTriangle className="w-8 h-8 text-danger-600" />
                  ) : (
                    <LoadingSpinner size="sm" />
                  )}
                  <div>
                    <p className="font-medium text-gray-900">{file.name}</p>
                    <p className="text-sm text-gray-500">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                >
                  Cambia File
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Validation Results */}
        {validation && (
          <div>
            {validation.isValid ? (
              <Alert type="success">
                <div className="space-y-3">
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-success-600 mr-2" />
                    <span className="font-medium">Backup valido!</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Utente:</span>
                      <span className="font-medium ml-2">{validation.stats.username}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Conti:</span>
                      <span className="font-medium ml-2">{validation.stats.conti}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Anagrafiche:</span>
                      <span className="font-medium ml-2">{validation.stats.anagrafiche}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Movimenti:</span>
                      <span className="font-medium ml-2">{validation.stats.movimenti}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Tipologie:</span>
                      <span className="font-medium ml-2">{validation.stats.tipologie}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Categorie:</span>
                      <span className="font-medium ml-2">{validation.stats.categorie}</span>
                    </div>
                  </div>
                  
                  <div className="text-sm text-gray-600">
                    <span>Backup creato il:</span>
                    <span className="font-medium ml-2">
                      {new Date(validation.stats.export_date).toLocaleString('it-IT')}
                    </span>
                  </div>
                </div>
              </Alert>
            ) : (
              <Alert type="danger">
                <div className="flex items-center">
                  <AlertTriangle className="w-5 h-5 text-danger-600 mr-2" />
                  <span>{validation.error}</span>
                </div>
              </Alert>
            )}
          </div>
        )}

        {/* Import Mode */}
        {validation?.isValid && (
          <div>
            <label className="form-label">Modalità Import</label>
            <div className="space-y-3">
              <div className="flex items-start">
                <input
                  type="radio"
                  id="replace"
                  name="importMode"
                  value="replace"
                  checked={importMode === 'replace'}
                  onChange={(e) => setImportMode(e.target.value)}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 mt-1"
                  disabled={isLoading}
                />
                <label htmlFor="replace" className="ml-3">
                  <span className="font-medium text-gray-900">Sostituisci tutto</span>
                  <p className="text-sm text-gray-600">
                    Elimina tutti i dati attuali e importa quelli dal backup
                  </p>
                </label>
              </div>
              
              <div className="flex items-start">
                <input
                  type="radio"
                  id="merge"
                  name="importMode"
                  value="merge"
                  checked={importMode === 'merge'}
                  onChange={(e) => setImportMode(e.target.value)}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 mt-1"
                  disabled={isLoading}
                />
                <label htmlFor="merge" className="ml-3">
                  <span className="font-medium text-gray-900">Unisci dati</span>
                  <p className="text-sm text-gray-600">
                    Mantieni i dati attuali e aggiungi quelli dal backup
                  </p>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Warning */}
        {validation?.isValid && (
          <Alert type="warning">
            <div className="flex items-start">
              <AlertTriangle className="w-5 h-5 text-warning-600 mt-0.5 mr-3 flex-shrink-0" />
              <div>
                <h4 className="font-semibold text-warning-800">Attenzione</h4>
                <p className="text-warning-700 mt-1">
                  {importMode === 'replace' 
                    ? 'Tutti i dati attuali verranno eliminati e sostituiti con quelli del backup.'
                    : 'I dati del backup verranno aggiunti a quelli esistenti. Potrebbero verificarsi duplicati.'}
                  {' '}Si consiglia di fare un backup prima di procedere.
                </p>
              </div>
            </div>
          </Alert>
        )}

        {/* Buttons */}
        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            Annulla
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleImport}
            disabled={!canImport}
            loading={isLoading}
          >
            <Upload className="w-4 h-4 mr-2" />
            {importMode === 'replace' ? 'Sostituisci Dati' : 'Unisci Dati'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ProfilePage;
