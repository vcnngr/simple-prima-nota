// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout/Layout';
import CommercialistaLayout from './components/Layout/CommercialistaLayout';
import LoadingSpinner from './components/UI/LoadingSpinner';

// Pages
import LoginChoicePage from './pages/Auth/LoginChoicePage';
import LoginPage from './pages/Auth/LoginPage';
import RegisterPage from './pages/Auth/RegisterPage';
import CommercialistaLoginPage from './pages/Commercialista/CommercialistaLoginPage';
import CommercialistaRegisterPage from './pages/Commercialista/CommercialistaRegisterPage';
import CommercialistaDashboardPage from './pages/Commercialista/CommercialistaDashboardPage';
import CommercialistaProfilePage from './pages/Commercialista/CommercialistaProfilePage';
import ClientDetailPage from './pages/Commercialista/ClientDetailPage';
import ClientReportsPage from './pages/Commercialista/ClientReportsPage';
import ClientiListPage from './pages/Commercialista/ClientiListPage';
import ChatListPage from './pages/Commercialista/ChatListPage';
import DashboardPage from './pages/Dashboard/DashboardPage';
import ContiBancariPage from './pages/ContiBancari/ContiBancariPage';
import AnagrafichePage from './pages/Anagrafiche/AnagrafichePage';
import MovimentiPage from './pages/Movimenti/MovimentiPage';
import CategoriePage from './pages/Categorie/CategoriePage';
import ReportsPage from './pages/Reports/ReportsPage';
import CustomReportsPage from './pages/Reports/CustomReportsPage';
import ProfilePage from './pages/Profile/ProfilePage';
import CommercialistaManagementPage from './pages/Profile/CommercialistaManagementPage';
import TipologiePage from './pages/Tipologie/TipologiePage';
import ChatPage from './pages/Messaggi/ChatPage';

// Configurazione React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minuti
    },
  },
});

// Componente per route protette (utenti)
function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Layout>{children}</Layout>;
}

// Componente per route protette commercialista
function ProtectedCommercialistaRoute({ children }) {
  const commercialistaToken = localStorage.getItem('commercialista_token');
  const userType = localStorage.getItem('user_type');

  if (!commercialistaToken || userType !== 'commercialista') {
    return <Navigate to="/login/commercialista" replace />;
  }

  return <CommercialistaLayout>{children}</CommercialistaLayout>;
}

// Componente per route pubbliche (redirect se autenticato)
function PublicRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <div className="App">
            <Routes>
              {/* Route pubbliche */}
              <Route
                path="/login"
                element={
                  <PublicRoute>
                    <LoginChoicePage />
                  </PublicRoute>
                }
              />
              <Route
                path="/login/utente"
                element={
                  <PublicRoute>
                    <LoginPage />
                  </PublicRoute>
                }
              />
              <Route
                path="/login/commercialista"
                element={
                  <PublicRoute>
                    <CommercialistaLoginPage />
                  </PublicRoute>
                }
              />
              <Route
                path="/register"
                element={
                  <PublicRoute>
                    <RegisterPage />
                  </PublicRoute>
                }
              />
              <Route
                path="/commercialista/register"
                element={
                  <PublicRoute>
                    <CommercialistaRegisterPage />
                  </PublicRoute>
                }
              />

              {/* Route protette commercialista */}
              <Route
                path="/commercialista/dashboard"
                element={
                  <ProtectedCommercialistaRoute>
                    <CommercialistaDashboardPage />
                  </ProtectedCommercialistaRoute>
                }
              />
              <Route
                path="/commercialista/profile"
                element={
                  <ProtectedCommercialistaRoute>
                    <CommercialistaProfilePage />
                  </ProtectedCommercialistaRoute>
                }
              />
              <Route
                path="/commercialista/clienti"
                element={
                  <ProtectedCommercialistaRoute>
                    <ClientiListPage />
                  </ProtectedCommercialistaRoute>
                }
              />
              <Route
                path="/commercialista/clienti/:userId"
                element={
                  <ProtectedCommercialistaRoute>
                    <ClientDetailPage />
                  </ProtectedCommercialistaRoute>
                }
              />
              <Route
                path="/commercialista/clienti/:userId/reports"
                element={
                  <ProtectedCommercialistaRoute>
                    <ClientReportsPage />
                  </ProtectedCommercialistaRoute>
                }
              />
              <Route
                path="/commercialista/chat"
                element={
                  <ProtectedCommercialistaRoute>
                    <ChatListPage />
                  </ProtectedCommercialistaRoute>
                }
              />
              <Route
                path="/commercialista/chat/:userId"
                element={
                  <ProtectedCommercialistaRoute>
                    <ChatPage />
                  </ProtectedCommercialistaRoute>
                }
              />

              {/* Route protette utenti */}
              <Route
                path="/dashboard" 
                element={
                  <ProtectedRoute>
                    <DashboardPage />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/conti-bancari" 
                element={
                  <ProtectedRoute>
                    <ContiBancariPage />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/anagrafiche" 
                element={
                  <ProtectedRoute>
                    <AnagrafichePage />
                  </ProtectedRoute>
                } 
              />
              <Route
                path="/tipologie"
                element={
                  <ProtectedRoute>
                    <TipologiePage />
                  </ProtectedRoute>
                }
              />
              <Route 
                path="/movimenti" 
                element={
                  <ProtectedRoute>
                    <MovimentiPage />
                  </ProtectedRoute>
                } 
              />
              <Route
                path="/categorie"
                element={
                  <ProtectedRoute>
                    <CategoriePage />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/reports" 
                element={
                  <ProtectedRoute>
                    <ReportsPage />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/reports/custom" 
                element={
                  <ProtectedRoute>
                    <CustomReportsPage />
                  </ProtectedRoute>
                } 
              />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <ProfilePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/commercialista-management"
                element={
                  <ProtectedRoute>
                    <CommercialistaManagementPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/chat"
                element={
                  <ProtectedRoute>
                    <ChatPage />
                  </ProtectedRoute>
                }
              />

              {/* Redirect root alla dashboard */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />

              {/* 404 - Route non trovata */}
              <Route 
                path="*" 
                element={
                  <div className="min-h-screen flex items-center justify-center">
                    <div className="text-center">
                      <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
                      <p className="text-gray-600 mb-4">Pagina non trovata</p>
                      <a 
                        href="/dashboard" 
                        className="btn btn-primary btn-md"
                      >
                        Torna alla Dashboard
                      </a>
                    </div>
                  </div>
                } 
              />
            </Routes>

            {/* Toast notifications */}
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  background: '#363636',
                  color: '#fff',
                },
                success: {
                  duration: 3000,
                  iconTheme: {
                    primary: '#22c55e',
                    secondary: '#fff',
                  },
                },
                error: {
                  duration: 5000,
                  iconTheme: {
                    primary: '#ef4444',
                    secondary: '#fff',
                  },
                },
              }}
            />
          </div>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
