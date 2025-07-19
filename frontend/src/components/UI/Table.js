// src/components/UI/Table.js
import React from 'react';
import LoadingSpinner from './LoadingSpinner';

const Table = ({ children, className = '', ...props }) => {
  return (
    <div className="overflow-x-auto">
      <table className={`table ${className}`} {...props}>
        {children}
      </table>
    </div>
  );
};

const TableHeader = ({ children, className = '', ...props }) => {
  return (
    <thead className={`table-header ${className}`} {...props}>
      {children}
    </thead>
  );
};

const TableBody = ({ 
  children, 
  className = '', 
  loading = false, 
  emptyMessage = 'Nessun dato disponibile', 
  ...props 
}) => {
  if (loading) {
    return (
      <tbody className={`table-body ${className}`}>
        <tr>
          <td colSpan="100%" className="text-center py-8">
            <LoadingSpinner size="lg" />
            <p className="text-gray-500 mt-2">Caricamento...</p>
          </td>
        </tr>
      </tbody>
    );
  }

  if (!children || (Array.isArray(children) && children.length === 0)) {
    return (
      <tbody className={`table-body ${className}`}>
        <tr>
          <td colSpan="100%" className="text-center py-8 text-gray-500">
            {emptyMessage}
          </td>
        </tr>
      </tbody>
    );
  }

  return (
    <tbody className={`table-body ${className}`} {...props}>
      {children}
    </tbody>
  );
};

const TableRow = ({ children, className = '', ...props }) => {
  return (
    <tr className={`table-row ${className}`} {...props}>
      {children}
    </tr>
  );
};

const TableHeaderCell = ({ children, className = '', ...props }) => {
  return (
    <th className={`table-header-cell ${className}`} {...props}>
      {children}
    </th>
  );
};

const TableCell = ({ children, className = '', ...props }) => {
  return (
    <td className={`table-cell ${className}`} {...props}>
      {children}
    </td>
  );
};

// Aggiungi i componenti come proprietà del Table principale
Table.Header = TableHeader;
Table.Body = TableBody;
Table.Row = TableRow;
Table.HeaderCell = TableHeaderCell;
Table.Cell = TableCell;

export default Table;
