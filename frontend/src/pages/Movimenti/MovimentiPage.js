// src/pages/Movimenti/MovimentiPage.js
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Plus,
  Edit,
  Trash2,
  Filter,
  Search,
  Download,
  ArrowUpDown,
  TrendingUp,
  TrendingDown,
  Calendar,
  Euro,
  FileText,
  Upload,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { movimentiAPI, contiBancariAPI, anagraficheAPI } from '../../services/api';
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
import { categorieMovimentiAPI } from '../../services/api';

const MovimentiPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showModal, setShowModal] = useState(false);
  const [editingMovimento, setEditingMovimento] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filtri, setFiltri] = useState({
    search: '',
    data_inizio: '',
    data_fine: '',
    conto_id: '',
    anagrafica_id: '',
    tipo: '',
    importo_min: '',
    importo_max: ''
  });
  const [paginazione, setPaginazione] = useState({
    limit: 50,
    offset: 0
  });
  
  const queryClient = useQueryClient();
  
  // Auto-apri modal se specificato nei params
  React.useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setShowModal(true);
      setEditingMovimento(null);
    }
  }, [searchParams]);
  
  // Query per ottenere movimenti
  const { data: movimentiData, isLoading, error } = useQuery(
    ['movimenti', filtri, paginazione],
    () => movimentiAPI.getAll({
      ...filtri,
      ...paginazione,
      search: filtri.search || undefined,
      data_inizio: filtri.data_inizio || undefined,
      data_fine: filtri.data_fine || undefined,
      conto_id: filtri.conto_id || undefined,
      anagrafica_id: filtri.anagrafica_id || undefined,
      tipo: filtri.tipo || undefined,
      importo_min: filtri.importo_min || undefined,
      importo_max: filtri.importo_max || undefined
    }),
    {
      refetchOnWindowFocus: false,
      keepPreviousData: true
    }
  );
  
  // Query per conti attivi (per dropdown)
  const { data: conti } = useQuery(
    'conti-attivi',
    contiBancariAPI.getAttivi
  );
  
  // Query per anagrafiche attive (per dropdown)
  const { data: anagrafiche } = useQuery(
    'anagrafiche-attive',
    anagraficheAPI.getAttive
  );
  
  // Mutations
  const createMutation = useMutation(movimentiAPI.create, {
    onSuccess: () => {
      queryClient.invalidateQueries('movimenti');
      queryClient.invalidateQueries('dashboard');
      queryClient.invalidateQueries('conti-bancari');
      setShowModal(false);
      setEditingMovimento(null);
      toast.success('Movimento creato con successo');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Errore nella creazione del movimento');
    }
  });
  
  const updateMutation = useMutation(
    ({ id, data }) => movimentiAPI.update(id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('movimenti');
        queryClient.invalidateQueries('dashboard');
        queryClient.invalidateQueries('conti-bancari');
        setShowModal(false);
        setEditingMovimento(null);
        toast.success('Movimento aggiornato con successo');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Errore nell\'aggiornamento del movimento');
      }
    }
  );
  
  const deleteMutation = useMutation(movimentiAPI.delete, {
    onSuccess: () => {
      queryClient.invalidateQueries('movimenti');
      queryClient.invalidateQueries('dashboard');
      queryClient.invalidateQueries('conti-bancari');
      toast.success('Movimento eliminato con successo');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Errore nell\'eliminazione del movimento');
    }
  });
  
  const movimenti = movimentiData?.movimenti || [];
  const totali = movimentiData?.totali || {};
  const pagination = movimentiData?.pagination || {};
  
  const handleEdit = (movimento) => {
    setEditingMovimento(movimento);
    setShowModal(true);
  };
  
  const handleDelete = async (movimento) => {
    if (window.confirm(`Sei sicuro di voler eliminare il movimento "${movimento.descrizione}"?`)) {
      deleteMutation.mutate(movimento.id);
    }
  };
  
  const handleFiltersChange = (newFiltri) => {
    setFiltri(newFiltri);
    setPaginazione(prev => ({ ...prev, offset: 0 })); // Reset pagination
  };
  
  const handlePageChange = (newOffset) => {
    setPaginazione(prev => ({ ...prev, offset: newOffset }));
  };
  
  const handleExport = async (formato) => {
    try {
      const params = new URLSearchParams({ formato });
      
      // Applica i filtri attivi all'export
      Object.entries(filtri).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      
      const response = await fetch(`/api/movimenti/export?${params}`, {
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
      a.download = `movimenti_${new Date().toISOString().split('T')[0]}.${formato === 'xlsx' ? 'xlsx' : 'csv'}`;
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
  
  const handleImport = async (file) => {
    console.log('🎯 handleImport chiamata:', file);
    
    try {
      if (!file) {
        console.error('❌ Nessun file selezionato');
        toast.error('Seleziona un file CSV');
        return;
      }
      
      console.log('📄 File selezionato:', {
        name: file.name,
        size: file.size,
        type: file.type
      });
      
      if (!file.name.toLowerCase().endsWith('.csv')) {
        console.error('❌ File non è CSV');
        toast.error('Seleziona un file CSV valido');
        return;
      }
      
      console.log('📖 Lettura file...');
      const text = await file.text();
      console.log('📝 Contenuto file (primi 200 caratteri):', text.substring(0, 200));
      
      console.log('🚀 Invio richiesta al backend...');
      const response = await fetch('/api/movimenti/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ csvData: text })
      });
      
      console.log('📡 Risposta backend:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Errore backend:', errorText);
        throw new Error(`Errore ${response.status}: ${errorText}`);
      }
      
      const result = await response.json();
      console.log('✅ Risultato import:', result);
      
      if (result.errori > 0) {
        toast.success(`Import completato con ${result.errori} errori. ${result.movimenti_importati} movimenti importati.`);
        console.log('⚠️ Errori import:', result.dettagli?.errori);
      } else {
        toast.success(`Import completato: ${result.movimenti_importati} movimenti importati!`);
      }
      
      // Ricarica la lista movimenti
      queryClient.invalidateQueries('movimenti');
      queryClient.invalidateQueries('dashboard');
      queryClient.invalidateQueries('conti-bancari');
      
    } catch (error) {
      console.error('💥 Errore import:', error);
      toast.error(`Errore durante l'import: ${error.message}`);
    }
  };
  
  const resetFiltri = () => {
    setFiltri({
      search: '',
      data_inizio: '',
      data_fine: '',
      conto_id: '',
      anagrafica_id: '',
      tipo: '',
      importo_min: '',
      importo_max: ''
    });
    setPaginazione({ limit: 50, offset: 0 });
  };
  
  if (isLoading && !movimenti.length) {
    return (
      <div className="flex items-center justify-center h-64">
      <LoadingSpinner size="lg" />
      </div>
    );
  }
  
  if (error) {
    return (
      <Alert type="danger">
      Errore nel caricamento dei movimenti: {error.message}
      </Alert>
    );
  }
  
  return (
    <div className="space-y-6">
    {/* Header */}
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
    <div>
    <h1 className="text-2xl font-bold text-gray-900">Movimenti</h1>
    <p className="mt-1 text-sm text-gray-600">
    Gestisci entrate e uscite
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
    {Object.values(filtri).some(v => v) && (
      <Badge variant="primary" size="sm" className="ml-2">
      {Object.values(filtri).filter(v => v).length}
      </Badge>
    )}
    </Button>
    <div className="relative">
    <input
    type="file"
    accept=".csv"
    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
    onChange={(e) => {
      const file = e.target.files[0];
      if (file) handleImport(file);
      e.target.value = ''; // Reset input
    }}
    />
    <Button
    variant="outline"
    className="flex items-center relative pointer-events-none"
    >
    <Upload className="w-4 h-4 mr-1" />
    Import CSV
    </Button>
    </div>
    <Button
    variant="primary"
    onClick={() => {
      setEditingMovimento(null);
      setShowModal(true);
    }}
    >
    <Plus className="w-4 h-4 mr-2" />
    Nuovo Movimento
    </Button>
    </div>
    </div>
    
    {/* Riassunto */}
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
    <Card>
    <Card.Body className="flex items-center">
    <div className="flex-shrink-0 p-3 bg-primary-100 rounded-lg">
    <ArrowUpDown className="w-6 h-6 text-primary-600" />
    </div>
    <div className="ml-4">
    <p className="text-sm font-medium text-gray-600">Movimenti</p>
    <p className="text-2xl font-semibold text-gray-900">
    {pagination.total || 0}
    </p>
    <p className="text-xs text-gray-500">
    Visualizzati: {movimenti.length}
    </p>
    </div>
    </Card.Body>
    </Card>
    
    <Card>
    <Card.Body className="flex items-center">
    <div className="flex-shrink-0 p-3 bg-success-100 rounded-lg">
    <TrendingUp className="w-6 h-6 text-success-600" />
    </div>
    <div className="ml-4">
    <p className="text-sm font-medium text-gray-600">Entrate</p>
    <p className="text-2xl font-semibold text-success-600">
    €{parseFloat(totali.totale_entrate || 0).toLocaleString('it-IT', { 
      minimumFractionDigits: 2 
    })}
    </p>
    </div>
    </Card.Body>
    </Card>
    
    <Card>
    <Card.Body className="flex items-center">
    <div className="flex-shrink-0 p-3 bg-danger-100 rounded-lg">
    <TrendingDown className="w-6 h-6 text-danger-600" />
    </div>
    <div className="ml-4">
    <p className="text-sm font-medium text-gray-600">Uscite</p>
    <p className="text-2xl font-semibold text-danger-600">
    €{parseFloat(totali.totale_uscite || 0).toLocaleString('it-IT', { 
      minimumFractionDigits: 2 
    })}
    </p>
    </div>
    </Card.Body>
    </Card>
    
    <Card>
    <Card.Body className="flex items-center">
    <div className="flex-shrink-0 p-3 bg-gray-100 rounded-lg">
    <Euro className="w-6 h-6 text-gray-600" />
    </div>
    <div className="ml-4">
    <p className="text-sm font-medium text-gray-600">Saldo Netto</p>
    <p className={`text-2xl font-semibold ${
      parseFloat(totali.saldo_netto || 0) >= 0 ? 'text-success-600' : 'text-danger-600'
    }`}>
    €{parseFloat(totali.saldo_netto || 0).toLocaleString('it-IT', { 
      minimumFractionDigits: 2 
    })}
    </p>
    </div>
    </Card.Body>
    </Card>
    </div>
    
    {/* Filtri */}
    {showFilters && (
      <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      >
      <MovimentiFiltri
      filtri={filtri}
      onChange={handleFiltersChange}
      onReset={resetFiltri}
      conti={conti}
      anagrafiche={anagrafiche}
      />
      </motion.div>
    )}
    
    {/* Tabella movimenti */}
    <Card>
    <Card.Header className="flex items-center justify-between">
    <h3 className="text-lg font-semibold text-gray-900">
    Lista Movimenti
    </h3>
    <div className="flex space-x-2">
    <Button 
    variant="outline" 
    size="sm"
    onClick={() => handleExport('csv')}
    disabled={!movimenti || movimenti.length === 0}
    >
    <Download className="w-4 h-4 mr-1" />
    CSV
    </Button>
    <Button 
    variant="outline" 
    size="sm"
    onClick={() => handleExport('xlsx')}
    disabled={!movimenti || movimenti.length === 0}
    >
    <FileText className="w-4 h-4 mr-1" />
    Excel
    </Button>
    </div>
    </Card.Header>
    <Card.Body className="p-0">
    <Table>
    <Table.Header>
    <Table.Row>
    <Table.HeaderCell>Data</Table.HeaderCell>
    <Table.HeaderCell>Descrizione</Table.HeaderCell>
    <Table.HeaderCell>Anagrafica</Table.HeaderCell>
    <Table.HeaderCell>Conto</Table.HeaderCell>
    <Table.HeaderCell className="text-right">Importo</Table.HeaderCell>
    <Table.HeaderCell>Tipo</Table.HeaderCell>
    <Table.HeaderCell className="text-right">Azioni</Table.HeaderCell>
    </Table.Row>
    </Table.Header>
    <Table.Body 
    loading={isLoading} 
    emptyMessage="Nessun movimento trovato"
    >
    {movimenti.map((movimento) => (
      <Table.Row key={movimento.id}>
      <Table.Cell>
      <div>
      <p className="text-sm font-medium text-gray-900">
      {new Date(movimento.data).toLocaleDateString('it-IT')}
      </p>
      <p className="text-xs text-gray-500">
      {new Date(movimento.created_at).toLocaleTimeString('it-IT', {
        hour: '2-digit',
        minute: '2-digit'
      })}
      </p>
      </div>
      </Table.Cell>
      <Table.Cell>
      <div>
      <p className="text-sm font-medium text-gray-900">
      {movimento.descrizione}
      </p>
      {movimento.note && (
        <p className="text-xs text-gray-500 mt-1">
        {movimento.note}
        </p>
      )}
      </div>
      </Table.Cell>
      <Table.Cell>
      {movimento.anagrafica_nome ? (
        <div>
        <p className="text-sm text-gray-900">
        {movimento.anagrafica_nome}
        </p>
        <Badge 
        variant={movimento.anagrafica_tipo === 'Cliente' ? 'success' : 'warning'}
        size="sm"
        >
        {movimento.anagrafica_tipo}
        </Badge>
        </div>
      ) : (
        <span className="text-gray-400">-</span>
      )}
      </Table.Cell>
      <Table.Cell>
      <div>
      <p className="text-sm text-gray-900">
      {movimento.nome_banca}
      </p>
      <p className="text-xs text-gray-500">
      {movimento.intestatario}
      </p>
      </div>
      </Table.Cell>
      <Table.Cell className="text-right">
      <p className={`text-sm font-semibold ${
        movimento.tipo === 'Entrata' ? 'text-success-600' : 'text-danger-600'
      }`}>
      {movimento.tipo === 'Entrata' ? '+' : '-'}€{parseFloat(movimento.importo).toLocaleString('it-IT', { 
        minimumFractionDigits: 2 
      })}
      </p>
      </Table.Cell>
      <Table.Cell>
      <Badge 
      variant={movimento.tipo === 'Entrata' ? 'success' : 'danger'}
      className="flex items-center"
      >
      {movimento.tipo === 'Entrata' ? (
        <TrendingUp className="w-3 h-3 mr-1" />
      ) : (
        <TrendingDown className="w-3 h-3 mr-1" />
      )}
      {movimento.tipo}
      </Badge>
      </Table.Cell>
      <Table.Cell className="text-right">
      <div className="flex items-center justify-end space-x-1">
      <Button
      variant="ghost"
      size="sm"
      onClick={() => handleEdit(movimento)}
      title="Modifica"
      >
      <Edit className="w-4 h-4" />
      </Button>
      <Button
      variant="ghost"
      size="sm"
      onClick={() => handleDelete(movimento)}
      title="Elimina"
      className="text-danger-600 hover:text-danger-700"
      >
      <Trash2 className="w-4 h-4" />
      </Button>
      </div>
      </Table.Cell>
      </Table.Row>
    ))}
    </Table.Body>
    </Table>
    
    {/* Paginazione */}
    {pagination.total > paginazione.limit && (
      <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-between">
      <div className="text-sm text-gray-700">
      Visualizzati {pagination.offset + 1}-{Math.min(pagination.offset + paginazione.limit, pagination.total)} di {pagination.total}
      </div>
      <div className="flex space-x-2">
      <Button
      variant="outline"
      size="sm"
      onClick={() => handlePageChange(Math.max(0, pagination.offset - paginazione.limit))}
      disabled={pagination.offset === 0}
      >
      <ChevronLeft className="w-4 h-4" />
      </Button>
      <Button
      variant="outline"
      size="sm"
      onClick={() => handlePageChange(pagination.offset + paginazione.limit)}
      disabled={!pagination.hasMore}
      >
      <ChevronRight className="w-4 h-4" />
      </Button>
      </div>
      </div>
    )}
    </Card.Body>
    </Card>
    
    {/* Modal Form */}
    <MovimentoModal
    isOpen={showModal}
    onClose={() => {
      setShowModal(false);
      setEditingMovimento(null);
      setSearchParams({});
    }}
    movimento={editingMovimento}
    onSave={(data) => {
      if (editingMovimento) {
        updateMutation.mutate({ id: editingMovimento.id, data });
      } else {
        createMutation.mutate(data);
      }
    }}
    isLoading={createMutation.isLoading || updateMutation.isLoading}
    conti={conti}
    anagrafiche={anagrafiche}
    />
    </div>
  );
};

// Componente Filtri
const MovimentiFiltri = ({ filtri, onChange, onReset, conti, anagrafiche }) => {
  const handleChange = (field, value) => {
    onChange({ ...filtri, [field]: value });
  };
  
  return (
    <Card>
    <Card.Body>
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
    <div>
    <label className="form-label">Cerca</label>
    <div className="relative">
    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
    <input
    type="text"
    placeholder="Descrizione, note..."
    className="form-input pl-10"
    value={filtri.search}
    onChange={(e) => handleChange('search', e.target.value)}
    />
    </div>
    </div>
    
    <div>
    <label className="form-label">Data Inizio</label>
    <input
    type="date"
    className="form-input"
    value={filtri.data_inizio}
    onChange={(e) => handleChange('data_inizio', e.target.value)}
    />
    </div>
    
    <div>
    <label className="form-label">Data Fine</label>
    <input
    type="date"
    className="form-input"
    value={filtri.data_fine}
    onChange={(e) => handleChange('data_fine', e.target.value)}
    />
    </div>
    
    <div>
    <label className="form-label">Tipo</label>
    <select
    className="form-select"
    value={filtri.tipo}
    onChange={(e) => handleChange('tipo', e.target.value)}
    >
    <option value="">Tutti</option>
    <option value="Entrata">Solo Entrate</option>
    <option value="Uscita">Solo Uscite</option>
    </select>
    </div>
    
    <div>
    <label className="form-label">Conto</label>
    <select
    className="form-select"
    value={filtri.conto_id}
    onChange={(e) => handleChange('conto_id', e.target.value)}
    >
    <option value="">Tutti i conti</option>
    {conti?.map(conto => (
      <option key={conto.id} value={conto.id}>
      {conto.nome_banca}
      </option>
    ))}
    </select>
    </div>
    
    <div>
    <label className="form-label">Anagrafica</label>
    <select
    className="form-select"
    value={filtri.anagrafica_id}
    onChange={(e) => handleChange('anagrafica_id', e.target.value)}
    >
    <option value="">Tutte</option>
    {anagrafiche?.map(anagrafica => (
      <option key={anagrafica.id} value={anagrafica.id}>
      {anagrafica.nome}
      </option>
    ))}
    </select>
    </div>
    
    <div>
    <label className="form-label">Importo Min</label>
    <div className="relative">
    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">€</span>
    <input
    type="number"
    step="0.01"
    className="form-input pl-8"
    placeholder="0.00"
    value={filtri.importo_min}
    onChange={(e) => handleChange('importo_min', e.target.value)}
    />
    </div>
    </div>
    
    <div>
    <label className="form-label">Importo Max</label>
    <div className="relative">
    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">€</span>
    <input
    type="number"
    step="0.01"
    className="form-input pl-8"
    placeholder="0.00"
    value={filtri.importo_max}
    onChange={(e) => handleChange('importo_max', e.target.value)}
    />
    </div>
    </div>
    </div>
    
    <div className="mt-4 flex justify-end space-x-2">
    <Button variant="outline" onClick={onReset}>
    Reset Filtri
    </Button>
    <Button variant="primary">
    Applica Filtri
    </Button>
    </div>
    </Card.Body>
    </Card>
  );
};

// Componente Modal per Form Movimento
const MovimentoModal = ({ isOpen, onClose, movimento, onSave, isLoading, conti, anagrafiche }) => {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors }
  } = useForm();

  const watchTipo = watch('tipo');
  const watchCategoria = watch('categoria');

  React.useEffect(() => {
    if (movimento) {
      reset({
        ...movimento,
        data: movimento.data ? new Date(movimento.data).toISOString().split('T')[0] : ''
      });
    } else {
      reset({
        data: new Date().toISOString().split('T')[0],
        anagrafica_id: '',
        conto_id: '',
        descrizione: '',
        categoria: '',
        importo: '',
        tipo: 'Entrata',
        note: ''
      });
    }
  }, [movimento, reset]);

  const onSubmit = (data) => {
    const formattedData = {
      ...data,
      anagrafica_id: data.anagrafica_id || null,
      categoria: data.categoria?.trim() || null,
      importo: parseFloat(data.importo)
    };
    onSave(formattedData);
  };

  const handleCategoriaSelect = (selection) => {
    setValue('categoria', selection.nome);
    
    if (selection.isNew) {
      console.log('🆕 Nuova categoria movimento da creare:', selection.nome, 'per tipo:', watchTipo);
      // TODO: Implementare creazione categoria se necessario
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={movimento ? 'Modifica Movimento' : 'Nuovo Movimento'}
      size="lg"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Data */}
          <div>
            <label className="form-label">Data *</label>
            <input
              type="date"
              className={`form-input ${errors.data ? 'border-danger-500' : ''}`}
              {...register('data', { required: 'Data è richiesta' })}
            />
            {errors.data && (
              <p className="form-error">{errors.data.message}</p>
            )}
          </div>

          {/* Tipo */}
          <div>
            <label className="form-label">Tipo *</label>
            <select
              className={`form-select ${errors.tipo ? 'border-danger-500' : ''}`}
              {...register('tipo', { required: 'Tipo è richiesto' })}
            >
              <option value="Entrata">Entrata</option>
              <option value="Uscita">Uscita</option>
            </select>
            {errors.tipo && (
              <p className="form-error">{errors.tipo.message}</p>
            )}
          </div>
        </div>

        {/* Descrizione */}
        <div>
          <label className="form-label">Descrizione *</label>
          <input
            type="text"
            className={`form-input ${errors.descrizione ? 'border-danger-500' : ''}`}
            placeholder="Descrizione del movimento"
            {...register('descrizione', {
              required: 'Descrizione è richiesta',
              maxLength: {
                value: 255,
                message: 'Descrizione non può superare 255 caratteri'
              }
            })}
          />
          {errors.descrizione && (
            <p className="form-error">{errors.descrizione.message}</p>
          )}
        </div>

        {/* Categoria Movimento con Autocompletamento */}
        <div>
          <label className="form-label">
            Categoria
            <span className="text-sm text-gray-500 ml-2">
              (es. {watchTipo === 'Entrata' ? 'Vendite, Consulenze, Rimborsi' : 'Spese Ufficio, Stipendi, Materiali'})
            </span>
          </label>
          <AutocompleteInput
            value={watchCategoria || ''}
            onChange={(value) => setValue('categoria', value)}
            onSelect={handleCategoriaSelect}
            apiEndpoint="/categorie-movimenti"
            queryParams={{ tipo: watchTipo }} // Filtra per tipo movimento
            placeholder={`Categoria ${watchTipo?.toLowerCase() || 'movimento'}...`}
            createLabel="Crea nuova categoria movimento"
            allowCreate={true}
            showColorDots={true}
            error={!!errors.categoria}
            className={errors.categoria ? 'border-danger-500' : ''}
          />
          {errors.categoria && (
            <p className="form-error">{errors.categoria.message}</p>
          )}
          <p className="text-xs text-gray-500 mt-1">
            Opzionale. Aiuta a classificare i movimenti per analisi e report
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Conto */}
          <div>
            <label className="form-label">Conto *</label>
            <select
              className={`form-select ${errors.conto_id ? 'border-danger-500' : ''}`}
              {...register('conto_id', { required: 'Conto è richiesto' })}
            >
              <option value="">Seleziona conto</option>
              {conti?.map(conto => (
                <option key={conto.id} value={conto.id}>
                  {conto.nome_banca} - {conto.intestatario}
                </option>
              ))}
            </select>
            {errors.conto_id && (
              <p className="form-error">{errors.conto_id.message}</p>
            )}
          </div>

          {/* Anagrafica */}
          <div>
            <label className="form-label">
              {watchTipo === 'Entrata' ? 'Cliente' : 'Fornitore'}
            </label>
            <select
              className="form-select"
              {...register('anagrafica_id')}
            >
              <option value="">Seleziona {watchTipo === 'Entrata' ? 'cliente' : 'fornitore'}</option>
              {anagrafiche?.filter(a => 
                watchTipo === 'Entrata' ? a.tipo === 'Cliente' : a.tipo === 'Fornitore'
              ).map(anagrafica => (
                <option key={anagrafica.id} value={anagrafica.id}>
                  {anagrafica.nome} {anagrafica.categoria && `(${anagrafica.categoria})`}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Opzionale. Associa il movimento a un cliente o fornitore
            </p>
          </div>
        </div>

        {/* Importo */}
        <div>
          <label className="form-label">Importo *</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">€</span>
            <input
              type="number"
              step="0.01"
              min="0"
              className={`form-input pl-8 ${errors.importo ? 'border-danger-500' : ''}`}
              placeholder="0.00"
              {...register('importo', {
                required: 'Importo è richiesto',
                min: {
                  value: 0.01,
                  message: 'Importo deve essere maggiore di 0'
                },
                max: {
                  value: 999999999,
                  message: 'Importo troppo alto'
                }
              })}
            />
          </div>
          {errors.importo && (
            <p className="form-error">{errors.importo.message}</p>
          )}
        </div>

        {/* Note */}
        <div>
          <label className="form-label">Note</label>
          <textarea
            className="form-textarea"
            rows={3}
            placeholder="Note aggiuntive (opzionali)"
            {...register('note')}
          />
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
            {movimento ? 'Aggiorna' : 'Crea'} Movimento
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default MovimentiPage;
