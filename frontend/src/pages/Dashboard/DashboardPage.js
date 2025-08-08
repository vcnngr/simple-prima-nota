// src/pages/Dashboard/DashboardPage.js - VERSIONE COMPLETA CON MIGLIORAMENTI
import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  CreditCard,
  Users,
  ArrowUpDown,
  Trash2,
  Plus,
  AlertTriangle,
  Eye,
  Download,
  X,
  RefreshCw,
  Calendar,
  Euro,
  Tag,
  Building,
  UserPlus
} from 'lucide-react';
import { dashboardAPI } from '../../services/api';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import Badge from '../../components/UI/Badge';
import LoadingSpinner from '../../components/UI/LoadingSpinner';
import Alert from '../../components/UI/Alert';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';

const DashboardPage = () => {
  const [selectedPeriod, setSelectedPeriod] = useState('30');
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'dashboard';
  
  // Query per dashboard completa
  const { data: dashboardData, isLoading, error, refetch } = useQuery(
    'dashboard',
    dashboardAPI.getDashboard,
    {
      refetchInterval: 5 * 60 * 1000, // Aggiorna ogni 5 minuti
    }
  );
  
  // Query per KPI
  const { data: kpiData } = useQuery(
    ['dashboard-kpi', selectedPeriod],
    () => dashboardAPI.getKPI({ periodo: selectedPeriod }),
    {
      refetchInterval: 2 * 60 * 1000, // Aggiorna ogni 2 minuti
    }
  );
  
  // Query per alerts
  const { data: alertsData } = useQuery(
    'dashboard-alerts',
    dashboardAPI.getAlerts,
    {
      refetchInterval: 5 * 60 * 1000,
    }
  );
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  
  if (error) {
    return (
      <Alert type="danger" className="mb-6">
        Errore nel caricamento della dashboard. 
        <Button variant="outline" size="sm" className="ml-2" onClick={() => refetch()}>
          Riprova
        </Button>
      </Alert>
    );
  }
  
  const dashboard = dashboardData || {};
  const kpi = kpiData?.kpi || {};
  const alerts = alertsData?.alerts || [];
  
  // Dati per i grafici
  const andamentoData = dashboard.andamento_mensile || [];
  const tipologieEntrate = dashboard.distribuzione_tipologie?.entrate || [];
  const tipologieUscite = dashboard.distribuzione_tipologie?.uscite || [];
  //const categorieMovimentiEntrate = dashboard.distribuzione_categorie_movimento?.entrate || [];
  
  // Colori per i grafici
  // const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
  
  // Helper per ottenere icona tipologia
  const getIconForTipologia = (iconName) => {
    const iconMap = {
      'user': UserPlus,
      'building': Building,
      'truck': Building,
      'star': UserPlus,
      'users': Users
    };
    return iconMap[iconName] || UserPlus;
  };
  
  // Se è richiesta la tab alerts, mostra solo gli alerts
  if (activeTab === 'alerts') {
    return <AlertsPage alerts={alerts} refetchDashboard={refetch} />;
  }
  
  return (
    <div className="space-y-6">
      {/* Header con azioni rapide */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-600">
            Panoramica della tua situazione contabile con tipologie flessibili
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex space-x-3">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="form-select text-sm"
          >
            <option value="7">Ultimi 7 giorni</option>
            <option value="30">Ultimi 30 giorni</option>
            <option value="90">Ultimi 3 mesi</option>
            <option value="365">Ultimo anno</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="flex items-center"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Aggiorna
          </Button>
          <Link to="/movimenti?action=new">
            <Button variant="primary" size="sm" className="flex items-center">
              <Plus className="w-4 h-4 mr-1" />
              Nuovo Movimento
            </Button>
          </Link>
        </div>
      </div>
      
      {/* Alerts */}
      {alerts.length > 0 && (
        <Alert type="warning" className="border-l-4 border-warning-500">
          <div className="flex items-center">
            <AlertTriangle className="w-5 h-5 mr-2" />
            <span className="font-medium">
              {alerts.length} {alerts.length === 1 ? 'avviso' : 'avvisi'} {alerts.length === 1 ? 'richiede' : 'richiedono'} attenzione
            </span>
            <Link to="/dashboard?tab=alerts" className="ml-auto text-sm underline">
              Visualizza tutti
            </Link>
          </div>
        </Alert>
      )}
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard
          title="Saldo Totale"
          value={dashboard.riassunto?.saldo_totale || 0}
          icon={Euro}
          trend={dashboard.statistiche_mensili?.variazioni?.saldo_netto}
          color="primary"
          format="currency"
        />
        <KPICard
          title="Entrate Periodo"
          value={kpi.totale_entrate || 0}
          icon={TrendingUp}
          trend={dashboard.statistiche_mensili?.variazioni?.entrate}
          color="success"
          format="currency"
        />
        <KPICard
          title="Uscite Periodo"
          value={kpi.totale_uscite || 0}
          icon={TrendingDown}
          trend={dashboard.statistiche_mensili?.variazioni?.uscite}
          color="danger"
          format="currency"
        />
        <KPICard
          title="Movimenti"
          value={kpi.movimenti_periodo || 0}
          icon={ArrowUpDown}
          trend={dashboard.statistiche_mensili?.variazioni?.movimenti}
          color="gray"
          format="number"
        />
      </div>
      
      {/* Grafici principali */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Andamento mensile - VERSIONE MIGLIORATA */}
        <Card>
          <Card.Header>
            <h3 className="text-lg font-semibold text-gray-900">Andamento Mensile</h3>
            <p className="text-sm text-gray-600">Entrate vs Uscite ultimi 6 mesi</p>
          </Card.Header>
          <Card.Body>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart 
                  data={andamentoData}
                  margin={{ top: 10, right: 30, left: 20, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="entrate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="uscite" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis 
                    dataKey="mese_label" 
                    fontSize={12}
                    tick={{ fill: '#6b7280' }}
                    axisLine={{ stroke: '#e5e7eb' }}
                    tickLine={{ stroke: '#e5e7eb' }}
                  />
                  <YAxis 
                    fontSize={12}
                    tick={{ fill: '#6b7280' }}
                    axisLine={{ stroke: '#e5e7eb' }}
                    tickLine={{ stroke: '#e5e7eb' }}
                    domain={[0, 'dataMax']}
                    tickFormatter={(value) => {
                      // Formattiamo dinamicamente in base al valore massimo
                      if (value >= 1000000) {
                        return `€${(value/1000000).toFixed(1)}M`;
                      } else if (value >= 1000) {
                        return `€${(value/1000).toFixed(0)}k`;
                      } else {
                        return `€${value}`;
                      }
                    }}
                    scale="linear"
                    allowDecimals={false}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      `€${parseFloat(value).toLocaleString('it-IT', { minimumFractionDigits: 2 })}`,
                      name === 'entrate' ? 'Entrate' : 'Uscite'
                    ]}
                    labelStyle={{ color: '#374151', fontWeight: '500' }}
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                      fontSize: '14px'
                    }}
                    cursor={{ stroke: '#d1d5db', strokeWidth: 1 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="entrate"
                    stroke="#10b981"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#entrate)"
                    dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, stroke: '#10b981', strokeWidth: 2, fill: '#ffffff' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="uscite"
                    stroke="#ef4444"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#uscite)"
                    dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, stroke: '#ef4444', strokeWidth: 2, fill: '#ffffff' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            
            {/* Legenda migliorata */}
            <div className="flex items-center justify-center mt-4 space-x-6">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-success-500 rounded-full mr-2"></div>
                <span className="text-sm text-gray-600 font-medium">Entrate</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-danger-500 rounded-full mr-2"></div>
                <span className="text-sm text-gray-600 font-medium">Uscite</span>
              </div>
            </div>
            
            {/* Statistiche rapide */}
            {andamentoData.length > 0 && (
              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100">
                <div className="text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Media Entrate</p>
                  <p className="text-lg font-semibold text-success-600">
                    €{(andamentoData.reduce((sum, item) => sum + (parseFloat(item.entrate) || 0), 0) / andamentoData.length).toLocaleString('it-IT', { maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Media Uscite</p>
                  <p className="text-lg font-semibold text-danger-600">
                    €{(andamentoData.reduce((sum, item) => sum + (parseFloat(item.uscite) || 0), 0) / andamentoData.length).toLocaleString('it-IT', { maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>
            )}
          </Card.Body>
        </Card>
        
        {/* Distribuzione tipologie - VERSIONE IBRIDA AVANZATA */}
        <Card>
          <Card.Header>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Attività per Tipologie</h3>
                <p className="text-sm text-gray-600">Analisi operativa ultimi 3 mesi</p>
              </div>
            </div>
          </Card.Header>
          <Card.Body>
            <TipologieHybridChart 
              entrateData={tipologieEntrate} 
              usciteData={tipologieUscite}
              getIconForTipologia={getIconForTipologia}
            />
          </Card.Body>
        </Card>
      </div>
      
      {/* Sezione inferiore */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Saldi conti */}
        <Card>
          <Card.Header className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Saldi Conti</h3>
            <Link to="/conti-bancari">
              <Button variant="ghost" size="sm">
                <Eye className="w-4 h-4" />
              </Button>
            </Link>
          </Card.Header>
          <Card.Body className="p-0">
            <div className="space-y-0">
              {dashboard.saldi_conti?.slice(0, 5).map((conto, index) => (
                <div key={conto.id} className="px-6 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {conto.nome_banca}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {conto.intestatario}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${
                        parseFloat(conto.saldo_corrente) >= 0 
                          ? 'text-success-600' 
                          : 'text-danger-600'
                      }`}>
                        €{parseFloat(conto.saldo_corrente).toLocaleString('it-IT', { 
                          minimumFractionDigits: 2 
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card.Body>
          {dashboard.saldi_conti?.length > 5 && (
            <Card.Footer>
              <Link to="/conti-bancari" className="text-sm text-primary-600 hover:text-primary-700">
                Visualizza tutti i conti →
              </Link>
            </Card.Footer>
          )}
        </Card>
        
        {/* Movimenti recenti */}
        <Card>
          <Card.Header className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Movimenti Recenti</h3>
            <Link to="/movimenti">
              <Button variant="ghost" size="sm">
                <Eye className="w-4 h-4" />
              </Button>
            </Link>
          </Card.Header>
          <Card.Body className="p-0">
            <div className="space-y-0">
              {dashboard.movimenti_recenti?.slice(0, 5).map((movimento) => {
                const IconTipologia = getIconForTipologia(movimento.tipologia_icona);
                return (
                  <div key={movimento.id} className="px-6 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center flex-1 min-w-0">
                        {movimento.tipologia_colore && (
                          <div 
                            className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mr-3"
                            style={{ backgroundColor: movimento.tipologia_colore + '20' }}
                          >
                            <IconTipologia 
                              className="w-3 h-3" 
                              style={{ color: movimento.tipologia_colore }} 
                            />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {movimento.descrizione}
                          </p>
                          <div className="flex items-center mt-1 space-x-2">
                            <p className="text-xs text-gray-500">
                              {new Date(movimento.data).toLocaleDateString('it-IT')}
                            </p>
                            {movimento.anagrafica_nome && (
                              <>
                                <span className="text-xs text-gray-300">•</span>
                                <p className="text-xs text-gray-500 truncate">
                                  {movimento.anagrafica_nome}
                                </p>
                              </>
                            )}
                            {movimento.tipologia_nome && (
                              <>
                                <span className="text-xs text-gray-300">•</span>
                                <Badge 
                                  variant="custom" 
                                  size="xs"
                                  style={{
                                    backgroundColor: (movimento.tipologia_colore || '#6B7280') + '20',
                                    color: movimento.tipologia_colore || '#6B7280'
                                  }}
                                >
                                  {movimento.tipologia_nome}
                                </Badge>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-semibold ${
                          movimento.tipo === 'Entrata' 
                            ? 'text-success-600' 
                            : 'text-danger-600'
                        }`}>
                          {movimento.tipo === 'Entrata' ? '+' : '-'}€{parseFloat(movimento.importo).toLocaleString('it-IT', { 
                            minimumFractionDigits: 2 
                          })}
                        </p>
                        <Badge 
                          variant={movimento.tipo === 'Entrata' ? 'success' : 'danger'}
                          size="sm"
                        >
                          {movimento.tipo}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card.Body>
          <Card.Footer>
            <Link to="/movimenti" className="text-sm text-primary-600 hover:text-primary-700">
              Visualizza tutti i movimenti →
            </Link>
          </Card.Footer>
        </Card>
        
        {/* Top anagrafiche */}
        <Card>
          <Card.Header className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Top Anagrafiche</h3>
            <Link to="/anagrafiche">
              <Button variant="ghost" size="sm">
                <Eye className="w-4 h-4" />
              </Button>
            </Link>
          </Card.Header>
          <Card.Body className="p-0">
            <div className="space-y-0">
              {/* Top per entrate */}
              <div className="px-6 py-2 bg-success-50 border-b">
                <p className="text-xs font-medium text-success-700 uppercase tracking-wide">
                  Maggiori Entrate (3 mesi)
                </p>
              </div>
              {dashboard.top_anagrafiche?.entrate?.slice(0, 3).map((anagrafica, index) => {
                const IconTipologia = getIconForTipologia(anagrafica.tipologia_icona);
                return (
                  <div key={`entrate-${anagrafica.id}`} className="px-6 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 w-8 h-8 bg-success-100 rounded-full flex items-center justify-center mr-3">
                          <span className="text-xs font-semibold text-success-600">
                            #{index + 1}
                          </span>
                        </div>
                        <div className="flex items-center">
                          {anagrafica.tipologia_colore && (
                            <div 
                              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mr-2"
                              style={{ backgroundColor: anagrafica.tipologia_colore + '20' }}
                            >
                              <IconTipologia 
                                className="w-3 h-3" 
                                style={{ color: anagrafica.tipologia_colore }} 
                              />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {anagrafica.nome}
                            </p>
                            <div className="flex items-center space-x-2">
                              <p className="text-xs text-gray-500">
                                {anagrafica.numero_movimenti} movimenti
                              </p>
                              {anagrafica.tipologia_nome && (
                                <>
                                  <span className="text-xs text-gray-300">•</span>
                                  <Badge 
                                    variant="custom" 
                                    size="xs"
                                    style={{
                                      backgroundColor: (anagrafica.tipologia_colore || '#6B7280') + '20',
                                      color: anagrafica.tipologia_colore || '#6B7280'
                                    }}
                                  >
                                    {anagrafica.tipologia_nome}
                                  </Badge>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-success-600">
                          €{parseFloat(anagrafica.totale_entrate).toLocaleString('it-IT', { 
                            minimumFractionDigits: 2 
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {/* Separatore */}
              <div className="px-6 py-2 bg-danger-50 border-b border-t">
                <p className="text-xs font-medium text-danger-700 uppercase tracking-wide">
                  Maggiori Uscite (3 mesi)
                </p>
              </div>
              
              {/* Top per uscite */}
              {dashboard.top_anagrafiche?.uscite?.slice(0, 2).map((anagrafica, index) => {
                const IconTipologia = getIconForTipologia(anagrafica.tipologia_icona);
                return (
                  <div key={`uscite-${anagrafica.id}`} className="px-6 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 w-8 h-8 bg-danger-100 rounded-full flex items-center justify-center mr-3">
                          <span className="text-xs font-semibold text-danger-600">
                            #{index + 1}
                          </span>
                        </div>
                        <div className="flex items-center">
                          {anagrafica.tipologia_colore && (
                            <div 
                              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mr-2"
                              style={{ backgroundColor: anagrafica.tipologia_colore + '20' }}
                            >
                              <IconTipologia 
                                className="w-3 h-3" 
                                style={{ color: anagrafica.tipologia_colore }} 
                              />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {anagrafica.nome}
                            </p>
                            <div className="flex items-center space-x-2">
                              <p className="text-xs text-gray-500">
                                {anagrafica.numero_movimenti} movimenti
                              </p>
                              {anagrafica.tipologia_nome && (
                                <>
                                  <span className="text-xs text-gray-300">•</span>
                                  <Badge 
                                    variant="custom" 
                                    size="xs"
                                    style={{
                                      backgroundColor: (anagrafica.tipologia_colore || '#6B7280') + '20',
                                      color: anagrafica.tipologia_colore || '#6B7280'
                                    }}
                                  >
                                    {anagrafica.tipologia_nome}
                                  </Badge>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-danger-600">
                          €{parseFloat(anagrafica.totale_uscite).toLocaleString('it-IT', { 
                            minimumFractionDigits: 2 
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card.Body>
          <Card.Footer>
            <Link to="/anagrafiche" className="text-sm text-primary-600 hover:text-primary-700">
              Visualizza tutte le anagrafiche →
            </Link>
          </Card.Footer>
        </Card>
      </div>
      
      {/* Azioni rapide */}
      <Card>
        <Card.Header>
          <h3 className="text-lg font-semibold text-gray-900">Azioni Rapide</h3>
          <p className="text-sm text-gray-600">Le operazioni più comuni</p>
        </Card.Header>
        <Card.Body>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <QuickActionCard
              title="Nuovo Movimento"
              description="Registra entrata/uscita"
              icon={Plus}
              link="/movimenti?action=new"
              color="primary"
            />
            <QuickActionCard
              title="Aggiungi Conto"
              description="Nuovo conto bancario"
              icon={CreditCard}
              link="/conti-bancari?action=new"
              color="success"
            />
            <QuickActionCard
              title="Nuova Anagrafica"
              description="Cliente o fornitore"
              icon={Users}
              link="/anagrafiche?action=new"
              color="warning"
            />
            <QuickActionCard
              title="Genera Report"
              description="Estratti e analisi"
              icon={Download}
              link="/reports"
              color="gray"
            />
          </div>
        </Card.Body>
      </Card>
    </div>
  );
};

// Componente del grafico ibrido tipologie - VERSIONE CORRETTA
const TipologieHybridChart = ({ entrateData, usciteData, getIconForTipologia }) => {
  const [activeView, setActiveView] = useState('frequenza');
  const [selectedType, setSelectedType] = useState('entrate');
  const [hoveredItem, setHoveredItem] = useState(null);

  // Prepara i dati in base alla vista attiva
  const getCurrentData = () => {
    const sourceData = selectedType === 'entrate' ? entrateData : usciteData;
    
    return sourceData.slice(0, 6).map(item => {
      const baseData = {
        tipologia: item.tipologia,
        colore: item.colore,
        icona: item.icona,
        numero_movimenti: parseInt(item.numero_movimenti || 0), // ASSICURIAMOCI CHE SIA UN NUMERO
        totale: parseFloat(item.totale || 0)
      };

      switch (activeView) {
        case 'frequenza':
          return { ...baseData, valore: baseData.numero_movimenti, suffix: '' };
        case 'totale':
          return { ...baseData, valore: baseData.totale, suffix: '€' };
        case 'media':
          const media = baseData.numero_movimenti > 0 ? baseData.totale / baseData.numero_movimenti : 0;
          return { ...baseData, valore: media, suffix: '€' };
        default:
          return { ...baseData, valore: baseData.numero_movimenti, suffix: '' };
      }
    });
  };

  const currentData = getCurrentData();
  const maxValue = Math.max(...currentData.map(d => d.valore));

  // Calcola totali per header - FIX CONCATENAZIONE
  const totals = {
    movimenti: currentData.reduce((sum, item) => sum + parseInt(item.numero_movimenti || 0), 0),
    valore: currentData.reduce((sum, item) => sum + item.totale, 0),
    media: currentData.length > 0 ? currentData.reduce((sum, item) => sum + item.totale, 0) / currentData.reduce((sum, item) => sum + item.numero_movimenti, 0) : 0
  };

  return (
    <div className="space-y-6">
      {/* Header con statistiche e toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">
              {activeView === 'frequenza' ? totals.movimenti :
               activeView === 'totale' ? `€${totals.valore.toLocaleString('it-IT', { maximumFractionDigits: 0 })}` :
               `€${totals.media.toLocaleString('it-IT', { maximumFractionDigits: 0 })}`}
            </p>
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              {activeView === 'frequenza' ? 'Tot. Movimenti' : 
               activeView === 'totale' ? 'Valore Totale' : 'Media per Mov.'}
            </p>
          </div>
          
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setSelectedType('entrate')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 flex items-center ${
                selectedType === 'entrate'
                  ? 'bg-success-100 text-success-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <TrendingUp className="w-3 h-3 mr-1" />
              Entrate
            </button>
            <button
              onClick={() => setSelectedType('uscite')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 flex items-center ${
                selectedType === 'uscite'
                  ? 'bg-danger-100 text-danger-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <TrendingDown className="w-3 h-3 mr-1" />
              Uscite
            </button>
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setActiveView('frequenza')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 flex items-center ${
              activeView === 'frequenza'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <ArrowUpDown className="w-3 h-3 mr-1" />
            Frequenza
          </button>
          <button
            onClick={() => setActiveView('totale')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 flex items-center ${
              activeView === 'totale'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Euro className="w-3 h-3 mr-1" />
            Valori
          </button>
          <button
            onClick={() => setActiveView('media')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 flex items-center ${
              activeView === 'media'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <TrendingUp className="w-3 h-3 mr-1" />
            Media
          </button>
        </div>
      </div>

      {/* Grafico a barre orizzontali */}
      <div className="space-y-3">
        {currentData.length > 0 ? currentData.map((item, index) => {
          const Icon = getIconForTipologia(item.icona);
          const percentage = maxValue > 0 ? (item.valore / maxValue) * 100 : 0;
          const isHovered = hoveredItem === index;
          
          return (
            <motion.div
              key={`${item.tipologia}-${activeView}-${selectedType}`}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`group relative p-4 rounded-lg border transition-all duration-200 cursor-pointer ${
                isHovered 
                  ? 'border-gray-300 shadow-md bg-gray-50' 
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onMouseEnter={() => setHoveredItem(index)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center flex-1 min-w-0">
                  {/* Icona tipologia */}
                  <div 
                    className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center mr-4 transition-transform duration-200"
                    style={{ 
                      backgroundColor: (item.colore || '#6B7280') + '20',
                      transform: isHovered ? 'scale(1.1)' : 'scale(1)'
                    }}
                  >
                    <Icon 
                      className="w-5 h-5" 
                      style={{ color: item.colore || '#6B7280' }} 
                    />
                  </div>
                  
                  {/* Info tipologia */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-gray-900 truncate">
                        {item.tipologia}
                      </h4>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">
                          {activeView === 'frequenza' ? item.valore :
                           `${item.suffix}${item.valore.toLocaleString('it-IT', { maximumFractionDigits: 0 })}`}
                        </p>
                        <p className="text-xs text-gray-500">
                          {activeView === 'frequenza' ? 'movimenti' :
                           activeView === 'totale' ? `${item.numero_movimenti} mov.` :
                           'per movimento'}
                        </p>
                      </div>
                    </div>
                    
                    {/* Barra di progresso */}
                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ 
                          backgroundColor: item.colore || '#6B7280',
                          width: `${percentage}%`
                        }}
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ delay: index * 0.1 + 0.3, duration: 0.8 }}
                      />
                    </div>
                    
                    {/* Dettagli aggiuntivi */}
                    <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                      <span>{percentage.toFixed(1)}% del totale</span>
                      {activeView !== 'frequenza' && (
                        <span>{item.numero_movimenti} movimenti</span>
                      )}
                      {activeView !== 'totale' && (
                        <span>€{item.totale.toLocaleString('it-IT', { maximumFractionDigits: 0 })}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Tooltip hover */}
              {isHovered && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute top-full left-4 right-4 mt-2 p-3 bg-white border border-gray-200 rounded-lg shadow-lg z-10"
                >
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="font-medium text-gray-900">{item.numero_movimenti}</p>
                      <p className="text-gray-500">Movimenti</p>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        €{item.totale.toLocaleString('it-IT', { maximumFractionDigits: 0 })}
                      </p>
                      <p className="text-gray-500">Totale</p>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        €{(item.totale / Math.max(item.numero_movimenti, 1)).toLocaleString('it-IT', { maximumFractionDigits: 0 })}
                      </p>
                      <p className="text-gray-500">Media</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          );
        }) : (
          <div className="text-center py-8">
            <div className="flex items-center justify-center w-12 h-12 bg-gray-100 rounded-full mx-auto mb-3">
              <Tag className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-gray-500 text-sm">
              Nessuna tipologia trovata per {selectedType}
            </p>
          </div>
        )}
      </div>

      {/* Footer con link di approfondimento */}
      <div className="pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between text-sm">
          <p className="text-gray-500">
            Mostrando le {Math.min(currentData.length, 6)} tipologie più attive
          </p>
          <Link to="/anagrafiche" className="text-primary-600 hover:text-primary-700 flex items-center">
            Gestisci tipologie
            <Eye className="w-4 h-4 ml-1" />
          </Link>
        </div>
      </div>
    </div>
  );
};

// Componente KPI Card
const KPICard = ({ title, value, icon: Icon, trend, color, format }) => {
  const formatValue = (val) => {
    if (format === 'currency') {
      return `€${parseFloat(val || 0).toLocaleString('it-IT', { minimumFractionDigits: 2 })}`;
    }
    return (val || 0).toLocaleString('it-IT');
  };
  
  const trendValue = parseFloat(trend || 0);
  const hasTrend = trend !== null && trend !== undefined && trendValue !== 0 && !isNaN(trendValue);
  
  const getTrendIcon = () => {
    if (!hasTrend) return null;
    return trendValue > 0 ? (
      <TrendingUp className="w-4 h-4 text-success-600" />
    ) : (
      <TrendingDown className="w-4 h-4 text-danger-600" />
    );
  };
  
  const getTrendColor = () => {
    if (!hasTrend) return 'text-gray-500';
    return trendValue > 0 ? 'text-success-600' : 'text-danger-600';
  };
  
  const getColorClasses = () => {
    switch (color) {
      case 'primary': return { bg: 'bg-primary-100', text: 'text-primary-600' };
      case 'success': return { bg: 'bg-success-100', text: 'text-success-600' };
      case 'danger': return { bg: 'bg-danger-100', text: 'text-danger-600' };
      case 'gray': return { bg: 'bg-gray-100', text: 'text-gray-600' };
      default: return { bg: 'bg-gray-100', text: 'text-gray-600' };
    }
  };
  
  const colorClasses = getColorClasses();
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="hover:shadow-md transition-shadow duration-200">
        <Card.Body>
          <div className="flex items-center">
            <div className={`flex-shrink-0 p-3 rounded-lg ${colorClasses.bg}`}>
              <Icon className={`w-6 h-6 ${colorClasses.text}`} />
            </div>
            <div className="ml-4 flex-1">
              <p className="text-sm font-medium text-gray-600">{title}</p>
              <div className="flex items-center mt-1">
                <p className="text-2xl font-semibold text-gray-900">
                  {formatValue(value)}
                </p>
                {hasTrend && (
                  <div className="ml-2 flex items-center text-sm">
                    {getTrendIcon()}
                    <span className={`ml-1 ${getTrendColor()}`}>
                      {Math.abs(trendValue)}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card.Body>
      </Card>
    </motion.div>
  );
};

// Componente Quick Action Card
const QuickActionCard = ({ title, description, icon: Icon, link, color }) => {
  return (
    <Link to={link}>
      <div className="group p-4 rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200 cursor-pointer">
        <div className="flex items-center">
          <div className={`flex-shrink-0 p-2 rounded-lg bg-${color}-100 group-hover:bg-${color}-200 transition-colors`}>
            <Icon className={`w-5 h-5 text-${color}-600`} />
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-medium text-gray-900 group-hover:text-gray-700">
              {title}
            </p>
            <p className="text-xs text-gray-500">
              {description}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
};

// Componente dedicato per la gestione degli Alerts
const AlertsPage = ({ alerts, refetchDashboard }) => {
  const [processingAlert, setProcessingAlert] = useState(null);
  
  // Separare alerts persistenti da quelli dinamici
  const persistentAlerts = alerts.filter(alert => alert.id && alert.isPersistent);
  const dynamicAlerts = alerts.filter(alert => !alert.id || !alert.isPersistent);
  
  // Gestione alerts persistenti (database)
  const handleMarkAsRead = async (alert) => {
    if (!alert || !alert.id) {
      toast.error('ID alert non valido');
      return;
    }
    
    try {
      setProcessingAlert(alert.id);
      
      const response = await fetch(`/api/alerts/${alert.id}/read`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        toast.success('Avviso contrassegnato come letto');
        refetchDashboard();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Errore nel marcare come letto');
      }
    } catch (error) {
      console.error('Error marking alert as read:', error);
      toast.error(`Errore: ${error.message}`);
    } finally {
      setProcessingAlert(null);
    }
  };

  const handleDeleteAlert = async (alert) => {
    if (!alert || !alert.id) {
      toast.error('ID alert non valido');
      return;
    }
    
    if (!window.confirm(`Sei sicuro di voler eliminare l'avviso "${alert.titolo}"?`)) {
      return;
    }
    
    try {
      setProcessingAlert(alert.id);
      
      const response = await fetch(`/api/alerts/${alert.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        toast.success('Avviso eliminato con successo');
        refetchDashboard();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Errore nell\'eliminazione');
      }
    } catch (error) {
      console.error('Error deleting alert:', error);
      toast.error(`Errore: ${error.message}`);
    } finally {
      setProcessingAlert(null);
    }
  };

  // Gestione alerts dinamici (localStorage)
  const handleDismissDynamicAlert = (alertType, alertIndex) => {
    try {
      const dismissedAlerts = JSON.parse(localStorage.getItem('dismissedAlerts') || '[]');
      const alertKey = `${alertType}_${alertIndex}_${Date.now()}`;
      
      dismissedAlerts.push({
        key: alertKey,
        type: alertType,
        index: alertIndex,
        dismissedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h
      });
      
      localStorage.setItem('dismissedAlerts', JSON.stringify(dismissedAlerts));
      toast.success('Avviso nascosto per 24 ore');
      
      // Rimuovi l'alert dalla lista locale temporaneamente
      setTimeout(() => refetchDashboard(), 500);
    } catch (error) {
      console.error('Error dismissing dynamic alert:', error);
      toast.error('Errore nel nascondere l\'avviso');
    }
  };

  const handleMarkAllPersistentAsRead = async () => {
    if (persistentAlerts.length === 0) {
      toast.info('Nessun avviso persistente da contrassegnare');
      return;
    }

    if (!window.confirm('Contrassegnare tutti gli avvisi salvati come letti?')) {
      return;
    }
    
    try {
      setProcessingAlert('all-persistent');
      
      const response = await fetch('/api/alerts/mark-all-read', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        toast.success('Tutti gli avvisi salvati contrassegnati come letti');
        refetchDashboard();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Errore nel marcare tutti come letti');
      }
    } catch (error) {
      console.error('Error marking all alerts as read:', error);
      toast.error(`Errore: ${error.message}`);
    } finally {
      setProcessingAlert(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Centro Avvisi</h1>
          <p className="mt-1 text-sm text-gray-600">
            Gestisci avvisi salvati e notifiche di sistema
          </p>
        </div>
        <div className="flex items-center space-x-3">
          {persistentAlerts.length > 0 && (
            <Button
              variant="outline"
              onClick={handleMarkAllPersistentAsRead}
              loading={processingAlert === 'all-persistent'}
              className="flex items-center"
            >
              <Eye className="w-4 h-4 mr-1" />
              Segna tutti salvati come letti
            </Button>
          )}
          <Link to="/dashboard" className="text-primary-600 hover:text-primary-700">
            ← Torna alla Dashboard
          </Link>
        </div>
      </div>

      <Card>
        <Card.Header className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            Avvisi Attivi ({alerts.length})
          </h3>
          <div className="flex items-center space-x-2">
            {persistentAlerts.length > 0 && (
              <Badge variant="warning" className="flex items-center">
                <AlertTriangle className="w-3 h-3 mr-1" />
                {persistentAlerts.length} salvati
              </Badge>
            )}
            {dynamicAlerts.length > 0 && (
              <Badge variant="info" className="flex items-center">
                <RefreshCw className="w-3 h-3 mr-1" />
                {dynamicAlerts.length} sistema
              </Badge>
            )}
          </div>
        </Card.Header>
        <Card.Body>
          {/* ALERTS PERSISTENTI (dal database - eliminabili) */}
          {persistentAlerts.length > 0 && (
            <div className="mb-6">
              <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                <AlertTriangle className="w-4 h-4 mr-2 text-warning-600" />
                Avvisi Salvati ({persistentAlerts.length})
              </h4>
              <div className="space-y-3">
                {persistentAlerts.map((alert) => (
                  <motion.div
                    key={alert.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="group p-4 bg-warning-50 border border-warning-200 rounded-lg hover:shadow-sm transition-all duration-200"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start flex-1">
                        <div className="flex-shrink-0 p-2 bg-warning-100 rounded-lg mr-3">
                          <AlertTriangle className="w-5 h-5 text-warning-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h5 className="font-semibold text-warning-800 mb-1">
                            {alert.titolo || 'Avviso'}
                          </h5>
                          <p className="text-sm text-warning-700 mb-2">
                            {alert.messaggio || 'Dettagli non disponibili'}
                          </p>
                          <div className="flex items-center text-xs text-warning-600 space-x-4">
                            {alert.data_creazione && (
                              <div className="flex items-center">
                                <Calendar className="w-3 h-3 mr-1" />
                                {new Date(alert.data_creazione).toLocaleDateString('it-IT', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </div>
                            )}
                            <Badge variant="warning" size="xs">
                              Persistente
                            </Badge>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2 ml-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMarkAsRead(alert)}
                          loading={processingAlert === alert.id}
                          title="Segna come letto"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteAlert(alert)}
                          loading={processingAlert === alert.id}
                          title="Elimina avviso"
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-danger-600 hover:text-danger-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* ALERTS DINAMICI (calcolati - nascondibili temporaneamente) */}
          {dynamicAlerts.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                <RefreshCw className="w-4 h-4 mr-2 text-blue-600" />
                Avvisi Sistema ({dynamicAlerts.length})
              </h4>
              <div className="space-y-3">
                {dynamicAlerts.map((alert, index) => (
                  <motion.div
                    key={`dynamic-${index}`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="group p-4 bg-blue-50 border border-blue-200 rounded-lg hover:shadow-sm transition-all duration-200"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start flex-1">
                        <div className="flex-shrink-0 p-2 bg-blue-100 rounded-lg mr-3">
                          <AlertTriangle className="w-5 h-5 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h5 className="font-semibold text-blue-900 mb-1">
                            {alert.titolo || alert.title || 'Avviso Sistema'}
                          </h5>
                          <p className="text-sm text-blue-700 mb-2">
                            {alert.messaggio || alert.message || 'Dettagli non disponibili'}
                          </p>
                          <div className="flex items-center text-xs text-blue-600 space-x-4">
                            <Badge variant="info" size="xs">
                              Avviso dinamico
                            </Badge>
                            {alert.tipo && (
                              <Badge variant="info" size="xs">
                                {alert.tipo}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDismissDynamicAlert(alert.type || 'generic', index)}
                        title="Nascondi per 24 ore"
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-600 hover:text-blue-700"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </div>
              <Alert type="info" className="mt-4">
                <div className="flex items-center">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  <span className="text-sm">
                    Gli avvisi sistema vengono calcolati in tempo reale. Puoi nasconderli temporaneamente, ma riappariranno se la condizione persiste.
                  </span>
                </div>
              </Alert>
            </div>
          )}

          {/* NESSUN AVVISO */}
          {alerts.length === 0 && (
            <div className="text-center py-12">
              <div className="flex items-center justify-center w-16 h-16 bg-success-100 rounded-full mx-auto mb-4">
                <Eye className="w-8 h-8 text-success-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Nessun avviso presente
              </h3>
              <p className="text-gray-600">
                Ottimo! Non ci sono avvisi che richiedono la tua attenzione.
              </p>
            </div>
          )}
        </Card.Body>
      </Card>
    </div>
  );
};

export default DashboardPage;