// ==============================================================================
// FILE: src/components/Import/ImportResultModal.js
// COMPONENTE: Modal per mostrare risultati import CSV
// ==============================================================================

import React from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle,
  AlertCircle,
  XCircle,
  TrendingUp,
  Users,
  Tag,
  CreditCard,
  Building,
  AlertTriangle,
  Copy,
  ExternalLink
} from 'lucide-react';
import Modal from '../UI/Modal';
import Button from '../UI/Button';
import Card from '../UI/Card';
import Badge from '../UI/Badge';

const ImportResultModal = ({ isOpen, onClose, result }) => {
  if (!result) return null;

  const { success, stats, dettagli, error, suggestions } = result;

  const handleCopyErrors = () => {
    if (dettagli?.warnings) {
      const errorText = dettagli.warnings.join('\n');
      navigator.clipboard.writeText(errorText);
    }
  };

  const renderSuccessContent = () => (
    <div className="space-y-6">
      {/* Header Success */}
      <div className="text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", delay: 0.1 }}
        >
          <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-4" />
        </motion.div>
        <h3 className="text-2xl font-bold text-green-900 mb-2">
          Import Completato con Successo! 🎉
        </h3>
        <p className="text-green-700">
          {stats.movimenti_importati} movimenti sono stati importati correttamente
        </p>
      </div>

      {/* Statistiche Principali */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="text-center border-green-200">
            <Card.Body className="p-4">
              <TrendingUp className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <div className="text-2xl font-bold text-green-600">
                {stats.movimenti_importati}
              </div>
              <div className="text-sm text-gray-600">Movimenti</div>
            </Card.Body>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="text-center border-blue-200">
            <Card.Body className="p-4">
              <Users className="w-8 h-8 text-blue-500 mx-auto mb-2" />
              <div className="text-2xl font-bold text-blue-600">
                {dettagli?.entità_create?.anagrafiche || 0}
              </div>
              <div className="text-sm text-gray-600">Anagrafiche</div>
            </Card.Body>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="text-center border-purple-200">
            <Card.Body className="p-4">
              <Tag className="w-8 h-8 text-purple-500 mx-auto mb-2" />
              <div className="text-2xl font-bold text-purple-600">
                {(dettagli?.entità_create?.tipologie || 0) + 
                 (dettagli?.entità_create?.categorie_anagrafiche || 0) + 
                 (dettagli?.entità_create?.categorie_movimenti || 0)}
              </div>
              <div className="text-sm text-gray-600">Categorie</div>
            </Card.Body>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card className="text-center border-orange-200">
            <Card.Body className="p-4">
              <CreditCard className="w-8 h-8 text-orange-500 mx-auto mb-2" />
              <div className="text-2xl font-bold text-orange-600">
                {dettagli?.entità_create?.conti || 0}
              </div>
              <div className="text-sm text-gray-600">Conti</div>
            </Card.Body>
          </Card>
        </motion.div>
      </div>

      {/* Dettaglio Entità Create */}
      {dettagli?.entità_create && (
        <Card>
          <Card.Header>
            <h4 className="font-medium text-gray-900 flex items-center">
              <Building className="w-4 h-4 mr-2" />
              Nuove Entità Create
            </h4>
          </Card.Header>
          <Card.Body>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Anagrafiche:</span>
                  <Badge variant="primary" size="sm">
                    {dettagli.entità_create.anagrafiche}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Tipologie:</span>
                  <Badge variant="secondary" size="sm">
                    {dettagli.entità_create.tipologie}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Conti Correnti:</span>
                  <Badge variant="warning" size="sm">
                    {dettagli.entità_create.conti}
                  </Badge>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Cat. Anagrafiche:</span>
                  <Badge variant="info" size="sm">
                    {dettagli.entità_create.categorie_anagrafiche}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Cat. Movimenti:</span>
                  <Badge variant="success" size="sm">
                    {dettagli.entità_create.categorie_movimenti}
                  </Badge>
                </div>
              </div>
            </div>
          </Card.Body>
        </Card>
      )}

      {/* Warnings se presenti */}
      {stats.errori > 0 && dettagli?.warnings && (
        <Card className="border-yellow-200">
          <Card.Header>
            <h4 className="font-medium text-yellow-900 flex items-center">
              <AlertTriangle className="w-4 h-4 mr-2" />
              Avvisi ({stats.errori} errori processati)
            </h4>
          </Card.Header>
          <Card.Body>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {dettagli.warnings.slice(0, 5).map((warning, index) => (
                <div key={index} className="text-sm text-yellow-800 bg-yellow-50 p-2 rounded">
                  {warning}
                </div>
              ))}
              {dettagli.warnings.length > 5 && (
                <div className="text-sm text-yellow-600 italic">
                  ... e altri {dettagli.warnings.length - 5} avvisi
                </div>
              )}
            </div>
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyErrors}
                className="text-yellow-700 border-yellow-300"
              >
                <Copy className="w-4 h-4 mr-1" />
                Copia Errori
              </Button>
            </div>
          </Card.Body>
        </Card>
      )}

      {/* Prossimi Steps */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">Cosa fare ora?</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>✅ Controlla i movimenti importati nella lista</li>
          <li>✅ Verifica le nuove anagrafiche create</li>
          <li>✅ Personalizza tipologie e categorie se necessario</li>
          <li>✅ Completa le informazioni mancanti (email, telefono, ecc.)</li>
        </ul>
      </div>
    </div>
  );

  const renderErrorContent = () => (
    <div className="space-y-6">
      {/* Header Error */}
      <div className="text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", delay: 0.1 }}
        >
          <XCircle className="w-20 h-20 text-red-500 mx-auto mb-4" />
        </motion.div>
        <h3 className="text-2xl font-bold text-red-900 mb-2">
          Errore durante l'Import
        </h3>
        <p className="text-red-700">
          L'import non è stato completato a causa di errori nel file CSV
        </p>
      </div>

      {/* Messaggio Errore */}
      <Card className="border-red-200">
        <Card.Header>
          <h4 className="font-medium text-red-900 flex items-center">
            <AlertCircle className="w-4 h-4 mr-2" />
            Dettaglio Errore
          </h4>
        </Card.Header>
        <Card.Body>
          <div className="bg-red-50 border border-red-200 rounded p-3">
            <p className="text-sm text-red-800 font-mono">
              {error}
            </p>
          </div>
        </Card.Body>
      </Card>

      {/* Suggerimenti */}
      {suggestions && suggestions.length > 0 && (
        <Card className="border-blue-200">
          <Card.Header>
            <h4 className="font-medium text-blue-900 flex items-center">
              <AlertCircle className="w-4 h-4 mr-2" />
              Suggerimenti per Risolvere
            </h4>
          </Card.Header>
          <Card.Body>
            <ul className="space-y-2">
              {suggestions.map((suggestion, index) => (
                <li key={index} className="flex items-start text-sm text-blue-800">
                  <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  {suggestion}
                </li>
              ))}
            </ul>
          </Card.Body>
        </Card>
      )}

      {/* Link Utili */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-3">Link Utili</h4>
        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // Download template
              fetch('/api/movimenti/template')
                .then(res => res.blob())
                .then(blob => {
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'template_prima_nota_v2.csv';
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(url);
                  document.body.removeChild(a);
                });
            }}
            className="mr-3"
          >
            <ExternalLink className="w-4 h-4 mr-1" />
            Scarica Template
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open('/help/import-csv', '_blank')}
          >
            <ExternalLink className="w-4 h-4 mr-1" />
            Guida Dettagliata
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={success ? "Risultato Import" : "Errore Import"}
      size="lg"
    >
      <div className="max-h-[80vh] overflow-y-auto">
        {success ? renderSuccessContent() : renderErrorContent()}

        {/* Actions */}
        <div className="flex items-center justify-between pt-6 border-t border-gray-200 mt-6">
          <div>
            {success && (
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
              >
                Aggiorna Pagina
              </Button>
            )}
          </div>

          <div className="flex space-x-3">
            {!success && (
              <Button
                variant="outline"
                onClick={() => {
                  onClose();
                  // Riapri disclaimer per nuovo tentativo
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('reopenImportDisclaimer'));
                  }, 100);
                }}
              >
                Riprova Import
              </Button>
            )}
            
            <Button
              variant="primary"
              onClick={onClose}
            >
              {success ? 'Perfetto!' : 'Ho Capito'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default ImportResultModal;