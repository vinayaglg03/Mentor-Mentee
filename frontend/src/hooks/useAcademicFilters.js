import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';

// Department, semester and academic year for the entry screens, pre-filled
// from Settings.
//
// It is three dropdowns, chosen again at the start of every marks session,
// for a value that changes twice a year. Faculty will notice this more than
// anything else in the redesign.
//
// The hook owns the state so the defaults can be applied inside the response
// handler rather than in an effect that fights whatever the user has already
// typed. If they touch a filter before the preferences arrive, their choice
// wins - a screen that rearranges itself under your hands is worse than one
// that never had defaults.

export const useAcademicFilters = (initial) => {
  const [filters, setFilters] = useState(initial);
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const touched = useRef(false);

  const update = useCallback((next) => {
    touched.current = true;
    setFilters(next);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [preferences, departments] = await Promise.all([
        api.get('/preferences').then(response => response.data).catch(() => null),
        api.get('/departments').then(response => response.data).catch(() => []),
      ]);

      if (cancelled) return;

      if (preferences && !touched.current) {
        // The filters carry a department code; the preference stores an id.
        const department = (departments || [])
          .find(item => item.id === preferences.defaultDepartmentId);

        setFilters(current => ({
          ...current,
          ...(department ? { department: department.code } : {}),
          ...(preferences.defaultSemester ? { semester: String(preferences.defaultSemester) } : {}),
          ...(preferences.defaultAcademicYear
            ? { academicYear: String(preferences.defaultAcademicYear) }
            : {}),
        }));
      }

      setDefaultsApplied(true);
    })();

    return () => { cancelled = true; };
  }, []);

  return [filters, update, defaultsApplied];
};
