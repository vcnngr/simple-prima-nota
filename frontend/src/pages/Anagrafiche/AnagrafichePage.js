// src/pages/Anagrafiche/AnagrafichePage.js
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
  Tag
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

const AnagrafichePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showModal, setShowModal] = useState(false);
  const [editingAnagrafica, setEditingAnagrafica] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('tutti');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroStato, setFiltroStato] = useState('tutti');

  const queryClient = useQueryClient();

  // Auto-apri modal se specificato nei params
  React.useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setShowModal(true);
      setEditingAnagrafica(null);
    }
  }, [searchParams]);

  // Query per ottenere anagrafiche
  const { data: anagrafiche, isLoading, error } = useQuery(
    ['anagrafiche', { tipo: filtroTipo !== 'tutti' ? filtroTipo : undefined, search: searchTerm, attivo: filtroStato !== 'tutti' ? filtroStato === 'attivi' : undefined, categoria: filtroCategoria || undefined }],
    () => anagraficheAPI.getAll({
      tipo: filtroTipo !== 'tutti' ? filtroTipo : undefined,
      search: searchTerm || undefined,
      attivo: filtroStato !== 'tutti' ? filtroStato === 'attivi' : undefined,
      categoria: filtroCategoria || undefined
    }),
    {
      refetchOnWindowFocus: false,
      keepPreviousData: true
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

  // Mutations
  const createMutation = useMutation(anagraficheAPI.create, {
    onSuccess: () => {
      queryClient.invalidateQueries('anagrafiche');
      queryClient.invalidateQueries('anagrafiche-categorie');
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

  // Calcoli riassuntivi
  const riassunto = React.useMemo(() => {
    if (!anagrafiche) return { totale: 0, clienti: 0, fornitori: 0, attive: 0 };
    
    return {
      totale: anagrafiche.length,
      clienti: anagrafiche.filter(a => a.tipo === 'Cliente').length,
      fornitori: anagrafiche.filter(a => a.tipo === 'Fornitore').length,
      attive: anagrafiche.filter(a => a.attivo).length
    };
  }, [anagrafiche]);

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

  const resetFiltri = () => {
    setSearchTerm('');
    setFiltroTipo('tutti');
    setFiltroCategoria('');
    setFiltroStato('tutti');
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
            Gestisci clienti e fornitori
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

      {/* Riassunto */}
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

        <Card>
          <Card.Body className="flex items-center">
            <div className="flex-shrink-0 p-3 bg-success-100 rounded-lg">
              <UserPlus className="w-6 h-6 text-success-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Clienti</p>
              <p className="text-2xl font-semibold text-success-600">{riassunto.clienti}</p>
            </div>
          </Card.Body>
        </Card>

        <Card>
          <Card.Body className="flex items-center">
            <div className="flex-shrink-0 p-3 bg-warning-100 rounded-lg">
              <Building className="w-6 h-6 text-warning-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Fornitori</p>
              <p className="text-2xl font-semibold text-warning-600">{riassunto.fornitori}</p>
            </div>
          </Card.Body>
        </Card>

        <Card>
          <Card.Body className="flex items-center">
            <div className="flex-shrink-0 p-3 bg-gray-100 rounded-lg">
              <Tag className="w-6 h-6 text-gray-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Categorie</p>
              <p className="text-2xl font-semibold text-gray-900">{categorie?.length || 0}</p>
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
                  <label className="form-label">Tipo</label>
                  <select
                    className="form-select"
                    value={filtroTipo}
                    onChange={(e) => setFiltroTipo(e.target.value)}
                  >
                    <option value="tutti">Tutti</option>
                    <option value="Cliente">Solo Clienti</option>
                    <option value="Fornitore">Solo Fornitori</option>
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

      {/* Tabella anagrafiche */}
      <Card>
        <Card.Header className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            Lista Anagrafiche ({anagrafiche?.length || 0})
          </h3>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-1" />
            Esporta
          </Button>
        </Card.Header>
        <Card.Body className="p-0">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Nome</Table.HeaderCell>
                <Table.HeaderCell>Tipo</Table.HeaderCell>
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
              {anagrafiche?.map((anagrafica) => (
                <Table.Row key={anagrafica.id}>
                  <Table.Cell>
                    <div className="flex items-center">
                      <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                        anagrafica.tipo === 'Cliente' ? 'bg-success-100' : 'bg-warning-100'
                      }`}>
                        {anagrafica.tipo === 'Cliente' ? (
                          <UserPlus className={`w-5 h-5 ${
                            anagrafica.tipo === 'Cliente' ? 'text-success-600' : 'text-warning-600'
                          }`} />
                        ) : (
                          <Building className={`w-5 h-5 ${
                            anagrafica.tipo === 'Cliente' ? 'text-success-600' : 'text-warning-600'
                          }`} />
                        )}
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
                    <Badge 
                      variant={anagrafica.tipo === 'Cliente' ? 'success' : 'warning'}
                    >
                      {anagrafica.tipo}
                    </Badge>
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
              ))}
            </Table.Body>
          </Table>
        </Card.Body>
      </Card>

      {/* Modal Form */}
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
      />
    </div>
  );
};

// Componente Modal per Form Anagrafica
const AnagraficaModal = ({ isOpen, onClose, anagrafica, onSave, isLoading }) => {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors }
  } = useForm();

  const watchTipo = watch('tipo');

  React.useEffect(() => {
    if (anagrafica) {
      reset(anagrafica);
    } else {
      reset({
        nome: '',
        tipo: 'Cliente',
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
    onSave(data);
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
          <div>
            <label className="form-label">Nome *</label>
            <input
              type="text"
              className={`form-input ${errors.nome ? 'border-danger-500' : ''}`}
              placeholder="Nome cliente/fornitore"
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

          <div>
            <label className="form-label">Tipo *</label>
            <select
              className={`form-select ${errors.tipo ? 'border-danger-500' : ''}`}
              {...register('tipo', { required: 'Tipo è richiesto' })}
            >
              <option value="Cliente">Cliente</option>
              <option value="Fornitore">Fornitore</option>
            </select>
            {errors.tipo && (
              <p className="form-error">{errors.tipo.message}</p>
            )}
          </div>
        </div>

        <div>
          <label className="form-label">Categoria</label>
          <input
            type="text"
            className="form-input"
            placeholder={`Categoria ${watchTipo?.toLowerCase() || 'anagrafica'} (es. ${watchTipo === 'Cliente' ? 'Azienda, Privato' : 'Materiali, Servizi'})`}
            {...register('categoria', {
              maxLength: {
                value: 50,
                message: 'Categoria non può superare 50 caratteri'
              }
            })}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

        <div>
          <label className="form-label">Indirizzo</label>
          <textarea
            className="form-textarea"
            rows={2}
            placeholder="Via, Città, CAP"
            {...register('indirizzo')}
          />
        </div>

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
