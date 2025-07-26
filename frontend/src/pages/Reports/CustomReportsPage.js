// frontend/src/pages/Reports/CustomReportsPage.js
import React from 'react';
import { motion } from 'framer-motion';
import { Settings, Sparkles, ArrowLeft } from 'lucide-react';
import CustomExportWizard from '../../components/Export/CustomExportWizard';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';

const CustomReportsPage = () => {
  return (
    <div className="space-y-6">
      {/* Header con informazioni */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-8 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border border-purple-100"
      >
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center">
            <Settings className="w-8 h-8 text-purple-600" />
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Export Personalizzato
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Crea export su misura scegliendo esattamente quali campi includere, 
          come ordinarli e quali filtri applicare.
        </p>
        
        <div className="flex items-center justify-center mt-4 space-x-6 text-sm text-gray-500">
          <div className="flex items-center space-x-1">
            <Sparkles className="w-4 h-4" />
            <span>Campi Personalizzabili</span>
          </div>
          <div className="flex items-center space-x-1">
            <Settings className="w-4 h-4" />
            <span>Drag & Drop</span>
          </div>
          <div className="flex items-center space-x-1">
            <Sparkles className="w-4 h-4" />
            <span>Anteprima Live</span>
          </div>
        </div>

        {/* Torna ai Reports Standard */}
        <div className="mt-6">
          <Button
            variant="outline"
            onClick={() => window.location.href = '/reports'}
            className="flex items-center"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Torna agli Export Standard
          </Button>
        </div>
      </motion.div>

      {/* Custom Export Wizard */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <CustomExportWizard />
      </motion.div>

      {/* Footer con suggerimenti personalizzati */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mt-12"
      >
        <Card>
          <Card.Body className="bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
              <Sparkles className="w-5 h-5 mr-2 text-purple-500" />
              Suggerimenti per Export Personalizzati
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
              <div className="space-y-2">
                <h4 className="font-medium text-gray-900">🎯 Campi Essenziali</h4>
                <p className="text-gray-600">
                  Includi sempre <strong>Data</strong>, <strong>Descrizione</strong> e <strong>Importo</strong> 
                  come campi base per qualsiasi analisi dei movimenti.
                </p>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-medium text-gray-900">📊 Ordinamento Smart</h4>
                <p className="text-gray-600">
                  L'ordine dei campi corrisponde alle colonne nell'export. 
                  Metti prima i campi più importanti per la tua analisi.
                </p>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-medium text-gray-900">⚡ Performance</h4>
                <p className="text-gray-600">
                  Meno campi = export più veloce. Seleziona solo 
                  i campi di cui hai realmente bisogno per ottimizzare le prestazioni.
                </p>
              </div>
            </div>

            <div className="mt-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <h4 className="font-medium text-purple-900 mb-2">💡 Esempi di Export Personalizzati</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-purple-800">
                <div>
                  <strong>📋 Per Analisi Fiscale:</strong><br />
                  Data + Descrizione + Importo + Tipo + P.IVA + Note
                </div>
                <div>
                  <strong>📈 Per Analisi Clienti:</strong><br />
                  Data + Cliente + Tipologia + Email + Importo + Categoria
                </div>
                <div>
                  <strong>💰 Per Controllo Conti:</strong><br />
                  Data + Descrizione + Importo + Banca + IBAN
                </div>
                <div>
                  <strong>📞 Per Lista Contatti:</strong><br />
                  Nome + Email + Telefono + Tipologia + Categoria
                </div>
              </div>
            </div>
          </Card.Body>
        </Card>
      </motion.div>
    </div>
  );
};

export default CustomReportsPage;