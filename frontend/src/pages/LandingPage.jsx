import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { atLeast } from '../lib/permissions';
import { useAuth } from '../context/useAuth';
import { motion } from 'framer-motion';
import { GraduationCap, ArrowRight, Upload, PenLine, BellRing } from 'lucide-react';
import { useTheme } from '../context/useTheme';
import './LandingPage.css';

// Screenshots of the running app, light and dark, served from public/shots.
// The stock photo of a laptop that used to sit here told a visitor nothing
// except that nobody had got round to taking a screenshot.
const Shot = ({ name, alt, theme, priority = false, width = 1440, height = 900 }) => (
  <picture>
    {/* The media query is the fallback for a first paint before the theme is
        known; the explicit src below follows the theme the app is actually
        showing, which is not always what the operating system says. */}
    <source srcSet={`/shots/${name}-dark.webp`} media="(prefers-color-scheme: dark)" />
    <img
      src={`/shots/${name}-${theme === 'dark' ? 'dark' : 'light'}.webp`}
      alt={alt}
      width={width}
      height={height}
      // The hero image is the largest thing above the fold, so it is the
      // element the load time is measured against. Marking it lazy - which is
      // right for the three below it - told the browser to wait, and put more
      // than a second on the measurement.
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding={priority ? 'sync' : 'async'}
    />
  </picture>
);

const STEPS = [
  { icon: Upload, title: 'Import your class', blurb: 'One spreadsheet. Preview every row, fix what is wrong, then commit.' },
  { icon: PenLine, title: 'Enter marks', blurb: 'A whole class on one grid. Paste a column straight from Excel.' },
  { icon: BellRing, title: 'Get alerts and reports', blurb: 'Who is falling behind, and a printable record for each student.' },
];

const FEATURES = [
  {
    shot: 'marks',
    alt: 'The mark entry grid: one row per student, columns for each assessment, with running totals',
    eyebrow: 'Mark entry',
    title: 'A class at a time, not a student at a time',
    body: 'Every student in the section on one grid, with the internal total calculated as you type. '
      + 'Paste a column from a spreadsheet and it lands in the right rows. Nothing is saved until you say so.',
  },
  {
    shot: 'attention',
    alt: 'A mentor dashboard listing the students who need attention, each with the reason stated',
    eyebrow: 'What needs attention',
    title: 'It opens on the four students who need you',
    body: 'Attendance below the threshold, marks down against their own average, a follow-up past its date, '
      + 'or nobody has spoken to them in a month. Each row says which, and links to the thing to fix.',
  },
  {
    shot: 'dashboard',
    alt: 'The department dashboard: student numbers, pass rate, alerts by type, and mentor workload',
    eyebrow: 'For the head of department',
    title: 'The whole department, honestly counted',
    body: 'Pass rates, alerts by type, how the mentoring load is spread, and who is carrying too much. '
      + 'Numbers come from the database, not from a spreadsheet somebody keeps separately.',
  },
];

const LandingPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { reduceMotion, resolvedTheme } = useTheme();

  const handleGoToDashboard = () => {
    if (atLeast(user, 'COORDINATOR')) navigate('/hod/dashboard');
    else navigate('/mentor/dashboard');
  };

  // Every entrance animation on this page goes through here, so the reduced
  // motion setting turns all of them off in one place rather than each
  // component deciding for itself.
  const enter = (delay = 0) => (reduceMotion
    ? {}
    : {
      initial: { opacity: 0, y: 20 },
      animate: { opacity: 1, y: 0 },
      transition: { delay, duration: 0.4, ease: 'easeOut' },
    });

  // Deliberately never starts at opacity 0. whileInView depends on an
  // intersection callback firing, and when it does not - a browser that
  // restores the page mid-scroll, a screenshot of the whole document, a
  // reader that never scrolls - the content stays invisible forever. Text
  // that might not appear is worse than text that does not animate, so the
  // motion here is a small rise and nothing is ever hidden by it.
  const enterOnView = (delay = 0) => (reduceMotion
    ? {}
    : {
      initial: { y: 18 },
      whileInView: { y: 0 },
      viewport: { once: true, margin: '-40px' },
      transition: { delay, duration: 0.45, ease: 'easeOut' },
    });

  return (
    <div className="landing-page">
      <nav className="lp-nav">
        <div className="lp-logo">
          <GraduationCap size={30} aria-hidden="true" />
          <span className="lp-wordmark">
            AMIS
            <span className="lp-wordmark-devanagari" lang="hi">अमीस</span>
          </span>
        </div>

        <div className="lp-nav-actions">
          {user ? (
            <button className="btn btn-primary" onClick={handleGoToDashboard}>
              Dashboard <ArrowRight size={16} aria-hidden="true" />
            </button>
          ) : (
            <>
              <button className="btn btn-outline" onClick={() => navigate('/login')}>Sign in</button>
              <button
                className="btn btn-primary"
                onClick={() => navigate('/login', { state: { signup: true } })}
              >
                Get started
              </button>
            </>
          )}
        </div>
      </nav>

      <main id="main-content">
      <header className="lp-hero">
        <motion.p className="lp-eyebrow" {...enter(0)}>
          <span className="lp-eyebrow-sa" lang="sa">विद्या ददाति विनयम्</span>
          <span className="lp-eyebrow-gloss">
            vidyā dadāti vinayam · knowledge bestows humility
          </span>
        </motion.p>

        <motion.h1 {...enter(0.05)}>
          Every mentee, <span>and who needs you this week</span>
        </motion.h1>

        <motion.p className="lp-lede" {...enter(0.1)}>
          AMIS keeps marks, attendance and mentoring records for a whole department in one
          place, and tells each mentor which of their students to speak to first.
        </motion.p>

        <motion.div className="lp-cta-group" {...enter(0.15)}>
          {user ? (
            <button className="btn btn-primary btn-lg" onClick={handleGoToDashboard}>
              Go to dashboard <ArrowRight size={20} aria-hidden="true" />
            </button>
          ) : (
            <>
              <button
                className="btn btn-primary btn-lg"
                onClick={() => navigate('/login', { state: { signup: true } })}
              >
                Get started <ArrowRight size={20} aria-hidden="true" />
              </button>
              <button className="btn btn-outline btn-lg" onClick={() => navigate('/login')}>
                Sign in
              </button>
            </>
          )}
        </motion.div>

        <motion.div className="lp-preview" {...enter(0.2)}>
          <div className="lp-frame">
            <div className="lp-frame-bar" aria-hidden="true">
              <span /><span /><span />
            </div>
            <Shot
              name="dashboard"
              theme={resolvedTheme}
              priority
              alt="The AMIS department dashboard: 30 students, 3 mentors, 68 at-risk, 97% pass rate, with charts for semester performance and alerts by type"
            />
          </div>
        </motion.div>
      </header>

      <section className="lp-steps" aria-labelledby="steps-heading">
        <h2 id="steps-heading" className="visually-hidden">How a semester runs</h2>
        <ol className="lp-steps-list">
          {STEPS.map((step, index) => (
            <motion.li key={step.title} {...enterOnView(index * 0.08)}>
              <span className="lp-step-number" aria-hidden="true">{index + 1}</span>
              <step.icon size={22} aria-hidden="true" />
              <h3>{step.title}</h3>
              <p>{step.blurb}</p>
            </motion.li>
          ))}
        </ol>
      </section>

      <section className="lp-features" aria-labelledby="features-heading">
        <div className="lp-section-header">
          <p className="lp-section-eyebrow" lang="hi">विशेषताएँ</p>
          <h2 id="features-heading">What it actually looks like</h2>
        </div>

        {FEATURES.map((feature, index) => (
          <motion.article
            key={feature.shot}
            className={`lp-feature-row ${index % 2 ? 'is-reversed' : ''}`}
            {...enterOnView()}
          >
            <div className="lp-feature-copy">
              <p className="lp-feature-eyebrow">{feature.eyebrow}</p>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </div>

            <div className="lp-feature-shot">
              <div className="lp-frame">
                <div className="lp-frame-bar" aria-hidden="true">
                  <span /><span /><span />
                </div>
                <Shot name={feature.shot} theme={resolvedTheme} alt={feature.alt} />
              </div>
            </div>
          </motion.article>
        ))}
      </section>

      </main>

      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <div className="lp-logo">
              <GraduationCap size={24} aria-hidden="true" />
              <span className="lp-wordmark">
                AMIS
                <span className="lp-wordmark-devanagari" lang="hi">अमीस</span>
              </span>
            </div>
            <p>Mentor–mentee tracking for engineering colleges.</p>
          </div>

          <nav className="lp-footer-links" aria-label="Footer">
            <div>
              <h2>Product</h2>
              <Link to="/login">Sign in</Link>
              <Link to="/changelog">What has changed</Link>
            </div>
            <div>
              <h2>Trust</h2>
              <Link to="/privacy">Privacy</Link>
              <a href="https://github.com/vinayaglg03/Mentor-Mentee/blob/main/docs/SECURITY.md">
                Security
              </a>
            </div>
            <div>
              <h2>Documentation</h2>
              <a href="https://github.com/vinayaglg03/Mentor-Mentee/blob/main/docs/DEPLOYMENT.md">
                Self-hosting
              </a>
              <a href="https://github.com/vinayaglg03/Mentor-Mentee">Source</a>
            </div>
          </nav>
        </div>

        <p className="lp-footer-legal">© {new Date().getFullYear()} AMIS</p>
      </footer>
    </div>
  );
};

export default LandingPage;
