// src/pages/Auth/RegisterPage.js
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { Eye, EyeOff, TrendingUp, Lock, User, Mail } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import Button from '../../components/UI/Button';
import Alert from '../../components/UI/Alert';

const RegisterPage = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const { register: registerUser, isLoading } = useAuth();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors }
  } = useForm();

  const watchPassword = watch('password');

  const onSubmit = async (data) => {
    setError('');
    
    if (data.password !== data.confirmPassword) {
      setError('Le password non coincidono');
      return;
    }

    const { confirmPassword, ...userData } = data;
    const result = await registerUser(userData);
    
    if (!result.success) {
      setError(result.error);
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
            <TrendingUp className="h-8 w-8 text-white" />
          </motion.div>
          <h2 className="mt-6 text-3xl font-bold text-gray-900">
            Crea il tuo account
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Inizia a gestire la tua contabilità oggi stesso
          </p>
        </div>

        {/* Register Form */}
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
                  placeholder="Scegli un username"
                  {...register('username', {
                    required: 'Username è richiesto',
                    minLength: {
                      value: 3,
                      message: 'Username deve essere di almeno 3 caratteri'
                    },
                    maxLength: {
                      value: 30,
                      message: 'Username non può superare 30 caratteri'
                    },
                    pattern: {
                      value: /^[a-zA-Z0-9_]+$/,
                      message: 'Username può contenere solo lettere, numeri e underscore'
                    }
                  })}
                />
              </div>
              {errors.username && (
                <p className="form-error">{errors.username.message}</p>
              )}
            </div>

            {/* Email Field */}
            <div>
              <label htmlFor="email" className="form-label">
                Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  className={`form-input pl-10 ${errors.email ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-500' : ''}`}
                  placeholder="La tua email"
                  {...register('email', {
                    required: 'Email è richiesta',
                    pattern: {
                      value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                      message: 'Email non valida'
                    }
                  })}
                />
              </div>
              {errors.email && (
                <p className="form-error">{errors.email.message}</p>
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
                  autoComplete="new-password"
                  className={`form-input pl-10 pr-10 ${errors.password ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-500' : ''}`}
                  placeholder="Crea una password sicura"
                  {...register('password', {
                    required: 'Password è richiesta',
                    minLength: {
                      value: 6,
                      message: 'Password deve essere di almeno 6 caratteri'
                    },
                    pattern: {
                      value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
                      message: 'Password deve contenere almeno una lettera minuscola, una maiuscola e un numero'
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
              <div className="mt-1">
                <div className="flex space-x-1">
                  {['weak', 'medium', 'strong'].map((strength, index) => (
                    <div
                      key={strength}
                      className={`h-1 flex-1 rounded-full ${
                        watchPassword && watchPassword.length > (index + 1) * 2
                          ? index === 0 ? 'bg-danger-500' : index === 1 ? 'bg-warning-500' : 'bg-success-500'
                          : 'bg-gray-200'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Usa almeno 6 caratteri con lettere maiuscole, minuscole e numeri
                </p>
              </div>
            </div>

            {/* Confirm Password Field */}
            <div>
              <label htmlFor="confirmPassword" className="form-label">
                Conferma Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={`form-input pl-10 pr-10 ${errors.confirmPassword ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-500' : ''}`}
                  placeholder="Ripeti la password"
                  {...register('confirmPassword', {
                    required: 'Conferma password è richiesta',
                    validate: value => value === watchPassword || 'Le password non coincidono'
                  })}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="form-error">{errors.confirmPassword.message}</p>
              )}
            </div>

            {/* Terms and Conditions */}
            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="terms"
                  type="checkbox"
                  className="h-4 w-4 text-success-600 focus:ring-success-500 border-gray-300 rounded"
                  {...register('terms', {
                    required: 'Devi accettare i termini e le condizioni'
                  })}
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="terms" className="text-gray-700">
                  Accetto i{' '}
                  <a href="#" className="text-success-600 hover:text-success-500 font-medium">
                    termini e le condizioni
                  </a>{' '}
                  e la{' '}
                  <a href="#" className="text-success-600 hover:text-success-500 font-medium">
                    privacy policy
                  </a>
                </label>
              </div>
            </div>
            {errors.terms && (
              <p className="form-error">{errors.terms.message}</p>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              variant="success"
              size="lg"
              loading={isLoading}
              className="w-full"
            >
              Crea Account
            </Button>
          </form>

          {/* Login Link */}
          <div className="text-center">
            <p className="text-sm text-gray-600">
              Hai già un account?{' '}
              <Link
                to="/login"
                className="text-success-600 hover:text-success-500 font-medium transition-colors"
              >
                Accedi qui
              </Link>
            </p>
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

export default RegisterPage;
