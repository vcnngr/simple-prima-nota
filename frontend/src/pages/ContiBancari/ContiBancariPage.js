// src/pages/ContiBancari/ContiBancariPage.js
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
  CreditCard,
  TrendingUp,
  TrendingDown,
  MoreVertical,
  Filter,
  Search,
  Download
} from 'lucide-react';
import { contiBancariAPI } from '../../services/api';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import Badge from '../../components/UI/Badge';
import Modal from '../../components/UI/Modal';
import Alert from '../../components/UI/Alert';
import LoadingSpinner from '../../components/UI/LoadingSpinner';
import Table from '../../components/UI/Table';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';

const ContiBancariPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showModal, setShowModal] = useState(false);
  const [editingConto, setEditingConto] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroStato, setFiltroStato] = useState('tutti');

  const queryClient = useQueryClient();

  // Auto-apri modal se specificato nei params
  React.useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setShowModal(true);
      setEditingConto(null);
    }
  }, [searchParams]);

  // Query per ottenere conti
  const { data: conti, isLoading, error } = useQuery(
    'conti-bancari',
    contiBancariAPI.getAll,
    {
      refetchOnWindowFocus: false,
    }
  );

  // Mutations
  const createMutation = useMutation(contiBancariAPI.create, {
    onSuccess: () => {
      queryClient.invalidateQueries('conti-bancari');
      setShowModal(false);
      setEditingConto(null);
      toast.success('Conto bancario creato con successo');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Errore nella creazione del conto');
    }
  });

  const updateMutation = useMutation(
    ({ id, data }) => contiBancariAPI.update(id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('conti-bancari');
        setShowModal(false);
        setEditingConto(null);
        toast.success('Conto bancario aggiornato con successo');
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Errore nell\'aggiornamento del conto');
      }
    }
  );

  const deleteMutation = useMutation(contiBancariAPI.delete, {
    onSuccess: () => {
      queryClient.invalidateQueries('conti-bancari');
      toast.success('Conto bancario eliminato con successo');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Errore nell\'eliminazione del conto');
    }
  });

  const toggleStatoMutation = useMutation(contiBancariAPI.toggleStato, {
    onSuccess: (data) => {
      queryClient.invalidateQueries('conti-bancari');
      toast.success(data.message);
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Errore nel cambio stato');
    }
  });

  // Filtri
  const contiFiltrati = React.useMemo(() => {
    if (!conti) return [];
    
    return conti.filter(conto => {
      const matchSearch = !searchTerm || 
        conto.nome_banca.toLowerCase().includes(searchTerm.toLowerCase()) ||
        conto.intestatario.toLowerCase().includes(searchTerm.toLowerCase()) ||
        conto.iban?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchStato = filtroStato === 'tutti' || 
        (filtroStato === 'attivi' && conto.attivo) ||
        (filtroStato === 'inattivi' && !conto.attivo);
      
      return matchSearch && matchStato;
    });
  }, [conti, searchTerm, filtroStato]);

  // Calcoli riassuntivi
  const riassunto = React.useMemo(() => {
    if (!conti) return { totaleConti: 0, saldoTotale: 0, contiAttivi: 0 };
    
    return {
      totaleConti: conti.length,
      saldoTotale: conti.reduce((sum, conto) => sum + parseFloat(conto.saldo_corrente || 0), 0),
      contiAttivi: conti.filter(conto => conto.attivo).length
    };
  }, [conti]);

  const handleEdit = (conto) => {
    setEditingConto(conto);
    setShowModal(true);
  };

  const handleDelete = async (conto) => {
    if (window.confirm(`Sei sicuro di voler eliminare il conto "${conto.nome_banca}"?`)) {
      deleteMutation.mutate(conto.id);
    }
  };

  const handleToggleStato = (conto) => {
    toggleStatoMutation.mutate(conto.id);
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
        Errore nel caricamento dei conti bancari: {error.message}
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conti Bancari</h1>
          <p className="mt-1 text-sm text-gray-600">
            Gestisci i tuoi conti correnti e monitora i saldi
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setEditingConto(null);
            setShowModal(true);
          }}
          className="mt-4 sm:mt-0"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuovo Conto
        </Button>
      </div>

      {/* Riassunto */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <Card.Body className="flex items-center">
            <div className="flex-shrink-0 p-3 bg-primary-100 rounded-lg">
              <CreditCard className="w-6 h-6 text-primary-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Totale Conti</p>
              <p className="text-2xl font-semibold text-gray-900">{riassunto.totaleConti}</p>
              <p className="text-xs text-gray-500">{riassunto.contiAttivi} attivi</p>
            </div>
          </Card.Body>
        </Card>

        <Card>
          <Card.Body className="flex items-center">
            <div className="flex-shrink-0 p-3 bg-success-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-success-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Saldo Totale</p>
              <p className={`text-2xl font-semibold ${
                riassunto.saldoTotale >= 0 ? 'text-success-600' : 'text-danger-600'
              }`}>
                €{riassunto.saldoTotale.toLocaleString('it-IT', { 
                  minimumFractionDigits: 2 
                })}
              </p>
            </div>
          </Card.Body>
        </Card>

        <Card>
          <Card.Body className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="flex-shrink-0 p-3 bg-gray-100 rounded-lg">
                <Filter className="w-6 h-6 text-gray-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Filtri Attivi</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {contiFiltrati.length}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="w-4 h-4" />
            </Button>
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="form-label">Cerca</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Nome banca, intestatario, IBAN..."
                      className="form-input pl-10"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
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
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchTerm('');
                      setFiltroStato('tutti');
                    }}
                  >
                    Reset Filtri
                  </Button>
                </div>
              </div>
            </Card.Body>
          </Card>
        </motion.div>
      )}

      {/* Tabella conti */}
      <Card>
        <Card.Header className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            Lista Conti ({contiFiltrati.length})
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
                <Table.HeaderCell>Banca</Table.HeaderCell>
                <Table.HeaderCell>Intestatario</Table.HeaderCell>
                <Table.HeaderCell>IBAN</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Saldo Iniziale</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Saldo Corrente</Table.HeaderCell>
                <Table.HeaderCell>Stato</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Azioni</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body loading={isLoading} emptyMessage="Nessun conto bancario trovato">
              {contiFiltrati.map((conto) => (
                <Table.Row key={conto.id}>
                  <Table.Cell>
                    <div className="flex items-center">
                      <div className="flex-shrink-0 w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-primary-600" />
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-900">
                          {conto.nome_banca}
                        </p>
                        <p className="text-xs text-gray-500">
                          {conto.numero_movimenti || 0} movimenti
                        </p>
                      </div>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <p className="text-sm text-gray-900">{conto.intestatario}</p>
                  </Table.Cell>
                  <Table.Cell>
                    <p className="text-sm font-mono text-gray-600">
                      {conto.iban || '-'}
                    </p>
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    <p className="text-sm text-gray-900">
                      €{parseFloat(conto.saldo_iniziale || 0).toLocaleString('it-IT', { 
                        minimumFractionDigits: 2 
                      })}
                    </p>
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    <p className={`text-sm font-semibold ${
                      parseFloat(conto.saldo_corrente || 0) >= 0 
                        ? 'text-success-600' 
                        : 'text-danger-600'
                    }`}>
                      €{parseFloat(conto.saldo_corrente || 0).toLocaleString('it-IT', { 
                        minimumFractionDigits: 2 
                      })}
                    </p>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge 
                      variant={conto.attivo ? 'success' : 'gray'}
                      className="flex items-center"
                    >
                      <span className={`w-2 h-2 rounded-full mr-1 ${
                        conto.attivo ? 'bg-success-500' : 'bg-gray-400'
                      }`} />
                      {conto.attivo ? 'Attivo' : 'Inattivo'}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    <div className="flex items-center justify-end space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(conto)}
                        title="Modifica"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleStato(conto)}
                        title={conto.attivo ? 'Disattiva' : 'Attiva'}
                      >
                        {conto.attivo ? (
                          <ToggleRight className="w-4 h-4 text-success-600" />
                        ) : (
                          <ToggleLeft className="w-4 h-4 text-gray-400" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(conto)}
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
      <ContoModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingConto(null);
          setSearchParams({});
        }}
        conto={editingConto}
        onSave={(data) => {
          if (editingConto) {
            updateMutation.mutate({ id: editingConto.id, data });
          } else {
            createMutation.mutate(data);
          }
        }}
        isLoading={createMutation.isLoading || updateMutation.isLoading}
      />
    </div>
  );
};

// Componente Modal per Form Conto
const ContoModal = ({ isOpen, onClose, conto, onSave, isLoading }) => {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm();

  React.useEffect(() => {
    if (conto) {
      reset(conto);
    } else {
      reset({
        nome_banca: '',
        intestatario: '',
        iban: '',
        saldo_iniziale: 0,
        attivo: true
      });
    }
  }, [conto, reset]);

  const onSubmit = (data) => {
    onSave(data);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={conto ? 'Modifica Conto Bancario' : 'Nuovo Conto Bancario'}
      size="md"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="form-label">Nome Banca *</label>
          <input
            type="text"
            className={`form-input ${errors.nome_banca ? 'border-danger-500' : ''}`}
            placeholder="es. Banca Intesa"
            {...register('nome_banca', {
              required: 'Nome banca è richiesto',
              maxLength: {
                value: 100,
                message: 'Nome banca non può superare 100 caratteri'
              }
            })}
          />
          {errors.nome_banca && (
            <p className="form-error">{errors.nome_banca.message}</p>
          )}
        </div>

        <div>
          <label className="form-label">Intestatario *</label>
          <input
            type="text"
            className={`form-input ${errors.intestatario ? 'border-danger-500' : ''}`}
            placeholder="Nome e cognome dell'intestatario"
            {...register('intestatario', {
              required: 'Intestatario è richiesto',
              maxLength: {
                value: 100,
                message: 'Intestatario non può superare 100 caratteri'
              }
            })}
          />
          {errors.intestatario && (
            <p className="form-error">{errors.intestatario.message}</p>
          )}
        </div>

        <div>
          <label className="form-label">IBAN</label>
          <input
            type="text"
            className={`form-input font-mono ${errors.iban ? 'border-danger-500' : ''}`}
            placeholder="IT60 X054 2811 1010 0000 0123 456"
            {...register('iban', {
              pattern: {
                value: /^[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}([A-Z0-9]?){0,16}$/,
                message: 'IBAN non valido'
              }
            })}
          />
          {errors.iban && (
            <p className="form-error">{errors.iban.message}</p>
          )}
          <p className="text-xs text-gray-500 mt-1">
            Opzionale. Inserire senza spazi.
          </p>
        </div>

        <div>
          <label className="form-label">Saldo Iniziale</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">€</span>
            <input
              type="number"
              step="0.01"
              className={`form-input pl-8 ${errors.saldo_iniziale ? 'border-danger-500' : ''}`}
              placeholder="0.00"
              {...register('saldo_iniziale', {
                valueAsNumber: true,
                min: {
                  value: -999999999,
                  message: 'Saldo non valido'
                },
                max: {
                  value: 999999999,
                  message: 'Saldo troppo alto'
                }
              })}
            />
          </div>
          {errors.saldo_iniziale && (
            <p className="form-error">{errors.saldo_iniziale.message}</p>
          )}
        </div>

        <div className="flex items-center">
          <input
            id="attivo"
            type="checkbox"
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            {...register('attivo')}
          />
          <label htmlFor="attivo" className="ml-2 block text-sm text-gray-700">
            Conto attivo
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
            {conto ? 'Aggiorna' : 'Crea'} Conto
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default ContiBancariPage;
