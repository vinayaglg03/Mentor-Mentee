import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import api from '../services/api';
import { downloadFile } from '../services/download';
import { atLeast } from '../lib/permissions';
import { motion, AnimatePresence } from 'framer-motion';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { 
  AlertCircle, CheckCircle, Plus, ArrowLeft, Send, 
  AlertTriangle, Trophy, Calendar, Book, Activity, 
  TrendingUp, User, Hash, Briefcase, GraduationCap, ChevronRight, CalendarCheck, FileDown, History
} from 'lucide-react';
import './StudentDetail.css';
import './MarksEntry.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

// Matches the thresholds the alert engine uses.
const attendanceClass = (percent) => {
  if (percent === null || percent === undefined) return '';
  if (percent < 75) return 'attendance-critical';
  if (percent < 85) return 'attendance-warning';
  return 'attendance-ok';
};

const StudentDetail = () => {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();

  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [showScoreModal, setShowScoreModal] = useState(false);
  // The achievement modal markup was never added, so the button that calls
  // setShowAchievementModal opens nothing. Wiring it up is a feature change,
  // out of scope for this pass.
  // eslint-disable-next-line no-unused-vars
  const [showAchievementModal, setShowAchievementModal] = useState(false);
  
  const [selectedSemesterId, setSelectedSemesterId] = useState(null);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [activity, setActivity] = useState(null);
  const [activityError, setActivityError] = useState('');
  const [newLog, setNewLog] = useState('');
  const [newAchievement, setNewAchievement] = useState({ title: '', description: '' });
  const [newScore, setNewScore] = useState({ 
    subjectId: '', test1: '', test2: '', assignment: '', exam: '', academicYear: '', semester: '' 
  });

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const [resStd, resSub] = await Promise.all([
          api.get(`/students/${id}`),
          api.get('/subjects')
        ]);
        if (isMounted) {
          setStudent(resStd.data);
          setSubjects(resSub.data);
          if (resStd.data.semesterRecords?.length > 0) {
            setSelectedSemesterId(resStd.data.semesterRecords[0].id);
          }
        }
      } catch (err) {
        console.error("Fetch Error:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchData();
    return () => { isMounted = false; };
  }, [id]);

  const selectedRecord = useMemo(() => {
    return student?.semesterRecords?.find(r => r.id === selectedSemesterId);
  }, [student, selectedSemesterId]);

  const canEdit = useMemo(() => {
    if (!user || !student) return false;
    // The server decides; this only hides controls that would 403.
    return atLeast(user, 'COORDINATOR') || student.mentorId === user.id;
  }, [user, student]);

  const semesterChartData = useMemo(() => {
    if (!selectedRecord?.scores) return { labels: [], internal: [], external: [], final: [] };
    return {
      labels: selectedRecord.scores.map(s => s.subject?.code || 'N/A'),
      datasets: [
        {
          label: 'Internal Score',
          data: selectedRecord.scores.map(s => s.internalTotal || 0),
          backgroundColor: 'rgba(70, 150, 218, 0.7)',
          borderRadius: 6,
        },
        {
          label: 'External Score',
          data: selectedRecord.scores.map(s => s.exam || 0),
          backgroundColor: 'rgba(53, 116, 170, 0.7)',
          borderRadius: 6,
        }
      ]
    };
  }, [selectedRecord]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, font: { family: 'Inter', size: 11 } } },
      tooltip: { backgroundColor: '#030F1B', padding: 12, cornerRadius: 8 }
    },
    scales: {
      y: { beginAtZero: true, max: 50, grid: { color: 'rgba(0,0,0,0.04)' } },
      x: { grid: { display: false } }
    }
  };

  const progressionChartData = useMemo(() => {
    if (!student?.semesterRecords || student.semesterRecords.length === 0) return null;
    
    // Sort ascending for chronological trend
    const chronologicalRecords = [...student.semesterRecords].sort((a, b) => a.semester - b.semester);
    
    const labels = chronologicalRecords.map(record => `Sem ${record.semester}`);
    const sgpa = chronologicalRecords.map(record => record.sgpa ?? null);
    const cgpa = chronologicalRecords.map(record => record.cgpa ?? null);

    if (sgpa.every(value => value === null)) return null;

    return {
      labels,
      datasets: [
        {
          label: 'SGPA',
          data: sgpa,
          borderColor: '#4696DA',
          backgroundColor: 'rgba(70, 150, 218, 0.2)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#fff',
          pointBorderColor: '#4696DA',
          pointBorderWidth: 2,
          pointRadius: 4,
        },
        {
          label: 'CGPA',
          data: cgpa,
          borderColor: '#047857',
          backgroundColor: 'rgba(4, 120, 87, 0.08)',
          fill: false,
          tension: 0.4,
          borderDash: [6, 4],
          pointBackgroundColor: '#fff',
          pointBorderColor: '#047857',
          pointBorderWidth: 2,
          pointRadius: 3,
        }
      ]
    };
  }, [student]);

  // The cumulative figure stored against the most recent semester.
  const currentCgpa = useMemo(() => {
    const records = [...(student?.semesterRecords || [])]
      .filter(record => record.cgpa !== null && record.cgpa !== undefined)
      .sort((a, b) => (a.academicYear - b.academicYear) || (a.semester - b.semester));

    return records.length > 0 ? records[records.length - 1].cgpa : null;
  }, [student]);

  const loadActivity = async () => {
    setActivityError('');
    try {
      const { data } = await api.get(`/audit/student/${id}`);
      setActivity(data.entries);
    } catch {
      setActivityError('Could not load the change history.');
    }
  };

  // The signed, filed semester document - one click, no options to get wrong.
  const downloadReport = async () => {
    setDownloadingReport(true);
    try {
      await downloadFile(
        `/reports/student/${id}/mentoring.pdf`,
        undefined,
        `mentoring-report-${student?.rollNumber || id}.pdf`
      );
    } catch {
      alert('Could not produce the report.');
    } finally {
      setDownloadingReport(false);
    }
  };

  const progressionOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'bottom', labels: { usePointStyle: true, font: { family: 'Inter', size: 11 } } },
      tooltip: { backgroundColor: '#030F1B', padding: 12, cornerRadius: 8 }
    },
    scales: {
      // Grade points, not marks.
      y: { beginAtZero: true, max: 10, grid: { color: 'rgba(0,0,0,0.04)' } },
      x: { grid: { display: false } }
    }
  };

  const handleLogSubmit = async (e) => {
    e.preventDefault();
    if (!newLog.trim() || !selectedSemesterId) return;
    try {
      await api.post('/mentors/logs', { studentId: id, semesterRecordId: selectedSemesterId, remark: newLog });
      setNewLog('');
      const { data } = await api.get(`/students/${id}`);
      setStudent(data);
    } catch(err) { console.error(err); }
  };

  // eslint-disable-next-line no-unused-vars
  const handleAchievementSubmit = async (e) => {
    e.preventDefault();
    if (!newAchievement.title.trim() || !selectedSemesterId) return;
    try {
      await api.post('/mentors/achievements', { studentId: id, semesterRecordId: selectedSemesterId, ...newAchievement });
      setNewAchievement({ title: '', description: '' });
      setShowAchievementModal(false);
      const { data } = await api.get(`/students/${id}`);
      setStudent(data);
    } catch(err) { console.error(err); }
  };

  const handleScoreSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/scores', {
        studentId: id,
        ...newScore,
        test1: Number(newScore.test1),
        test2: Number(newScore.test2),
        assignment: Number(newScore.assignment),
        exam: Number(newScore.exam),
        academicYear: Number(newScore.academicYear),
        semester: Number(newScore.semester),
      });
      setShowScoreModal(false);
      const { data } = await api.get(`/students/${id}`);
      setStudent(data);
    } catch(err) { 
      alert(err.response?.data?.error || "Failed to save score");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="loading-state">Initializing institutional intelligence...</div>;
  if (!student) return <div className="error-state">Student profile not found.</div>;

  const sortedRecords = [...(student.semesterRecords || [])].sort((a, b) => b.semester - a.semester);

  return (
    <div className="student-detail-wrapper">
      <aside className="timeline-nav">
        <h3><Calendar size={16} /> Academic Timeline</h3>
        <div className="timeline-scroll">
          {sortedRecords.map((record) => (
            <div 
              key={record.id} 
              className={`timeline-link ${selectedSemesterId === record.id ? 'active' : ''}`}
              onClick={() => setSelectedSemesterId(record.id)}
            >
              <div className="sem-num">{record.semester}</div>
              <div className="sem-info">
                <span className="sem-label">Semester {record.semester}</span>
                <span className="year-label">{record.academicYear}</span>
              </div>
              {record.alerts?.length > 0 && <div className="alert-dot" />}
            </div>
          ))}
          {canEdit && (
            <button className="add-sem-btn" onClick={() => setShowScoreModal(true)}>
              <Plus size={16} /> New Semester
            </button>
          )}
        </div>
      </aside>

      <main className="detail-container" style={{ padding: '2rem', flex: 1, overflowY: 'auto' }}>
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="student-profile-glass"
        >
          <div className="profile-main">
            <button onClick={() => navigate(-1)} className="btn-back-glass" style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '0.5rem', borderRadius: '50%', marginBottom: '1.5rem', cursor: 'pointer' }}>
              <ArrowLeft size={20} />
            </button>
            <h1>{student.name}</h1>
            <div className="profile-meta">
              <span><Hash size={16} /> {student.rollNumber}</span>
              <span><Briefcase size={16} /> {student.department}</span>
              <span><User size={16} /> Mentor: {student.mentor?.name || 'Unassigned'}</span>
            </div>
          </div>
          <div className="profile-stats">
            <button
              className="btn btn-outline"
              type="button"
              onClick={downloadReport}
              disabled={downloadingReport}
              style={{ background: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.4)', color: 'white' }}
            >
              <FileDown size={16} /> {downloadingReport ? 'Preparing…' : 'Mentoring report'}
            </button>
          </div>
        </motion.div>

        <div className="metrics-grid">
          <div className="card stat-card">
            <label>SGPA (Sem {selectedRecord?.semester ?? '—'})</label>
            <div className="value">{selectedRecord?.sgpa ?? '—'}</div>
            <TrendingUp size={20} color="var(--success)" style={{ position: 'absolute', top: '1rem', right: '1rem' }} />
          </div>
          <div className="card stat-card">
            <label>Current CGPA</label>
            <div className="value">{currentCgpa ?? '—'}</div>
            <GraduationCap size={20} color="var(--c-primary)" style={{ position: 'absolute', top: '1rem', right: '1rem' }} />
          </div>
          <div className="card stat-card">
            <label>Active Alerts</label>
            <div className="value" style={{ color: selectedRecord?.alerts?.length > 0 ? 'var(--danger)' : 'inherit' }}>
              {selectedRecord?.alerts?.length || 0}
            </div>
            <AlertTriangle size={20} color="var(--warning)" style={{ position: 'absolute', top: '1rem', right: '1rem' }} />
          </div>
          <div className="card stat-card">
            <label>Achievements</label>
            <div className="value">{selectedRecord?.achievements?.length || 0}</div>
            <Trophy size={20} color="var(--info)" style={{ position: 'absolute', top: '1rem', right: '1rem' }} />
          </div>
          <div className="card stat-card">
            <label>Attendance</label>
            <div className={`value ${attendanceClass(selectedRecord?.attendancePercent)}`}>
              {selectedRecord?.attendancePercent == null ? '—' : `${selectedRecord.attendancePercent}%`}
            </div>
            <Book size={20} color="var(--c-primary)" style={{ position: 'absolute', top: '1rem', right: '1rem' }} />
          </div>
        </div>

        <div className="card mb-4" style={{ marginTop: '1.5rem' }}>
          <div className="card-header">
            <h3><TrendingUp size={18} /> SGPA and CGPA by Semester</h3>
          </div>
          <div className="card-body" style={{ height: '300px' }}>
            {!progressionChartData || !progressionChartData.labels || progressionChartData.labels.length === 0 ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="text-muted">
                No academic data available yet
              </div>
            ) : (
              <Line data={progressionChartData} options={progressionOptions} />
            )}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {selectedRecord ? (
            <motion.div 
              key={selectedRecord.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="semester-view fade-in"
            >
              <div className="detail-grid">
                <div className="left-col">
                  <div className="card mb-4">
                    <div className="card-header">
                      <h3><Activity size={18} /> Performance Breakdown</h3>
                      <button className="btn btn-outline" onClick={() => setShowScoreModal(true)}>
                        <Plus size={14} /> Add Score
                      </button>
                    </div>
                    <div style={{ height: '300px' }}>
                      <Bar data={semesterChartData} options={chartOptions} />
                    </div>
                  </div>

                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Subject</th>
                          <th>Internal (50)</th>
                          <th>External (50)</th>
                          <th>Total (100)</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedRecord.scores || []).map(s => (
                          <tr key={s.id}>
                            <td><strong>{s.subject?.name}</strong> <br/><small className="text-muted">{s.subject?.code}</small></td>
                            <td>{s.internalTotal}</td>
                            <td>{s.exam || '-'}</td>
                            <td><span className={s.finalScore < 40 ? 'badge badge-danger' : 'badge badge-success'}>{s.finalScore || '-'}</span></td>
                            <td>{s.finalScore >= 40 ? 'Passed' : 'At Risk'}</td>
                          </tr>
                        ))}
                        {selectedRecord.scores.length === 0 && (
                          <tr><td colSpan="5" className="empty">No scores recorded for this semester yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="right-col">
                  <div className="card mb-4">
                    <div className="card-header">
                      <h3><CalendarCheck size={18} /> Attendance by Subject</h3>
                    </div>
                    <div className="card-body">
                      {(selectedRecord?.attendance || []).length === 0 ? (
                        <p className="text-muted" style={{ fontSize: '14px', margin: 0 }}>
                          No attendance recorded for this semester yet.
                        </p>
                      ) : (
                        <div className="table-responsive">
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>Subject</th>
                                <th>Held</th>
                                <th>Attended</th>
                                <th>Percentage</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(selectedRecord.attendance || []).map(row => {
                                const percent = row.classesHeld > 0
                                  ? Math.round((row.classesAttended / row.classesHeld) * 1000) / 10
                                  : null;
                                return (
                                  <tr key={row.id}>
                                    <td><strong>{row.subject?.code}</strong> {row.subject?.name}</td>
                                    <td>{row.classesHeld}</td>
                                    <td>{row.classesAttended}</td>
                                    <td className={attendanceClass(percent)}>
                                      {percent === null ? '—' : `${percent}%`}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="card mb-4">
                    <div className="card-header">
                      <h3><AlertCircle size={18} /> Intelligence Alerts</h3>
                    </div>
                    <div className="list-content">
                      {selectedRecord.alerts?.map(alert => (
                        <div key={alert.id} className={`alert-banner severity-${alert.severity.toLowerCase()}`}>
                          <strong>{alert.type}:</strong> {alert.message}
                        </div>
                      ))}
                      {(!selectedRecord.alerts || selectedRecord.alerts.length === 0) && <p className="empty">No active alerts.</p>}
                    </div>
                  </div>

                  <div className="card mb-4">
                    <div className="card-header">
                      <h3><Trophy size={18} /> Achievements</h3>
                      <button className="btn-icon" onClick={() => setShowAchievementModal(true)}><Plus size={16} /></button>
                    </div>
                    <div className="list-content">
                      {selectedRecord.achievements?.map(ach => (
                        <div key={ach.id} className="item-card">
                          <div className="item-icon"><Trophy size={18} /></div>
                          <div>
                            <strong>{ach.title}</strong>
                            <p className="text-muted" style={{ fontSize: '12px' }}>{ach.description}</p>
                          </div>
                        </div>
                      ))}
                      {(!selectedRecord.achievements || selectedRecord.achievements.length === 0) && <p className="empty">No achievements noted.</p>}
                    </div>
                  </div>

                  <div className="card mb-4">
                    <div className="card-header flex-between">
                      <h3><History size={18} /> Activity</h3>
                      {activity === null && (
                        <button className="btn btn-outline btn-sm" type="button" onClick={loadActivity}>
                          Show change history
                        </button>
                      )}
                    </div>
                    <div className="card-body">
                      {activityError && <p className="text-muted" style={{ fontSize: '13px', color: 'var(--danger)' }}>{activityError}</p>}
                      {activity === null && !activityError && (
                        <p className="text-muted" style={{ fontSize: '13px', margin: 0 }}>
                          Every change to this student's marks, attendance, alerts and logs, with who made it and when.
                        </p>
                      )}
                      {activity !== null && activity.length === 0 && (
                        <p className="text-muted" style={{ fontSize: '13px', margin: 0 }}>Nothing recorded yet.</p>
                      )}
                      {activity !== null && activity.length > 0 && (
                        <ul className="activity-list">
                          {activity.map(entry => (
                            <li key={entry.id}>
                              <span className="activity-when">
                                {new Date(entry.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                              </span>
                              <span className="activity-what">{entry.summary}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-header">
                      <h3><Send size={18} /> Mentor Feedback</h3>
                    </div>
                    <div className="list-content">
                      <form onSubmit={handleLogSubmit} className="log-form">
                        <input 
                          type="text" 
                          className="input-control" 
                          placeholder="Add academic remark..." 
                          value={newLog} 
                          onChange={e => setNewLog(e.target.value)} 
                        />
                        <button type="submit" className="btn btn-primary"><Send size={16} /></button>
                      </form>
                      <div className="logs-list">
                        {(selectedRecord.progressLogs || []).map(log => (
                          <div key={log.id} className="log-entry">
                            <span className="log-meta text-muted">{new Date(log.date).toLocaleDateString()}</span>
                            <p>{log?.remark}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="select-prompt">Please select a semester from the timeline to view academic data.</div>
          )}
        </AnimatePresence>

        {/* MODALS (Modernized styling applied via global card/btn styles) */}
        {showScoreModal && (
          <div className="modal-overlay glass">
            <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} className="card modal-content" style={{ maxWidth: '600px', margin: 'auto' }}>
               <div className="card-header">
                 <h2>Record Academic Performance</h2>
               </div>
               <form onSubmit={handleScoreSubmit}>
                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label>Subject</label>
                      <select className="input-control" required value={newScore.subjectId} onChange={e => setNewScore({...newScore, subjectId: e.target.value})}>
                        <option value="">Select Subject</option>
                        {(subjects || []).map(sub => <option key={sub.id} value={sub.id}>{sub.name} ({sub.code})</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Academic Year</label>
                      <input type="number" className="input-control" required value={newScore.academicYear} onChange={e => setNewScore({...newScore, academicYear: e.target.value})} placeholder="e.g. 2024" />
                    </div>
                    <div className="form-group">
                      <label>Semester</label>
                      <input type="number" className="input-control" required value={newScore.semester} onChange={e => setNewScore({...newScore, semester: e.target.value})} placeholder="1-8" />
                    </div>
                    <div className="form-group">
                      <label>CIE 1</label>
                      <input type="number" className="input-control" required value={newScore.test1} onChange={e => setNewScore({...newScore, test1: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label>CIE 2</label>
                      <input type="number" className="input-control" required value={newScore.test2} onChange={e => setNewScore({...newScore, test2: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label>Assignment (3+ only)</label>
                      <input type="number" className="input-control" value={newScore.assignment} onChange={e => setNewScore({...newScore, assignment: e.target.value})} disabled={newScore.semester <= 2} />
                    </div>
                    <div className="form-group">
                      <label>External (Max 50)</label>
                      <input type="number" className="input-control" required value={newScore.exam} onChange={e => setNewScore({...newScore, exam: e.target.value})} />
                    </div>
                 </div>
                 <div className="mt-4 flex-between">
                   <button type="button" className="btn btn-outline" onClick={() => setShowScoreModal(false)}>Cancel</button>
                   <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Syncing...' : 'Confirm Entry'}</button>
                 </div>
               </form>
            </motion.div>
          </div>
        )}
      </main>
    </div>
  );
};

export default StudentDetail;
