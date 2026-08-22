import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import api from '../services/api';
import './GlobalSearch.css';

// Press "/" anywhere to search by roll number, name or email; arrow keys and
// Enter to open a student. Scoped by the server, so a mentor only ever finds
// their own mentees.
const GlobalSearch = () => {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const typingElsewhere = target instanceof HTMLElement
        && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if (event.key === '/' && !typingElsewhere) {
        event.preventDefault();
        inputRef.current?.focus();
      }

      if (event.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (term.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return undefined;
    }

    let cancelled = false;
    setSearching(true);

    // Debounced: a roll number is typed a character at a time.
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get('/students/search', { params: { q: term.trim() } });
        if (cancelled) return;
        setResults(data.students);
        setHighlighted(0);
        setOpen(true);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 220);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [term]);

  const openStudent = useCallback((student) => {
    setOpen(false);
    setTerm('');
    navigate(`/student/${student.id}`);
  }, [navigate]);

  const onKeyDown = (event) => {
    if (!open || results.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted(current => (current + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted(current => (current - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      openStudent(results[highlighted]);
    }
  };

  return (
    <div className="global-search">
      <label htmlFor="global-search-input" className="sr-only">Search students</label>
      <Search size={16} className="global-search-icon" aria-hidden="true" />
      <input
        id="global-search-input"
        ref={inputRef}
        type="search"
        className="global-search-input"
        placeholder="Search roll number or name…"
        value={term}
        onChange={e => setTerm(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        role="combobox"
        aria-expanded={open}
        aria-controls="global-search-results"
        aria-autocomplete="list"
        aria-activedescendant={open && results[highlighted] ? `search-result-${results[highlighted].id}` : undefined}
      />
      {term ? (
        <button className="global-search-clear" onClick={() => setTerm('')} aria-label="Clear search">
          <X size={14} />
        </button>
      ) : (
        <kbd className="global-search-hint" aria-hidden="true">/</kbd>
      )}

      {open && (
        <ul className="global-search-results" id="global-search-results" role="listbox" ref={listRef}>
          {results.length === 0 && !searching && (
            <li className="global-search-empty" role="presentation">
              Nothing matches “{term}”. Try a roll number or part of a name.
            </li>
          )}

          {results.map((student, index) => (
            <li
              key={student.id}
              id={`search-result-${student.id}`}
              role="option"
              aria-selected={index === highlighted}
              className={index === highlighted ? 'is-highlighted' : ''}
              onMouseEnter={() => setHighlighted(index)}
              onMouseDown={(event) => { event.preventDefault(); openStudent(student); }}
            >
              <span className="global-search-roll">{student.rollNumber}</span>
              <span className="global-search-name">{student.name}</span>
              <span className="global-search-meta">
                {student.department} · Sem {student.semester}
                {student.highAlerts > 0 && <span className="global-search-alert">{student.highAlerts} high</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default GlobalSearch;
