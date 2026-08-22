import { createContext, useContext } from 'react';

// The context and its hook live here rather than in ThemeContext.jsx so that
// file only exports a component - react-refresh needs that for fast refresh.
// Same arrangement as useAuth.js.
export const ThemeContext = createContext(null);

export const useTheme = () => {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used inside a ThemeProvider');
  }

  return context;
};
