// ==============================================================================
// FILE: src/components/Import/ImportModal.js
// COMPONENTE: Modal per selezione e caricamento file CSV
// ==============================================================================

import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Upload,
  FileText,
  X,
  AlertCircle,
  CheckCircle,
  Loader2,
  Download,
  Info
} from 'lucide-react';
import Modal from '../UI/Modal';
import Button from '../UI/Button';
import Card from '../UI/Card';

const ImportModal = ({ isOpen, onClose, onImport, isLoading }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [filePreview, setFilePreview] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileSelect = async (file) => {
    if (!file) return;

    // Validazioni file
    const errors = [];
    
    if (!file.name.toLowerCase().endsWith('.csv')) {
      errors.push('Il file deve essere in formato CSV');
    }
    
    if (file.size > 10 * 1024 * 1024) { // 10MB
      errors.push('Il file non può superare 10MB');
    }
    
    if (file.size === 0) {
      errors.push('Il file è vuoto');
    }

    if (errors.length > 0) {
      alert(errors.join('\n'));
      return;
    }

    setSelectedFile(file);

    // Preview prime righe
    try {
      const text = await file.text();
      const lines = text.split('\n').slice(0, 5); // Prime 5 righe
      setFilePreview(lines);
    } catch (error) {
      console.error('Errore lettura file:', error);
      setFilePreview(['Errore nella lettura del file']);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleFileInputChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleImport = () => {
    if (selectedFile && onImport) {
      onImport(selectedFile);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Import CSV - Carica File"
      size="lg"
    >
      <div className="space-y-6">
        {/* Template Download */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start">
              <Info className="w-5 h-5 text-blue-600 mt-0.5 mr-3" />
              <div>
                <h4 className="font-medium text-blue-900">Template Consigliato</h4>
                <p className="text-sm text-blue-700 mt-1">
                  Usa il template ufficiale per evitare errori di formato
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadTemplate}
              className="text-blue-600 border-blue-300 hover:bg-blue-50"
            >
              <Download className="w-4 h-4 mr-1" />
              Template
            </Button>
          </div>
        </div>

        {/* File Drop Zone */}
        <Card className={`transition-colors ${dragOver ? 'border-primary-400 bg-primary-50' : ''}`}>
          <Card.Body>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragOver 
                  ? 'border-primary-400 bg-primary-50' 
                  : selectedFile 
                    ? 'border-green-400 bg-green-50'
                    : 'border-gray-300 hover:border-gray-400'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileInputChange}
                className="hidden"
              />

              {selectedFile ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-4"
                >
                  <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
                  <div>
                    <h3 className="text-lg font-medium text-green-900">File Selezionato</h3>
                    <div className="mt-2 space-y-1">
                      <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                      <p className="text-sm text-gray-600">
                        {formatFileSize(selectedFile.size)} • Modificato: {' '}
                        {new Date(selectedFile.lastModified).toLocaleDateString('it-IT')}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-center space-x-3">
                    <Button variant="outline" size="sm" onClick={handleReset}>
                      <X className="w-4 h-4 mr-1" />
                      Cambia File
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <div className="space-y-4">
                  <Upload className={`w-16 h-16 mx-auto ${dragOver ? 'text-primary-500' : 'text-gray-400'}`} />
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">
                      {dragOver ? 'Rilascia il file qui' : 'Carica file CSV'}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Trascina il file qui o clicca per selezionare
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center justify-center space-y-2 sm:space-y-0 sm:space-x-4">
                    <Button
                      variant="primary"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Seleziona File
                    </Button>
                    <div className="text-xs text-gray-500">
                      CSV • Max 10MB • UTF-8
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card.Body>
        </Card>

        {/* File Preview */}
        {filePreview && (
          <Card>
            <Card.Header>
              <h4 className="font-medium text-gray-900 flex items-center">
                <FileText className="w-4 h-4 mr-2" />
                Anteprima File
              </h4>
            </Card.Header>
            <Card.Body>
              <div className="bg-gray-100 rounded-lg p-3 font-mono text-xs overflow-x-auto">
                {filePreview.map((line, index) => (
                  <div key={index} className={`py-1 ${index === 0 ? 'font-semibold text-blue-700' : ''}`}>
                    <span className="text-gray-500 mr-3">{index + 1}:</span>
                    {line}
                  </div>
                ))}
                {filePreview.length >= 5 && (
                  <div className="py-1 text-gray-500 italic">
                    ... (mostrando prime 5 righe)
                  </div>
                )}
              </div>
            </Card.Body>
          </Card>
        )}

        {/* Validazioni */}
        {selectedFile && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center text-sm">
              <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
              <span className="text-gray-700">Formato CSV</span>
            </div>
            <div className="flex items-center text-sm">
              <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
              <span className="text-gray-700">Dimensione OK</span>
            </div>
            <div className="flex items-center text-sm">
              {filePreview && filePreview.length > 1 ? (
                <>
                  <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                  <span className="text-gray-700">Contiene dati</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-yellow-500 mr-2" />
                  <span className="text-gray-700">Verifica contenuto</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            Annulla
          </Button>

          <div className="flex space-x-3">
            {selectedFile && (
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={isLoading}
              >
                Reset
              </Button>
            )}
            
            <Button
              variant="primary"
              onClick={handleImport}
              disabled={!selectedFile || isLoading}
              loading={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importazione...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Avvia Import
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default ImportModal;