// src/contexts/AuthContext.js
import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { authAPI } from '../services/api';
import toast from 'react-hot-toast';

// Stato iniziale
const initialState = {
  user: null,
  token: localStorage.getItem('token'),
  isAuthenticated: false,
  isLoading: true,
};

// Action types
const AuthActionTypes = {
  SET_LOADING: 'SET_LOADING',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  LOGOUT: 'LOGOUT',
  UPDATE_USER: 'UPDATE_USER',
};

// Reducer
function authReducer(state, action) {
  switch (action.type) {
    case AuthActionTypes.SET_LOADING:
      return {
        ...state,
        isLoading: action.payload,
      };

    case AuthActionTypes.LOGIN_SUCCESS:
      localStorage.setItem('token', action.payload.token);
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        isAuthenticated: true,
        isLoading: false,
      };

    case AuthActionTypes.LOGIN_FAILURE:
      localStorage.removeItem('token');
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      };

    case AuthActionTypes.LOGOUT:
      localStorage.removeItem('token');
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      };

    case AuthActionTypes.UPDATE_USER:
      return {
        ...state,
        user: { ...state.user, ...action.payload },
      };

    default:
      return state;
  }
}

// Context
const AuthContext = createContext();

// Provider
export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Verifica token al caricamento
  useEffect(() => {
    const verifyToken = async () => {
      const token = localStorage.getItem('token');
      
      if (!token) {
        dispatch({ type: AuthActionTypes.SET_LOADING, payload: false });
        return;
      }

      try {
        const response = await authAPI.verifyToken();
        dispatch({
          type: AuthActionTypes.LOGIN_SUCCESS,
          payload: {
            user: response.user,
            token,
          },
        });
      } catch (error) {
        console.error('Token verification failed:', error);
        dispatch({ type: AuthActionTypes.LOGIN_FAILURE });
      }
    };

    verifyToken();
  }, []);

  // Login
  const login = async (credentials) => {
    try {
      dispatch({ type: AuthActionTypes.SET_LOADING, payload: true });
      
      const response = await authAPI.login(credentials);
      
      dispatch({
        type: AuthActionTypes.LOGIN_SUCCESS,
        payload: {
          user: response.user,
          token: response.token,
        },
      });

      toast.success(`Benvenuto, ${response.user.username}!`);
      return { success: true };
    } catch (error) {
      dispatch({ type: AuthActionTypes.LOGIN_FAILURE });
      
      const errorMessage = error.response?.data?.error || 'Errore durante il login';
      toast.error(errorMessage);
      
      return { 
        success: false, 
        error: errorMessage 
      };
    }
  };

  // Register
  const register = async (userData) => {
    try {
      dispatch({ type: AuthActionTypes.SET_LOADING, payload: true });
      
      const response = await authAPI.register(userData);
      
      dispatch({
        type: AuthActionTypes.LOGIN_SUCCESS,
        payload: {
          user: response.user,
          token: response.token,
        },
      });

      toast.success('Registrazione completata con successo!');
      return { success: true };
    } catch (error) {
      dispatch({ type: AuthActionTypes.LOGIN_FAILURE });
      
      const errorMessage = error.response?.data?.error || 'Errore durante la registrazione';
      toast.error(errorMessage);
      
      return { 
        success: false, 
        error: errorMessage 
      };
    }
  };

  // Logout
  const logout = () => {
    dispatch({ type: AuthActionTypes.LOGOUT });
    toast.success('Logout effettuato con successo');
  };

  // Aggiorna profilo utente
  const updateUser = (userData) => {
    dispatch({
      type: AuthActionTypes.UPDATE_USER,
      payload: userData,
    });
  };

  // Cambio password
  const changePassword = async (passwordData) => {
    try {
      await authAPI.changePassword(passwordData);
      toast.success('Password cambiata con successo');
      return { success: true };
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Errore durante il cambio password';
      toast.error(errorMessage);
      return { 
        success: false, 
        error: errorMessage 
      };
    }
  };

  const value = {
    // Stato
    user: state.user,
    token: state.token,
    isAuthenticated: state.isAuthenticated,
    isLoading: state.isLoading,

    // Azioni
    login,
    register,
    logout,
    updateUser,
    changePassword,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook personalizzato
export function useAuth() {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth deve essere usato all\'interno di AuthProvider');
  }
  
  return context;
}

export default AuthContext;
