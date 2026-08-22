import React, { useEffect, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import api from '../services/api';
import './DemoBanner.css';

// Demo data is obvious at a glance, so nobody mistakes sample students for
// real ones or reports on them by accident.
const DemoBanner = () => {
  const [present, setPresent] = useState(false);

  useEffect(() => {
    let cancelled = false;

    api.get('/setup/status')
      .then(({ data }) => { if (!cancelled) setPresent(Boolean(data.demoDataPresent)); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, []);

  if (!present) return null;

  return (
    <div className="demo-banner" role="status">
      <FlaskConical size={16} aria-hidden="true" />
      <span>
        This instance contains <strong>sample data</strong> for evaluation. Remove it with
        <code>npm run seed:demo -- --remove</code> before entering real student records.
      </span>
    </div>
  );
};

export default DemoBanner;
