import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import './Modal.css';

// One dialog, used by all of them.
//
// Before this each modal was a bare div with a class that had no styling
// behind it beyond a phone override, so on a short screen - a laptop at
// 640px, or a phone in landscape - a long form ran off the bottom with its
// Save button somewhere past the edge and no way to scroll to it.
//
// Here the header and the actions are pinned and only the body scrolls, so
// the way out is always on screen.

const Modal = ({ title, onClose, children, actions, size = 'md', labelledBy }) => {
  const panel = useRef(null);
  const previouslyFocused = useRef(null);
  const generatedId = useId();
  const titleId = labelledBy || `${generatedId}-title`;

  useEffect(() => {
    previouslyFocused.current = document.activeElement;

    const node = panel.current;
    const focusable = () => [...(node?.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ) || [])];

    // Focus the first real control rather than the close button, so keyboard
    // and screen-reader users land where the work is.
    const first = focusable().find(el => !el.classList.contains('modal-close'));
    (first || node)?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
        return;
      }

      if (event.key !== 'Tab') return;

      const items = focusable();
      if (items.length === 0) return;

      const start = items[0];
      const end = items[items.length - 1];

      if (event.shiftKey && document.activeElement === start) {
        event.preventDefault();
        end.focus();
      } else if (!event.shiftKey && document.activeElement === end) {
        event.preventDefault();
        start.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="modal"
      // A click on the backdrop closes; a click inside must not.
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}
    >
      <div
        className={`modal-content modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panel}
        tabIndex={-1}
      >
        <header className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="btn-icon modal-close" onClick={onClose} aria-label="Close">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="modal-body">{children}</div>

        {actions && <footer className="modal-actions">{actions}</footer>}
      </div>
    </div>
  );
};

export default Modal;
