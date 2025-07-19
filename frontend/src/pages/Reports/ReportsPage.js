// src/pages/Reports/ReportsPage.js
import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { motion } from 'framer-motion';
import {
  FileText,
  Download,
  Calendar,
  Filter,
  BarChart3,
  PieChart as PieChartIcon,
  TrendingUp,
  FileSpreadsheet,
  FileType,
  Eye,
  Settings,
  RefreshCw
} from 'lucide-react';
import { reportsAPI, contiBancariAPI, anagraficheAPI } from '../../services/api';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import Badge from '../../components/UI/Badge';
import Alert from '../../components/UI/Alert';
import LoadingSpinner from '../../components/UI/LoadingSpinner';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const ReportsPage = () => {
  const [activeTab, setActiveTab] = useState('estratto-conto');
  const [reportData, setReportData] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Query per dati dropdown
  const { data: conti } = useQuery('conti-attivi', contiBancariAPI.getAttivi);
  const { data: anagrafiche } = useQuery('anagrafiche-attive', anagraficheAPI.getAttive);

  const tabs = [
    {
      id: 'estratto-conto',
      name: 'Estratto Conto',
      icon: FileText,
      description: 'Report dettagliato movimenti per periodo'
    },
    {
      id: 'movimenti-anagrafica',
      name: 'Per Anagrafica',
      icon: BarChart3,
      description: 'Analisi movimenti per cliente/fornitore'
    },
    {
      id: 'entrate-uscite',
      name: 'Entrate vs Uscite',
      icon: TrendingUp,
      description: 'Confronto entrate e uscite per periodo'
    },
    {
      id: 'bilancio-mensile',
      name: 'Bilancio Mensile',
      icon: PieChartIcon,
      description: 'Riepilogo mensile per anno'
    }
  ];

  const handleGenerateReport = async (formData, endpoint) => {
    try {
      setIsGenerating(true);
      const response = await reportsAPI[endpoint](formData);
      setReportData(response);
      toast.success('Report generato con successo');
    } catch (error) {
      toast.error('Errore nella generazione del report');
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExport = async (format, endpoint, formData) => {
    try {
      let response;
      const filename = `${activeTab}_${new Date().toISOString().split('T')[0]}`;
      
      if (format === 'csv') {
        response = await reportsAPI.export(endpoint, formData);
        downloadFile(response, `${filename}.csv`, 'text/csv');
      } else if (format === 'excel') {
        response = await reportsAPI.exportExcel(endpoint, formData);
        downloadFile(response, `${filename}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      } else if (format === 'pdf') {
        response = await reportsAPI.exportPDF(endpoint, formData);
        downloadFile(response, `${filename}.pdf`, 'application/pdf');
      }
      
      toast.success(`Export ${format.toUpperCase()} completato`);
    } catch (error) {
      toast.error(`Errore nell'export ${format.toUpperCase()}`);
      console.error(error);
    }
  };

  const downloadFile = (blob, filename, mimeType) => {
    const url = window.URL.createObjectURL(new Blob([blob], { type: mimeType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="mt-1 text-sm text-gray-600">
            Genera report dettagliati e analisi dei tuoi dati contabili
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex space-x-3">
          <Button
            variant="outline"
            onClick={() => setReportData(null)}
            className="flex items-center"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Reset
          </Button>
          <Button
            variant="outline"
            className="flex items-center"
          >
            <Settings className="w-4 h-4 mr-1" />
            Impostazioni
          </Button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <Card>
        <Card.Body className="p-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setReportData(null);
                  }}
                  className={`p-6 text-left transition-all duration-200 ${
                    isActive 
                      ? 'bg-primary-50 border-b-2 border-primary-600' 
                      : 'hover:bg-gray-50 border-b-2 border-transparent'
                  }`}
                >
                  <div className="flex items-center mb-2">
                    <Icon className={`w-5 h-5 mr-2 ${
                      isActive ? 'text-primary-600' : 'text-gray-400'
                    }`} />
                    <span className={`font-medium ${
                      isActive ? 'text-primary-900' : 'text-gray-900'
                    }`}>
                      {tab.name}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">
                    {tab.description}
                  </p>
                </button>
              );
            })}
          </div>
        </Card.Body>
      </Card>

      {/* Report Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form Panel */}
        <div className="lg:col-span-1">
          <Card>
            <Card.Header>
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <Filter className="w-5 h-5 mr-2" />
                Parametri Report
              </h3>
            </Card.Header>
            <Card.Body>
              {activeTab === 'estratto-conto' && (
                <EstrattoConto
                  onGenerate={handleGenerateReport}
                  onExport={handleExport}
                  isLoading={isGenerating}
                  conti={conti}
                />
              )}
              {activeTab === 'movimenti-anagrafica' && (
                <MovimentiAnagrafica
                  onGenerate={handleGenerateReport}
                  onExport={handleExport}
                  isLoading={isGenerating}
                  anagrafiche={anagrafiche}
                />
              )}
              {activeTab === 'entrate-uscite' && (
                <EntrateUscite
                  onGenerate={handleGenerateReport}
                  onExport={handleExport}
                  isLoading={isGenerating}
                  conti={conti}
                />
              )}
              {activeTab === 'bilancio-mensile' && (
                <BilancioMensile
                  onGenerate={handleGenerateReport}
                  onExport={handleExport}
                  isLoading={isGenerating}
                  conti={conti}
                />
              )}
            </Card.Body>
          </Card>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2">
          <Card>
            <Card.Header>
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <Eye className="w-5 h-5 mr-2" />
                Risultati Report
              </h3>
            </Card.Header>
            <Card.Body>
              {!reportData ? (
                <div className="text-center py-12">
                  <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Nessun report generato
                  </h3>
                  <p className="text-gray-600">
                    Compila i parametri e clicca su "Genera Report" per visualizzare i risultati
                  </p>
                </div>
              ) : isGenerating ? (
                <div className="text-center py-12">
                  <LoadingSpinner size="lg" />
                  <p className="text-gray-600 mt-4">Generazione report in corso...</p>
                </div>
              ) : (
                <ReportResults data={reportData} type={activeTab} />
              )}
            </Card.Body>
          </Card>
        </div>
      </div>
    </div>
  );
};

// Componenti di form per ogni tipo di report
const EstrattoConto = ({ onGenerate, onExport, isLoading, conti }) => {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      data_inizio: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
      data_fine: new Date().toISOString().split('T')[0],
      conto_id: ''
    }
  });

  const onSubmit = (data) => {
    onGenerate(data, 'getEstrattoConto');
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="form-label">Data Inizio *</label>
        <input
          type="date"
          className={`form-input ${errors.data_inizio ? 'border-danger-500' : ''}`}
          {...register('data_inizio', { required: 'Data inizio è richiesta' })}
        />
        {errors.data_inizio && (
          <p className="form-error">{errors.data_inizio.message}</p>
        )}
      </div>

      <div>
        <label className="form-label">Data Fine *</label>
        <input
          type="date"
          className={`form-input ${errors.data_fine ? 'border-danger-500' : ''}`}
          {...register('data_fine', { required: 'Data fine è richiesta' })}
        />
        {errors.data_fine && (
          <p className="form-error">{errors.data_fine.message}</p>
        )}
      </div>

      <div>
        <label className="form-label">Conto Bancario</label>
        <select className="form-select" {...register('conto_id')}>
          <option value="">Tutti i conti</option>
          {conti?.map(conto => (
            <option key={conto.id} value={conto.id}>
              {conto.nome_banca} - {conto.intestatario}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3 pt-4 border-t border-gray-200">
        <Button
          type="submit"
          variant="primary"
          loading={isLoading}
          className="w-full"
        >
          <FileText className="w-4 h-4 mr-2" />
          Genera Report
        </Button>

        <div className="grid grid-cols-3 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleSubmit(data => onExport('csv', '/reports/estratto-conto', data))()}
            disabled={isLoading}
          >
            <Download className="w-3 h-3 mr-1" />
            CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleSubmit(data => onExport('excel', '/reports/estratto-conto', data))()}
            disabled={isLoading}
          >
            <FileSpreadsheet className="w-3 h-3 mr-1" />
            Excel
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleSubmit(data => onExport('pdf', '/reports/estratto-conto', data))()}
            disabled={isLoading}
          >
            <FileType className="w-3 h-3 mr-1" />
            PDF
          </Button>
        </div>
      </div>
    </form>
  );
};

const MovimentiAnagrafica = ({ onGenerate, onExport, isLoading, anagrafiche }) => {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      data_inizio: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
      data_fine: new Date().toISOString().split('T')[0],
      anagrafica_id: '',
      tipo: ''
    }
  });

  const onSubmit = (data) => {
    onGenerate(data, 'getMovimentiAnagrafica');
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="form-label">Data Inizio *</label>
        <input
          type="date"
          className={`form-input ${errors.data_inizio ? 'border-danger-500' : ''}`}
          {...register('data_inizio', { required: 'Data inizio è richiesta' })}
        />
      </div>

      <div>
        <label className="form-label">Data Fine *</label>
        <input
          type="date"
          className={`form-input ${errors.data_fine ? 'border-danger-500' : ''}`}
          {...register('data_fine', { required: 'Data fine è richiesta' })}
        />
      </div>

      <div>
        <label className="form-label">Tipo Movimento</label>
        <select className="form-select" {...register('tipo')}>
          <option value="">Tutti</option>
          <option value="Entrata">Solo Entrate</option>
          <option value="Uscita">Solo Uscite</option>
        </select>
      </div>

      <div>
        <label className="form-label">Anagrafica Specifica</label>
        <select className="form-select" {...register('anagrafica_id')}>
          <option value="">Tutte le anagrafiche</option>
          {anagrafiche?.map(anagrafica => (
            <option key={anagrafica.id} value={anagrafica.id}>
              {anagrafica.nome} ({anagrafica.tipo})
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3 pt-4 border-t border-gray-200">
        <Button
          type="submit"
          variant="primary"
          loading={isLoading}
          className="w-full"
        >
          <BarChart3 className="w-4 h-4 mr-2" />
          Genera Report
        </Button>

        <div className="grid grid-cols-3 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleSubmit(data => onExport('csv', '/reports/movimenti-anagrafica', data))()}
            disabled={isLoading}
          >
            CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleSubmit(data => onExport('excel', '/reports/movimenti-anagrafica', data))()}
            disabled={isLoading}
          >
            Excel
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleSubmit(data => onExport('pdf', '/reports/movimenti-anagrafica', data))()}
            disabled={isLoading}
          >
            PDF
          </Button>
        </div>
      </div>
    </form>
  );
};

const EntrateUscite = ({ onGenerate, onExport, isLoading, conti }) => {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      data_inizio: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
      data_fine: new Date().toISOString().split('T')[0],
      conto_id: '',
      categoria: ''
    }
  });

  const onSubmit = (data) => {
    onGenerate(data, 'getEntrateVsUscite');
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="form-label">Data Inizio *</label>
        <input
          type="date"
          className={`form-input ${errors.data_inizio ? 'border-danger-500' : ''}`}
          {...register('data_inizio', { required: 'Data inizio è richiesta' })}
        />
      </div>

      <div>
        <label className="form-label">Data Fine *</label>
        <input
          type="date"
          className={`form-input ${errors.data_fine ? 'border-danger-500' : ''}`}
          {...register('data_fine', { required: 'Data fine è richiesta' })}
        />
      </div>

      <div>
        <label className="form-label">Conto Bancario</label>
        <select className="form-select" {...register('conto_id')}>
          <option value="">Tutti i conti</option>
          {conti?.map(conto => (
            <option key={conto.id} value={conto.id}>
              {conto.nome_banca}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="form-label">Categoria</label>
        <input
          type="text"
          className="form-input"
          placeholder="Filtra per categoria specifica"
          {...register('categoria')}
        />
      </div>

      <div className="space-y-3 pt-4 border-t border-gray-200">
        <Button
          type="submit"
          variant="primary"
          loading={isLoading}
          className="w-full"
        >
          <TrendingUp className="w-4 h-4 mr-2" />
          Genera Report
        </Button>

        <div className="grid grid-cols-3 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleSubmit(data => onExport('csv', '/reports/entrate-uscite', data))()}
            disabled={isLoading}
          >
            CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleSubmit(data => onExport('excel', '/reports/entrate-uscite', data))()}
            disabled={isLoading}
          >
            Excel
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleSubmit(data => onExport('pdf', '/reports/entrate-uscite', data))()}
            disabled={isLoading}
          >
            PDF
          </Button>
        </div>
      </div>
    </form>
  );
};

const BilancioMensile = ({ onGenerate, onExport, isLoading, conti }) => {
  const { register, handleSubmit } = useForm({
    defaultValues: {
      anno: new Date().getFullYear(),
      conto_id: ''
    }
  });

  const onSubmit = (data) => {
    onGenerate(data, 'getBilancioMensile');
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="form-label">Anno *</label>
        <select className="form-select" {...register('anno')}>
          {years.map(year => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="form-label">Conto Bancario</label>
        <select className="form-select" {...register('conto_id')}>
          <option value="">Tutti i conti</option>
          {conti?.map(conto => (
            <option key={conto.id} value={conto.id}>
              {conto.nome_banca}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3 pt-4 border-t border-gray-200">
        <Button
          type="submit"
          variant="primary"
          loading={isLoading}
          className="w-full"
        >
          <PieChartIcon className="w-4 h-4 mr-2" />
          Genera Report
        </Button>

        <div className="grid grid-cols-3 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleSubmit(data => onExport('csv', '/reports/bilancio-mensile', data))()}
            disabled={isLoading}
          >
            CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleSubmit(data => onExport('excel', '/reports/bilancio-mensile', data))()}
            disabled={isLoading}
          >
            Excel
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleSubmit(data => onExport('pdf', '/reports/bilancio-mensile', data))()}
            disabled={isLoading}
          >
            PDF
          </Button>
        </div>
      </div>
    </form>
  );
};

const ReportResults = ({ data, type }) => {
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Totali Generali */}
      {data.totali_generali && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
          <div className="text-center">
            <p className="text-sm text-gray-600">Movimenti</p>
            <p className="text-2xl font-semibold text-gray-900">
              {data.totali_generali.numero_movimenti}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-600">Entrate</p>
            <p className="text-2xl font-semibold text-success-600">
              €{parseFloat(data.totali_generali.totale_entrate || 0).toLocaleString('it-IT', { 
                minimumFractionDigits: 2 
              })}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-600">Uscite</p>
            <p className="text-2xl font-semibold text-danger-600">
              €{parseFloat(data.totali_generali.totale_uscite || 0).toLocaleString('it-IT', { 
                minimumFractionDigits: 2 
              })}
            </p>
          </div>
        </div>
      )}

      <Alert type="success">
        Report generato con successo! Utilizza i pulsanti di export per scaricare i dati.
      </Alert>
    </div>
  );
};

export default ReportsPage;
