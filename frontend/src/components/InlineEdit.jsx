import React, { useEffect, useRef, useState } from 'react';
import { Check, X, Pencil } from 'lucide-react';
import { useToast } from './useToast';
import './InlineEdit.css';

// A modal for changing one field is three clicks and a context switch. This
// is click, type, Enter - and if the save fails the old value comes back and
// the failure is said out loud rather than silently kept.
const InlineEdit = ({
  value,
  onSave,
  label,
  placeholder,
  multiline = false,
  disabled = false,
  emptyText = 'Not set',
  formatter = (input) => input,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [shown, setShown] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);
  const toast = useToast();

  useEffect(() => { setShown(value ?? ''); }, [value]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select?.();
    }
  }, [editing]);

  const commit = async () => {
    const next = draft.trim();

    if (next === (shown ?? '').toString().trim()) {
      setEditing(false);
      return;
    }

    const previous = shown;

    // Optimistic: show the new value immediately, put the old one back if the
    // server disagrees.
    setShown(next);
    setEditing(false);
    setSaving(true);

    try {
      await onSave(next);
    } catch (error) {
      setShown(previous);
      setDraft(previous ?? '');
      toast.error(error, `Could not save ${label ?? 'that change'}.`);
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setDraft(shown ?? '');
    setEditing(false);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    } else if (event.key === 'Enter' && (!multiline || event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      commit();
    }
  };

  if (disabled) {
    return <span className="inline-edit-static">{formatter(shown) || emptyText}</span>;
  }

  if (!editing) {
    return (
      <button
        type="button"
        className={`inline-edit-trigger ${saving ? 'is-saving' : ''}`}
        onClick={() => { setDraft(shown ?? ''); setEditing(true); }}
        aria-label={label ? `Edit ${label}` : 'Edit'}
      >
        <span className={shown ? '' : 'inline-edit-empty'}>{formatter(shown) || emptyText}</span>
        <Pencil size={13} aria-hidden="true" />
      </button>
    );
  }

  const Field = multiline ? 'textarea' : 'input';

  return (
    <span className="inline-edit-field">
      <Field
        ref={inputRef}
        className="input-control"
        value={draft}
        placeholder={placeholder}
        aria-label={label}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        rows={multiline ? 3 : undefined}
      />
      <button type="button" className="btn-icon" onMouseDown={(e) => e.preventDefault()} onClick={commit} aria-label="Save">
        <Check size={15} />
      </button>
      <button type="button" className="btn-icon" onMouseDown={(e) => e.preventDefault()} onClick={cancel} aria-label="Cancel">
        <X size={15} />
      </button>
    </span>
  );
};

export default InlineEdit;
