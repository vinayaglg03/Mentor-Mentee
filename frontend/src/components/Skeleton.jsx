import React from 'react';
import './Skeleton.css';

// A blank screen looks like a failure; a skeleton looks like work in
// progress and keeps the layout from jumping when the data lands.
export const SkeletonLine = ({ width = '100%' }) => (
  <span className="skeleton-line" style={{ width }} aria-hidden="true" />
);

export const SkeletonTable = ({ rows = 5, columns = 5, label = 'Loading' }) => (
  <div className="skeleton-table" role="status" aria-live="polite" aria-label={label}>
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <div className="skeleton-row" key={rowIndex}>
        {Array.from({ length: columns }).map((_, columnIndex) => (
          <SkeletonLine key={columnIndex} width={columnIndex === 0 ? '60%' : '85%'} />
        ))}
      </div>
    ))}
    <span className="sr-only">{label}…</span>
  </div>
);

export const SkeletonCards = ({ count = 3, label = 'Loading' }) => (
  <div className="skeleton-cards" role="status" aria-live="polite" aria-label={label}>
    {Array.from({ length: count }).map((_, index) => (
      <div className="skeleton-card" key={index}>
        <SkeletonLine width="45%" />
        <SkeletonLine width="80%" />
        <SkeletonLine width="65%" />
      </div>
    ))}
    <span className="sr-only">{label}…</span>
  </div>
);

export default SkeletonTable;
