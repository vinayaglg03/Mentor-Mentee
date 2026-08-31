import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, AlertTriangle } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/useAuth';
import { atLeast } from '../lib/permissions';
import './NotificationBell.css';

// The bell used to have no onClick at all, and the unread dot next to it was
// written into the markup - so it was permanently lit, whether or not there
// was anything to see. A badge that is always on is worse than no badge: it
// trains people to ignore the one signal the app has.
//
// It now counts open alerts for whatever this user is allowed to see, and
// opens the list.

const SEVERITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };

const NotificationBell = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState(null);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const containerRef = useRef(null);

  // A HOD or coordinator sees their whole scope; a mentor sees their mentees.
  const endpoint = atLeast(user, 'COORDINATOR') ? '/alerts/all' : '/alerts/mentor';

  // Open alerts, worst first. Returns null when the request fails, so a count
  // is never shown that we are not sure about.
  const fetchOpenAlerts = useCallback(async () => {
    const data = await api.get(endpoint).then(response => response.data).catch(() => null);
    if (data === null) return null;

    return (Array.isArray(data) ? data : [])
      .filter(alert => !alert.resolved)
      .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3)
        || new Date(b.timestamp) - new Date(a.timestamp));
  }, [endpoint]);

  useEffect(() => {
    if (!user) return undefined;

    let cancelled = false;

    (async () => {
      const list = await fetchOpenAlerts();
      if (cancelled) return;
      setAlerts(list ?? []);
      setFailed(list === null);
    })();

    return () => { cancelled = true; };
  }, [user, fetchOpenAlerts]);

  const refresh = async () => {
    const list = await fetchOpenAlerts();
    setAlerts(list ?? []);
    setFailed(list === null);
  };

  // Click outside and Escape both close it.
  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const count = alerts?.length ?? 0;
  const highCount = alerts?.filter(alert => alert.severity === 'HIGH').length ?? 0;

  const label = count === 0
    ? 'Alerts: nothing open'
    : `Alerts: ${count} open${highCount ? `, ${highCount} high severity` : ''}`;

  const openStudent = (alert) => {
    setOpen(false);
    const studentId = alert.student?.id || alert.semesterRecord?.student?.id || alert.studentId;
    if (studentId) navigate(`/student/${studentId}`);
  };

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        type="button"
        className="icon-btn"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => { setOpen(value => !value); if (!open) refresh(); }}
      >
        <Bell size={20} aria-hidden="true" />
        {count > 0 && (
          <span className={`bell-count ${highCount ? 'is-high' : ''}`} aria-hidden="true">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {/* Read out when the number changes, rather than only being visible. */}
      <span className="sr-only" role="status" aria-live="polite">{label}</span>

      {open && (
        <div className="bell-panel card" role="dialog" aria-label="Open alerts">
          <div className="bell-panel-header">
            <h2>Open alerts</h2>
            <span className="text-muted">{count}</span>
          </div>

          {failed && (
            <p className="bell-empty" role="alert">
              Could not load alerts just now.
            </p>
          )}

          {!failed && alerts === null && <p className="bell-empty">Loading…</p>}

          {!failed && alerts?.length === 0 && (
            <p className="bell-empty">Nothing open. Every alert has been dealt with.</p>
          )}

          <ul className="bell-list">
            {alerts?.slice(0, 8).map(alert => (
              <li key={alert.id}>
                <button type="button" onClick={() => openStudent(alert)}>
                  <span className={`bell-severity is-${(alert.severity || 'low').toLowerCase()}`}>
                    <AlertTriangle size={14} aria-hidden="true" />
                    {alert.severity}
                  </span>
                  <span className="bell-student">
                    {alert.student?.rollNumber} {alert.student?.name}
                  </span>
                  <span className="bell-message">{alert.message}</span>
                </button>
              </li>
            ))}
          </ul>

          {count > 8 && (
            <p className="bell-more text-muted">
              and {count - 8} more, on your dashboard.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
