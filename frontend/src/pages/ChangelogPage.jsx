import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import api from '../services/api';
import './ImportPage.css';
import './ChangelogPage.css';

// Fed from CHANGELOG.md in the repository, so release notes are written once
// and appear in both places.
const escapeHtml = (text) => text
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const inline = (text) => escapeHtml(text)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // Only http(s) and relative links; anything else is left as text.
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*|docs\/[^)\s]+)\)/g,
    '<a href="$2" rel="noreferrer noopener" target="_blank">$1</a>');

const renderMarkdown = (markdown) => {
  const blocks = [];
  let list = null;

  const flush = () => {
    if (list) {
      blocks.push(`${list}</ul>`);
      list = null;
    }
  };

  for (const line of markdown.split('\n')) {
    if (/^#\s/.test(line)) { flush(); blocks.push(`<h2>${inline(line.slice(2))}</h2>`); }
    else if (/^##\s/.test(line)) { flush(); blocks.push(`<h3>${inline(line.slice(3))}</h3>`); }
    else if (/^###\s/.test(line)) { flush(); blocks.push(`<h4>${inline(line.slice(4))}</h4>`); }
    else if (/^---\s*$/.test(line)) { flush(); blocks.push('<hr />'); }
    else if (/^[-*]\s/.test(line)) { list = `${list || '<ul>'}<li>${inline(line.slice(2))}</li>`; }
    else if (line.trim() === '') { flush(); }
    else { flush(); blocks.push(`<p>${inline(line)}</p>`); }
  }

  flush();
  return blocks.join('\n');
};

const ChangelogPage = () => {
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/privacy/changelog', { responseType: 'text' })
      .then(({ data }) => setHtml(renderMarkdown(String(data))))
      .catch(() => setError('Could not load the release notes.'));
  }, []);

  return (
    <div className="import-view">
      <header className="page-header import-header">
        <div>
          <h1><Sparkles size={22} aria-hidden="true" /> What has changed</h1>
          <p className="text-muted">Every release, most recent first.</p>
        </div>
      </header>

      {error && <div className="import-banner import-banner-error" role="alert">{error}</div>}

      <div className="card changelog" style={{ padding: '1.5rem' }}>
        {html
          ? <div dangerouslySetInnerHTML={{ __html: html }} />
          : <p className="text-muted">Loading…</p>}
      </div>
    </div>
  );
};

export default ChangelogPage;
