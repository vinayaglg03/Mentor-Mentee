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
              Dashboard <ArrowRight size={16} />
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="btn btn-outline" onClick={() => navigate('/login')}>Sign in</button>
              <button className="btn btn-primary" onClick={() => navigate('/login', { state: { signup: true } })}>Get started</button>
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
          Built for engineering colleges in India
        </motion.div>
        
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          Every mentee, <span>and who needs you this week</span>
        </motion.h1>
        
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          AMIS keeps marks, attendance and mentoring records for a whole department in one
          place, and tells each mentor which of their students to speak to first.
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
              Go to dashboard <ArrowRight size={20} />
            </button>
          ) : (
            <>
              <button className="btn btn-primary btn-lg" style={{ padding: '1.2rem 3rem', fontSize: '1.1rem' }} onClick={() => navigate('/login', { state: { signup: true } })}>
                Get started <ArrowRight size={20} />
              </button>
              <button className="btn btn-outline btn-lg" style={{ padding: '1.2rem 3rem', fontSize: '1.1rem' }} onClick={() => navigate('/login')}>
                Sign in
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
            alt="The AMIS department dashboard, showing student numbers, pass rate and open alerts"
            className="lp-preview-image"
          />
        </motion.div>
      </header>

      <section className="lp-features">
        <div className="lp-section-header">
          <h2>What it does</h2>
          <p className="text-muted">Four things, done properly.</p>
        </div>

        <div className="lp-features-grid">
          {[
            { icon: <BarChart3 />, title: 'Marks and attendance', desc: 'Enter a whole class at once, or paste from a spreadsheet. SGPA and CGPA are calculated for you.' },
            { icon: <Shield />, title: 'The full record', desc: 'Every semester a student has been through, with who changed what and when.' },
            { icon: <BellRing />, title: 'Alerts that fire early', desc: 'Attendance below the threshold, marks dropping, nobody spoken to in a month.' },
            { icon: <Target />, title: 'Mentor assignment', desc: 'Assign students to mentors, see how the load is spread, and cap it.' },
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
            <p>&copy; 2026 AMIS</p>
            <p>Academic Mentor Intelligence System</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
