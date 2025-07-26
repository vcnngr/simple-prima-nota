// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout/Layout';
import LoadingSpinner from './components/UI/LoadingSpinner';

// Pages
import LoginPage from './pages/Auth/LoginPage';
import RegisterPage from './pages/Auth/RegisterPage';
import DashboardPage from './pages/Dashboard/DashboardPage';
import ContiBancariPage from './pages/ContiBancari/ContiBancariPage';
import AnagrafichePage from './pages/Anagrafiche/AnagrafichePage';
import MovimentiPage from './pages/Movimenti/MovimentiPage';
import CategoriePage from './pages/Categorie/CategoriePage';
import ReportsPage from './pages/Reports/ReportsPage';
import CustomReportsPage from './pages/Reports/CustomReportsPage';
import ProfilePage from './pages/Profile/ProfilePage';
import TipologiePage from './pages/Tipologie/TipologiePage';

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

// Componente per route protette
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
                    <LoginPage />
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

              {/* Route protette */}
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
