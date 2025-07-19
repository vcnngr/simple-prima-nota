// src/components/UI/Alert.js
import React from 'react';
import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react';

const iconMap = {
  success: CheckCircle,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info
};

const Alert = ({ 
  type = 'info', 
  title, 
  children, 
  dismissible = false, 
  onDismiss,
  className = '',
  ...props 
}) => {
  const Icon = iconMap[type];
  const alertClasses = {
    success: 'alert-success',
    warning: 'alert-warning',
    danger: 'alert-danger',
    info: 'alert-info'
  };

  return (
    <div className={`alert ${alertClasses[type]} ${className}`} {...props}>
      <div className="flex">
        <div className="flex-shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="ml-3 flex-1">
          {title && (
            <h3 className="text-sm font-medium mb-1">
              {title}
            </h3>
          )}
          <div className="text-sm">
            {children}
          </div>
        </div>
        {dismissible && (
          <div className="ml-auto pl-3">
            <div className="-mx-1.5 -my-1.5">
              <button
                type="button"
                className="inline-flex rounded-md p-1.5 hover:bg-black hover:bg-opacity-10 focus:outline-none focus:ring-2 focus:ring-offset-2"
                onClick={onDismiss}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Alert;
