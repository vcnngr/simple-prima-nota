// src/pages/Reports/ReportsPage.js - VERSIONE AGGIORNATA CON TIPOLOGIE
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
  RefreshCw,
  Users,
  Building
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

  // Query per dati dropdown (AGGIORNATO)
  const { data: conti } = useQuery('conti-attivi', contiBancariAPI.getAttivi);
  const { data: anagrafiche } = useQuery('anagrafiche-attive', anagraficheAPI.getAttive);
  const { data: tipologie } = useQuery('tipologie-anagrafiche', anagraficheAPI.getTipologie);

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
      description: 'Analisi movimenti per tipologia/anagrafica'
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
            Genera report dettagliati e analisi dei tuoi dati contabili con tipologie flessibili
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
                  tipologie={tipologie}
                />
              )}
              {activeTab === 'entrate-uscite' && (
                <EntrateUscite
                  onGenerate={handleGenerateReport}
                  onExport={handleExport}
                  isLoading={isGenerating}
                  conti={conti}
                  tipologie={tipologie}
                />
              )}
              {activeTab === 'bilancio-mensile' && (
                <BilancioMensile
                  onGenerate={handleGenerateReport}
                  onExport={handleExport}
                  isLoading={isGenerating}
                  conti={conti}
                  tipologie={tipologie}
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

// Componenti di form per ogni tipo di report (AGGIORNATI)
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

const MovimentiAnagrafica = ({ onGenerate, onExport, isLoading, anagrafiche, tipologie }) => {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      data_inizio: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
      data_fine: new Date().toISOString().split('T')[0],
      anagrafica_id: '',
      tipologia_id: '', // NUOVO
      tipo: ''
    }
  });

  const onSubmit = (data) => {
    onGenerate(data, 'getMovimentiAnagrafica');
  };

  // Helper per ottenere icona tipologia
  const getIconForTipologia = (iconName) => {
    const iconMap = {
      'user': Users,
      'building': Building,
      'truck': Building,
      'star': Users,
      'users': Users
    };
    return iconMap[iconName] || Users;
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

      {/* NUOVO: Filtro per tipologia */}
      <div>
        <label className="form-label">Tipologia Anagrafica</label>
        <select className="form-select" {...register('tipologia_id')}>
          <option value="">Tutte le tipologie</option>
          {tipologie?.map(tipologia => {
            const Icon = getIconForTipologia(tipologia.icona);
            return (
              <option key={tipologia.id} value={tipologia.id}>
                {tipologia.nome} ({tipologia.tipo_movimento_default})
              </option>
            );
          })}
        </select>
      </div>

      <div>
        <label className="form-label">Anagrafica Specifica</label>
        <select className="form-select" {...register('anagrafica_id')}>
          <option value="">Tutte le anagrafiche</option>
          {anagrafiche?.map(anagrafica => (
            <option key={anagrafica.id} value={anagrafica.id}>
              {anagrafica.nome} 
              {anagrafica.tipologia_nome && ` (${anagrafica.tipologia_nome})`}
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

const EntrateUscite = ({ onGenerate, onExport, isLoading, conti, tipologie }) => {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      data_inizio: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
      data_fine: new Date().toISOString().split('T')[0],
      conto_id: '',
      tipologia_id: '', // NUOVO
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

      {/* NUOVO: Filtro per tipologia */}
      <div>
        <label className="form-label">Tipologia Anagrafica</label>
        <select className="form-select" {...register('tipologia_id')}>
          <option value="">Tutte le tipologie</option>
          {tipologie?.map(tipologia => (
            <option key={tipologia.id} value={tipologia.id}>
              {tipologia.nome} ({tipologia.tipo_movimento_default})
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

const BilancioMensile = ({ onGenerate, onExport, isLoading, conti, tipologie }) => {
  const { register, handleSubmit } = useForm({
    defaultValues: {
      anno: new Date().getFullYear(),
      conto_id: '',
      tipologia_id: '' // NUOVO
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

      {/* NUOVO: Filtro per tipologia */}
      <div>
        <label className="form-label">Tipologia Anagrafica</label>
        <select className="form-select" {...register('tipologia_id')}>
          <option value="">Tutte le tipologie</option>
          {tipologie?.map(tipologia => (
            <option key={tipologia.id} value={tipologia.id}>
              {tipologia.nome} ({tipologia.tipo_movimento_default})
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

      {/* Distribuzione Tipologie (NUOVO) */}
      {data.distribuzione_tipologie && (
        <div className="space-y-4">
          <h4 className="text-lg font-medium text-gray-900">Distribuzione per Tipologie</h4>
          
          {data.distribuzione_tipologie.entrate?.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h5 className="text-md font-medium text-success-600 mb-2">Entrate per Tipologia</h5>
                <div className="space-y-2">
                  {data.distribuzione_tipologie.entrate.slice(0, 5).map((tipologia, index) => (
                    <div key={tipologia.tipologia} className="flex items-center justify-between p-2 bg-success-50 rounded">
                      <div className="flex items-center">
                        <div 
                          className="w-3 h-3 rounded-full mr-2"
                          style={{ backgroundColor: tipologia.colore || '#10b981' }}
                        />
                        <span className="text-sm text-gray-700">{tipologia.tipologia}</span>
                      </div>
                      <span className="text-sm font-medium text-success-600">
                        €{parseFloat(tipologia.totale).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div>
                <h5 className="text-md font-medium text-danger-600 mb-2">Uscite per Tipologia</h5>
                <div className="space-y-2">
                  {data.distribuzione_tipologie.uscite.slice(0, 5).map((tipologia, index) => (
                    <div key={tipologia.tipologia} className="flex items-center justify-between p-2 bg-danger-50 rounded">
                      <div className="flex items-center">
                        <div 
                          className="w-3 h-3 rounded-full mr-2"
                          style={{ backgroundColor: tipologia.colore || '#ef4444' }}
                        />
                        <span className="text-sm text-gray-700">{tipologia.tipologia}</span>
                      </div>
                      <span className="text-sm font-medium text-danger-600">
                        €{parseFloat(tipologia.totale).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Top Tipologie (NUOVO per bilancio mensile) */}
      {data.top_tipologie && (
        <div className="space-y-4">
          <h4 className="text-lg font-medium text-gray-900">Top Tipologie dell'Anno</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.top_tipologie.slice(0, 10).map((tipologia, index) => (
              <div key={`${tipologia.tipologia}-${tipologia.tipo}`} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mr-3"
                       style={{ backgroundColor: (tipologia.colore || '#6B7280') + '20' }}>
                    <span className="text-xs font-semibold" style={{ color: tipologia.colore || '#6B7280' }}>
                      #{index + 1}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {tipologia.tipologia}
                    </p>
                    <div className="flex items-center space-x-2">
                      <Badge variant={tipologia.tipo === 'Entrata' ? 'success' : 'danger'} size="xs">
                        {tipologia.tipo}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        {tipologia.numero_movimenti} movimenti
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${
                    tipologia.tipo === 'Entrata' ? 'text-success-600' : 'text-danger-600'
                  }`}>
                    €{parseFloat(tipologia.totale).toLocaleString('it-IT', { 
                      minimumFractionDigits: 2 
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raggruppamento per tipologia (per report movimenti anagrafica) */}
      {data.raggruppamento && (
        <div className="space-y-4">
          <h4 className="text-lg font-medium text-gray-900">Dettaglio per Tipologia e Anagrafica</h4>
          {data.raggruppamento.map((gruppo, index) => (
            <div key={index} className="border rounded-lg overflow-hidden">
              <div className="p-4 bg-gray-50 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div 
                      className="w-4 h-4 rounded-full mr-3"
                      style={{ backgroundColor: gruppo.tipologia.colore || '#6B7280' }}
                    />
                    <div>
                      <h5 className="font-medium text-gray-900">
                        {gruppo.tipologia.nome}
                      </h5>
                      <p className="text-sm text-gray-600">
                        {gruppo.anagrafica.nome}
                        {gruppo.anagrafica.categoria && ` • ${gruppo.anagrafica.categoria}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">
                      {gruppo.totali.numero_movimenti} movimenti
                    </p>
                    <p className={`text-lg font-bold ${
                      gruppo.totali.saldo_netto >= 0 ? 'text-success-600' : 'text-danger-600'
                    }`}>
                      €{parseFloat(gruppo.totali.saldo_netto).toLocaleString('it-IT', { 
                        minimumFractionDigits: 2 
                      })}
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Entrate:</span>
                    <span className="ml-2 font-medium text-success-600">
                      €{parseFloat(gruppo.totali.totale_entrate).toLocaleString('it-IT', { 
                        minimumFractionDigits: 2 
                      })}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Uscite:</span>
                    <span className="ml-2 font-medium text-danger-600">
                      €{parseFloat(gruppo.totali.totale_uscite).toLocaleString('it-IT', { 
                        minimumFractionDigits: 2 
                      })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Alert type="success">
        Report generato con successo! Utilizza i pulsanti di export per scaricare i dati in formato CSV, Excel o PDF.
      </Alert>
    </div>
  );
};

export default ReportsPage;