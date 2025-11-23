// src/pages/Commercialista/ClientReportsPage.js
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  FileText,
  Download,
  Calendar,
  Filter,
  Eye,
  FileSpreadsheet,
  FileType,
  TrendingUp,
  TrendingDown,
  Settings
} from 'lucide-react';
import { commercialistiAPI } from '../../services/api';
import Button from '../../components/UI/Button';
import Card from '../../components/UI/Card';
import LoadingSpinner from '../../components/UI/LoadingSpinner';
import toast from 'react-hot-toast';

const ClientReportsPage = () => {
  const { userId } = useParams();
  const [clientInfo, setClientInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  const [config, setConfig] = useState({
    export_type: 'commercialista',
    data_inizio: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    data_fine: new Date().toISOString().split('T')[0],
    tutto_storico: false,
    conto_id: '',
    ordina_per: 'data',
    ordine: 'desc',
    campi_personalizzati: []
  });

  const [conti, setConti] = useState([]);

  useEffect(() => {
    loadClientInfo();
  }, [userId]);

  const loadClientInfo = async () => {
    try {
      setIsLoading(true);
      const response = await commercialistiAPI.getClientDetails(userId);
      setClientInfo(response.cliente);
      setConti(response.conti || []);
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Errore nel caricamento dati cliente';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGeneratePreview = async () => {
    try {
      setIsGenerating(true);
      const response = await commercialistiAPI.exportClientData(userId, {
        ...config,
        formato: 'json'
      });
      setPreviewData(response);
      toast.success('Anteprima generata con successo');
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Errore nella generazione anteprima';
      toast.error(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async (formato) => {
    try {
      setIsGenerating(true);
      const response = await commercialistiAPI.exportClientData(userId, {
        ...config,
        formato: 'json'
      });

      // Convert to desired format
      let content, filename, mimeType;

      if (formato === 'csv') {
        content = convertToCSV(response.data);
        filename = `report_${clientInfo.username}_${new Date().toISOString().split('T')[0]}.csv`;
        mimeType = 'text/csv;charset=utf-8;';
      } else if (formato === 'xlsx') {
        toast.info('Formato Excel: funzionalità in sviluppo. Usa CSV per ora.');
        setIsGenerating(false);
        return;
      } else if (formato === 'pdf') {
        toast.info('Formato PDF: funzionalità in sviluppo. Usa CSV per ora.');
        setIsGenerating(false);
        return;
      }

      // Download file
      const blob = new Blob([content], { type: mimeType });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);

      toast.success(`Report scaricato: ${filename}`);
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Errore nel download del report';
      toast.error(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const convertToCSV = (data) => {
    if (!data || data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row =>
        headers.map(field => {
          const value = row[field] || '';
          return `"${String(value).replace(/"/g, '""')}"`;
        }).join(',')
      )
    ];

    return csvRows.join('\n');
  };

  const reportTypes = [
    {
      id: 'commercialista',
      name: 'Estratto Completo',
      description: 'Tutti i dettagli per dichiarazioni fiscali',
      icon: FileText,
      color: 'blue'
    },
    {
      id: 'semplice',
      name: 'Estratto Semplice',
      description: 'Solo movimenti base',
      icon: FileText,
      color: 'green'
    },
    {
      id: 'entrate',
      name: 'Solo Entrate',
      description: 'Tutti i ricavi del periodo',
      icon: TrendingUp,
      color: 'emerald'
    },
    {
      id: 'uscite',
      name: 'Solo Uscite',
      description: 'Tutte le spese del periodo',
      icon: TrendingDown,
      color: 'red'
    },
    {
      id: 'custom',
      name: 'Export Personalizzato',
      description: 'Scegli esattamente quali campi esportare',
      icon: Settings,
      color: 'purple'
    }
  ];

  const availableFields = [
    { id: 'data', label: 'Data' },
    { id: 'descrizione', label: 'Descrizione' },
    { id: 'importo', label: 'Importo' },
    { id: 'tipo', label: 'Tipo (Entrata/Uscita)' },
    { id: 'categoria', label: 'Categoria' },
    { id: 'note', label: 'Note' },
    { id: 'anagrafica_nome', label: 'Nome Anagrafica' },
    { id: 'anagrafica_piva', label: 'P.IVA Anagrafica' },
    { id: 'anagrafica_email', label: 'Email Anagrafica' },
    { id: 'tipologia_nome', label: 'Tipologia Anagrafica' },
    { id: 'conto_nome', label: 'Conto Bancario' }
  ];

  const toggleField = (fieldId) => {
    setConfig(prev => ({
      ...prev,
      campi_personalizzati: prev.campi_personalizzati.includes(fieldId)
        ? prev.campi_personalizzati.filter(f => f !== fieldId)
        : [...prev.campi_personalizzati, fieldId]
    }));
  };

  const canExport = () => {
    if (config.export_type === 'custom') {
      return config.campi_personalizzati.length > 0;
    }
    return true;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!clientInfo) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Cliente non trovato</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Link
        to={`/commercialista/clienti/${userId}`}
        className="inline-flex items-center text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Torna ai Dettagli Cliente
      </Link>

      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Report per {clientInfo.username}
            </h1>
            <p className="text-gray-600">{clientInfo.email}</p>
          </div>
          <div className="h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center">
            <FileText className="h-8 w-8 text-blue-600" />
          </div>
        </div>
      </div>

      {/* Report Type Selection */}
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-gray-900">Tipo di Report</h2>
        </Card.Header>
        <Card.Body>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {reportTypes.map((type) => {
              const Icon = type.icon;
              const isSelected = config.export_type === type.id;

              return (
                <button
                  key={type.id}
                  onClick={() => setConfig({ ...config, export_type: type.id })}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${
                    isSelected
                      ? `border-${type.color}-500 bg-${type.color}-50`
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Icon className={`h-8 w-8 mb-2 ${
                    isSelected ? `text-${type.color}-600` : 'text-gray-400'
                  }`} />
                  <h3 className={`font-semibold mb-1 ${
                    isSelected ? `text-${type.color}-900` : 'text-gray-900'
                  }`}>
                    {type.name}
                  </h3>
                  <p className="text-sm text-gray-600">{type.description}</p>
                </button>
              );
            })}
          </div>
        </Card.Body>
      </Card>

      {/* Custom Fields Selection */}
      {config.export_type === 'custom' && (
        <Card>
          <Card.Header>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <Settings className="h-5 w-5 mr-2" />
              Seleziona Campi da Esportare
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Selezionati: {config.campi_personalizzati.length} campi
            </p>
          </Card.Header>
          <Card.Body>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {availableFields.map((field) => {
                const isSelected = config.campi_personalizzati.includes(field.id);
                return (
                  <label
                    key={field.id}
                    className={`flex items-center p-3 rounded-lg border-2 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleField(field.id)}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 mr-3"
                    />
                    <span className={`font-medium ${
                      isSelected ? 'text-purple-900' : 'text-gray-900'
                    }`}>
                      {field.label}
                    </span>
                  </label>
                );
              })}
            </div>
            {config.campi_personalizzati.length === 0 && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ⚠️ Seleziona almeno un campo per procedere con l'export
                </p>
              </div>
            )}
          </Card.Body>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <Filter className="h-5 w-5 mr-2" />
            Filtri
          </h2>
        </Card.Header>
        <Card.Body>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Tutto Storico */}
            <div className="col-span-full">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={config.tutto_storico}
                  onChange={(e) => setConfig({ ...config, tutto_storico: e.target.checked })}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Tutto lo storico (ignora filtri data)
                </span>
              </label>
            </div>

            {/* Data Inizio */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="inline h-4 w-4 mr-1" />
                Data Inizio
              </label>
              <input
                type="date"
                value={config.data_inizio}
                onChange={(e) => setConfig({ ...config, data_inizio: e.target.value })}
                disabled={config.tutto_storico}
                className="form-input"
              />
            </div>

            {/* Data Fine */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="inline h-4 w-4 mr-1" />
                Data Fine
              </label>
              <input
                type="date"
                value={config.data_fine}
                onChange={(e) => setConfig({ ...config, data_fine: e.target.value })}
                disabled={config.tutto_storico}
                className="form-input"
              />
            </div>

            {/* Conto */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Conto Bancario
              </label>
              <select
                value={config.conto_id}
                onChange={(e) => setConfig({ ...config, conto_id: e.target.value })}
                className="form-select"
              >
                <option value="">Tutti i conti</option>
                {conti.map((conto) => (
                  <option key={conto.id} value={conto.id}>
                    {conto.nome_banca} - {conto.intestatario}
                  </option>
                ))}
              </select>
            </div>

            {/* Ordina per */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ordina per
              </label>
              <select
                value={config.ordina_per}
                onChange={(e) => setConfig({ ...config, ordina_per: e.target.value })}
                className="form-select"
              >
                <option value="data">Data</option>
                <option value="importo">Importo</option>
                <option value="anagrafica">Anagrafica</option>
              </select>
            </div>

            {/* Ordine */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ordine
              </label>
              <select
                value={config.ordine}
                onChange={(e) => setConfig({ ...config, ordine: e.target.value })}
                className="form-select"
              >
                <option value="desc">Decrescente</option>
                <option value="asc">Crescente</option>
              </select>
            </div>
          </div>
        </Card.Body>
      </Card>

      {/* Actions */}
      <Card>
        <Card.Body>
          <div className="flex flex-col sm:flex-row gap-4">
            <Button
              variant="outline"
              onClick={handleGeneratePreview}
              loading={isGenerating}
              disabled={isGenerating || !canExport()}
              className="flex-1"
            >
              <Eye className="h-4 w-4 mr-2" />
              Anteprima
            </Button>
            <Button
              variant="primary"
              onClick={() => handleDownload('csv')}
              loading={isGenerating}
              disabled={isGenerating || !canExport()}
              className="flex-1"
            >
              <Download className="h-4 w-4 mr-2" />
              Scarica CSV
            </Button>
            <Button
              variant="success"
              onClick={() => handleDownload('xlsx')}
              loading={isGenerating}
              disabled={isGenerating || !canExport()}
              className="flex-1"
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Scarica Excel
            </Button>
            <Button
              variant="danger"
              onClick={() => handleDownload('pdf')}
              loading={isGenerating}
              disabled={isGenerating || !canExport()}
              className="flex-1"
            >
              <FileType className="h-4 w-4 mr-2" />
              Scarica PDF
            </Button>
          </div>
        </Card.Body>
      </Card>

      {/* Preview */}
      {previewData && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card>
            <Card.Header>
              <h2 className="text-lg font-semibold text-gray-900">Anteprima</h2>
              <p className="text-sm text-gray-600 mt-1">
                {previewData.metadata.numero_record} movimenti trovati
              </p>
            </Card.Header>
            <Card.Body>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {previewData.preview.length > 0 &&
                        Object.keys(previewData.preview[0]).map((key) => (
                          <th
                            key={key}
                            className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"
                          >
                            {key.replace(/_/g, ' ')}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {previewData.preview.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        {Object.values(row).map((value, i) => (
                          <td key={i} className="px-4 py-3 text-sm text-gray-900">
                            {value}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {previewData.metadata.numero_record > 10 && (
                <p className="mt-4 text-sm text-gray-600 text-center">
                  Mostrando 10 di {previewData.metadata.numero_record} record
                </p>
              )}
            </Card.Body>
          </Card>
        </motion.div>
      )}
    </div>
  );
};

export default ClientReportsPage;
