import React from 'react';
import { useNavigate } from 'react-router-dom';
import './EmptyState.css';

// A blank grid tells a user nothing. Every table that can be empty says what
// is missing and what to do about it.
const EmptyState = ({ icon: Icon, title, description, actionLabel, actionTo, onAction, compact = false }) => {
  const navigate = useNavigate();

  const act = () => {
    if (onAction) return onAction();
    if (actionTo) navigate(actionTo);
  };

  return (
    <div className={`empty-state ${compact ? 'is-compact' : ''}`}>
      {Icon && <div className="empty-state-icon" aria-hidden="true"><Icon size={compact ? 20 : 26} /></div>}
      <h4>{title}</h4>
      {description && <p>{description}</p>}
      {actionLabel && (actionTo || onAction) && (
        <button className="btn btn-primary" type="button" onClick={act}>{actionLabel}</button>
      )}
    </div>
  );
};

export default EmptyState;
