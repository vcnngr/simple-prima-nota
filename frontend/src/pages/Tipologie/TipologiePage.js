// src/pages/Tipologie/TipologiePage.js - GESTIONE TIPOLOGIE ANAGRAFICHE
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useSearchParams } from 'react-router-dom';
// import { motion } from 'framer-motion';
import {
  Plus,
  Edit,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Tag,
  Users,
  Building,
  Truck,
  Star,
  UserCheck,
  Briefcase,
  CreditCard,
  Landmark,
  HeartHandshake,
  Settings,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  Palette
} from 'lucide-react';
import { anagraficheAPI } from '../../services/api';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import Badge from '../../components/UI/Badge';
import Modal from '../../components/UI/Modal';
import Alert from '../../components/UI/Alert';
import LoadingSpinner from '../../components/UI/LoadingSpinner';
import Table from '../../components/UI/Table';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';

const TipologiePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showModal, setShowModal] = useState(false);
  const [editingTipologia, setEditingTipologia] = useState(null);
  
  const queryClient = useQueryClient();
  
  // Auto-apri modal se specificato nei params
  React.useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setShowModal(true);
      setEditingTipologia(null);
    }
  }, [searchParams]);
  
  // Query per ottenere tipologie
  const { data: tipologie, isLoading, error } = useQuery(
    'tipologie-anagrafiche',
    anagraficheAPI.getTipologie,
    {
      refetchOnWindowFocus: false,
    }
  );
  
  // Mutations
  const createMutation = useMutation(anagraficheAPI.createTipologia, {
    onSuccess: () => {
      queryClient.invalidateQueries('tipologie-anagrafiche');
      queryClient.invalidateQueries('anagrafiche');
      setShowModal(false);
      setEditingTipologia(null);
      toast.success('Tipologia creata con successo');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Errore nella creazione della tipologia');
    }
  });
  
  const updateMutation = useMutation(
    ({ id, data }) => anagraficheAPI.updateTipologia(id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('tipologie-anagrafiche');
        queryClient.invalidateQueries('anagrafiche');
        setShowModal(false);
        setEditingTipologia(null);
        toast.success('Tipologia aggiornata con successo');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Errore nell\'aggiornamento della tipologia');
      }
    }
  );
  
  const deleteMutation = useMutation(anagraficheAPI.deleteTipologia, {
    onSuccess: () => {
      queryClient.invalidateQueries('tipologie-anagrafiche');
      queryClient.invalidateQueries('anagrafiche');
      toast.success('Tipologia eliminata con successo');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Errore nell\'eliminazione della tipologia');
    }
  });
  
  const toggleStatoMutation = useMutation(anagraficheAPI.toggleStatoTipologia, {
    onSuccess: (data) => {
      queryClient.invalidateQueries('tipologie-anagrafiche');
      queryClient.invalidateQueries('anagrafiche');
      toast.success(data.message || 'Stato tipologia aggiornato');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Errore nel cambio stato');
    }
  });
  
  // Calcoli riassuntivi
  const riassunto = React.useMemo(() => {
    if (!tipologie) return { totale: 0, per_movimento: {}, attive: 0 };
    
    const perMovimento = {
      'Entrata': tipologie.filter(t => t.tipo_movimento_default === 'Entrata').length,
      'Uscita': tipologie.filter(t => t.tipo_movimento_default === 'Uscita').length,
      'Entrambi': tipologie.filter(t => t.tipo_movimento_default === 'Entrambi').length,
    };
    
    return {
      totale: tipologie.length,
      per_movimento: perMovimento,
      attive: tipologie.filter(t => t.attiva).length
    };
  }, [tipologie]);
  
  const handleEdit = (tipologia) => {
    setEditingTipologia(tipologia);
    setShowModal(true);
  };
  
  const handleDelete = async (tipologia) => {
    if (window.confirm(`Sei sicuro di voler eliminare la tipologia "${tipologia.nome}"?\n\nAttenzione: questa azione eliminerà anche i riferimenti da tutte le anagrafiche associate.`)) {
      deleteMutation.mutate(tipologia.id);
    }
  };
  
  const handleToggleStato = (tipologia) => {
    toggleStatoMutation.mutate(tipologia.id);
  };

  // Helper per ottenere icona da nome
  const getIconComponent = (iconName) => {
    const iconMap = {
      'user': Users,
      'building': Building,
      'truck': Truck,
      'star': Star,
      'users': Users,
      'user-check': UserCheck,
      'briefcase': Briefcase,
      'credit-card': CreditCard,
      'landmark': Landmark,
      'HeartHandshake': HeartHandshake,
      'building-bank': Building
    };
    return iconMap[iconName] || Tag;
  };

  // Helper per icona tipo movimento
  const getTipoMovimentoIcon = (tipo) => {
    switch (tipo) {
      case 'Entrata': return TrendingUp;
      case 'Uscita': return TrendingDown;
      case 'Entrambi': return ArrowUpDown;
      default: return ArrowUpDown;
    }
  };

  // Helper per colore tipo movimento
  const getTipoMovimentoColor = (tipo) => {
    switch (tipo) {
      case 'Entrata': return 'text-success-600';
      case 'Uscita': return 'text-danger-600';
      case 'Entrambi': return 'text-primary-600';
      default: return 'text-gray-600';
    }
  };
  
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
        Errore nel caricamento delle tipologie: {error.message}
      </Alert>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tipologie Anagrafiche</h1>
          <p className="mt-1 text-sm text-gray-600">
            Gestisci le tipologie personalizzabili per le tue anagrafiche
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex space-x-3">
          <Button
            variant="outline"
            className="flex items-center"
          >
            <Settings className="w-4 h-4 mr-1" />
            Impostazioni
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setEditingTipologia(null);
              setShowModal(true);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Nuova Tipologia
          </Button>
        </div>
      </div>
      
      {/* Riassunto */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <Card.Body className="flex items-center">
            <div className="flex-shrink-0 p-3 bg-primary-100 rounded-lg">
              <Tag className="w-6 h-6 text-primary-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Totale</p>
              <p className="text-2xl font-semibold text-gray-900">{riassunto.totale}</p>
              <p className="text-xs text-gray-500">{riassunto.attive} attive</p>
            </div>
          </Card.Body>
        </Card>
        
        <Card>
          <Card.Body className="flex items-center">
            <div className="flex-shrink-0 p-3 bg-success-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-success-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Solo Entrate</p>
              <p className="text-2xl font-semibold text-success-600">{riassunto.per_movimento['Entrata']}</p>
            </div>
          </Card.Body>
        </Card>
        
        <Card>
          <Card.Body className="flex items-center">
            <div className="flex-shrink-0 p-3 bg-danger-100 rounded-lg">
              <TrendingDown className="w-6 h-6 text-danger-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Solo Uscite</p>
              <p className="text-2xl font-semibold text-danger-600">{riassunto.per_movimento['Uscita']}</p>
            </div>
          </Card.Body>
        </Card>
        
        <Card>
          <Card.Body className="flex items-center">
            <div className="flex-shrink-0 p-3 bg-blue-100 rounded-lg">
              <ArrowUpDown className="w-6 h-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Entrambi</p>
              <p className="text-2xl font-semibold text-blue-600">{riassunto.per_movimento['Entrambi']}</p>
            </div>
          </Card.Body>
        </Card>
      </div>

      {/* Info Box */}
      <Alert type="info">
        <div className="flex items-start">
          <Tag className="w-5 h-5 mr-2 mt-0.5" />
          <div>
            <p className="font-medium">Come funzionano le tipologie</p>
            <p className="text-sm mt-1">
              Le tipologie permettono di categorizzare le anagrafiche (es. Cliente Premium, Fornitore Servizi, Consulente) 
              e definire automaticamente per che tipo di movimenti possono essere utilizzate. 
              Ogni tipologia ha un colore e un'icona personalizzabili per una migliore organizzazione visiva.
            </p>
          </div>
        </div>
      </Alert>
      
      {/* Tabella tipologie */}
      <Card>
        <Card.Header className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            Lista Tipologie ({tipologie?.length || 0})
          </h3>
        </Card.Header>
        <Card.Body className="p-0">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Tipologia</Table.HeaderCell>
                <Table.HeaderCell>Descrizione</Table.HeaderCell>
                <Table.HeaderCell>Tipo Movimenti</Table.HeaderCell>
                <Table.HeaderCell>Icona & Colore</Table.HeaderCell>
                <Table.HeaderCell>Stato</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Azioni</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body loading={isLoading} emptyMessage="Nessuna tipologia trovata">
              {tipologie?.map((tipologia) => {
                const IconComponent = getIconComponent(tipologia.icona);
                const TipoIcon = getTipoMovimentoIcon(tipologia.tipo_movimento_default);
                const tipoColor = getTipoMovimentoColor(tipologia.tipo_movimento_default);
                
                return (
                  <Table.Row key={tipologia.id}>
                    <Table.Cell>
                      <div className="flex items-center">
                        <div 
                          className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center mr-3"
                          style={{ backgroundColor: (tipologia.colore || '#6B7280') + '20' }}
                        >
                          <IconComponent 
                            className="w-5 h-5" 
                            style={{ color: tipologia.colore || '#6B7280' }} 
                          />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {tipologia.nome}
                          </p>
                          <p className="text-xs text-gray-500">
                            ID: {tipologia.id}
                          </p>
                        </div>
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <p className="text-sm text-gray-900">
                        {tipologia.descrizione || 'Nessuna descrizione'}
                      </p>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex items-center">
                        <TipoIcon className={`w-4 h-4 mr-2 ${tipoColor}`} />
                        <Badge 
                          variant={
                            tipologia.tipo_movimento_default === 'Entrata' ? 'success' :
                            tipologia.tipo_movimento_default === 'Uscita' ? 'danger' : 
                            'primary'
                          }
                        >
                          {tipologia.tipo_movimento_default}
                        </Badge>
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center">
                          <Palette className="w-4 h-4 text-gray-400 mr-1" />
                          <div 
                            className="w-6 h-6 rounded border-2 border-gray-200"
                            style={{ backgroundColor: tipologia.colore || '#6B7280' }}
                            title={tipologia.colore || '#6B7280'}
                          />
                        </div>
                        <div className="flex items-center">
                          <Tag className="w-4 h-4 text-gray-400 mr-1" />
                          <code className="text-xs text-gray-600 bg-gray-100 px-1 rounded">
                            {tipologia.icona || 'user'}
                          </code>
                        </div>
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge 
                        variant={tipologia.attiva ? 'success' : 'gray'}
                        className="flex items-center"
                      >
                        <span className={`w-2 h-2 rounded-full mr-1 ${
                          tipologia.attiva ? 'bg-success-500' : 'bg-gray-400'
                        }`} />
                        {tipologia.attiva ? 'Attiva' : 'Inattiva'}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(tipologia)}
                          title="Modifica"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleStato(tipologia)}
                          title={tipologia.attiva ? 'Disattiva' : 'Attiva'}
                        >
                          {tipologia.attiva ? (
                            <ToggleRight className="w-4 h-4 text-success-600" />
                          ) : (
                            <ToggleLeft className="w-4 h-4 text-gray-400" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(tipologia)}
                          title="Elimina"
                          className="text-danger-600 hover:text-danger-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
        </Card.Body>
      </Card>
      
      {/* Modal Form */}
      <TipologiaModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingTipologia(null);
          setSearchParams({});
        }}
        tipologia={editingTipologia}
        onSave={(data) => {
          if (editingTipologia) {
            updateMutation.mutate({ id: editingTipologia.id, data });
          } else {
            createMutation.mutate(data);
          }
        }}
        isLoading={createMutation.isLoading || updateMutation.isLoading}
      />
    </div>
  );
};

// Componente Modal per Form Tipologia
const TipologiaModal = ({ isOpen, onClose, tipologia, onSave, isLoading }) => {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors }
  } = useForm();

  const watchColore = watch('colore');
  const watchIcona = watch('icona');

  React.useEffect(() => {
    if (tipologia) {
      reset({
        ...tipologia
      });
    } else {
      reset({
        nome: '',
        descrizione: '',
        tipo_movimento_default: 'Entrambi',
        colore: '#6B7280',
        icona: 'user',
        attiva: true
      });
    }
  }, [tipologia, reset]);

  const onSubmit = (data) => {
    onSave(data);
  };

  // Icone disponibili
  const iconeDisponibili = [
    { value: 'user', label: 'Utente', icon: Users },
    { value: 'building', label: 'Edificio', icon: Building },
    { value: 'truck', label: 'Camion', icon: Truck },
    { value: 'star', label: 'Stella', icon: Star },
    { value: 'users', label: 'Gruppo', icon: Users },
    { value: 'user-check', label: 'Utente Check', icon: UserCheck },
    { value: 'briefcase', label: 'Valigetta', icon: Briefcase },
    { value: 'credit-card', label: 'Carta Credito', icon: CreditCard },
    { value: 'landmark', label: 'Edificio Pubblico', icon: Landmark },
    { value: 'heart-handshake', label: 'Stretta di Mano', icon: HeartHandshake }
  ];

  // Colori predefiniti
  const coloriPredefiniti = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', 
    '#06B6D4', '#EC4899', '#84CC16', '#F97316', '#6B7280'
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={tipologia ? 'Modifica Tipologia' : 'Nuova Tipologia'}
      size="lg"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Nome */}
          <div>
            <label className="form-label">Nome Tipologia *</label>
            <input
              type="text"
              className={`form-input ${errors.nome ? 'border-danger-500' : ''}`}
              placeholder="es. Cliente Premium, Fornitore Servizi"
              {...register('nome', {
                required: 'Nome è richiesto',
                maxLength: {
                  value: 100,
                  message: 'Nome non può superare 100 caratteri'
                }
              })}
            />
            {errors.nome && (
              <p className="form-error">{errors.nome.message}</p>
            )}
          </div>

          {/* Tipo Movimento */}
          <div>
            <label className="form-label">Tipo Movimenti *</label>
            <select
              className={`form-select ${errors.tipo_movimento_default ? 'border-danger-500' : ''}`}
              {...register('tipo_movimento_default', {
                required: 'Tipo movimento è richiesto'
              })}
            >
              <option value="Entrata">Solo Entrate</option>
              <option value="Uscita">Solo Uscite</option>
              <option value="Entrambi">Entrate e Uscite</option>
            </select>
            {errors.tipo_movimento_default && (
              <p className="form-error">{errors.tipo_movimento_default.message}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Definisce per che tipo di movimenti può essere usata questa tipologia
            </p>
          </div>
        </div>

        {/* Descrizione */}
        <div>
          <label className="form-label">Descrizione</label>
          <textarea
            className="form-textarea"
            rows={3}
            placeholder="Descrizione dettagliata della tipologia (opzionale)"
            {...register('descrizione', {
              maxLength: {
                value: 500,
                message: 'Descrizione non può superare 500 caratteri'
              }
            })}
          />
          {errors.descrizione && (
            <p className="form-error">{errors.descrizione.message}</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Colore */}
          <div>
            <label className="form-label">Colore</label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <input
                  type="color"
                  className="w-10 h-10 border border-gray-300 rounded cursor-pointer"
                  {...register('colore')}
                />
                <input
                  type="text"
                  className="form-input flex-1"
                  placeholder="#6B7280"
                  {...register('colore')}
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {coloriPredefiniti.map(colore => (
                  <button
                    key={colore}
                    type="button"
                    className={`w-6 h-6 rounded border-2 ${
                      watchColore === colore ? 'border-gray-900' : 'border-gray-300'
                    }`}
                    style={{ backgroundColor: colore }}
                    onClick={() => setValue('colore', colore)}
                    title={colore}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Icona */}
          <div>
            <label className="form-label">Icona</label>
            <select
              className="form-select"
              {...register('icona')}
            >
              {iconeDisponibili.map(({ value, label, icon: IconComp }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <div className="mt-2 flex items-center space-x-2">
              <span className="text-sm text-gray-600">Anteprima:</span>
              <div 
                className="w-8 h-8 rounded flex items-center justify-center"
                style={{ backgroundColor: (watchColore || '#6B7280') + '20' }}
              >
                {(() => {
                  const IconComp = iconeDisponibili.find(i => i.value === watchIcona)?.icon || Users;
                  return <IconComp className="w-4 h-4" style={{ color: watchColore || '#6B7280' }} />;
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* Attiva */}
        <div className="flex items-center">
          <input
            id="attiva"
            type="checkbox"
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            {...register('attiva')}
          />
          <label htmlFor="attiva" className="ml-2 block text-sm text-gray-700">
            Tipologia attiva
          </label>
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
            variant="primary"
            loading={isLoading}
          >
            {tipologia ? 'Aggiorna' : 'Crea'} Tipologia
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default TipologiePage;