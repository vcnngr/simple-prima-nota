// src/pages/Commercialista/CommercialistaLoginPage.js
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Briefcase, Lock, User } from 'lucide-react';
import { commercialistiAPI } from '../../services/api';
import Button from '../../components/UI/Button';
import Alert from '../../components/UI/Alert';
import toast from 'react-hot-toast';

const CommercialistaLoginPage = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm();

  const onSubmit = async (data) => {
    setError('');
    setIsLoading(true);

    try {
      const response = await commercialistiAPI.login(data);

      if (response.success && response.token) {
        // Store token
        localStorage.setItem('commercialista_token', response.token);
        localStorage.setItem('commercialista', JSON.stringify(response.commercialista));
        localStorage.setItem('user_type', 'commercialista');

        toast.success(`Benvenuto, ${response.commercialista.ragione_sociale || response.commercialista.username}!`);
        navigate('/commercialista/dashboard');
      } else {
        setError('Errore durante il login');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Errore durante il login';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-success-50 to-success-100 py-12 px-4 sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full space-y-8"
      >
        {/* Header */}
        <div className="text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="mx-auto h-16 w-16 bg-success-600 rounded-xl flex items-center justify-center shadow-lg"
          >
            <Briefcase className="h-8 w-8 text-white" />
          </motion.div>
          <h2 className="mt-6 text-3xl font-bold text-gray-900">
            Accedi come Commercialista
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Area professionale per la gestione dei clienti
          </p>
        </div>

        {/* Login Form */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="bg-white rounded-2xl shadow-xl p-8 space-y-6"
        >
          {/* Error Alert */}
          {error && (
            <Alert type="danger" dismissible onDismiss={() => setError('')}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Username Field */}
            <div>
              <label htmlFor="username" className="form-label">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  className={`form-input pl-10 ${errors.username ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-500' : ''}`}
                  placeholder="Inserisci il tuo username"
                  {...register('username', {
                    required: 'Username è richiesto',
                    minLength: {
                      value: 3,
                      message: 'Username deve essere di almeno 3 caratteri'
                    }
                  })}
                />
              </div>
              {errors.username && (
                <p className="form-error">{errors.username.message}</p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="form-label">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className={`form-input pl-10 pr-10 ${errors.password ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-500' : ''}`}
                  placeholder="Inserisci la tua password"
                  {...register('password', {
                    required: 'Password è richiesta',
                    minLength: {
                      value: 6,
                      message: 'Password deve essere di almeno 6 caratteri'
                    }
                  })}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="form-error">{errors.password.message}</p>
              )}
            </div>

            {/* Remember me */}
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                className="h-4 w-4 text-success-600 focus:ring-success-500 border-gray-300 rounded"
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
                Ricordami
              </label>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              variant="success"
              size="lg"
              loading={isLoading}
              className="w-full"
            >
              Accedi
            </Button>
          </form>

          {/* Register Link */}
          <div className="text-center">
            <p className="text-sm text-gray-600">
              Non hai un account?{' '}
              <Link
                to="/commercialista/register"
                className="text-success-600 hover:text-success-500 font-medium transition-colors"
              >
                Registrati come Commercialista
              </Link>
            </p>
          </div>

          {/* Back to choice */}
          <div className="text-center">
            <Link
              to="/login"
              className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
            >
              ← Torna alla scelta
            </Link>
          </div>
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="text-center"
        >
          <p className="text-xs text-gray-500">
            © 2024 Prima Nota. Sistema di gestione contabile semplificato.
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default CommercialistaLoginPage;
