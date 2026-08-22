import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, CalendarCheck, CheckCircle2 } from 'lucide-react';
import { SkeletonCards } from './Skeleton';
import EmptyState from './EmptyState';
import './AttentionPanel.css';

const formatDate = (value) =>
  new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

// What a mentor should look at first: students carrying a high alert,
// students nobody has spoken to, and follow-ups they set themselves.
const AttentionPanel = ({ data, loading, onOpenStudent }) => {
  const navigate = useNavigate();
  const open = onOpenStudent || ((id) => navigate(`/student/${id}`));

  if (loading) return <SkeletonCards count={3} label="Loading what needs attention" />;
  if (!data) return null;

  const nothingToDo = data.total === 0;

  if (nothingToDo) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Nothing needs your attention"
        description="No open high alerts, no mentee unheard from in a month, and no follow-ups due this week. Your full list is on the other tab."
      />
    );
  }

  return (
    <div className="attention-grid">
      <section className="attention-group" aria-labelledby="attention-risk">
        <h2 id="attention-risk">
          <AlertTriangle size={16} aria-hidden="true" /> High alerts
          <span className="attention-count" aria-live="polite">{data.atRisk.length}</span>
        </h2>

        {data.atRisk.length === 0 ? (
          <p className="attention-none">Nobody is carrying a high alert.</p>
        ) : (
          <ul className="attention-list">
            {data.atRisk.map(student => (
              <li key={student.id}>
                <button type="button" onClick={() => open(student.id)}>
                  <span className="attention-primary">
                    <strong>{student.rollNumber}</strong> {student.name}
                  </span>
                  <span className="attention-secondary">
                    {student.highAlerts} high · {student.openAlerts} open
                    {student.attendancePercent !== null && student.attendancePercent !== undefined && (
                      <span className={student.attendancePercent < 75 ? 'attention-bad' : ''}>
                        {' '}· {student.attendancePercent}% attendance
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="attention-group" aria-labelledby="attention-quiet">
        <h2 id="attention-quiet">
          <Clock size={16} aria-hidden="true" /> No contact in {data.quietDays}+ days
          <span className="attention-count" aria-live="polite">{data.quiet.length}</span>
        </h2>

        {data.quiet.length === 0 ? (
          <p className="attention-none">Everybody has been spoken to recently.</p>
        ) : (
          <ul className="attention-list">
            {data.quiet.map(student => (
              <li key={student.id}>
                <button type="button" onClick={() => open(student.id)}>
                  <span className="attention-primary">
                    <strong>{student.rollNumber}</strong> {student.name}
                  </span>
                  <span className="attention-secondary">
                    {student.daysSince === null ? 'No interaction ever logged' : `${student.daysSince} days ago`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="attention-group" aria-labelledby="attention-followups">
        <h2 id="attention-followups">
          <CalendarCheck size={16} aria-hidden="true" /> Follow-ups due
          <span className="attention-count" aria-live="polite">{data.followUps.length}</span>
        </h2>

        {data.followUps.length === 0 ? (
          <p className="attention-none">Nothing due this week.</p>
        ) : (
          <ul className="attention-list">
            {data.followUps.map(followUp => (
              <li key={followUp.id}>
                <button type="button" onClick={() => open(followUp.student.id)}>
                  <span className="attention-primary">
                    <strong>{followUp.student.rollNumber}</strong> {followUp.student.name}
                  </span>
                  <span className="attention-secondary">
                    <span className={followUp.overdue ? 'attention-bad' : ''}>
                      {formatDate(followUp.followUpDate)}{followUp.overdue ? ' · overdue' : ''}
                    </span>
                    {followUp.actionItems ? ` · ${followUp.actionItems}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default AttentionPanel;
