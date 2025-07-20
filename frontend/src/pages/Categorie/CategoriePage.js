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