// src/components/Layout/CommercialistaHeader.js
import React, { useState } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import {
  Menu,
  User,
  ChevronDown,
  LogOut,
  Briefcase
} from 'lucide-react';

// Breadcrumb mapping
const breadcrumbMap = {
  '/commercialista/dashboard': 'Dashboard',
  '/commercialista/clienti': 'Clienti',
  '/commercialista/profile': 'Profilo',
  '/commercialista/chat': 'Chat'
};

const CommercialistaHeader = ({ onMenuClick }) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const commercialista = JSON.parse(localStorage.getItem('commercialista') || '{}');

  const currentPageTitle = breadcrumbMap[location.pathname] || 'Pagina';

  const handleUserMenuToggle = () => {
    setShowUserMenu(!showUserMenu);
  };

  const handleLogout = () => {
    localStorage.removeItem('commercialista_token');
    localStorage.removeItem('commercialista');
    localStorage.removeItem('user_type');
    navigate('/login/commercialista');
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
              className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-success-500"
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
            {/* User menu */}
            <div className="relative">
              <button
                type="button"
                className="flex items-center p-2 rounded-lg text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-success-500"
                onClick={handleUserMenuToggle}
              >
                <div className="flex items-center">
                  <div className="w-8 h-8 bg-success-100 rounded-full flex items-center justify-center">
                    <Briefcase className="w-4 h-4 text-success-600" />
                  </div>
                  <div className="ml-3 hidden md:block text-left">
                    <p className="text-sm font-medium text-gray-900">
                      {commercialista?.ragione_sociale || commercialista?.username || 'Commercialista'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {commercialista?.email || ''}
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
                      to="/commercialista/profile"
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <User className="w-4 h-4 mr-3 text-gray-400" />
                      Profilo
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
      {showUserMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowUserMenu(false)}
        />
      )}
    </header>
  );
};

export default CommercialistaHeader;
