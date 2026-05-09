import React from 'react';
import './AlertItem.css';

const AlertItem = ({ studentName, usn, message, status = 'medium' }) => {
  return (
    <div className={`alert-item mode-${status}`}>
      <div className="alert-content">
        <h4>{studentName} ({usn})</h4>
        <p>{message}</p>
      </div>
      <button className="btn btn-outline btn-sm">Action</button>
    </div>
  );
};

export default AlertItem;
