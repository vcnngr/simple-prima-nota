// src/components/Layout/Header.js
import React, { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { 
  Menu, 
  Bell, 
  Search,
  Plus,
  ChevronDown,
  User,
  Settings,
  LogOut
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useQuery } from 'react-query';
import { dashboardAPI } from '../../services/api';

// Breadcrumb mapping
const breadcrumbMap = {
  '/dashboard': 'Dashboard',
  '/conti-bancari': 'Conti Bancari',
  '/anagrafiche': 'Anagrafiche',
  '/movimenti': 'Movimenti',
  '/reports': 'Reports',
  '/profile': 'Profilo'
};

const Header = ({ onMenuClick }) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const location = useLocation();
  const { user, logout } = useAuth();

  // Query per gli alerts
  const { data: alertsData } = useQuery(
    'dashboard-alerts',
    dashboardAPI.getAlerts,
    {
      refetchInterval: 5 * 60 * 1000, // Aggiorna ogni 5 minuti
      staleTime: 2 * 60 * 1000, // 2 minuti
    }
  );

  const alerts = alertsData?.alerts || [];
  const unreadAlertsCount = alerts.filter(alert => alert.tipo === 'warning' || alert.tipo === 'error').length;

  const currentPageTitle = breadcrumbMap[location.pathname] || 'Pagina';

  const handleUserMenuToggle = () => {
    setShowUserMenu(!showUserMenu);
    setShowNotifications(false);
  };

  const handleNotificationsToggle = () => {
    setShowNotifications(!showNotifications);
    setShowUserMenu(false);
  };

  const handleLogout = () => {
    logout();
    setShowUserMenu(false);
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Left side */}
          <div className="flex items-center">
            {/* Mobile menu button */}
            <button
              type="button"
              className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
              onClick={onMenuClick}
            >
              <Menu className="w-6 h-6" />
            </button>

            {/* Page title */}
            <div className="ml-4 lg:ml-0">
              <h1 className="text-2xl font-semibold text-gray-900">
                {currentPageTitle}
              </h1>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center space-x-4">
            {/* Quick search (hidden on mobile) */}
            <div className="hidden md:block">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Cerca movimenti..."
                  className="form-input pl-10 pr-4 py-2 w-64 text-sm"
                />
              </div>
            </div>

            {/* Quick action button */}
            <Link
              to="/movimenti?action=new"
              className="btn btn-primary btn-sm hidden sm:inline-flex"
            >
              <Plus className="w-4 h-4 mr-1" />
              Nuovo Movimento
            </Link>

            {/* Notifications */}
            <div className="relative">
              <button
                type="button"
                className="p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 relative"
                onClick={handleNotificationsToggle}
              >
                <Bell className="w-5 h-5" />
                {unreadAlertsCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-danger-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {unreadAlertsCount > 9 ? '9+' : unreadAlertsCount}
                  </span>
                )}
              </button>

              {/* Notifications dropdown */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-strong border border-gray-200 z-50">
                  <div className="p-4 border-b border-gray-200">
                    <h3 className="text-sm font-medium text-gray-900">
                      Notifiche ({alerts.length})
                    </h3>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {alerts.length > 0 ? (
                      alerts.slice(0, 5).map((alert, index) => (
                        <div key={index} className="p-3 border-b border-gray-100 last:border-b-0">
                          <div className="flex items-start">
                            <div className={`flex-shrink-0 w-2 h-2 rounded-full mt-2 mr-3 ${
                              alert.tipo === 'error' ? 'bg-danger-500' :
                              alert.tipo === 'warning' ? 'bg-warning-500' :
                              'bg-primary-500'
                            }`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">
                                {alert.titolo}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                {alert.messaggio}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-center text-gray-500">
                        <Bell className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                        <p className="text-sm">Nessuna notifica</p>
                      </div>
                    )}
                  </div>
                  {alerts.length > 5 && (
                    <div className="p-3 border-t border-gray-200 text-center">
                      <Link
                        to="/dashboard"
                        className="text-sm text-primary-600 hover:text-primary-700"
                        onClick={() => setShowNotifications(false)}
                      >
                        Vedi tutte le notifiche
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* User menu */}
            <div className="relative">
              <button
                type="button"
                className="flex items-center p-2 rounded-lg text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                onClick={handleUserMenuToggle}
              >
                <div className="flex items-center">
                  <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                    <User className="w-4 h-4 text-primary-600" />
                  </div>
                  <div className="ml-3 hidden md:block text-left">
                    <p className="text-sm font-medium text-gray-900">
                      {user?.username || 'Utente'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {user?.email || ''}
                    </p>
                  </div>
                  <ChevronDown className="w-4 h-4 ml-2 text-gray-400" />
                </div>
              </button>

              {/* User dropdown menu */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-strong border border-gray-200 z-50">
                  <div className="py-1">
                    <Link
                      to="/profile"
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <User className="w-4 h-4 mr-3 text-gray-400" />
                      Profilo
                    </Link>
                    <Link
                      to="/profile?tab=settings"
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <Settings className="w-4 h-4 mr-3 text-gray-400" />
                      Impostazioni
                    </Link>
                    <hr className="my-1 border-gray-200" />
                    <button
                      onClick={handleLogout}
                      className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      <LogOut className="w-4 h-4 mr-3 text-gray-400" />
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Click outside handler */}
      {(showUserMenu || showNotifications) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setShowUserMenu(false);
            setShowNotifications(false);
          }}
        />
      )}
    </header>
  );
};

export default Header;
