// src/pages/Auth/LoginChoicePage.js
import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { TrendingUp, User, Briefcase } from 'lucide-react';

const LoginChoicePage = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-purple-50 to-success-50 py-12 px-4 sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-4xl w-full space-y-8"
      >
        {/* Header */}
        <div className="text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="mx-auto h-20 w-20 bg-gradient-to-br from-primary-600 to-success-600 rounded-2xl flex items-center justify-center shadow-xl"
          >
            <TrendingUp className="h-10 w-10 text-white" />
          </motion.div>
          <h1 className="mt-6 text-4xl font-bold text-gray-900">
            Benvenuto in Prima Nota
          </h1>
          <p className="mt-3 text-lg text-gray-600">
            Scegli come vuoi accedere
          </p>
        </div>

        {/* Choice Cards */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12"
        >
          {/* User Login Card */}
          <Link to="/login/utente">
            <motion.div
              whileHover={{ scale: 1.02, y: -5 }}
              whileTap={{ scale: 0.98 }}
              className="bg-white rounded-2xl shadow-xl p-8 cursor-pointer border-2 border-transparent hover:border-primary-500 transition-all duration-300"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="h-16 w-16 bg-primary-100 rounded-full flex items-center justify-center">
                  <User className="h-8 w-8 text-primary-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Accedi come Utente
                </h2>
                <p className="text-gray-600">
                  Gestisci la tua contabilità personale e i tuoi movimenti finanziari
                </p>
                <div className="pt-4">
                  <span className="text-primary-600 font-semibold flex items-center">
                    Continua
                    <svg className="ml-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </div>
              </div>
            </motion.div>
          </Link>

          {/* Commercialista Login Card */}
          <Link to="/login/commercialista">
            <motion.div
              whileHover={{ scale: 1.02, y: -5 }}
              whileTap={{ scale: 0.98 }}
              className="bg-white rounded-2xl shadow-xl p-8 cursor-pointer border-2 border-transparent hover:border-success-500 transition-all duration-300"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="h-16 w-16 bg-success-100 rounded-full flex items-center justify-center">
                  <Briefcase className="h-8 w-8 text-success-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Accedi come Commercialista
                </h2>
                <p className="text-gray-600">
                  Accedi alla dashboard professionale e gestisci i tuoi clienti
                </p>
                <div className="pt-4">
                  <span className="text-success-600 font-semibold flex items-center">
                    Continua
                    <svg className="ml-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </div>
              </div>
            </motion.div>
          </Link>
        </motion.div>

        {/* Registration Links */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="text-center space-y-2"
        >
          <p className="text-sm text-gray-600">
            Non hai ancora un account?
          </p>
          <div className="flex justify-center space-x-4">
            <Link
              to="/register"
              className="text-primary-600 hover:text-primary-500 font-medium transition-colors"
            >
              Registrati come Utente
            </Link>
            <span className="text-gray-400">|</span>
            <Link
              to="/commercialista/register"
              className="text-success-600 hover:text-success-500 font-medium transition-colors"
            >
              Registrati come Commercialista
            </Link>
          </div>
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="text-center pt-8"
        >
          <p className="text-xs text-gray-500">
            © 2024 Prima Nota. Sistema di gestione contabile semplificato.
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default LoginChoicePage;
