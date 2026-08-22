import React, { useCallback, useEffect, useRef, useState } from 'react';
import api, { setAccessToken, refreshSession, onSessionExpired } from '../services/api';
import { AuthContext } from './useAuth';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const renewTimer = useRef(null);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    if (renewTimer.current) clearTimeout(renewTimer.current);
  }, []);

  // Renew a minute before the access token expires, so a mentor typing marks
  // never gets bounced mid-sentence.
  const scheduleRenewal = useCallback((minutes) => {
    if (renewTimer.current) clearTimeout(renewTimer.current);
    const delay = Math.max((Number(minutes) || 15) - 1, 1) * 60 * 1000;

    renewTimer.current = setTimeout(async () => {
      try {
        const data = await refreshSession();
        setUser(data.user);
        scheduleRenewal(data.expiresInMinutes);
      } catch {
        clearSession();
      }
    }, delay);
  }, [clearSession]);

  const adoptSession = useCallback((data) => {
    setAccessToken(data.token);
    setUser(data.user);
    scheduleRenewal(data.expiresInMinutes);
  }, [scheduleRenewal]);

  useEffect(() => {
    onSessionExpired(clearSession);

    // The refresh cookie is the only thing that survives a reload, so the
    // session is rebuilt from it rather than from anything in localStorage.
    const restore = async () => {
      try {
        const data = await refreshSession();
        adoptSession(data);
      } catch {
        clearSession();
      } finally {
        setLoading(false);
      }
    };

    restore();

    return () => { if (renewTimer.current) clearTimeout(renewTimer.current); };
  }, [adoptSession, clearSession]);

  const login = useCallback((data) => adoptSession(data), [adoptSession]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Signing out locally matters more than the server acknowledging it.
    }
    clearSession();
  }, [clearSession]);

  const logoutEverywhere = useCallback(async () => {
    const { data } = await api.post('/auth/logout-everywhere');
    clearSession();
    return data;
  }, [clearSession]);

  return (
    <AuthContext.Provider value={{ user, login, logout, logoutEverywhere, loading, setUser }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
