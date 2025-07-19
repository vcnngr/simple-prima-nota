// src/pages/Dashboard/DashboardPage.js
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
  Plus,
  AlertTriangle,
  Eye,
  Download,
  RefreshCw,
  Calendar,
  Euro
} from 'lucide-react';
import { dashboardAPI } from '../../services/api';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import Badge from '../../components/UI/Badge';
import LoadingSpinner from '../../components/UI/LoadingSpinner';
import Alert from '../../components/UI/Alert';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const DashboardPage = () => {
  const [selectedPeriod, setSelectedPeriod] = useState('30');

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
  const categorieEntrate = dashboard.distribuzione_categorie?.entrate || [];
  const categorieUscite = dashboard.distribuzione_categorie?.uscite || [];

  // Colori per i grafici
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  return (
    <div className="space-y-6">
      {/* Header con azioni rapide */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-600">
            Panoramica della tua situazione contabile
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
        {/* Andamento mensile */}
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

        {/* Distribuzione categorie */}
        <Card>
          <Card.Header>
            <h3 className="text-lg font-semibold text-gray-900">Categorie Principali</h3>
            <p className="text-sm text-gray-600">Distribuzione per categorie (ultimi 3 mesi)</p>
          </Card.Header>
          <Card.Body>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categorieEntrate.slice(0, 6)}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={120}
                    paddingAngle={5}
                    dataKey="totale"
                  >
                    {categorieEntrate.slice(0, 6).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => `€${parseFloat(value).toLocaleString('it-IT', { minimumFractionDigits: 2 })}`}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {categorieEntrate.slice(0, 6).map((categoria, index) => (
                <div key={categoria.categoria} className="flex items-center text-sm">
                  <div 
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-gray-600 truncate">{categoria.categoria}</span>
                </div>
              ))}
            </div>
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
              {dashboard.movimenti_recenti?.slice(0, 5).map((movimento) => (
                <div key={movimento.id} className="px-6 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
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
              ))}
            </div>
          </Card.Body>
          <Card.Footer>
            <Link to="/movimenti" className="text-sm text-primary-600 hover:text-primary-700">
              Visualizza tutti i movimenti →
            </Link>
          </Card.Footer>
        </Card>

        {/* Top clienti/fornitori */}
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
              {/* Top clienti */}
              {dashboard.top_clienti?.slice(0, 3).map((cliente, index) => (
                <div key={cliente.id} className="px-6 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 w-8 h-8 bg-success-100 rounded-full flex items-center justify-center mr-3">
                        <span className="text-xs font-semibold text-success-600">
                          #{index + 1}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {cliente.nome}
                        </p>
                        <p className="text-xs text-gray-500">
                          {cliente.numero_movimenti} movimenti
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-success-600">
                        €{parseFloat(cliente.totale_entrate).toLocaleString('it-IT', { 
                          minimumFractionDigits: 2 
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Top fornitori */}
              {dashboard.top_fornitori?.slice(0, 2).map((fornitore, index) => (
                <div key={fornitore.id} className="px-6 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 w-8 h-8 bg-danger-100 rounded-full flex items-center justify-center mr-3">
                        <span className="text-xs font-semibold text-danger-600">
                          #{index + 1}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {fornitore.nome}
                        </p>
                        <p className="text-xs text-gray-500">
                          {fornitore.numero_movimenti} movimenti
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-danger-600">
                        €{parseFloat(fornitore.totale_uscite).toLocaleString('it-IT', { 
                          minimumFractionDigits: 2 
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
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

// Componente KPI Card
const KPICard = ({ title, value, icon: Icon, trend, color, format }) => {
  const formatValue = (val) => {
    if (format === 'currency') {
      return `€${parseFloat(val || 0).toLocaleString('it-IT', { minimumFractionDigits: 2 })}`;
    }
    return (val || 0).toLocaleString('it-IT');
  };

  const getTrendIcon = () => {
    if (!trend || trend === '0') return null;
    return parseFloat(trend) > 0 ? (
      <TrendingUp className="w-4 h-4 text-success-600" />
    ) : (
      <TrendingDown className="w-4 h-4 text-danger-600" />
    );
  };

  const getTrendColor = () => {
    if (!trend || trend === '0') return 'text-gray-500';
    return parseFloat(trend) > 0 ? 'text-success-600' : 'text-danger-600';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="hover:shadow-md transition-shadow duration-200">
        <Card.Body>
          <div className="flex items-center">
            <div className={`flex-shrink-0 p-3 rounded-lg bg-${color}-100`}>
              <Icon className={`w-6 h-6 text-${color}-600`} />
            </div>
            <div className="ml-4 flex-1">
              <p className="text-sm font-medium text-gray-600">{title}</p>
              <div className="flex items-center mt-1">
                <p className="text-2xl font-semibold text-gray-900">
                  {formatValue(value)}
                </p>
                {trend && (
                  <div className="ml-2 flex items-center text-sm">
                    {getTrendIcon()}
                    <span className={`ml-1 ${getTrendColor()}`}>
                      {Math.abs(parseFloat(trend))}%
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

export default DashboardPage;
