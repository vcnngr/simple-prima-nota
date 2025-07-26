// ==============================================================================
// FILE: src/components/Import/ImportDisclaimerModal.js
// COMPONENTE: Modal con disclaimer e istruzioni per import CSV
// ==============================================================================

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  FileText,
  AlertCircle,
  CheckCircle,
  Download,
  Info,
  X,
  ChevronRight,
  Database,
  Users,
  CreditCard,
  Tag,
  Building
} from 'lucide-react';
import Modal from '../UI/Modal';
import Button from '../UI/Button';
import Card from '../UI/Card';
import Badge from '../UI/Badge';
import { useQuery } from 'react-query';

const ImportDisclaimerModal = ({ isOpen, onClose, onProceedToImport }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [acceptedDisclaimer, setAcceptedDisclaimer] = useState(false);

  // Query per informazioni import
  const { data: importInfo } = useQuery(
    'import-info',
    () => fetch('/api/movimenti/import/info').then(res => res.json()),
    { 
      enabled: isOpen,
      staleTime: 5 * 60 * 1000 // 5 minuti
    }
  );

  const steps = [
    {
      title: 'Preparazione CSV',
      icon: FileText,
      content: 'prepare'
    },
    {
      title: 'Formato e Colonne',
      icon: Database,
      content: 'format'
    },
    {
      title: 'Esempi Pratici',
      icon: Info,
      content: 'examples'
    },
    {
      title: 'Disclaimer',
      icon: AlertCircle,
      content: 'disclaimer'
    }
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleProceed = () => {
    if (acceptedDisclaimer) {
      onProceedToImport();
      onClose();
      setCurrentStep(0);
      setAcceptedDisclaimer(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const response = await fetch('/api/movimenti/template');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'template_prima_nota_v2.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Errore download template:', error);
    }
  };

  const renderStepContent = () => {
    const step = steps[currentStep];

    switch (step.content) {
      case 'prepare':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <FileText className="w-16 h-16 text-primary-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Preparazione File CSV
              </h3>
              <p className="text-gray-600">
                Prima di iniziare l'import, assicurati di avere il tuo file CSV pronto
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <Card.Body className="p-4">
                  <h4 className="font-medium text-gray-900 mb-2 flex items-center">
                    <Download className="w-4 h-4 mr-2 text-primary-500" />
                    Template CSV
                  </h4>
                  <p className="text-sm text-gray-600 mb-3">
                    Scarica il template ufficiale con esempi e formato corretto
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={downloadTemplate}
                    className="w-full"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Scarica Template
                  </Button>
                </Card.Body>
              </Card>

              <Card>
                <Card.Body className="p-4">
                  <h4 className="font-medium text-gray-900 mb-2 flex items-center">
                    <CheckCircle className="w-4 h-4 mr-2 text-success-500" />
                    Requisiti File
                  </h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Formato: CSV (.csv)</li>
                    <li>• Encoding: UTF-8</li>
                    <li>• Delimitatore: ; (punto e virgola)</li>
                    <li>• Dimensione max: 10MB</li>
                    <li>• Righe max: 10.000</li>
                  </ul>
                </Card.Body>
              </Card>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start">
                <Info className="w-5 h-5 text-blue-600 mt-0.5 mr-3" />
                <div>
                  <h4 className="font-medium text-blue-900">Creazione Automatica</h4>
                  <p className="text-sm text-blue-700 mt-1">
                    Il sistema creerà automaticamente anagrafiche, tipologie, categorie e conti 
                    che non esistono ancora, utilizzando i dati del tuo CSV.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

      case 'format':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <Database className="w-16 h-16 text-primary-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Formato e Colonne
              </h3>
              <p className="text-gray-600">
                Struttura del file CSV e descrizione delle colonne
              </p>
            </div>

            {importInfo && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <Card.Header>
                      <h4 className="font-medium text-gray-900 flex items-center">
                        <AlertCircle className="w-4 h-4 mr-2 text-red-500" />
                        Colonne Obbligatorie
                      </h4>
                    </Card.Header>
                    <Card.Body className="p-4">
                      <div className="space-y-3">
                        {importInfo.colonne.obbligatorie.map((col, index) => (
                          <div key={index} className="border-l-4 border-red-500 pl-3">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-gray-900">{col.nome}</span>
                              <Badge variant="danger" size="sm">Richiesta</Badge>
                            </div>
                            <p className="text-sm text-gray-600 mt-1">{col.descrizione}</p>
                            <p className="text-xs text-gray-500">
                              Formato: {col.formato} • Esempio: {col.esempio}
                            </p>
                          </div>
                        ))}
                      </div>
                    </Card.Body>
                  </Card>

                  <Card>
                    <Card.Header>
                      <h4 className="font-medium text-gray-900 flex items-center">
                        <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
                        Colonne Opzionali
                      </h4>
                    </Card.Header>
                    <Card.Body className="p-4">
                      <div className="space-y-3">
                        {importInfo.colonne.opzionali.map((col, index) => (
                          <div key={index} className="border-l-4 border-green-500 pl-3">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-gray-900">{col.nome}</span>
                              <Badge variant="success" size="sm">Opzionale</Badge>
                            </div>
                            <p className="text-sm text-gray-600 mt-1">{col.descrizione}</p>
                            <p className="text-xs text-gray-500">
                              Esempio: {col.esempio}
                            </p>
                          </div>
                        ))}
                      </div>
                    </Card.Body>
                  </Card>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                    <Database className="w-4 h-4 mr-2" />
                    Creazione Automatica Entità
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {importInfo.creazione_automatica.entità.map((entita, index) => (
                      <div key={index} className="flex items-center text-sm text-gray-700">
                        <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                        {entita}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        );

      case 'examples':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <Info className="w-16 h-16 text-primary-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Esempi Pratici
              </h3>
              <p className="text-gray-600">
                Esempi di righe CSV per diversi scenari
              </p>
            </div>

            {importInfo && (
              <div className="space-y-4">
                {importInfo.esempi.map((esempio, index) => (
                  <Card key={index}>
                    <Card.Header>
                      <h4 className="font-medium text-gray-900">{esempio.scenario}</h4>
                    </Card.Header>
                    <Card.Body>
                      <div className="bg-gray-100 rounded-lg p-3 font-mono text-sm overflow-x-auto">
                        {esempio.csv}
                      </div>
                    </Card.Body>
                  </Card>
                ))}
              </div>
            )}

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start">
                <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 mr-3" />
                <div>
                  <h4 className="font-medium text-yellow-900">Suggerimenti</h4>
                  <ul className="text-sm text-yellow-800 mt-2 space-y-1">
                    <li>• Usa nomi consistenti per anagrafiche e categorie</li>
                    <li>• Le tipologie verranno create automaticamente se compatibili</li>
                    <li>• I conti mancanti verranno creati con nome "Conto Principale"</li>
                    <li>• Puoi lasciare vuote le colonne opzionali</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        );

      case 'disclaimer':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Disclaimer e Conferma
              </h3>
              <p className="text-gray-600">
                Leggi attentamente prima di procedere
              </p>
            </div>

            <div className="space-y-4">
              <Card className="border-red-200">
                <Card.Body className="p-4">
                  <h4 className="font-medium text-red-900 mb-3 flex items-center">
                    <AlertCircle className="w-4 h-4 mr-2" />
                    Attenzione - Operazione Irreversibile
                  </h4>
                  <ul className="text-sm text-red-800 space-y-2">
                    <li>• I movimenti importati verranno <strong>aggiunti permanentemente</strong> al database</li>
                    <li>• Le nuove anagrafiche, tipologie e categorie verranno <strong>create definitivamente</strong></li>
                    <li>• Non è possibile annullare automaticamente l'import una volta completato</li>
                    <li>• Eventuali errori dovranno essere corretti manualmente</li>
                  </ul>
                </Card.Body>
              </Card>

              <Card className="border-blue-200">
                <Card.Body className="p-4">
                  <h4 className="font-medium text-blue-900 mb-3 flex items-center">
                    <Info className="w-4 h-4 mr-2" />
                    Raccomandazioni
                  </h4>
                  <ul className="text-sm text-blue-800 space-y-2">
                    <li>• Fai un backup dei dati prima dell'import (sezione Impostazioni)</li>
                    <li>• Testa l'import con poche righe prima di caricare file grandi</li>
                    <li>• Verifica attentamente il formato del tuo CSV</li>
                    <li>• Controlla che le date siano nel formato corretto (YYYY-MM-DD)</li>
                  </ul>
                </Card.Body>
              </Card>

              <div className="bg-gray-50 rounded-lg p-4">
                <label className="flex items-start space-x-3">
                  <input
                    type="checkbox"
                    checked={acceptedDisclaimer}
                    onChange={(e) => setAcceptedDisclaimer(e.target.checked)}
                    className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <div className="text-sm">
                    <span className="font-medium text-gray-900">
                      Confermo di aver letto e compreso
                    </span>
                    <p className="text-gray-600 mt-1">
                      Ho letto tutte le istruzioni, comprendo che l'operazione è irreversibile 
                      e ho preparato il file CSV secondo il formato richiesto.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Import CSV - Guida e Preparazione"
      size="xl"
    >
      <div className="max-h-[80vh] flex flex-col">
        {/* Step Indicator */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          {steps.map((step, index) => {
            const StepIcon = step.icon;
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;

            return (
              <div
                key={index}
                className={`flex items-center ${index < steps.length - 1 ? 'flex-1' : ''}`}
              >
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors ${
                    isActive
                      ? 'bg-primary-500 border-primary-500 text-white'
                      : isCompleted
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'bg-gray-100 border-gray-300 text-gray-400'
                  }`}
                >
                  <StepIcon className="w-4 h-4" />
                </div>
                <div className="ml-2 hidden sm:block">
                  <p className={`text-sm font-medium ${
                    isActive ? 'text-primary-600' : 
                    isCompleted ? 'text-green-600' : 'text-gray-400'
                  }`}>
                    {step.title}
                  </p>
                </div>
                {index < steps.length - 1 && (
                  <div className={`flex-1 h-px mx-4 ${
                    isCompleted ? 'bg-green-500' : 'bg-gray-300'
                  }`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {renderStepContent()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 0}
          >
            Indietro
          </Button>

          <div className="flex space-x-3">
            <Button
              variant="outline"
              onClick={onClose}
            >
              Annulla
            </Button>

            {currentStep < steps.length - 1 ? (
              <Button
                variant="primary"
                onClick={handleNext}
              >
                Avanti
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={handleProceed}
                disabled={!acceptedDisclaimer}
                className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
              >
                <Upload className="w-4 h-4 mr-2" />
                Procedi all'Import
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default ImportDisclaimerModal;