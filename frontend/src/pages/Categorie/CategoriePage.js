// ==============================================================================
// FILE: frontend/src/pages/Categorie/CategoriePage.js
// POSIZIONE: frontend/src/pages/Categorie/CategoriePage.js (NUOVO FILE)
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
  Filter,
  TrendingUp,
  DollarSign
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

// Form Component per Categoria
const CategoriaForm = ({ categoria, onSave, onCancel, isLoading, type }) => {
  const { register, handleSubmit, formState: { errors }, reset, watch } = useForm({
    defaultValues: categoria || {
      nome: '',
      descrizione: '',
      colore: '#3B82F6',
      attiva: true,
      ...(type === 'anagrafiche' ? { tipo: 'cliente' } : { tipo_movimento: 'entrata' })
    }
  });

  React.useEffect(() => {
    if (categoria) {
      reset(categoria);
    }
  }, [categoria, reset]);

  const onSubmit = (data) => {
    onSave(data);
  };

  const watchedColor = watch('colore');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Nome */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Nome Categoria *
        </label>
        <input
          {...register('nome', { 
            required: 'Il nome è obbligatorio',
            maxLength: { value: 100, message: 'Massimo 100 caratteri' }
          })}
          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
            errors.nome ? 'border-red-300' : 'border-gray-300'
          }`}
          placeholder="Es. Clienti Premium, Spese Generali..."
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
          {...register('descrizione', {
            maxLength: { value: 255, message: 'Massimo 255 caratteri' }
          })}
          rows={3}
          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
            errors.descrizione ? 'border-red-300' : 'border-gray-300'
          }`}
          placeholder="Descrizione opzionale della categoria..."
        />
        {errors.descrizione && (
          <p className="mt-1 text-sm text-red-600">{errors.descrizione.message}</p>
        )}
      </div>

      {/* Tipo e Colore */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {type === 'anagrafiche' ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo Anagrafica
            </label>
            <select
              {...register('tipo', { required: 'Il tipo è obbligatorio' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="cliente">Cliente</option>
              <option value="fornitore">Fornitore</option>
              <option value="entrambi">Cliente/Fornitore</option>
            </select>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo Movimento
            </label>
            <select
              {...register('tipo_movimento', { required: 'Il tipo è obbligatorio' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="entrata">Entrata</option>
              <option value="uscita">Uscita</option>
              <option value="entrambi">Entrata/Uscita</option>
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Colore
          </label>
          <div className="flex items-center space-x-3">
            <input
              {...register('colore')}
              type="color"
              className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
            />
            <div 
              className="w-6 h-6 rounded-full border-2 border-gray-200"
              style={{ backgroundColor: watchedColor }}
            />
            <span className="text-sm text-gray-600">{watchedColor}</span>
          </div>
        </div>
      </div>

      {/* Stato attiva */}
      <div className="flex items-center">
        <input
          {...register('attiva')}
          type="checkbox"
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
        />
        <label className="ml-2 text-sm text-gray-700">
          Categoria attiva
        </label>
      </div>

      {/* Buttons */}
      <div className="flex justify-end space-x-3 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annulla
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading && <LoadingSpinner size="sm" className="mr-2" />}
          {categoria ? 'Aggiorna' : 'Crea'} Categoria
        </Button>
      </div>
    </form>
  );
};

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
    { refetchOnWindowFocus: false }
  );

  // Query categorie movimenti
  const { data: categorieMovimenti, isLoading: loadingMovimenti } = useQuery(
    ['categorie-movimenti', { search: searchTerm, attiva: showInactive ? undefined : true }],
    () => categorieMovimentiAPI.getAll({ 
      search: searchTerm || undefined,
      attiva: showInactive ? undefined : true 
    }),
    { refetchOnWindowFocus: false }
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

  const handleCreate = (type) => {
    setEditingCategoria(null);
    setModalType(type);
    setShowModal(true);
  };

  const handleEdit = (categoria, type) => {
    setEditingCategoria(categoria);
    setModalType(type);
    setShowModal(true);
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

  const isLoading = loadingAnagrafiche || loadingMovimenti;
  const isModalLoading = 
    createAnagraficaMutation.isLoading || 
    updateAnagraficaMutation.isLoading ||
    createMovimentoMutation.isLoading || 
    updateMovimentoMutation.isLoading;

  // Prepara i dati per la tabella
  const currentData = activeTab === 'anagrafiche' ? categorieAnagrafiche?.data || [] : categorieMovimenti?.data || [];
  
  const filteredData = currentData.filter(categoria => {
    const matchesSearch = !searchTerm || 
      categoria.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      categoria.descrizione?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesActive = showInactive || categoria.attiva;
    
    return matchesSearch && matchesActive;
  });

  // Colonne per la tabella
  const getColumns = (type) => [
    {
      key: 'nome',
      title: 'Nome',
      render: (categoria) => (
        <div className="flex items-center">
          <div
            className="w-4 h-4 rounded-full mr-3 border border-gray-200"
            style={{ backgroundColor: categoria.colore }}
          />
          <div>
            <div className="font-medium text-gray-900">{categoria.nome}</div>
            {categoria.descrizione && (
              <div className="text-sm text-gray-500">{categoria.descrizione}</div>
            )}
          </div>
        </div>
      )
    },
    {
      key: 'tipo',
      title: 'Tipo',
      render: (categoria) => {
        const tipo = type === 'anagrafiche' ? categoria.tipo : categoria.tipo_movimento;
        const colorMap = {
          cliente: 'blue',
          fornitore: 'green',
          entrambi: 'purple',
          entrata: 'green',
          uscita: 'red'
        };
        return (
          <Badge variant={colorMap[tipo] || 'gray'}>
            {tipo === 'entrambi' ? 
              (type === 'anagrafiche' ? 'Cliente/Fornitore' : 'Entrata/Uscita') : 
              tipo.charAt(0).toUpperCase() + tipo.slice(1)
            }
          </Badge>
        );
      }
    },
    {
      key: 'utilizzi',
      title: 'Utilizzi',
      render: (categoria) => (
        <span className="text-sm text-gray-600">
          {categoria.utilizzi || 0}
        </span>
      )
    },
    {
      key: 'stato',
      title: 'Stato',
      render: (categoria) => (
        <Badge variant={categoria.attiva ? 'green' : 'gray'}>
          {categoria.attiva ? 'Attiva' : 'Inattiva'}
        </Badge>
      )
    },
    {
      key: 'azioni',
      title: 'Azioni',
      render: (categoria) => (
        <div className="flex items-center space-x-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleToggle(categoria, type)}
            title={categoria.attiva ? 'Disattiva' : 'Attiva'}
          >
            {categoria.attiva ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleEdit(categoria, type)}
            title="Modifica"
          >
            <Edit className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleDelete(categoria, type)}
            title="Elimina"
            disabled={categoria.utilizzi > 0}
            className={categoria.utilizzi > 0 ? 'opacity-50 cursor-not-allowed' : 'text-red-600 hover:text-red-700'}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      )
    }
  ];

  // Statistiche
  const getStats = (data) => ({
    totali: data?.length || 0,
    attive: data?.filter(c => c.attiva).length || 0,
    utilizzi: data?.reduce((sum, c) => sum + (c.utilizzi || 0), 0) || 0
  });

  const statsAnagrafiche = getStats(categorieAnagrafiche?.data);
  const statsMovimenti = getStats(categorieMovimenti?.data);

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

      {/* Statistiche */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <Card.Body className="flex items-center">
            <div className="flex-shrink-0">
              <Users className="w-8 h-8 text-blue-600" />
            </div>
            <div className="ml-4">
              <div className="text-2xl font-bold text-gray-900">{statsAnagrafiche.totali}</div>
              <div className="text-sm text-gray-600">Categorie Anagrafiche</div>
              <div className="text-xs text-green-600">{statsAnagrafiche.attive} attive</div>
            </div>
          </Card.Body>
        </Card>

        <Card>
          <Card.Body className="flex items-center">
            <div className="flex-shrink-0">
              <TrendingUp className="w-8 h-8 text-green-600" />
            </div>
            <div className="ml-4">
              <div className="text-2xl font-bold text-gray-900">{statsMovimenti.totali}</div>
              <div className="text-sm text-gray-600">Categorie Movimenti</div>
              <div className="text-xs text-green-600">{statsMovimenti.attive} attive</div>
            </div>
          </Card.Body>
        </Card>

        <Card>
          <Card.Body className="flex items-center">
            <div className="flex-shrink-0">
              <DollarSign className="w-8 h-8 text-purple-600" />
            </div>
            <div className="ml-4">
              <div className="text-2xl font-bold text-gray-900">
                {statsAnagrafiche.utilizzi + statsMovimenti.utilizzi}
              </div>
              <div className="text-sm text-gray-600">Utilizzi Totali</div>
              <div className="text-xs text-gray-500">
                Ana: {statsAnagrafiche.utilizzi} | Mov: {statsMovimenti.utilizzi}
              </div>
            </div>
          </Card.Body>
        </Card>
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
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Mostra inattive</span>
              </label>
              
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm('');
                  setShowInactive(false);
                }}
              >
                <Filter className="w-4 h-4 mr-2" />
                Reset Filtri
              </Button>
            </div>
          </div>
        </Card.Body>
      </Card>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('anagrafiche')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'anagrafiche'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Users className="w-5 h-5 inline mr-2" />
            Categorie Anagrafiche
            <Badge variant="gray" className="ml-2">
              {filteredData.length}
            </Badge>
          </button>
          <button
            onClick={() => setActiveTab('movimenti')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'movimenti'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <TrendingUp className="w-5 h-5 inline mr-2" />
            Categorie Movimenti
            <Badge variant="gray" className="ml-2">
              {activeTab === 'movimenti' ? (categorieMovimenti?.data || []).filter(categoria => {
                const matchesSearch = !searchTerm || 
                  categoria.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  categoria.descrizione?.toLowerCase().includes(searchTerm.toLowerCase());
                const matchesActive = showInactive || categoria.attiva;
                return matchesSearch && matchesActive;
              }).length : 0}
            </Badge>
          </button>
        </nav>
      </div>

      {/* Content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card>
          <Card.Header>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">
                {activeTab === 'anagrafiche' ? 'Categorie Anagrafiche' : 'Categorie Movimenti'}
              </h3>
              <Button onClick={() => handleCreate(activeTab)}>
                <Plus className="w-4 h-4 mr-2" />
                Nuova Categoria
              </Button>
            </div>
          </Card.Header>
          
          <Card.Body className="p-0">
            {isLoading ? (
              <div className="flex justify-center items-center py-12">
                <LoadingSpinner size="lg" />
              </div>
            ) : (
              <Table
                columns={getColumns(activeTab)}
                data={filteredData}
                emptyMessage={`Nessuna categoria ${activeTab} trovata`}
              />
            )}
          </Card.Body>
        </Card>
      </motion.div>

      {/* Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingCategoria(null);
        }}
        title={`${editingCategoria ? 'Modifica' : 'Nuova'} Categoria ${modalType === 'anagrafiche' ? 'Anagrafica' : 'Movimento'}`}
        size="lg"
      >
        <CategoriaForm
          categoria={editingCategoria}
          onSave={handleSave}
          onCancel={() => {
            setShowModal(false);
            setEditingCategoria(null);
          }}
          isLoading={isModalLoading}
          type={modalType}
        />
      </Modal>
    </div>
  );
};

export default CategoriePage;