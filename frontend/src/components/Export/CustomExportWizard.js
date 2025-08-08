// frontend/src/components/Export/CustomExportWizard.js
import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings, Download, Calendar, Eye, ChevronLeft, ChevronRight, 
  Check, AlertCircle, 
  GripVertical, Plus, X, FileText, FileSpreadsheet, FileType
} from 'lucide-react';
import { exportAPI, contiBancariAPI, anagraficheAPI } from '../../services/api';
import Card from '../UI/Card';
import Button from '../UI/Button';
import Alert from '../UI/Alert';
import LoadingSpinner from '../UI/LoadingSpinner';
import toast from 'react-hot-toast';
import TestAPI from './TestAPI';

const CustomExportWizard = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [exportConfig, setExportConfig] = useState({
    export_type: 'custom',
    table_type: 'movimenti', // movimenti, anagrafiche, conti_correnti
    campi_personalizzati: ['data', 'descrizione', 'importo', 'tipo'], // Default con almeno i campi base
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
    { id: 1, name: 'Campi', icon: Settings },
    { id: 2, name: 'Filtri', icon: Calendar },
    { id: 3, name: 'Formato', icon: Download }
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

  // Campi disponibili per tipologia di tabella
  const getAvailableFields = (table = 'movimenti') => {
    const allFields = {
      movimenti: [
        { id: 'data', name: 'Data', group: 'Base', required: true },
        { id: 'descrizione', name: 'Descrizione', group: 'Base', required: true },
        { id: 'importo', name: 'Importo', group: 'Base', required: true },
        { id: 'tipo', name: 'Tipo (Entrata/Uscita)', group: 'Base', required: true },
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
        { id: 'nome', name: 'Nome', group: 'Base', required: true },
        { id: 'email', name: 'Email', group: 'Base' },
        { id: 'telefono', name: 'Telefono', group: 'Base' },
        { id: 'piva', name: 'P.IVA', group: 'Base' },
        { id: 'categoria', name: 'Categoria', group: 'Base' },
        { id: 'indirizzo', name: 'Indirizzo', group: 'Base' },
        { id: 'tipologia_nome', name: 'Tipologia', group: 'Classificazione' }
      ],
      conti_correnti: [
        { id: 'nome_banca', name: 'Nome Banca', group: 'Base', required: true },
        { id: 'intestatario', name: 'Intestatario', group: 'Base', required: true },
        { id: 'iban', name: 'IBAN', group: 'Base' },
        { id: 'saldo_iniziale', name: 'Saldo Iniziale', group: 'Saldi' },
        { id: 'saldo_corrente', name: 'Saldo Corrente', group: 'Saldi' }
      ]
    };
    
    return allFields[table] || allFields.movimenti;
  };

  const updateConfig = (updates) => {
    setExportConfig(prev => ({ ...prev, ...updates }));
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

  const isStepValid = (step) => {
    if (step === 1) return exportConfig.campi_personalizzati.length > 0;
    if (step === 2) {
      if (exportConfig.table_type === 'movimenti') {
        return exportConfig.tutto_storico || (exportConfig.data_inizio && exportConfig.data_fine);
      }
      return true;
    }
    if (step === 3) return exportConfig.formato !== '';
    return false;
  };

  const handlePreview = async () => {
    try {
      setIsGenerating(true);
      console.log('🔍 Config personalizzata per anteprima:', exportConfig);
      console.log('📋 Campi personalizzati:', exportConfig.campi_personalizzati);
      console.log('🗂️ Tabella:', exportConfig.table_type);
      
      const preview = await exportAPI.generatePreview(exportConfig);
      console.log('✅ Preview ricevuta:', preview);
      
      setPreviewData(preview);
      toast.success('Anteprima generata con successo');
    } catch (error) {
      console.error('❌ Errore anteprima completo:', error);
      console.error('❌ Error response:', error.response?.data);
      console.error('❌ Error status:', error.response?.status);
      
      const errorMessage = error.response?.data?.error || error.response?.data?.details || error.message || 'Errore sconosciuto';
      toast.error(`Errore anteprima: ${errorMessage}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExport = async () => {
    try {
      setIsGenerating(true);
      console.log('📦 Config personalizzata per export:', exportConfig);
      
      let blob, filename;
      
      if (exportConfig.formato === 'csv') {
        blob = await exportAPI.generateCSV(exportConfig);
        filename = `custom_export_${new Date().toISOString().split('T')[0]}.csv`;
      } else if (exportConfig.formato === 'xlsx') {
        blob = await exportAPI.generateExcel(exportConfig);
        filename = `custom_export_${new Date().toISOString().split('T')[0]}.xlsx`;
      } else if (exportConfig.formato === 'pdf') {
        blob = await exportAPI.generatePDF(exportConfig);
        filename = `custom_export_${new Date().toISOString().split('T')[0]}.pdf`;
      }
      
      downloadBlob(blob, filename);
      toast.success('Export personalizzato completato!');
      
    } catch (error) {
      console.error('❌ Errore export completo:', error);
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

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Test API - TEMPORANEO */}
      <TestAPI />
      
      {/* Breadcrumb */}
      <div className="mb-6 mt-6">
        <nav className="flex" aria-label="Breadcrumb">
          <ol className="flex items-center space-x-4">
            <li>
              <a href="/reports" className="text-gray-500 hover:text-gray-700">
                Reports
              </a>
            </li>
            <li>
              <span className="text-gray-500">/</span>
            </li>
            <li>
              <span className="text-gray-900 font-medium">Export Personalizzato</span>
            </li>
          </ol>
        </nav>
      </div>

      {/* Progress Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Export Personalizzato</h1>
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
                    ? 'bg-purple-100 text-purple-700' 
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
              <Step1FieldSelection
                key="step1"
                config={exportConfig}
                onUpdate={updateConfig}
                availableFields={getAvailableFields(exportConfig.table_type)}
              />
            )}
            
            {currentStep === 2 && (
              <Step2CustomFilters
                key="step2"
                config={exportConfig}
                onUpdate={updateConfig}
                conti={conti}
                tipologie={tipologie}
              />
            )}
            
            {currentStep === 3 && (
              <Step3CustomFormat
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

// Step 1: Selezione Campi con Drag & Drop
const Step1FieldSelection = ({ config, onUpdate, availableFields }) => {
  const addField = (field) => {
    if (!config.campi_personalizzati.includes(field.id)) {
      onUpdate({
        campi_personalizzati: [...config.campi_personalizzati, field.id]
      });
    }
  };

  const removeField = (fieldId) => {
    onUpdate({
      campi_personalizzati: config.campi_personalizzati.filter(id => id !== fieldId)
    });
  };

  // const moveField = (fromIndex, toIndex) => {
  //   const newFields = [...config.campi_personalizzati];
  //   const [removed] = newFields.splice(fromIndex, 1);
  //   newFields.splice(toIndex, 0, removed);
  //   onUpdate({ campi_personalizzati: newFields });
  // };

  const getFieldName = (fieldId) => {
    const field = availableFields.find(f => f.id === fieldId);
    return field ? field.name : fieldId;
  };

  const fieldsByGroup = availableFields.reduce((acc, field) => {
    if (!acc[field.group]) acc[field.group] = [];
    acc[field.group].push(field);
    return acc;
  }, {});

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Seleziona e Ordina i Campi
        </h2>
        <p className="text-gray-600">
          Scegli quali campi includere nel tuo export e ordinali come preferisci
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Campi Disponibili */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">Campi Disponibili</h3>
          
          {Object.entries(fieldsByGroup).map(([group, fields]) => (
            <div key={group} className="border rounded-lg p-4">
              <h4 className="font-medium text-gray-700 mb-2">{group}</h4>
              <div className="space-y-2">
                {fields.map(field => (
                  <div
                    key={field.id}
                    className={`
                      flex items-center justify-between p-2 rounded border
                      ${config.campi_personalizzati.includes(field.id)
                        ? 'bg-green-50 border-green-200'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                      }
                    `}
                  >
                    <div className="flex items-center">
                      <span className={`text-sm ${
                        config.campi_personalizzati.includes(field.id)
                          ? 'text-green-800'
                          : 'text-gray-700'
                      }`}>
                        {field.name}
                      </span>
                      {field.required && (
                        <span className="ml-1 text-xs text-red-500">*</span>
                      )}
                    </div>
                    
                    <button
                      onClick={() => 
                        config.campi_personalizzati.includes(field.id)
                          ? removeField(field.id)
                          : addField(field)
                      }
                      className={`
                        text-xs px-2 py-1 rounded transition-colors
                        ${config.campi_personalizzati.includes(field.id)
                          ? 'bg-red-100 text-red-700 hover:bg-red-200'
                          : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        }
                      `}
                    >
                      {config.campi_personalizzati.includes(field.id) ? (
                        <X className="w-3 h-3" />
                      ) : (
                        <Plus className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Campi Selezionati */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">
            Campi Selezionati ({config.campi_personalizzati.length})
          </h3>
          
          {config.campi_personalizzati.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Settings className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Nessun campo selezionato</p>
              <p className="text-sm">Aggiungi campi dalla lista a sinistra</p>
            </div>
          ) : (
            <div className="space-y-2">
              {config.campi_personalizzati.map((fieldId, index) => (
                <div
                  key={fieldId}
                  className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded"
                >
                  <div className="flex items-center">
                    <GripVertical className="w-4 h-4 text-gray-400 mr-2 cursor-move" />
                    <span className="text-sm font-medium text-blue-900">
                      {index + 1}. {getFieldName(fieldId)}
                    </span>
                  </div>
                  
                  <button
                    onClick={() => removeField(fieldId)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {config.campi_personalizzati.length > 0 && (
        <Alert type="success">
          ✅ {config.campi_personalizzati.length} campi selezionati. 
          L'ordine corrisponderà alle colonne nell'export.
        </Alert>
      )}
    </motion.div>
  );
};

// Step 2: Filtri personalizzati
const Step2CustomFilters = ({ config, onUpdate, conti, tipologie }) => {
  const needsPeriod = config.table_type === 'movimenti';

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Filtri e Ordinamento</h2>
        <p className="text-gray-600">Personalizza i filtri per il tuo export</p>
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
          <h3 className="text-lg font-medium text-gray-900">Ordinamento e Filtri</h3>
          
          <div className="space-y-3">
            <div>
              <label className="form-label">Ordina per</label>
              <select
                value={config.ordina_per}
                onChange={(e) => onUpdate({ ordina_per: e.target.value })}
                className="form-select"
              >
                <option value="data">Data</option>
                <option value="importo">Importo</option>
                <option value="anagrafica">Anagrafica</option>
              </select>
            </div>

            <div>
              <label className="form-label">Direzione</label>
              <select
                value={config.ordine}
                onChange={(e) => onUpdate({ ordine: e.target.value })}
                className="form-select"
              >
                <option value="desc">Decrescente</option>
                <option value="asc">Crescente</option>
              </select>
            </div>

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

// Step 3: Formato personalizzato
const Step3CustomFormat = ({ 
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

      {/* Anteprima Configurazione */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-purple-900 mb-2">
          📋 Riepilogo Export Personalizzato
        </h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-purple-700">Campi selezionati:</span>
            <span className="ml-2 font-medium">{config.campi_personalizzati.length}</span>
          </div>
          <div>
            <span className="text-purple-700">Formato:</span>
            <span className="ml-2 font-medium">{selectedFormat.toUpperCase()}</span>
          </div>
          <div>
            <span className="text-purple-700">Ordinamento:</span>
            <span className="ml-2 font-medium">{config.ordina_per} ({config.ordine})</span>
          </div>
          <div>
            <span className="text-purple-700">Periodo:</span>
            <span className="ml-2 font-medium">
              {config.tutto_storico ? 'Tutto lo storico' : `${config.data_inizio} - ${config.data_fine}`}
            </span>
          </div>
        </div>
      </div>

      {/* Anteprima Dati */}
      {previewData && (
        <div className="mt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-3">Anteprima Export</h3>
          <div className="bg-gray-50 border rounded-lg p-4">
            <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
              <div>
                <span className="text-gray-600">Tipo:</span>
                <span className="ml-2 font-medium">Export Personalizzato</span>
              </div>
              <div>
                <span className="text-gray-600">Record:</span>
                <span className="ml-2 font-medium">{previewData.metadata?.numero_record_anteprima}</span>
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

export default CustomExportWizard;