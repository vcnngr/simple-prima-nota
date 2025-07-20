// ==============================================================================
// FILE: frontend/src/components/UI/AutocompleteInput.js
// POSIZIONE: frontend/src/components/UI/AutocompleteInput.js (NUOVO FILE)
// ==============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Plus, X, Search } from 'lucide-react';

const AutocompleteInput = ({ 
  value = '', 
  onChange, 
  onSelect,
  placeholder = 'Scrivi per cercare...', 
  apiEndpoint,
  allowCreate = true,
  createLabel = 'Crea nuova categoria',
  queryParams = {},
  disabled = false,
  error = false,
  className = '',
  maxSuggestions = 10,
  minSearchLength = 2,
  debounceMs = 300,
  showColorDots = true,
  emptyMessage = 'Nessun risultato trovato'
}) => {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  
  const inputRef = useRef(null);
  const suggestionsRef = useRef(null);
  const timeoutRef = useRef(null);

  // Sync con valore esterno
  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  // Fetch suggestions con debounce
  const fetchSuggestions = async (query) => {
    if (!query || query.length < minSearchLength) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: query,
        ...queryParams
      });

      const response = await fetch(`/api${apiEndpoint}/suggestions?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.slice(0, maxSuggestions));
      } else {
        console.error('Error fetching suggestions:', response.statusText);
        setSuggestions([]);
      }
    } catch (error) {
      console.error('Error fetching suggestions:', error);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  // Debounced search
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      if (showSuggestions) {
        fetchSuggestions(inputValue);
      }
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [inputValue, queryParams, showSuggestions]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setShowSuggestions(true);
    setSelectedIndex(-1);
    onChange?.(newValue);
  };

  const handleSuggestionClick = (suggestion) => {
    setInputValue(suggestion.nome);
    setShowSuggestions(false);
    setSelectedIndex(-1);
    onChange?.(suggestion.nome);
    onSelect?.(suggestion);
  };

  const handleCreateNew = () => {
    setShowSuggestions(false);
    setSelectedIndex(-1);
    onSelect?.({ nome: inputValue, isNew: true });
  };

  const handleFocus = () => {
    setShowSuggestions(true);
    if (inputValue.length >= minSearchLength) {
      fetchSuggestions(inputValue);
    }
  };

  const handleBlur = (e) => {
    // Delay per permettere click sui suggerimenti
    setTimeout(() => {
      if (!suggestionsRef.current?.contains(document.activeElement)) {
        setShowSuggestions(false);
        setSelectedIndex(-1);
      }
    }, 150);
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions) return;

    const totalItems = suggestions.length + (allowCreate && inputValue && !suggestions.find(s => s.nome.toLowerCase() === inputValue.toLowerCase()) ? 1 : 0);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev < totalItems - 1 ? prev + 1 : -1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > -1 ? prev - 1 : totalItems - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSuggestionClick(suggestions[selectedIndex]);
        } else if (selectedIndex === suggestions.length && allowCreate && inputValue) {
          handleCreateNew();
        } else if (allowCreate && inputValue && !suggestions.find(s => s.nome.toLowerCase() === inputValue.toLowerCase())) {
          handleCreateNew();
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
      case 'Tab':
        if (showSuggestions && selectedIndex >= 0 && selectedIndex < suggestions.length) {
          e.preventDefault();
          handleSuggestionClick(suggestions[selectedIndex]);
        } else {
          setShowSuggestions(false);
        }
        break;
    }
  };

  const clearInput = () => {
    setInputValue('');
    setShowSuggestions(false);
    setSelectedIndex(-1);
    onChange?.('');
    inputRef.current?.focus();
  };

  const hasSuggestions = suggestions.length > 0;
  const canCreate = allowCreate && inputValue && !suggestions.find(s => s.nome.toLowerCase() === inputValue.toLowerCase());
  const showDropdown = showSuggestions && (hasSuggestions || canCreate);

  return (
    <div className="relative">
      {/* Input Field */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`form-input pr-20 ${error ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-500' : ''} ${className}`}
          autoComplete="off"
        />
        
        {/* Right Icons */}
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 space-x-1">
          {inputValue && !disabled && (
            <button
              type="button"
              onClick={clearInput}
              className="text-gray-400 hover:text-gray-600 focus:outline-none"
              tabIndex={-1}
            >
              <X className="h-4 w-4" />
            </button>
          )}
          
          {loading ? (
            <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-gray-600 rounded-full" />
          ) : (
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showSuggestions ? 'rotate-180' : ''}`} />
          )}
        </div>
      </div>

      {/* Suggestions Dropdown */}
      {showDropdown && (
        <div 
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto"
          style={{ minWidth: '100%' }}
        >
          {/* Suggestions List */}
          {suggestions.map((suggestion, index) => (
            <div
              key={`${suggestion.nome}-${index}`}
              onClick={() => handleSuggestionClick(suggestion)}
              className={`px-3 py-2 cursor-pointer flex items-center justify-between transition-colors ${
                index === selectedIndex 
                  ? 'bg-primary-50 text-primary-700' 
                  : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center min-w-0 flex-1">
                {showColorDots && suggestion.colore && (
                  <div 
                    className="w-3 h-3 rounded-full mr-2 flex-shrink-0"
                    style={{ backgroundColor: suggestion.colore }}
                  />
                )}
                <span className="truncate">{suggestion.nome}</span>
              </div>
              
              {suggestion.tipo && (
                <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                  {suggestion.tipo}
                </span>
              )}
            </div>
          ))}
          
          {/* Empty State */}
          {!hasSuggestions && !canCreate && inputValue.length >= minSearchLength && !loading && (
            <div className="px-3 py-2 text-gray-500 text-sm text-center">
              <Search className="w-4 h-4 mx-auto mb-1 opacity-50" />
              {emptyMessage}
            </div>
          )}
          
          {/* Create New Option */}
          {canCreate && (
            <div
              onClick={handleCreateNew}
              className={`px-3 py-2 cursor-pointer flex items-center text-primary-600 border-t border-gray-200 transition-colors ${
                selectedIndex === suggestions.length 
                  ? 'bg-primary-50' 
                  : 'hover:bg-gray-50'
              }`}
            >
              <Plus className="w-4 h-4 mr-2 flex-shrink-0" />
              <span className="truncate">
                {createLabel}: "<strong>{inputValue}</strong>"
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AutocompleteInput;