// ==============================================================================
// FILE: frontend/src/pages/Categorie/CategoriePage.js
// POSIZIONE: frontend/src/pages/Categorie/CategoriePage.js (COMPLETAMENTO)
// ==============================================================================

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { motion } from 'framer-motion';
import {
  Plus,
  Edit,
  Trash2,
  Tag,
  Users,
  ArrowUpDown,
  Eye,
  EyeOff,
  Search,
  Filter
} from 'lucide-react';
import { categorieAnagraficheAPI, categorieMovimentiAPI } from '../../services/api';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import Badge from '../../components/UI/Badge';
import Modal from '../../components/UI/Modal';
import Alert from '../../components/UI/Alert';
import LoadingSpinner from '../../components/UI/LoadingSpinner';
import Table from '../../components/UI/Table';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';

const CategoriePage = () => {
  const [activeTab, setActiveTab] = useState('anagrafiche');
  const [showModal, setShowModal] = useState(false);
  const [editingCategoria, setEditingCategoria] = useState(null);
  const [modalType, setModalType] = useState('anagrafiche');
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  
  const queryClient = useQueryClient();

  // Query categorie anagrafiche
  const { data: categorieAnagrafiche, isLoading: loadingAnagrafiche } = useQuery(
    ['categorie-anagrafiche', { search: searchTerm, attiva: showInactive ? undefined : true }],
    () => categorieAnagraficheAPI.getAll({ 
      search: searchTerm || undefined,
      attiva: showInactive ? undefined : true 
    }),
    { 
      refetchOnWindowFocus: false,
      onSuccess: (data) => {
        console.log('Categorie Anagrafiche loaded:', data);
      },
      onError: (error) => {
        console.error('Error loading Categorie Anagrafiche:', error);
      }
    }
  );

  // Query categorie movimenti
  const { data: categorieMovimenti, isLoading: loadingMovimenti } = useQuery(
    ['categorie-movimenti', { search: searchTerm, attiva: showInactive ? undefined : true }],
    () => categorieMovimentiAPI.getAll({ 
      search: searchTerm || undefined,
      attiva: showInactive ? undefined : true 
    }),
    { 
      refetchOnWindowFocus: false,
      onSuccess: (data) => {
        console.log('Categorie Movimenti loaded:', data);
      },
      onError: (error) => {
        console.error('Error loading Categorie Movimenti:', error);
      }
    }
  );

  // Mutations anagrafiche
  const createAnagraficaMutation = useMutation(categorieAnagraficheAPI.create, {
    onSuccess: () => {
      queryClient.invalidateQueries('categorie-anagrafiche');
      setShowModal(false);
      setEditingCategoria(null);
      toast.success('Categoria anagrafica creata con successo');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Errore nella creazione');
    }
  });

  const updateAnagraficaMutation = useMutation(
    ({ id, data }) => categorieAnagraficheAPI.update(id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('categorie-anagrafiche');
        setShowModal(false);
        setEditingCategoria(null);
        toast.success('Categoria anagrafica aggiornata con successo');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Errore nell\'aggiornamento');
      }
    }
  );

  const deleteAnagraficaMutation = useMutation(categorieAnagraficheAPI.delete, {
    onSuccess: () => {
      queryClient.invalidateQueries('categorie-anagrafiche');
      toast.success('Categoria anagrafica eliminata con successo');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Errore nell\'eliminazione');
    }
  });

  const toggleAnagraficaMutation = useMutation(categorieAnagraficheAPI.toggle, {
    onSuccess: () => {
      queryClient.invalidateQueries('categorie-anagrafiche');
      toast.success('Stato categoria aggiornato');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Errore nel cambio stato');
    }
  });

  // Mutations movimenti
  const createMovimentoMutation = useMutation(categorieMovimentiAPI.create, {
    onSuccess: () => {
      queryClient.invalidateQueries('categorie-movimenti');
      setShowModal(false);
      setEditingCategoria(null);
      toast.success('Categoria movimento creata con successo');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Errore nella creazione');
    }
  });

  const updateMovimentoMutation = useMutation(
    ({ id, data }) => categorieMovimentiAPI.update(id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('categorie-movimenti');
        setShowModal(false);
        setEditingCategoria(null);
        toast.success('Categoria movimento aggiornata con successo');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Errore nell\'aggiornamento');
      }
    }
  );

  const deleteMovimentoMutation = useMutation(categorieMovimentiAPI.delete, {
    onSuccess: () => {
      queryClient.invalidateQueries('categorie-movimenti');
      toast.success('Categoria movimento eliminata con successo');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Errore nell\'eliminazione');
    }
  });

  const toggleMovimentoMutation = useMutation(categorieMovimentiAPI.toggle, {
    onSuccess: () => {
      queryClient.invalidateQueries('categorie-movimenti');
      toast.success('Stato categoria aggiornato');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Errore nel cambio stato');
    }
  });

  // Variabili calcolate
  const isLoading = loadingAnagrafiche || loadingMovimenti;
  const isModalLoading = 
    createAnagraficaMutation.isLoading || 
    updateAnagraficaMutation.isLoading ||
    createMovimentoMutation.isLoading || 
    updateMovimentoMutation.isLoading;

  // Funzione helper per ottenere la lunghezza dei dati
  const getDataLength = (data) => {
    if (!data) return 0;
    if (Array.isArray(data)) return data.length;
    if (data.data && Array.isArray(data.data)) return data.data.length;
    if (data.categorie && Array.isArray(data.categorie)) return data.categorie.length;
    if (data.results && Array.isArray(data.results)) return data.results.length;
    return 0;
  };

  // Handler functions
  const handleCreate = (type) => {
    console.log('Creating new categoria:', type);
    setEditingCategoria(null);
    setModalType(type);
    setShowModal(true);
    console.log('Modal state:', { showModal: true, modalType: type, editingCategoria: null });
  };

  const handleEdit = (categoria, type) => {
    console.log('Editing categoria:', categoria, type);
    setEditingCategoria(categoria);
    setModalType(type);
    setShowModal(true);
    console.log('Modal state:', { showModal: true, modalType: type, editingCategoria: categoria });
  };

  const handleDelete = (categoria, type) => {
    if (categoria.utilizzi > 0) {
      toast.error(`Impossibile eliminare categoria in uso (${categoria.utilizzi} utilizzi)`);
      return;
    }

    if (window.confirm(`Sei sicuro di voler eliminare la categoria "${categoria.nome}"?`)) {
      if (type === 'anagrafiche') {
        deleteAnagraficaMutation.mutate(categoria.id);
      } else {
        deleteMovimentoMutation.mutate(categoria.id);
      }
    }
  };

  const handleToggle = (categoria, type) => {
    if (type === 'anagrafiche') {
      toggleAnagraficaMutation.mutate(categoria.id);
    } else {
      toggleMovimentoMutation.mutate(categoria.id);
    }
  };

  const handleSave = (data) => {
    if (editingCategoria) {
      if (modalType === 'anagrafiche') {
        updateAnagraficaMutation.mutate({ id: editingCategoria.id, data });
      } else {
        updateMovimentoMutation.mutate({ id: editingCategoria.id, data });
      }
    } else {
      if (modalType === 'anagrafiche') {
        createAnagraficaMutation.mutate(data);
      } else {
        createMovimentoMutation.mutate(data);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestione Categorie</h1>
          <p className="mt-1 text-sm text-gray-600">
            Organizza e gestisci le categorie per anagrafiche e movimenti
          </p>
        </div>
      </div>

      {/* Filtri */}
      <Card>
        <Card.Body>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Cerca categorie..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowInactive(!showInactive)}
                className={`${showInactive ? 'text-blue-600 border-blue-600' : ''}`}
              >
                {showInactive ? <Eye className="w-4 h-4 mr-2" /> : <EyeOff className="w-4 h-4 mr-2" />}
                {showInactive ? 'Mostra solo attive' : 'Mostra anche inattive'}
              </Button>
            </div>
          </div>
        </Card.Body>
      </Card>

      {/* Tabs */}
      <Card>
        <Card.Body className="p-0">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('anagrafiche')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'anagrafiche'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Categorie Anagrafiche
                {categorieAnagrafiche && (
                  <Badge variant="gray" className="ml-2">
                    {getDataLength(categorieAnagrafiche)}
                  </Badge>
                )}
              </div>
            </button>
            <button
              onClick={() => setActiveTab('movimenti')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'movimenti'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4" />
                Categorie Movimenti
                {categorieMovimenti && (
                  <Badge variant="gray" className="ml-2">
                    {getDataLength(categorieMovimenti)}
                  </Badge>
                )}
              </div>
            </button>
          </div>
        </Card.Body>
      </Card>

      {/* Contenuto Tab Attivo */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
      >
        <CategorieTab
          type={activeTab}
          data={activeTab === 'anagrafiche' ? categorieAnagrafiche : categorieMovimenti}
          isLoading={isLoading}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onToggle={handleToggle}
          onCreate={handleCreate}
        />
      </motion.div>

      {/* Modal Categoria */}
      {showModal && (
        <CategoriaModal
          isOpen={showModal}
          onClose={() => {
            console.log('Closing modal');
            setShowModal(false);
            setEditingCategoria(null);
          }}
          categoria={editingCategoria}
          type={modalType}
          onSave={handleSave}
          isLoading={isModalLoading}
        />
      )}
    </div>
  );
};

// Componente Tab Categorie
const CategorieTab = ({ 
  type, 
  data, 
  isLoading, 
  onEdit, 
  onDelete, 
  onToggle, 
  onCreate 
}) => {
  // Debug - rimuovi dopo aver risolto
  console.log('CategorieTab Debug:', { type, data, isLoading });
  console.log('Data type:', typeof data);
  console.log('Data length:', data?.length);
  console.log('Data content:', data);

  // Gestione diversi formati di risposta API
  const categorieList = React.useMemo(() => {
    if (!data) return [];
    
    // Se data è un array, restituiscilo direttamente
    if (Array.isArray(data)) {
      return data;
    }
    
    // Se data ha una proprietà 'data' che è un array
    if (data.data && Array.isArray(data.data)) {
      return data.data;
    }
    
    // Se data ha una proprietà 'categorie' che è un array
    if (data.categorie && Array.isArray(data.categorie)) {
      return data.categorie;
    }
    
    // Se data ha una proprietà 'results' che è un array
    if (data.results && Array.isArray(data.results)) {
      return data.results;
    }
    
    console.warn('Formato dati non riconosciuto:', data);
    return [];
  }, [data]);

  console.log('Processed categorieList:', categorieList);

  const columns = [
    {
      header: 'Nome',
      accessor: 'nome',
      cell: (categoria) => (
        <div className="flex items-center gap-3">
          <div
            className="w-4 h-4 rounded-full border"
            style={{ backgroundColor: categoria.colore || '#6b7280' }}
          />
          <div>
            <div className="font-medium text-gray-900">{categoria.nome}</div>
            {categoria.descrizione && (
              <div className="text-sm text-gray-500">{categoria.descrizione}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      header: 'Stato',
      accessor: 'attiva',
      cell: (categoria) => (
        <Badge variant={categoria.attiva ? 'success' : 'gray'}>
          {categoria.attiva ? 'Attiva' : 'Inattiva'}
        </Badge>
      ),
    },
    {
      header: 'Utilizzi',
      accessor: 'utilizzi',
      cell: (categoria) => (
        <div className="text-sm text-gray-600">
          {categoria.utilizzi || 0} {categoria.utilizzi === 1 ? 'utilizzo' : 'utilizzi'}
        </div>
      ),
    },
    {
      header: 'Data Creazione',
      accessor: 'created_at',
      cell: (categoria) => (
        <div className="text-sm text-gray-600">
          {categoria.created_at ? new Date(categoria.created_at).toLocaleDateString('it-IT') : '-'}
        </div>
      ),
    },
    {
      header: 'Azioni',
      accessor: 'actions',
      cell: (categoria) => (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(categoria, type)}
            className="text-blue-600 hover:text-blue-700"
          >
            <Edit className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggle(categoria, type)}
            className={categoria.attiva ? 'text-orange-600 hover:text-orange-700' : 'text-green-600 hover:text-green-700'}
          >
            {categoria.attiva ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(categoria, type)}
            className="text-red-600 hover:text-red-700"
            disabled={categoria.utilizzi > 0}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  if (isLoading) {
    return (
      <Card>
        <Card.Body className="flex items-center justify-center py-12">
          <LoadingSpinner />
          <span className="ml-3 text-gray-600">Caricamento categorie...</span>
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card>
      <Card.Header>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-900">
              Categorie {type === 'anagrafiche' ? 'Anagrafiche' : 'Movimenti'}
            </h3>
          </div>
          <Button onClick={() => onCreate(type)} className="gap-2">
            <Plus className="w-4 h-4" />
            Nuova Categoria
          </Button>
        </div>
      </Card.Header>
      <Card.Body>
        {!categorieList || categorieList.length === 0 ? (
          <div className="text-center py-12">
            <Tag className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Nessuna categoria trovata
            </h3>
            <p className="text-gray-600 mb-4">
              Inizia creando la tua prima categoria {type === 'anagrafiche' ? 'anagrafica' : 'movimento'}.
            </p>
            <Button onClick={() => onCreate(type)} className="gap-2">
              <Plus className="w-4 h-4" />
              Crea Prima Categoria
            </Button>
          </div>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                {columns.map((column, index) => (
                  <Table.HeaderCell key={index}>
                    {column.header}
                  </Table.HeaderCell>
                ))}
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {categorieList.map((item, index) => (
                <Table.Row key={item.id || index}>
                  {columns.map((column, colIndex) => (
                    <Table.Cell key={colIndex}>
                      {column.cell ? column.cell(item) : item[column.accessor]}
                    </Table.Cell>
                  ))}
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Card.Body>
    </Card>
  );
};

// Modal Categoria
const CategoriaModal = ({ 
  isOpen, 
  onClose, 
  categoria, 
  type, 
  onSave, 
  isLoading 
}) => {
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm({
    defaultValues: {
      nome: categoria?.nome || '',
      descrizione: categoria?.descrizione || '',
      colore: categoria?.colore || '#6366f1',
      attiva: categoria?.attiva !== undefined ? categoria.attiva : true,
    },
  });

  const watchedColore = watch('colore');

  React.useEffect(() => {
    if (categoria) {
      reset({
        nome: categoria.nome || '',
        descrizione: categoria.descrizione || '',
        colore: categoria.colore || '#6366f1',
        attiva: categoria.attiva !== undefined ? categoria.attiva : true,
      });
    } else {
      reset({
        nome: '',
        descrizione: '',
        colore: '#6366f1',
        attiva: true,
      });
    }
  }, [categoria, reset]);

  const onSubmit = (data) => {
    console.log('Submitting form data:', data);
    onSave(data);
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      size="md"
      title={`${categoria ? 'Modifica' : 'Nuova'} Categoria ${type === 'anagrafiche' ? 'Anagrafica' : 'Movimento'}`}
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-6">
          {/* Nome */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nome Categoria *
            </label>
            <input
              type="text"
              {...register('nome', { 
                required: 'Il nome è obbligatorio',
                minLength: { value: 2, message: 'Il nome deve essere di almeno 2 caratteri' }
              })}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.nome ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Es. Clienti Aziendali, Spese Ufficio, etc."
            />
            {errors.nome && (
              <p className="mt-1 text-sm text-red-600">{errors.nome.message}</p>
            )}
          </div>

          {/* Descrizione */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Descrizione
            </label>
            <textarea
              {...register('descrizione')}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Descrizione opzionale della categoria..."
            />
          </div>

          {/* Colore */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Colore Identificativo
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                {...register('colore')}
                className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
              />
              <div className="flex-1">
                <div
                  className="w-full h-10 rounded border border-gray-300 flex items-center px-3"
                  style={{ backgroundColor: watchedColore }}
                >
                  <span className="text-white text-sm font-medium drop-shadow">
                    Anteprima colore
                  </span>
                </div>
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Il colore aiuta a identificare rapidamente la categoria nelle liste
            </p>
          </div>

          {/* Stato Attiva */}
          <div className="flex items-center">
            <input
              type="checkbox"
              {...register('attiva')}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
            />
            <label className="ml-2 text-sm text-gray-700">
              Categoria attiva
            </label>
          </div>

          {/* Info utilizzi per modifica */}
          {categoria && categoria.utilizzi > 0 && (
            <Alert type="info">
              Questa categoria è utilizzata in <strong>{categoria.utilizzi}</strong> {categoria.utilizzi === 1 ? 'record' : 'record'}.
              Le modifiche si rifletteranno su tutti i record collegati.
            </Alert>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 justify-end mt-6 pt-6 border-t border-gray-200">
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
            disabled={isLoading}
          >
            {categoria ? 'Aggiorna' : 'Crea'} Categoria
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default CategoriePage;