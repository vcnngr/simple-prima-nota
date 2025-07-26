// frontend/src/pages/Reports/ReportsPage.js - VERSIONE NUOVA CON EXPORT WIZARD
import React from 'react';
import { motion } from 'framer-motion';
import { FileText, Download, Sparkles } from 'lucide-react';
import ExportWizard from '../../components/Export/ExportWizard';
import Card from '../../components/UI/Card';

const ReportsPage = () => {
  return (
    <div className="space-y-6">
      {/* Header con informazioni */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-8 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100"
      >
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
            <Download className="w-8 h-8 text-blue-600" />
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Export Dati
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Esporta i tuoi dati contabili in modo semplice e veloce. 
          Scegli cosa esportare, applica i filtri e scarica nei formati che preferisci.
        </p>
        
        <div className="flex items-center justify-center mt-4 space-x-6 text-sm text-gray-500">
          <div className="flex items-center space-x-1">
            <FileText className="w-4 h-4" />
            <span>CSV, Excel, PDF</span>
          </div>
          <div className="flex items-center space-x-1">
            <Sparkles className="w-4 h-4" />
            <span>Wizard Guidato</span>
          </div>
          <div className="flex items-center space-x-1">
            <Download className="w-4 h-4" />
            <span>Anteprima Inclusa</span>
          </div>
        </div>
      </motion.div>

      {/* Export Wizard */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <ExportWizard />
      </motion.div>

      {/* Footer con suggerimenti */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mt-12"
      >
        <Card>
          <Card.Body className="bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
              <Sparkles className="w-5 h-5 mr-2 text-yellow-500" />
              Suggerimenti per l'Export
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
              <div className="space-y-2">
                <h4 className="font-medium text-gray-900">📊 Per il Commercialista</h4>
                <p className="text-gray-600">
                  Usa l'<strong>Estratto per Commercialista</strong> in formato <strong>Excel</strong> 
                  per includere tutti i dettagli necessari per le dichiarazioni fiscali.
                </p>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-medium text-gray-900">📈 Per Analisi Personali</h4>
                <p className="text-gray-600">
                  L'<strong>Estratto Semplice</strong> in <strong>CSV</strong> è perfetto 
                  per importare i dati in Excel e creare le tue analisi personalizzate.
                </p>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-medium text-gray-900">📋 Per Archiviazione</h4>
                <p className="text-gray-600">
                  Il formato <strong>PDF</strong> è ideale per conservare un riepilogo 
                  stampabile dei tuoi movimenti per i documenti ufficiali.
                </p>
              </div>
            </div>

            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">💡 Lo sapevi?</h4>
              <p className="text-blue-800 text-sm">
                Puoi usare l'<strong>anteprima</strong> per verificare esattamente quali dati 
                verranno esportati prima di scaricare il file. Questo ti permette di controllare 
                i filtri e assicurarti che tutto sia corretto.
              </p>
            </div>
          </Card.Body>
        </Card>
      </motion.div>
    </div>
  );
};

export default ReportsPage;