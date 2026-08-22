import { createContext, useContext } from 'react';

// Kept apart from the component so fast refresh stays happy.
export const ToastContext = createContext(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <Toaster>');
  return context;
};
