// src/services/api.js
import axios from 'axios';

// Configurazione base axios
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor per aggiungere token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor per gestire risposte
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  verifyToken: () => api.get('/auth/verify'),
  getProfile: () => api.get('/auth/profile'),
  changePassword: (passwordData) => api.post('/auth/change-password', passwordData),
  
  // ✅ CORRETTI - Usano api (Axios) invece di apiRequest
  
  // Statistiche account per conferma eliminazione
  getAccountStats: () => api.get('/auth/account/stats'),
  
  // Eliminazione account
  deleteAccount: (password) => api.delete('/auth/account', { data: { password } }),
  
  // Export backup completo
  // Export backup completo
  exportBackup: async () => {
    try {
      console.log('📦 Inizio export backup...');
      
      const response = await fetch(`${API_BASE_URL}/auth/backup/export`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Errore ${response.status}: ${response.statusText}`);
      }
      
      // Ottieni statistiche e metadata dai headers
      const backupSize = response.headers.get('X-Backup-Size');
      const backupStats = response.headers.get('X-Backup-Stats');
      const username = response.headers.get('X-Backup-Username');
      
      const data = await response.json();
      
      console.log('✅ Backup ricevuto:', {
        size: backupSize + ' MB',
        stats: backupStats ? JSON.parse(backupStats) : null
      });
      
      return {
        data,
        size: backupSize,
        stats: backupStats ? JSON.parse(backupStats) : null,
        username: username
      };
      
    } catch (error) {
      console.error('❌ Errore export backup:', error);
      throw error;
    }
  },
  
  // Import backup
  importBackup: (backupData, mode = 'replace') => 
    api.post('/auth/backup/import', { backupData, mode }),
  
  // Validazione backup (solo frontend)
  validateBackupFile: (fileContent) => {
    try {
      const backup = JSON.parse(fileContent);
      
      // Controlli base
      if (!backup.metadata || !backup.user) {
        return { 
          isValid: false, 
          error: 'File backup non valido: struttura mancante' 
        };
      }
      
      if (backup.metadata.app_name && !backup.metadata.app_name.includes('Prima Nota')) {
        return { 
          isValid: false, 
          error: 'Questo backup non è compatibile con Prima Nota Contabile' 
        };
      }
      
      // Calcola statistiche
      const stats = {
        conti: backup.conti_correnti?.length || 0,
        anagrafiche: backup.anagrafiche?.length || 0,
        movimenti: backup.movimenti?.length || 0,
        tipologie: backup.tipologie_anagrafiche?.length || 0,
        categorie: (backup.categorie_anagrafiche?.length || 0) + (backup.categorie_movimenti?.length || 0),
        export_date: backup.metadata.export_date,
        version: backup.metadata.version,
        username: backup.user.username
      };
      
      return { 
        isValid: true, 
        backup, 
        stats 
      };
      
    } catch (error) {
      return { 
        isValid: false, 
        error: 'File non valido: impossibile leggere il contenuto JSON' 
      };
    }
  },
};

// Conti Bancari API
export const contiBancariAPI = {
  getAll: () => api.get('/conti-bancari'),
  getAttivi: () => api.get('/conti-bancari/attivi'),
  getForDropdown: () => api.get('/conti-bancari/dropdown'),
  getById: (id) => api.get(`/conti-bancari/${id}`),
  create: (data) => api.post('/conti-bancari', data),
  update: (id, data) => api.put(`/conti-bancari/${id}`, data),
  delete: (id) => api.delete(`/conti-bancari/${id}`),
  toggleStato: (id) => api.patch(`/conti-bancari/${id}/toggle-stato`),
  getSaldoStorico: (id) => api.get(`/conti-bancari/${id}/saldo-storico`),
};

// Anagrafiche API
export const anagraficheAPI = {
  getAll: (params = {}) => api.get('/anagrafiche', { params }),
  getAttive: (params = {}) => api.get('/anagrafiche/attive', { params }),
  getCategorie: (params = {}) => api.get('/anagrafiche/categorie', { params }),
  getById: (id) => api.get(`/anagrafiche/${id}`),
  create: (data) => api.post('/anagrafiche', data),
  update: (id, data) => api.put(`/anagrafiche/${id}`, data),
  delete: (id) => api.delete(`/anagrafiche/${id}`),
  toggleStato: (id) => api.patch(`/anagrafiche/${id}/toggle-stato`),
  getMovimenti: (id, params = {}) => api.get(`/anagrafiche/${id}/movimenti`, { params }),
  getStatistiche: (id, params = {}) => api.get(`/anagrafiche/${id}/statistiche`, { params }),
  // NUOVI METODI PER TIPOLOGIE
  getTipologie: (params = {}) => api.get('/anagrafiche/tipologie', { params }),
  createTipologia: (data) => api.post('/anagrafiche/tipologie', data),
  updateTipologia: (id, data) => api.put(`/anagrafiche/tipologie/${id}`, data),
  deleteTipologia: (id) => api.delete(`/anagrafiche/tipologie/${id}`),
  toggleStatoTipologia: (id) => api.patch(`/anagrafiche/tipologie/${id}/toggle-stato`),
};

// Movimenti API
export const movimentiAPI = {
  getAll: (params = {}) => api.get('/movimenti', { params }),
  getRecenti: (params = {}) => api.get('/movimenti/recenti', { params }),
  getById: (id) => api.get(`/movimenti/${id}`),
  create: (data) => api.post('/movimenti', data),
  createBulk: (data) => api.post('/movimenti/bulk', data),
  update: (id, data) => api.put(`/movimenti/${id}`, data),
  delete: (id) => api.delete(`/movimenti/${id}`),
  getStatisticheMensili: (params = {}) => api.get('/movimenti/statistiche/mensili', { params }),
};

// Categorie Anagrafiche API
export const categorieAnagraficheAPI = {
  // Lista tutte le categorie
  getAll: (params = {}) => api.get('/categorie-anagrafiche', { params }),
  // Autocompletamento
  getSuggestions: (query, params = {}) => 
    api.get('/categorie-anagrafiche/suggestions', { 
    params: { q: query, ...params } 
  }),
  // Dettaglio categoria
  getById: (id) => api.get(`/categorie-anagrafiche/${id}`),
  // Crea categoria
  create: (data) => api.post('/categorie-anagrafiche', data),
  // Aggiorna categoria
  update: (id, data) => api.put(`/categorie-anagrafiche/${id}`, data),
  // Elimina categoria
  delete: (id) => api.delete(`/categorie-anagrafiche/${id}`),
  // Attiva/disattiva categoria
  toggle: (id) => api.patch(`/categorie-anagrafiche/${id}/toggle`),
};

// Categorie Movimenti API
export const categorieMovimentiAPI = {
  // Lista tutte le categorie
  getAll: (params = {}) => api.get('/categorie-movimenti', { params }),  
  // Autocompletamento con filtro per tipo
  getSuggestions: (query, tipo = null, params = {}) => 
    api.get('/categorie-movimenti/suggestions', { 
    params: { q: query, tipo, ...params } 
  }),
  // Dettaglio categoria
  getById: (id) => api.get(`/categorie-movimenti/${id}`),
  // Crea categoria
  create: (data) => api.post('/categorie-movimenti', data),
  // Aggiorna categoria
  update: (id, data) => api.put(`/categorie-movimenti/${id}`, data),
  // Elimina categoria
  delete: (id) => api.delete(`/categorie-movimenti/${id}`),
  // Attiva/disattiva categoria
  toggle: (id) => api.patch(`/categorie-movimenti/${id}/toggle`),
};

// Dashboard API
export const dashboardAPI = {
  getDashboard: () => api.get('/dashboard'),
  getKPI: (params = {}) => api.get('/dashboard/kpi', { params }),
  getAlerts: () => api.get('/dashboard/alerts'),
  getQuickStats: () => api.get('/dashboard/quick-stats'),
};

// Export API (Nuovo sistema unificato) - CORRETTO
export const exportAPI = {
  // Genera export con anteprima
  generate: (config) => api.post('/export/generate', config),
  
  // Anteprima (primi 10 record) - CORRETTO
  generatePreview: (config) => api.post('/export/preview', config),
  
  // Export diretti per download - CORRETTI
  generateCSV: async (config) => {
    const response = await api.post('/export/generate', 
      { ...config, formato: 'csv' },
      { 
        responseType: 'blob',
        headers: { 'Accept': 'text/csv' }
      }
    );
    return response;
  },
  
  generateExcel: async (config) => {
    const response = await api.post('/export/generate', 
      { ...config, formato: 'xlsx' },
      { 
        responseType: 'blob',
        headers: { 'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
      }
    );
    return response;
  },
  
  generatePDF: async (config) => {
    const response = await api.post('/export/generate', 
      { ...config, formato: 'pdf' },
      { 
        responseType: 'blob',
        headers: { 'Accept': 'application/pdf' }
      }
    );
    return response;
  }
};

// Reports API (Deprecato - mantenuto per compatibilità)
export const reportsAPI = {
  getEstrattoConto: (params = {}) => api.get('/reports/estratto-conto', { params }),
  getMovimentiAnagrafica: (params = {}) => api.get('/reports/movimenti-anagrafica', { params }),
  getEntrateVsUscite: (params = {}) => api.get('/reports/entrate-vs-uscite', { params }),
  getBilancioMensile: (params = {}) => api.get('/reports/bilancio-mensile', { params }),
  downloadTemplate: () => {
    return api.get('/reports/template', { 
      responseType: 'blob',
      headers: { 'Accept': 'text/csv' }
    });
  },
  export: (endpoint, params = {}) => {
    return api.get(endpoint, { 
      params: { ...params, formato: 'csv' },
      responseType: 'blob',
      headers: { 'Accept': 'text/csv' }
    });
  },
  exportExcel: (endpoint, params = {}) => {
    return api.get(endpoint, { 
      params: { ...params, formato: 'xlsx' },
      responseType: 'blob',
      headers: { 'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    });
  },
  exportPDF: (endpoint, params = {}) => {
    return api.get(endpoint, { 
      params: { ...params, formato: 'pdf' },
      responseType: 'blob',
      headers: { 'Accept': 'application/pdf' }
    });
  },
};

// Utility functions
export const apiUtils = {
  // Gestione errori standardizzata
  handleError: (error) => {
    console.error('API Error:', error);
    
    if (error.response) {
      // Errore dal server
      return {
        message: error.response.data?.error || 'Errore del server',
        status: error.response.status,
        data: error.response.data,
      };
    } else if (error.request) {
      // Errore di rete
      return {
        message: 'Errore di connessione. Verifica la connessione internet.',
        status: 0,
        data: null,
      };
    } else {
      // Errore generico
      return {
        message: error.message || 'Errore sconosciuto',
        status: -1,
        data: null,
      };
    }
  },
  
  // Download file da blob
  downloadBlob: (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
  
  // Formattazione parametri query
  formatQueryParams: (params) => {
    const formatted = {};
    Object.keys(params).forEach(key => {
      const value = params[key];
      if (value !== undefined && value !== null && value !== '') {
        if (value instanceof Date) {
          formatted[key] = value.toISOString().split('T')[0];
        } else {
          formatted[key] = value;
        }
      }
    });
    return formatted;
  },
  
  // Debounce per ricerche
  debounce: (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },
};

export default api;
