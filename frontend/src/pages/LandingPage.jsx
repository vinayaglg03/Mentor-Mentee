import React from 'react';
import { useNavigate } from 'react-router-dom';
import { atLeast } from '../lib/permissions';
import { useAuth } from '../context/useAuth';
import { motion } from 'framer-motion';
import { GraduationCap, ArrowRight, Shield, BarChart3, BellRing, Target } from 'lucide-react';
import './LandingPage.css';

const LandingPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleGoToDashboard = () => {
    if (atLeast(user, 'COORDINATOR')) navigate('/hod/dashboard');
    else navigate('/mentor/dashboard');
  };

  return (
    <div className="landing-page">
      <nav className="lp-nav">
        <div className="lp-logo flex-between" style={{ gap: '0.75rem' }}>
          <GraduationCap size={32} color="var(--accent-text)" />
          <span>AMIS</span>
        </div>
        <div className="lp-nav-actions">
          {user ? (
            <button className="btn btn-primary" onClick={handleGoToDashboard}>
              Console <ArrowRight size={16} />
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="btn btn-outline" onClick={() => navigate('/login')}>Sign In</button>
              <button className="btn btn-primary" onClick={() => navigate('/login', { state: { signup: true } })}>Get Started</button>
            </div>
          )}
        </div>
      </nav>

      <header className="lp-hero">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lp-badge"
        >
          Institutional Academic Intelligence v2.0
        </motion.div>
        
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          Institutional Oversight with <span>Live Academic Intelligence</span>
        </motion.h1>
        
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          A professional, role-based platform designed for modern educational institutions. 
          Empower mentors with longitudinal student tracking and provide HODs with real-time academic oversight.
        </motion.p>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="lp-cta-group"
          style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem' }}
        >
          {user ? (
            <button className="btn btn-primary btn-lg" style={{ padding: '1.2rem 3rem', fontSize: '1.1rem' }} onClick={handleGoToDashboard}>
              Enter Intelligence Terminal <ArrowRight size={20} />
            </button>
          ) : (
            <>
              <button className="btn btn-primary btn-lg" style={{ padding: '1.2rem 3rem', fontSize: '1.1rem' }} onClick={() => navigate('/login', { state: { signup: true } })}>
                Deploy System <ArrowRight size={20} />
              </button>
              <button className="btn btn-outline btn-lg" style={{ padding: '1.2rem 3rem', fontSize: '1.1rem' }} onClick={() => navigate('/login')}>
                Institutional Login
              </button>
            </>
          )}
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="lp-preview"
        >
          <img
            src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=2026"
            alt="AMIS Terminal Preview"
            className="lp-preview-image"
          />
        </motion.div>
      </header>

      <section className="lp-features">
        <div className="lp-section-header">
          <h2>Institutional Core Features</h2>
          <p className="text-muted">High-performance tools built for academic governance.</p>
        </div>

        <div className="lp-features-grid">
          {[
            { icon: <BarChart3 />, title: 'Real-time Analytics', desc: 'Global performance aggregation with semester-wise breakdown for institutional oversight.' },
            { icon: <Shield />, title: 'Longitudinal Tracking', desc: 'Complete historical academic records with progressive performance mapping.' },
            { icon: <BellRing />, title: 'Proactive Alerting', desc: 'Intelligent security and academic alerts to identify at-risk students instantly.' },
            { icon: <Target />, title: 'Mentor Management', desc: 'Direct assignment and workload tracking for departmental faculty.' },
          ].map((f, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="lp-feature-card"
            >
              <div className="lp-feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <footer style={{ padding: '6rem 2rem', background: 'var(--chrome-bg)', color: 'var(--text-on-accent)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="lp-logo flex-between" style={{ gap: '0.75rem', opacity: 0.6 }}>
            <GraduationCap size={24} />
            <span>AMIS</span>
          </div>
          <div style={{ textAlign: 'right', opacity: 0.6, fontSize: '0.9rem' }}>
            <p>&copy; 2026 Institutional Academic Intelligence. All rights reserved.</p>
            <p>Built for Smarter Academic Governance</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
