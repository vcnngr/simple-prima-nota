// frontend/src/components/Export/TestAPI.js - Componente temporaneo per test
import React from 'react';
import { exportAPI } from '../../services/api';
import Button from '../UI/Button';
import toast from 'react-hot-toast';

const TestAPI = () => {
  const testPreview = async () => {
    try {
      console.log('🧪 Test API Preview...');
      
      const testConfig = {
        export_type: 'commercialista',
        tutto_storico: true,
        data_inizio: '2024-01-01',
        data_fine: '2024-12-31',
        conto_id: '',
        tipologia_id: '',
        formato: 'json',
        ordina_per: 'data',
        ordine: 'desc',
        solo_attivi: true
      };
      
      console.log('📤 Invio config completa:', testConfig);
      
      const result = await exportAPI.generatePreview(testConfig);
      console.log('📥 Risultato:', result);
      
      toast.success(`Test OK: ${result.data?.length || 0} record trovati`);
      
    } catch (error) {
      console.error('❌ Test fallito:', error);
      console.error('Response:', error.response?.data);
      toast.error(`Test fallito: ${error.message}`);
    }
  };

  const testBackendConnection = async () => {
    try {
      console.log('🧪 Test connessione backend...');
      
      const testPayload = {
        export_type: 'commercialista',
        tutto_storico: true,
        ordina_per: 'data',
        ordine: 'desc',
        solo_attivi: true
      };
      
      console.log('📤 Payload di test:', testPayload);
      
      // Test con fetch diretto
      const response = await fetch('/api/export/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(testPayload)
      });
      
      console.log('Status:', response.status);
      console.log('Headers:', Object.fromEntries(response.headers.entries()));
      
      const data = await response.text();
      console.log('Raw response:', data);
      
      if (response.ok) {
        toast.success('Backend connesso!');
        const parsed = JSON.parse(data);
        console.log('Parsed:', parsed);
        console.log(`Records trovati: ${parsed.data?.length || 0}`);
      } else {
        toast.error(`Errore ${response.status}: ${data}`);
      }
      
    } catch (error) {
      console.error('❌ Connessione fallita:', error);
      toast.error(`Connessione fallita: ${error.message}`);
    }
  };

  return (
    <div className="p-4 border border-orange-300 bg-orange-50 rounded-lg">
      <h3 className="font-bold text-orange-900 mb-3">🧪 Test API Export</h3>
      <div className="space-x-2">
        <Button onClick={testBackendConnection} size="sm" variant="outline">
          Test Connessione
        </Button>
        <Button onClick={testPreview} size="sm" variant="outline">
          Test Preview API
        </Button>
      </div>
      <p className="text-xs text-orange-700 mt-2">
        Apri la console per vedere i dettagli
      </p>
    </div>
  );
};

export default TestAPI;