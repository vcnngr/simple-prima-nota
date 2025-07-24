// src/pages/Anagrafiche/AnagrafichePage.js - VERSIONE FLESSIBILE CON TIPOLOGIE
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Plus,
  Edit,
  Trash2,
  Eye,
  ToggleLeft,
  ToggleRight,
  Users,
  UserPlus,
  Building,
  Mail,
  Phone,
  MapPin,
  Filter,
  Search,
  Download,
  Tag,
  Settings
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
import AutocompleteInput from '../../components/UI/AutocompleteInput';
import { categorieAnagraficheAPI } from '../../services/api';
import { useNavigate } from 'react-router-dom';

const AnagrafichePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showModal, setShowModal] = useState(false);
  const [editingAnagrafica, setEditingAnagrafica] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroTipologia, setFiltroTipologia] = useState(''); // AGGIORNATO
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroStato, setFiltroStato] = useState('tutti');

  const navigate = useNavigate();
  
  const queryClient = useQueryClient();
  
  // Auto-apri modal se specificato nei params
  React.useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setShowModal(true);
      setEditingAnagrafica(null);
    }
  }, [searchParams]);
  
  // Query per ottenere anagrafiche (AGGIORNATO)
  const { data: anagrafiche, isLoading, error } = useQuery(
    ['anagrafiche', { 
      tipologia_id: filtroTipologia || undefined, 
      search: searchTerm, 
      attivo: filtroStato !== 'tutti' ? filtroStato === 'attivi' : undefined, 
      categoria: filtroCategoria || undefined 
    }],
    () => anagraficheAPI.getAll({
      tipologia_id: filtroTipologia || undefined,
      search: searchTerm || undefined,
      attivo: filtroStato !== 'tutti' ? filtroStato === 'attivi' : undefined,
      categoria: filtroCategoria || undefined
    }),
    {
      refetchOnWindowFocus: false,
      keepPreviousData: true
    }
  );
  
  // Query per tipologie (NUOVO)
  const { data: tipologie } = useQuery(
    'tipologie-anagrafiche',
    anagraficheAPI.getTipologie,
    {
      refetchOnWindowFocus: false,
    }
  );
  
  // Query per categorie
  const { data: categorie } = useQuery(
    'anagrafiche-categorie',
    anagraficheAPI.getCategorie,
    {
      refetchOnWindowFocus: false,
    }
  );
  
  // Mutations (INVARIATE)
  const createMutation = useMutation(anagraficheAPI.create, {
    onSuccess: () => {
      queryClient.invalidateQueries('anagrafiche');
      queryClient.invalidateQueries('anagrafiche-categorie');
      queryClient.invalidateQueries('tipologie-anagrafiche');
      setShowModal(false);
      setEditingAnagrafica(null);
      toast.success('Anagrafica creata con successo');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Errore nella creazione dell\'anagrafica');
    }
  });
  
  const updateMutation = useMutation(
    ({ id, data }) => anagraficheAPI.update(id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('anagrafiche');
        queryClient.invalidateQueries('anagrafiche-categorie');
        queryClient.invalidateQueries('tipologie-anagrafiche');
        setShowModal(false);
        setEditingAnagrafica(null);
        toast.success('Anagrafica aggiornata con successo');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Errore nell\'aggiornamento dell\'anagrafica');
      }
    }
  );
  
  const deleteMutation = useMutation(anagraficheAPI.delete, {
    onSuccess: () => {
      queryClient.invalidateQueries('anagrafiche');
      toast.success('Anagrafica eliminata con successo');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Errore nell\'eliminazione dell\'anagrafica');
    }
  });
  
  const toggleStatoMutation = useMutation(anagraficheAPI.toggleStato, {
    onSuccess: (data) => {
      queryClient.invalidateQueries('anagrafiche');
      toast.success(data.message);
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Errore nel cambio stato');
    }
  });
  
  // Calcoli riassuntivi (AGGIORNATO)
  const riassunto = React.useMemo(() => {
    if (!anagrafiche || !tipologie) return { totale: 0, per_tipologia: {}, attive: 0 };
    
    const perTipologia = {};
    tipologie.forEach(tip => {
      perTipologia[tip.nome] = anagrafiche.filter(a => a.tipologia_nome === tip.nome).length;
    });
    
    return {
      totale: anagrafiche.length,
      per_tipologia: perTipologia,
      attive: anagrafiche.filter(a => a.attivo).length,
      tipologie_count: tipologie.length
    };
  }, [anagrafiche, tipologie]);
  
  const handleEdit = (anagrafica) => {
    setEditingAnagrafica(anagrafica);
    setShowModal(true);
  };
  
  const handleDelete = async (anagrafica) => {
    if (window.confirm(`Sei sicuro di voler eliminare "${anagrafica.nome}"?`)) {
      deleteMutation.mutate(anagrafica.id);
    }
  };
  
  const handleToggleStato = (anagrafica) => {
    toggleStatoMutation.mutate(anagrafica.id);
  };
  
  const handleExport = async (formato) => {
    try {
      const params = new URLSearchParams({ formato });
      if (filtroTipologia) params.append('tipologia_id', filtroTipologia);
      
      const response = await fetch(`/api/anagrafiche/export?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Errore durante l\'export');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `anagrafiche_${new Date().toISOString().split('T')[0]}.${formato === 'xlsx' ? 'xlsx' : 'csv'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success(`Export ${formato.toUpperCase()} completato!`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Errore durante l\'export');
    }
  };
  
  const resetFiltri = () => {
    setSearchTerm('');
    setFiltroTipologia('');
    setFiltroCategoria('');
    setFiltroStato('tutti');
  };

  // Helper per ottenere icona tipologia (NUOVO)
  const getIconForTipologia = (iconName) => {
    const iconMap = {
      'user': UserPlus,
      'building': Building,
      'truck': Building, // Fallback
      'star': UserPlus,
      'users': Users
    };
    return iconMap[iconName] || UserPlus;
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
      Errore nel caricamento delle anagrafiche: {error.message}
      </Alert>
    );
  }
  
  return (
    <div className="space-y-6">
    {/* Header */}
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
    <div>
    <h1 className="text-2xl font-bold text-gray-900">Anagrafiche</h1>
    <p className="mt-1 text-sm text-gray-600">
    Gestisci le tue anagrafiche con tipologie personalizzabili
    </p>
    </div>
    <div className="mt-4 sm:mt-0 flex space-x-3">
    <Button
    variant="outline"
    onClick={() => setShowFilters(!showFilters)}
    className="flex items-center"
    >
    <Filter className="w-4 h-4 mr-1" />
    Filtri
    </Button>
    <Button
    variant="outline"
    onClick={() => navigate('/tipologie')}
    className="flex items-center"
    >
    <Settings className="w-4 h-4 mr-1" />
    Tipologie
    </Button>
    <Button
    variant="primary"
    onClick={() => {
      setEditingAnagrafica(null);
      setShowModal(true);
    }}
    >
    <Plus className="w-4 h-4 mr-2" />
    Nuova Anagrafica
    </Button>
    </div>
    </div>
    
    {/* Riassunto (AGGIORNATO) */}
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
    <Card>
    <Card.Body className="flex items-center">
    <div className="flex-shrink-0 p-3 bg-primary-100 rounded-lg">
    <Users className="w-6 h-6 text-primary-600" />
    </div>
    <div className="ml-4">
    <p className="text-sm font-medium text-gray-600">Totale</p>
    <p className="text-2xl font-semibold text-gray-900">{riassunto.totale}</p>
    <p className="text-xs text-gray-500">{riassunto.attive} attive</p>
    </div>
    </Card.Body>
    </Card>
    
    {/* Mostra top 3 tipologie */}
    {tipologie?.slice(0, 3).map((tipologia, index) => {
      const Icon = getIconForTipologia(tipologia.icona);
      return (
        <Card key={tipologia.id}>
        <Card.Body className="flex items-center">
        <div className="flex-shrink-0 p-3 rounded-lg" style={{backgroundColor: tipologia.colore + '20'}}>
        <Icon className="w-6 h-6" style={{color: tipologia.colore}} />
        </div>
        <div className="ml-4">
        <p className="text-sm font-medium text-gray-600">{tipologia.nome}</p>
        <p className="text-2xl font-semibold" style={{color: tipologia.colore}}>
        {riassunto.per_tipologia[tipologia.nome] || 0}
        </p>
        </div>
        </Card.Body>
        </Card>
      );
    })}
    
    <Card>
    <Card.Body className="flex items-center">
    <div className="flex-shrink-0 p-3 bg-gray-100 rounded-lg">
    <Tag className="w-6 h-6 text-gray-600" />
    </div>
    <div className="ml-4">
    <p className="text-sm font-medium text-gray-600">Tipologie</p>
    <p className="text-2xl font-semibold text-gray-900">{riassunto.tipologie_count}</p>
    <p className="text-xs text-gray-500">configurabili</p>
    </div>
    </Card.Body>
    </Card>
    </div>
    
    {/* Filtri (AGGIORNATO) */}
    {showFilters && (
      <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      >
      <Card>
      <Card.Body>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div>
      <label className="form-label">Cerca</label>
      <div className="relative">
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
      <input
      type="text"
      placeholder="Nome, email, P.IVA..."
      className="form-input pl-10"
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      />
      </div>
      </div>
      <div>
      <label className="form-label">Tipologia</label>
      <select
      className="form-select"
      value={filtroTipologia}
      onChange={(e) => setFiltroTipologia(e.target.value)}
      >
      <option value="">Tutte le tipologie</option>
      {tipologie?.map((tipologia) => (
        <option key={tipologia.id} value={tipologia.id}>
        {tipologia.nome}
        </option>
      ))}
      </select>
      </div>
      <div>
      <label className="form-label">Categoria</label>
      <select
      className="form-select"
      value={filtroCategoria}
      onChange={(e) => setFiltroCategoria(e.target.value)}
      >
      <option value="">Tutte</option>
      {categorie?.map((cat) => (
        <option key={cat.categoria} value={cat.categoria}>
        {cat.categoria} ({cat.count})
        </option>
      ))}
      </select>
      </div>
      <div>
      <label className="form-label">Stato</label>
      <select
      className="form-select"
      value={filtroStato}
      onChange={(e) => setFiltroStato(e.target.value)}
      >
      <option value="tutti">Tutti</option>
      <option value="attivi">Solo attivi</option>
      <option value="inattivi">Solo inattivi</option>
      </select>
      </div>
      </div>
      <div className="mt-4 flex justify-end">
      <Button variant="outline" onClick={resetFiltri}>
      Reset Filtri
      </Button>
      </div>
      </Card.Body>
      </Card>
      </motion.div>
    )}
    
    {/* Tabella anagrafiche (AGGIORNATA) */}
    <Card>
    <Card.Header className="flex items-center justify-between">
    <h3 className="text-lg font-semibold text-gray-900">
    Lista Anagrafiche ({anagrafiche?.length || 0})
    </h3>
    <div className="flex space-x-1">
    <Button 
    variant="outline" 
    size="sm"
    onClick={() => handleExport('csv')}
    disabled={!anagrafiche || anagrafiche.length === 0}
    >
    <Download className="w-4 h-4 mr-1" />
    CSV
    </Button>
    <Button 
    variant="outline" 
    size="sm"
    onClick={() => handleExport('xlsx')}
    disabled={!anagrafiche || anagrafiche.length === 0}
    >
    <Download className="w-4 h-4 mr-1" />
    Excel
    </Button>
    </div>
    </Card.Header>
    <Card.Body className="p-0">
    <Table>
    <Table.Header>
    <Table.Row>
    <Table.HeaderCell>Nome</Table.HeaderCell>
    <Table.HeaderCell>Tipologia</Table.HeaderCell>
    <Table.HeaderCell>Categoria</Table.HeaderCell>
    <Table.HeaderCell>Contatti</Table.HeaderCell>
    <Table.HeaderCell className="text-right">Movimenti</Table.HeaderCell>
    <Table.HeaderCell className="text-right">Tot. Entrate</Table.HeaderCell>
    <Table.HeaderCell className="text-right">Tot. Uscite</Table.HeaderCell>
    <Table.HeaderCell>Stato</Table.HeaderCell>
    <Table.HeaderCell className="text-right">Azioni</Table.HeaderCell>
    </Table.Row>
    </Table.Header>
    <Table.Body loading={isLoading} emptyMessage="Nessuna anagrafica trovata">
    {anagrafiche?.map((anagrafica) => {
      const IconTipologia = getIconForTipologia(anagrafica.tipologia_icona);
      return (
        <Table.Row key={anagrafica.id}>
        <Table.Cell>
        <div className="flex items-center">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center" 
             style={{backgroundColor: (anagrafica.tipologia_colore || '#6B7280') + '20'}}>
        <IconTipologia className="w-5 h-5" 
                       style={{color: anagrafica.tipologia_colore || '#6B7280'}} />
        </div>
        <div className="ml-3">
        <p className="text-sm font-medium text-gray-900">
        {anagrafica.nome}
        </p>
        {anagrafica.piva && (
          <p className="text-xs text-gray-500">
          P.IVA: {anagrafica.piva}
          </p>
        )}
        </div>
        </div>
        </Table.Cell>
        <Table.Cell>
        {anagrafica.tipologia_nome ? (
          <Badge 
          variant="custom"
          className="flex items-center"
          style={{
            backgroundColor: (anagrafica.tipologia_colore || '#6B7280') + '20',
            color: anagrafica.tipologia_colore || '#6B7280'
          }}
          >
          {anagrafica.tipologia_nome}
          </Badge>
        ) : (
          <Badge variant="gray">Senza tipologia</Badge>
        )}
        </Table.Cell>
        <Table.Cell>
        {anagrafica.categoria ? (
          <Badge variant="gray">{anagrafica.categoria}</Badge>
        ) : (
          <span className="text-gray-400">-</span>
        )}
        </Table.Cell>
        <Table.Cell>
        <div className="space-y-1">
        {anagrafica.email && (
          <div className="flex items-center text-xs text-gray-600">
          <Mail className="w-3 h-3 mr-1" />
          {anagrafica.email}
          </div>
        )}
        {anagrafica.telefono && (
          <div className="flex items-center text-xs text-gray-600">
          <Phone className="w-3 h-3 mr-1" />
          {anagrafica.telefono}
          </div>
        )}
        {!anagrafica.email && !anagrafica.telefono && (
          <span className="text-gray-400">-</span>
        )}
        </div>
        </Table.Cell>
        <Table.Cell className="text-right">
        <p className="text-sm text-gray-900">
        {anagrafica.numero_movimenti || 0}
        </p>
        {anagrafica.ultimo_movimento && (
          <p className="text-xs text-gray-500">
          {new Date(anagrafica.ultimo_movimento).toLocaleDateString('it-IT')}
          </p>
        )}
        </Table.Cell>
        <Table.Cell className="text-right">
        <p className="text-sm font-semibold text-success-600">
        €{parseFloat(anagrafica.totale_entrate || 0).toLocaleString('it-IT', { 
          minimumFractionDigits: 2 
        })}
        </p>
        </Table.Cell>
        <Table.Cell className="text-right">
        <p className="text-sm font-semibold text-danger-600">
        €{parseFloat(anagrafica.totale_uscite || 0).toLocaleString('it-IT', { 
          minimumFractionDigits: 2 
        })}
        </p>
        </Table.Cell>
        <Table.Cell>
        <Badge 
        variant={anagrafica.attivo ? 'success' : 'gray'}
        className="flex items-center"
        >
        <span className={`w-2 h-2 rounded-full mr-1 ${
          anagrafica.attivo ? 'bg-success-500' : 'bg-gray-400'
        }`} />
        {anagrafica.attivo ? 'Attivo' : 'Inattivo'}
        </Badge>
        </Table.Cell>
        <Table.Cell className="text-right">
        <div className="flex items-center justify-end space-x-1">
        <Button
        variant="ghost"
        size="sm"
        onClick={() => handleEdit(anagrafica)}
        title="Modifica"
        >
        <Edit className="w-4 h-4" />
        </Button>
        <Button
        variant="ghost"
        size="sm"
        onClick={() => handleToggleStato(anagrafica)}
        title={anagrafica.attivo ? 'Disattiva' : 'Attiva'}
        >
        {anagrafica.attivo ? (
          <ToggleRight className="w-4 h-4 text-success-600" />
        ) : (
          <ToggleLeft className="w-4 h-4 text-gray-400" />
        )}
        </Button>
        <Button
        variant="ghost"
        size="sm"
        onClick={() => handleDelete(anagrafica)}
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
    
    {/* Modal Form (AGGIORNATO) */}
    <AnagraficaModal
    isOpen={showModal}
    onClose={() => {
      setShowModal(false);
      setEditingAnagrafica(null);
      setSearchParams({});
    }}
    anagrafica={editingAnagrafica}
    onSave={(data) => {
      if (editingAnagrafica) {
        updateMutation.mutate({ id: editingAnagrafica.id, data });
      } else {
        createMutation.mutate(data);
      }
    }}
    isLoading={createMutation.isLoading || updateMutation.isLoading}
    tipologie={tipologie}
    />
    </div>
  );
};

// Componente Modal per Form Anagrafica (AGGIORNATO)
const AnagraficaModal = ({ isOpen, onClose, anagrafica, onSave, isLoading, tipologie }) => {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors }
  } = useForm();

  const watchTipologiaId = watch('tipologia_id');
  const watchCategoria = watch('categoria');

  // Trova tipologia selezionata per mostrare info
  const tipologiaSelezionata = tipologie?.find(t => t.id == watchTipologiaId);

  React.useEffect(() => {
    if (anagrafica) {
      reset({
        ...anagrafica,
        tipologia_id: anagrafica.tipologia_id || ''
      });
    } else {
      reset({
        nome: '',
        tipologia_id: '',
        categoria: '',
        email: '',
        telefono: '',
        piva: '',
        indirizzo: '',
        attivo: true
      });
    }
  }, [anagrafica, reset]);

  const onSubmit = (data) => {
    const cleanData = {
      ...data,
      tipologia_id: data.tipologia_id || null,
      categoria: data.categoria?.trim() || null
    };
    onSave(cleanData);
  };

  const handleCategoriaSelect = (selection) => {
    setValue('categoria', selection.nome);
    
    if (selection.isNew) {
      console.log('🆕 Nuova categoria anagrafica da creare:', selection.nome);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={anagrafica ? 'Modifica Anagrafica' : 'Nuova Anagrafica'}
      size="lg"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Nome */}
          <div>
            <label className="form-label">Nome *</label>
            <input
              type="text"
              className={`form-input ${errors.nome ? 'border-danger-500' : ''}`}
              placeholder="Nome anagrafica"
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

          {/* Tipologia (NUOVO) */}
          <div>
            <label className="form-label">Tipologia</label>
            <select
              className={`form-select ${errors.tipologia_id ? 'border-danger-500' : ''}`}
              {...register('tipologia_id')}
            >
              <option value="">Seleziona tipologia</option>
              {tipologie?.map(tipologia => (
                <option key={tipologia.id} value={tipologia.id}>
                  {tipologia.nome} ({tipologia.tipo_movimento_default})
                </option>
              ))}
            </select>
            {tipologiaSelezionata && (
              <p className="text-xs text-gray-500 mt-1">
                💡 Tipologia per movimenti: <span className="font-medium">{tipologiaSelezionata.tipo_movimento_default}</span>
              </p>
            )}
            {errors.tipologia_id && (
              <p className="form-error">{errors.tipologia_id.message}</p>
            )}
          </div>
        </div>

        {/* Categoria con Autocompletamento */}
        <div>
          <label className="form-label">
            Categoria
            <span className="text-sm text-gray-500 ml-2">
              (es. VIP, Locale, Strategico)
            </span>
          </label>
          <AutocompleteInput
            value={watchCategoria || ''}
            onChange={(value) => setValue('categoria', value)}
            onSelect={handleCategoriaSelect}
            apiEndpoint="/categorie-anagrafiche"
            placeholder="Categoria anagrafica..."
            createLabel="Crea nuova categoria"
            allowCreate={true}
            showColorDots={true}
            error={!!errors.categoria}
            className={errors.categoria ? 'border-danger-500' : ''}
          />
          {errors.categoria && (
            <p className="form-error">{errors.categoria.message}</p>
          )}
          <p className="text-xs text-gray-500 mt-1">
            Opzionale. Aiuta a organizzare le anagrafiche per analisi
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Email */}
          <div>
            <label className="form-label">Email</label>
            <input
              type="email"
              className={`form-input ${errors.email ? 'border-danger-500' : ''}`}
              placeholder="email@esempio.it"
              {...register('email', {
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

          {/* Telefono */}
          <div>
            <label className="form-label">Telefono</label>
            <input
              type="tel"
              className="form-input"
              placeholder="+39 123 456 7890"
              {...register('telefono', {
                maxLength: {
                  value: 20,
                  message: 'Telefono non può superare 20 caratteri'
                }
              })}
            />
          </div>
        </div>

        {/* Partita IVA */}
        <div>
          <label className="form-label">Partita IVA</label>
          <input
            type="text"
            className={`form-input ${errors.piva ? 'border-danger-500' : ''}`}
            placeholder="12345678901"
            {...register('piva', {
              pattern: {
                value: /^[0-9]{11}$/,
                message: 'Partita IVA deve essere di 11 cifre'
              }
            })}
          />
          {errors.piva && (
            <p className="form-error">{errors.piva.message}</p>
          )}
        </div>

        {/* Indirizzo */}
        <div>
          <label className="form-label">Indirizzo</label>
          <textarea
            className="form-textarea"
            rows={2}
            placeholder="Via, Città, CAP"
            {...register('indirizzo')}
          />
        </div>

        {/* Attivo */}
        <div className="flex items-center">
          <input
            id="attivo"
            type="checkbox"
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            {...register('attivo')}
          />
          <label htmlFor="attivo" className="ml-2 block text-sm text-gray-700">
            Anagrafica attiva
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
            {anagrafica ? 'Aggiorna' : 'Crea'} Anagrafica
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default AnagrafichePage;