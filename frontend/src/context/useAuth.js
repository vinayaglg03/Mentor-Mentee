import { createContext, useContext } from 'react';

// The context and its hook live here rather than in AuthContext.jsx so that
// file only exports a component - react-refresh needs that for fast refresh.
export const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);
