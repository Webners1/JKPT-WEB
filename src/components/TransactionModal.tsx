'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'success' | 'error' | 'loading';
  title: string;
  message: string;
  txHash?: string;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  type,
  title,
  message,
  txHash
}) => {
  // Handle close with additional logic
  const handleClose = () => {
    // Only allow closing if not in loading state
    if (type !== 'loading') {
      onClose();
    }
  };

  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return (
          <div className="bg-green-500 rounded-full p-3 text-white">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        );
      case 'error':
        return (
          <div className="bg-red-500 rounded-full p-3 text-white">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        );
      case 'loading':
        return (
          <div className="inline-block w-12 h-12 border-4 border-t-yellow-400 border-r-transparent border-b-yellow-500 border-l-transparent rounded-full animate-spin"></div>
        );
    }
  };

  const getColor = () => {
    switch (type) {
      case 'success':
        return 'bg-green-100 border-green-500';
      case 'error':
        return 'bg-red-100 border-red-500';
      case 'loading':
        return 'bg-yellow-100 border-yellow-500';
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className={`relative max-w-md w-full rounded-xl shadow-lg ${getColor()} border p-6`}
          >
            {type !== 'loading' && (
              <button
                onClick={handleClose}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}

            <div className="flex flex-col items-center text-center">
              {getIcon()}
              <h3 className="mt-4 text-xl font-semibold">{title}</h3>
              <p className="mt-2 text-gray-600">{message}</p>

              {txHash && (
                <div className="mt-4 text-xs text-gray-500 bg-gray-100 p-3 rounded-lg w-full break-all">
                  <div className="flex items-center">
                    <span className="mr-2">🔗</span>
                    <span>Transaction: {txHash.slice(0, 6)}...{txHash.slice(-4)}</span>
                  </div>
                </div>
              )}

              {type !== 'loading' && (
                <button
                  onClick={handleClose}
                  className="mt-6 bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-6 rounded-lg transition transform hover:scale-105 active:scale-95"
                >
                  Dismiss
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
