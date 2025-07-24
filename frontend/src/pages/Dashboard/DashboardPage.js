// src/pages/Dashboard/DashboardPage.js - VERSIONE FLESSIBILE CON TIPOLOGIE
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
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

import { useSearchParams } from 'react-router-dom'; // Aggiungi questo import
import toast from 'react-hot-toast'; // Per le notifiche

const DashboardPage = () => {
  const [selectedPeriod, setSelectedPeriod] = useState('30');
  const [searchParams] = useSearchParams(); // ✅ AGGIUNGI QUESTA RIGA
  const activeTab = searchParams.get('tab') || 'dashboard'; // ✅ AGGIUNGI QUESTA RIGA
  
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
  
  // Dati per i grafici (AGGIORNATI)
  const andamentoData = dashboard.andamento_mensile || [];
  const tipologieEntrate = dashboard.distribuzione_tipologie?.entrate || [];
  const tipologieUscite = dashboard.distribuzione_tipologie?.uscite || [];
  const categorieMovimentiEntrate = dashboard.distribuzione_categorie_movimento?.entrate || [];
  
  // Colori per i grafici
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
  
  // Helper per ottenere icona tipologia (NUOVO)
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
    {/* Andamento mensile (INVARIATO) */}
    <Card>
    <Card.Header>
    <h3 className="text-lg font-semibold text-gray-900">Andamento Mensile</h3>
    <p className="text-sm text-gray-600">Entrate vs Uscite ultimi 6 mesi</p>
    </Card.Header>
    <Card.Body>
    <div className="h-80">
    <ResponsiveContainer width="100%" height="100%">
    <AreaChart data={andamentoData}>
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
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis 
    dataKey="mese_label" 
    fontSize={12}
    tick={{ fill: '#6b7280' }}
    />
    <YAxis 
    fontSize={12}
    tick={{ fill: '#6b7280' }}
    tickFormatter={(value) => `€${(value/1000).toFixed(0)}k`}
    />
    <Tooltip
    formatter={(value, name) => [
      `€${parseFloat(value).toLocaleString('it-IT', { minimumFractionDigits: 2 })}`,
      name === 'entrate' ? 'Entrate' : 'Uscite'
    ]}
    labelStyle={{ color: '#374151' }}
    />
    <Area
    type="monotone"
    dataKey="entrate"
    stroke="#10b981"
    strokeWidth={2}
    fillOpacity={1}
    fill="url(#entrate)"
    />
    <Area
    type="monotone"
    dataKey="uscite"
    stroke="#ef4444"
    strokeWidth={2}
    fillOpacity={1}
    fill="url(#uscite)"
    />
    </AreaChart>
    </ResponsiveContainer>
    </div>
    </Card.Body>
    </Card>
    
    {/* Distribuzione tipologie (NUOVO) */}
    <Card>
    <Card.Header>
    <h3 className="text-lg font-semibold text-gray-900">Distribuzione per Tipologie</h3>
    <p className="text-sm text-gray-600">Entrate per tipologia anagrafica (ultimi 3 mesi)</p>
    </Card.Header>
    <Card.Body>
    <div className="h-80">
    <ResponsiveContainer width="100%" height="100%">
    <PieChart>
    <Pie
    data={tipologieEntrate.slice(0, 6)}
    cx="50%"
    cy="50%"
    innerRadius={60}
    outerRadius={120}
    paddingAngle={5}
    dataKey="totale"
    >
    {tipologieEntrate.slice(0, 6).map((entry, index) => (
      <Cell 
      key={`cell-${index}`} 
      fill={entry.colore || COLORS[index % COLORS.length]} 
      />
    ))}
    </Pie>
    <Tooltip
    formatter={(value) => `€${parseFloat(value).toLocaleString('it-IT', { minimumFractionDigits: 2 })}`}
    />
    </PieChart>
    </ResponsiveContainer>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-2">
    {tipologieEntrate.slice(0, 6).map((tipologia, index) => {
      const Icon = getIconForTipologia(tipologia.icona);
      return (
        <div key={tipologia.tipologia} className="flex items-center text-sm">
        <div 
        className="w-3 h-3 rounded-full mr-2 flex items-center justify-center"
        style={{ backgroundColor: tipologia.colore || COLORS[index % COLORS.length] }}
        >
        <Icon className="w-2 h-2 text-white" />
        </div>
        <span className="text-gray-600 truncate">{tipologia.tipologia}</span>
        </div>
      );
    })}
    </div>
    </Card.Body>
    </Card>
    </div>
    
    {/* Sezione inferiore */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
    {/* Saldi conti (INVARIATO) */}
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
    
    {/* Movimenti recenti (AGGIORNATO CON TIPOLOGIE) */}
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
    
    {/* Top anagrafiche (AGGIORNATO - UNIFICATO) */}
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

// Componente KPI Card - VERSIONE CORRETTA
const KPICard = ({ title, value, icon: Icon, trend, color, format }) => {
  const formatValue = (val) => {
    if (format === 'currency') {
      return `€${parseFloat(val || 0).toLocaleString('it-IT', { minimumFractionDigits: 2 })}`;
    }
    return (val || 0).toLocaleString('it-IT');
  };
  
  // ✅ VERSIONE PIÙ ROBUSTA
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
  
  // ✅ CLASSI CSS STATICHE INVECE CHE DINAMICHE
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
// Componente dedicato per la gestione degli Alerts - VERSIONE MISTA
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