// src/components/Layout/Sidebar.js
import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  CreditCard, 
  Users, 
  ArrowUpDown,
  Tag, 
  FileText, 
  User,
  LogOut,
  X,
  TrendingUp
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const navigation = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    description: 'Panoramica generale'
  },
  {
    name: 'Conti Bancari',
    href: '/conti-bancari',
    icon: CreditCard,
    description: 'Gestione conti correnti'
  },
  {
    name: 'Anagrafiche',
    href: '/anagrafiche',
    icon: Users,
    description: 'Clienti e fornitori'
  },
  {
    name: 'Movimenti',
    href: '/movimenti',
    icon: ArrowUpDown,
    description: 'Entrate e uscite'
  },
  {
    name: 'Categorie',
    href: '/categorie', 
    icon: Tag,
    description: 'Categorie Anagrafiche/Movimenti'
  },
  {
    name: 'Reports',
    href: '/reports',
    icon: FileText,
    description: 'Estratti e analisi'
  },
];

const Sidebar = ({ isOpen, onClose }) => {
  const location = useLocation();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    onClose();
  };

  return (
    <>
      {/* Sidebar per desktop */}
      <div className="hidden lg:flex lg:flex-shrink-0">
        <div className="flex flex-col w-64">
          <div className="flex flex-col h-0 flex-1 bg-white border-r border-gray-200 shadow-sm">
            <SidebarContent 
              navigation={navigation}
              currentPath={location.pathname}
              user={user}
              onLogout={handleLogout}
            />
          </div>
        </div>
      </div>

      {/* Sidebar mobile */}
      <div className={`fixed inset-0 z-30 lg:hidden transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex flex-col w-64 h-full bg-white border-r border-gray-200 shadow-lg">
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Menu</h2>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <SidebarContent 
            navigation={navigation}
            currentPath={location.pathname}
            user={user}
            onLogout={handleLogout}
            onClose={onClose}
          />
        </div>
      </div>
    </>
  );
};

// Componente contenuto sidebar
const SidebarContent = ({ navigation, currentPath, user, onLogout, onClose }) => {
  return (
    <>
      {/* Logo */}
      <div className="flex items-center flex-shrink-0 px-6 py-4 border-b border-gray-200">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
          </div>
          <div className="ml-3">
            <h1 className="text-lg font-semibold text-gray-900">Prima Nota</h1>
            <p className="text-xs text-gray-500">Gestionale contabile</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = currentPath === item.href;
          const Icon = item.icon;
          
          return (
            <NavLink
              key={item.name}
              to={item.href}
              onClick={onClose}
              className={`nav-link group ${
                isActive ? 'nav-link-active' : 'nav-link-inactive'
              }`}
            >
              <Icon className={`flex-shrink-0 w-5 h-5 mr-3 ${
                isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-gray-600'
              }`} />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium truncate">
                  {item.name}
                </span>
                <p className="text-xs text-gray-500 truncate">
                  {item.description}
                </p>
              </div>
            </NavLink>
          );
        })}
      </nav>

      {/* User info e logout */}
      <div className="flex-shrink-0 border-t border-gray-200 p-4">
        {/* User profile link */}
        <NavLink
          to="/profile"
          onClick={onClose}
          className={`nav-link group mb-2 ${
            currentPath === '/profile' ? 'nav-link-active' : 'nav-link-inactive'
          }`}
        >
          <User className={`flex-shrink-0 w-5 h-5 mr-3 ${
            currentPath === '/profile' ? 'text-primary-600' : 'text-gray-400 group-hover:text-gray-600'
          }`} />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium truncate">Profilo</span>
            <p className="text-xs text-gray-500 truncate">
              {user?.username || 'Utente'}
            </p>
          </div>
        </NavLink>

        {/* Logout button */}
        <button
          onClick={onLogout}
          className="nav-link nav-link-inactive w-full text-left group hover:text-danger-600"
        >
          <LogOut className="flex-shrink-0 w-5 h-5 mr-3 text-gray-400 group-hover:text-danger-600" />
          <span className="text-sm font-medium">Logout</span>
        </button>

        {/* Version info */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-400 text-center">
            v1.0.0 • Prima Nota
          </p>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
