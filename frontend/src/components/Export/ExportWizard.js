// frontend/src/components/Export/ExportWizard.js
import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Users, Building, Settings, Download, Calendar, 
  TrendingUp, Eye, ChevronLeft, ChevronRight, Check,
  FileSpreadsheet, FileType, AlertCircle
} from 'lucide-react';
import { exportAPI, contiBancariAPI, anagraficheAPI } from '../../services/api';
import Card from '../UI/Card';
import Button from '../UI/Button';
import Alert from '../UI/Alert';
import LoadingSpinner from '../UI/LoadingSpinner';
import toast from 'react-hot-toast';
import { format, differenceInDays } from 'date-fns';
import TestAPI from './TestAPI';

const ExportWizard = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [exportConfig, setExportConfig] = useState({
    export_type: '',
    tutto_storico: false,
    data_inizio: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    data_fine: new Date().toISOString().split('T')[0],
    conto_id: '',
    tipologia_id: '',
    formato: 'csv',
    ordina_per: 'data',
    ordine: 'desc',
    solo_attivi: true
  });
  const [previewData, setPreviewData] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Queries per dropdown
  const { data: conti } = useQuery('conti-attivi', contiBancariAPI.getAttivi);
  const { data: tipologie } = useQuery('tipologie-anagrafiche', anagraficheAPI.getTipologie);

  const steps = [
    { id: 1, name: 'Tipo Export', icon: FileText },
    { id: 2, name: 'Filtri', icon: Calendar },
    { id: 3, name: 'Formato', icon: Download }
  ];

  const updateConfig = (updates) => {
    setExportConfig(prev => ({ ...prev, ...updates }));
  };

  const presetExports = [
    {
      id: 'commercialista',
      name: 'Estratto per Commercialista',
      description: 'Movimenti completi con anagrafiche per dichiarazioni fiscali',
      icon: FileText,
      popular: true,
      includes: ['Data', 'Descrizione', 'Importo', 'Tipo', 'Anagrafica', 'P.IVA', 'Note'],
      color: 'blue'
    },
    {
      id: 'semplice',
      name: 'Estratto Semplice',
      description: 'Solo movimenti base: data, importo, descrizione',
      icon: Download,
      includes: ['Data', 'Descrizione', 'Importo', 'Tipo', 'Anagrafica'],
      color: 'green'
    },
    {
      id: 'entrate',
      name: 'Solo Entrate',
      description: 'Tutti i ricavi del periodo selezionato',
      icon: TrendingUp,
      includes: ['Data', 'Descrizione', 'Importo', 'Anagrafica', 'Categoria'],
      color: 'emerald'
    },
    {
      id: 'uscite',
      name: 'Solo Uscite',
      description: 'Tutte le spese del periodo selezionato',
      icon: TrendingUp,
      includes: ['Data', 'Descrizione', 'Importo', 'Anagrafica', 'Categoria'],
      color: 'red'
    },
    {
      id: 'custom',
      name: 'Export Personalizzato',
      description: 'Scegli esattamente quali campi includere e come ordinarli',
      icon: Settings,
      includes: ['Campi personalizzabili', 'Drag & drop', 'Anteprima live'],
      color: 'purple',
      isCustom: true
    }
  ];

  const dataExports = [
    {
      id: 'anagrafiche',
      name: 'Lista Anagrafiche',
      description: 'Contatti con email, telefono e dati fiscali',
      icon: Users,
      includes: ['Nome', 'Email', 'Telefono', 'P.IVA', 'Tipologia'],
      color: 'purple'
    },
    {
      id: 'conti',
      name: 'Conti Bancari',
      description: 'Lista conti con saldi e intestatari',
      icon: Building,
      includes: ['Banca', 'Intestatario', 'IBAN', 'Saldo'],
      color: 'indigo'
    }
  ];

  const formatOptions = [
    {
      id: 'csv',
      name: 'CSV',
      description: 'Per Excel, Google Sheets e elaborazioni',
      icon: FileText,
      extension: '.csv',
      color: 'green'
    },
    {
      id: 'xlsx',
      name: 'Excel',
      description: 'File Excel con formattazione avanzata',
      icon: FileSpreadsheet,
      extension: '.xlsx',
      color: 'blue'
    },
    {
      id: 'pdf',
      name: 'PDF',
      description: 'Per stampa e archiviazione',
      icon: FileType,
      extension: '.pdf',
      color: 'red'
    }
  ];

  // Mappa dei campi disponibili per tipo
  const getFieldsForExportType = (exportType) => {
    const fieldMaps = {
      commercialista: {
        name: 'Estratto per Commercialista',
        fields: ['data', 'descrizione', 'importo', 'tipo', 'note', 'anagrafica_nome', 'anagrafica_piva', 'anagrafica_email', 'tipologia_nome', 'categoria_movimento', 'conto_nome'],
        table: 'movimenti'
      },
      semplice: {
        name: 'Estratto Semplice', 
        fields: ['data', 'descrizione', 'importo', 'tipo', 'anagrafica_nome'],
        table: 'movimenti'
      },
      entrate: {
        name: 'Solo Entrate',
        fields: ['data', 'descrizione', 'importo', 'anagrafica_nome', 'categoria_movimento'],
        table: 'movimenti'
      },
      uscite: {
        name: 'Solo Uscite',
        fields: ['data', 'descrizione', 'importo', 'anagrafica_nome', 'categoria_movimento'], 
        table: 'movimenti'
      },
      anagrafiche: {
        name: 'Lista Anagrafiche',
        fields: ['nome', 'email', 'telefono', 'piva', 'tipologia_nome', 'categoria'],
        table: 'anagrafiche'
      },
      conti: {
        name: 'Conti Bancari',
        fields: ['nome_banca', 'intestatario', 'iban', 'saldo_iniziale', 'saldo_corrente'],
        table: 'conti_correnti'
      }
    };
    
    return fieldMaps[exportType] || { name: 'Custom', fields: [], table: 'movimenti' };
  };

  // Campi disponibili per tipologia di tabella
  const getAvailableFields = (table = 'movimenti') => {
    const allFields = {
      movimenti: [
        { id: 'data', name: 'Data', group: 'Base' },
        { id: 'descrizione', name: 'Descrizione', group: 'Base' },
        { id: 'importo', name: 'Importo', group: 'Base' },
        { id: 'tipo', name: 'Tipo (Entrata/Uscita)', group: 'Base' },
        { id: 'note', name: 'Note', group: 'Base' },
        { id: 'categoria_movimento', name: 'Categoria Movimento', group: 'Base' },
        { id: 'anagrafica_nome', name: 'Nome Anagrafica', group: 'Anagrafica' },
        { id: 'anagrafica_email', name: 'Email Anagrafica', group: 'Anagrafica' },
        { id: 'anagrafica_telefono', name: 'Telefono Anagrafica', group: 'Anagrafica' },
        { id: 'anagrafica_piva', name: 'P.IVA Anagrafica', group: 'Anagrafica' },
        { id: 'tipologia_nome', name: 'Tipologia Anagrafica', group: 'Anagrafica' },
        { id: 'conto_nome', name: 'Nome Banca', group: 'Conto' },
        { id: 'conto_iban', name: 'IBAN', group: 'Conto' },
        { id: 'conto_intestatario', name: 'Intestatario Conto', group: 'Conto' }
      ],
      anagrafiche: [
        { id: 'nome', name: 'Nome', group: 'Base' },
        { id: 'email', name: 'Email', group: 'Base' },
        { id: 'telefono', name: 'Telefono', group: 'Base' },
        { id: 'piva', name: 'P.IVA', group: 'Base' },
        { id: 'categoria', name: 'Categoria', group: 'Base' },
        { id: 'indirizzo', name: 'Indirizzo', group: 'Base' },
        { id: 'tipologia_nome', name: 'Tipologia', group: 'Classificazione' }
      ],
      conti_correnti: [
        { id: 'nome_banca', name: 'Nome Banca', group: 'Base' },
        { id: 'intestatario', name: 'Intestatario', group: 'Base' },
        { id: 'iban', name: 'IBAN', group: 'Base' },
        { id: 'saldo_iniziale', name: 'Saldo Iniziale', group: 'Saldi' },
        { id: 'saldo_corrente', name: 'Saldo Corrente', group: 'Saldi' }
      ]
    };
    
    return allFields[table] || allFields.movimenti;
  };

  const nextStep = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handlePreview = async () => {
    try {
      setIsGenerating(true);
      console.log('🔍 Config inviata per anteprima:', exportConfig);
      
      const preview = await exportAPI.generatePreview(exportConfig);
      console.log('✅ Preview ricevuta:', preview);
      
      setPreviewData(preview);
      toast.success('Anteprima generata con successo');
    } catch (error) {
      console.error('❌ Errore anteprima completo:', error);
      console.error('❌ Error response:', error.response?.data);
      console.error('❌ Error status:', error.response?.status);
      
      const errorMessage = error.response?.data?.error || error.message || 'Errore sconosciuto';
      toast.error(`Errore anteprima: ${errorMessage}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExport = async () => {
    try {
      setIsGenerating(true);
      console.log('📦 Config inviata per export:', exportConfig);
      
      let blob, filename;
      
      if (exportConfig.formato === 'csv') {
        console.log('📄 Generazione CSV...');
        blob = await exportAPI.generateCSV(exportConfig);
        filename = `export_${exportConfig.export_type}_${new Date().toISOString().split('T')[0]}.csv`;
      } else if (exportConfig.formato === 'xlsx') {
        console.log('📊 Generazione Excel...');
        blob = await exportAPI.generateExcel(exportConfig);
        filename = `export_${exportConfig.export_type}_${new Date().toISOString().split('T')[0]}.xlsx`;
      } else if (exportConfig.formato === 'pdf') {
        console.log('📑 Generazione PDF...');
        blob = await exportAPI.generatePDF(exportConfig);
        filename = `export_${exportConfig.export_type}_${new Date().toISOString().split('T')[0]}.pdf`;
      }
      
      console.log('✅ Blob generato, dimensione:', blob.size);
      downloadBlob(blob, filename);
      toast.success('Export completato con successo!');
      
    } catch (error) {
      console.error('❌ Errore export completo:', error);
      console.error('❌ Error response:', error.response?.data);
      console.error('❌ Error status:', error.response?.status);
      
      const errorMessage = error.response?.data?.error || error.message || 'Errore sconosciuto';
      toast.error(`Errore export: ${errorMessage}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadBlob = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const isStepValid = (step) => {
    if (step === 1) return exportConfig.export_type !== '';
    if (step === 2) {
      if (['commercialista', 'semplice', 'entrate', 'uscite'].includes(exportConfig.export_type)) {
        return exportConfig.tutto_storico || (exportConfig.data_inizio && exportConfig.data_fine);
      }
      return true; // Per anagrafiche e conti non servono filtri periodo
    }
    if (step === 3) return exportConfig.formato !== '';
    return false;
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Test API - TEMPORANEO */}
      <TestAPI />
      
      {/* Progress Header */}
      <div className="mb-8 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Export Guidato</h1>
          <div className="text-sm text-gray-500">
            Step {currentStep} di {steps.length}
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;
            const isValid = isStepValid(step.id);
            
            return (
              <React.Fragment key={step.id}>
                <div className={`
                  flex items-center space-x-2 px-4 py-2 rounded-lg transition-all
                  ${isActive 
                    ? 'bg-blue-100 text-blue-700' 
                    : isCompleted 
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }
                `}>
                  {isCompleted ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                  <span className="text-sm font-medium">{step.name}</span>
                  {isActive && !isValid && (
                    <AlertCircle className="w-4 h-4 text-orange-500" />
                  )}
                </div>
                {index < steps.length - 1 && (
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <Card>
        <Card.Body className="p-6">
          <AnimatePresence mode="wait">
            {currentStep === 1 && (
              <Step1TypeSelection
                key="step1"
                presetExports={presetExports}
                dataExports={dataExports}
                selectedType={exportConfig.export_type}
                onSelect={(type) => {
                  if (type === 'custom') {
                    // Reindirizza al wizard personalizzato
                    window.location.href = '/reports/custom';
                  } else {
                    updateConfig({ export_type: type });
                  }
                }}
              />
            )}
            
            {currentStep === 2 && (
              <Step2Filters
                key="step2"
                config={exportConfig}
                onUpdate={updateConfig}
                conti={conti}
                tipologie={tipologie}
              />
            )}
            
            {currentStep === 3 && (
              <Step3Format
                key="step3"
                formatOptions={formatOptions}
                selectedFormat={exportConfig.formato}
                onSelect={(formato) => updateConfig({ formato })}
                config={exportConfig}
                onPreview={handlePreview}
                onExport={handleExport}
                previewData={previewData}
                isGenerating={isGenerating}
              />
            )}
          </AnimatePresence>
        </Card.Body>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <Button
          variant="outline"
          onClick={prevStep}
          disabled={currentStep === 1}
          className="flex items-center"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Indietro
        </Button>
        
        <div className="flex space-x-3">
          {currentStep === 3 ? (
            <>
              <Button
                variant="outline"
                onClick={handlePreview}
                disabled={!isStepValid(currentStep) || isGenerating}
                className="flex items-center"
              >
                <Eye className="w-4 h-4 mr-1" />
                Anteprima
              </Button>
              <Button
                variant="primary"
                onClick={handleExport}
                disabled={!isStepValid(currentStep) || isGenerating}
                loading={isGenerating}
                className="flex items-center"
              >
                <Download className="w-4 h-4 mr-1" />
                Esporta
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              onClick={nextStep}
              disabled={!isStepValid(currentStep)}
              className="flex items-center"
            >
              Avanti
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

// Componenti per ogni step
const Step1TypeSelection = ({ presetExports, dataExports, selectedType, onSelect }) => {
  const ExportCard = ({ export: exportItem, onClick, isSelected }) => {
    const Icon = exportItem.icon;
    const colorClasses = {
      blue: 'border-blue-200 bg-blue-50 text-blue-700',
      green: 'border-green-200 bg-green-50 text-green-700',
      emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      red: 'border-red-200 bg-red-50 text-red-700',
      purple: 'border-purple-200 bg-purple-50 text-purple-700',
      indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700'
    };

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        onClick={() => onClick(exportItem.id)}
        className={`
          relative p-4 border-2 rounded-lg cursor-pointer transition-all duration-200
          ${isSelected 
            ? `${colorClasses[exportItem.color]} border-${exportItem.color}-500 shadow-md` 
            : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
          }
        `}
      >
        {exportItem.popular && (
          <div className="absolute -top-2 -right-2 bg-orange-500 text-white text-xs px-2 py-1 rounded-full font-medium">
            PIÙ USATO
          </div>
        )}
        
        <div className="flex items-start space-x-3">
          <div className={`
            flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center
            ${isSelected ? `bg-${exportItem.color}-100` : 'bg-gray-100'}
          `}>
            <Icon className={`w-5 h-5 ${
              isSelected ? `text-${exportItem.color}-600` : 'text-gray-600'
            }`} />
          </div>
          
          <div className="flex-1">
            <div className="flex items-center space-x-2">
              <h3 className={`text-sm font-semibold ${
                isSelected ? `text-${exportItem.color}-900` : 'text-gray-900'
              }`}>
                {exportItem.name}
              </h3>
              {exportItem.isCustom && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                  ✨ AVANZATO
                </span>
              )}
            </div>
            <p className={`text-xs mt-1 ${
              isSelected ? `text-${exportItem.color}-700` : 'text-gray-600'
            }`}>
              {exportItem.description}
            </p>
            
            <div className="mt-2 flex flex-wrap gap-1">
              {exportItem.includes.slice(0, 4).map((field, index) => (
                <span key={index} className={`
                  text-xs px-2 py-0.5 rounded-full
                  ${isSelected 
                    ? `bg-${exportItem.color}-200 text-${exportItem.color}-800` 
                    : 'bg-gray-200 text-gray-700'
                  }
                `}>
                  {field}
                </span>
              ))}
              {exportItem.includes.length > 4 && (
                <span className={`
                  text-xs px-2 py-0.5 rounded-full
                  ${isSelected 
                    ? `bg-${exportItem.color}-200 text-${exportItem.color}-800` 
                    : 'bg-gray-200 text-gray-700'
                  }
                `}>
                  +{exportItem.includes.length - 4}
                </span>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Cosa vuoi esportare?</h2>
        <p className="text-gray-600">Scegli il tipo di dati da includere nel tuo export</p>
      </div>

      <div className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <FileText className="w-5 h-5 text-gray-700" />
            <h3 className="text-lg font-semibold text-gray-900">Export Movimenti</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {presetExports.map((exportItem) => (
              <ExportCard
                key={exportItem.id}
                export={exportItem}
                onClick={onSelect}
                isSelected={selectedType === exportItem.id}
              />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-gray-700" />
            <h3 className="text-lg font-semibold text-gray-900">Export Dati</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {dataExports.map((exportItem) => (
              <ExportCard
                key={exportItem.id}
                export={exportItem}
                onClick={onSelect}
                isSelected={selectedType === exportItem.id}
              />
            ))}
          </div>
        </div>
      </div>

      {selectedType && (
        <Alert type="success">
          ✅ Hai selezionato: <strong>
            {[...presetExports, ...dataExports].find(e => e.id === selectedType)?.name}
          </strong>
        </Alert>
      )}
    </motion.div>
  );
};

const Step2Filters = ({ config, onUpdate, conti, tipologie }) => {
  const needsPeriod = ['commercialista', 'semplice', 'entrate', 'uscite'].includes(config.export_type);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Filtri e Opzioni</h2>
        <p className="text-gray-600">Personalizza cosa includere nell'export</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {needsPeriod && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <Calendar className="w-5 h-5 mr-2" />
              Periodo
            </h3>
            
            <div className="space-y-3">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={config.tutto_storico}
                  onChange={(e) => onUpdate({ tutto_storico: e.target.checked })}
                  className="mr-2"
                />
                Tutto lo storico
              </label>
              
              {!config.tutto_storico && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Data Inizio</label>
                    <input
                      type="date"
                      value={config.data_inizio}
                      onChange={(e) => onUpdate({ data_inizio: e.target.value })}
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="form-label">Data Fine</label>
                    <input
                      type="date"
                      value={config.data_fine}
                      onChange={(e) => onUpdate({ data_fine: e.target.value })}
                      className="form-input"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900 flex items-center">
            <Building className="w-5 h-5 mr-2" />
            Filtri Specifici
          </h3>
          
          <div className="space-y-3">
            {needsPeriod && (
              <>
                <div>
                  <label className="form-label">Conto Bancario</label>
                  <select
                    value={config.conto_id}
                    onChange={(e) => onUpdate({ conto_id: e.target.value })}
                    className="form-select"
                  >
                    <option value="">Tutti i conti</option>
                    {conti?.map(conto => (
                      <option key={conto.id} value={conto.id}>
                        {conto.nome_banca} - {conto.intestatario}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label">Tipologia Anagrafica</label>
                  <select
                    value={config.tipologia_id}
                    onChange={(e) => onUpdate({ tipologia_id: e.target.value })}
                    className="form-select"
                  >
                    <option value="">Tutte le tipologie</option>
                    {tipologie?.map(tipologia => (
                      <option key={tipologia.id} value={tipologia.id}>
                        {tipologia.nome} ({tipologia.tipo_movimento_default})
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div>
              <label className="form-label">Ordinamento</label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={config.ordina_per}
                  onChange={(e) => onUpdate({ ordina_per: e.target.value })}
                  className="form-select"
                >
                  <option value="data">Per Data</option>
                  <option value="importo">Per Importo</option>
                  <option value="anagrafica">Per Anagrafica</option>
                </select>
                <select
                  value={config.ordine}
                  onChange={(e) => onUpdate({ ordine: e.target.value })}
                  className="form-select"
                >
                  <option value="desc">Decrescente</option>
                  <option value="asc">Crescente</option>
                </select>
              </div>
            </div>

            <label className="flex items-center">
              <input
                type="checkbox"
                checked={config.solo_attivi}
                onChange={(e) => onUpdate({ solo_attivi: e.target.checked })}
                className="mr-2"
              />
              Solo record attivi
            </label>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const Step3Format = ({ 
  formatOptions, 
  selectedFormat, 
  onSelect, 
  config, 
  onPreview, 
  onExport, 
  previewData, 
  isGenerating 
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Formato Export</h2>
        <p className="text-gray-600">Scegli il formato per il download</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {formatOptions.map((format) => {
          const Icon = format.icon;
          const isSelected = selectedFormat === format.id;
          
          return (
            <div
              key={format.id}
              onClick={() => onSelect(format.id)}
              className={`
                p-4 border-2 rounded-lg cursor-pointer transition-all duration-200
                ${isSelected 
                  ? `border-${format.color}-500 bg-${format.color}-50` 
                  : 'border-gray-200 bg-white hover:border-gray-300'
                }
              `}
            >
              <div className="text-center">
                <div className={`
                  w-12 h-12 mx-auto rounded-lg flex items-center justify-center mb-3
                  ${isSelected ? `bg-${format.color}-100` : 'bg-gray-100'}
                `}>
                  <Icon className={`w-6 h-6 ${
                    isSelected ? `text-${format.color}-600` : 'text-gray-600'
                  }`} />
                </div>
                <h3 className={`font-semibold text-lg ${
                  isSelected ? `text-${format.color}-900` : 'text-gray-900'
                }`}>
                  {format.name}
                </h3>
                <p className={`text-sm mt-1 ${
                  isSelected ? `text-${format.color}-700` : 'text-gray-600'
                }`}>
                  {format.description}
                </p>
                <span className={`
                  inline-block mt-2 px-2 py-1 text-xs rounded-full
                  ${isSelected 
                    ? `bg-${format.color}-200 text-${format.color}-800` 
                    : 'bg-gray-200 text-gray-700'
                  }
                `}>
                  {format.extension}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Anteprima */}
      {previewData && (
        <div className="mt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-3">Anteprima Export</h3>
          <div className="bg-gray-50 border rounded-lg p-4">
            <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
              <div>
                <span className="text-gray-600">Tipo:</span>
                <span className="ml-2 font-medium">{previewData.metadata?.nome_export}</span>
              </div>
              <div>
                <span className="text-gray-600">Record:</span>
                <span className="ml-2 font-medium">{previewData.metadata?.numero_record}</span>
              </div>
              <div>
                <span className="text-gray-600">Filtri:</span>
                <span className="ml-2 font-medium text-xs">{previewData.metadata?.filtri_applicati}</span>
              </div>
            </div>
            
            {previewData.data && previewData.data.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-gray-100">
                      {Object.keys(previewData.data[0]).map(key => (
                        <th key={key} className="px-2 py-1 text-left font-medium text-gray-700">
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.data.slice(0, 5).map((row, index) => (
                      <tr key={index} className="border-t border-gray-200">
                        {Object.values(row).map((value, colIndex) => (
                          <td key={colIndex} className="px-2 py-1 text-gray-900">
                            {value || '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewData.data.length > 5 && (
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    ... e altri {previewData.data.length - 5} record
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {isGenerating && (
        <div className="text-center py-8">
          <LoadingSpinner size="lg" />
          <p className="text-gray-600 mt-4">Generazione in corso...</p>
        </div>
      )}
    </motion.div>
  );
};

export default ExportWizard;