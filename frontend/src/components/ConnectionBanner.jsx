import React, { useEffect, useState } from 'react';
import { WifiOff, UploadCloud } from 'lucide-react';
import { subscribeToConnection } from '../lib/offline';
import './ConnectionBanner.css';

// Campus wifi drops. Saying so, and saying what happened to the thing the
// user just typed, is the difference between "it saved" and "it vanished".
const ConnectionBanner = () => {
  const [connection, setConnection] = useState({ online: true, queued: 0, lastFlush: null });

  useEffect(() => subscribeToConnection(setConnection), []);

  if (connection.online && connection.queued === 0) return null;

  return (
    <div className={`connection-banner ${connection.online ? 'is-syncing' : 'is-offline'}`} role="status" aria-live="polite">
      {connection.online ? <UploadCloud size={16} /> : <WifiOff size={16} />}
      <span>
        {connection.online
          ? `Back online. Sending ${connection.queued} change${connection.queued === 1 ? '' : 's'} saved while you were offline…`
          : connection.queued > 0
            ? `You are offline. ${connection.queued} change${connection.queued === 1 ? '' : 's'} will be sent when you reconnect.`
            : 'You are offline. You can still read anything already loaded.'}
      </span>
    </div>
  );
};

export default ConnectionBanner;
