import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/useAuth';
import { Search, Plus, BookOpen, Eye, PlusCircle, Users, ChevronDown, MessageSquare, Bell } from 'lucide-react';
import AlertItem from '../components/AlertItem';
import { can } from '../lib/permissions';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import AttentionPanel from '../components/AttentionPanel';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/useToast';
import './MarksEntry.css';
import { useCardLabels } from '../hooks/useCardLabels';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const LOG_TYPES = [
  { value: 'ROUTINE_MEETING', label: 'Routine meeting' },
  { value: 'ACADEMIC', label: 'Academic' },
  { value: 'ATTENDANCE', label: 'Attendance' },
  { value: 'PERSONAL', label: 'Personal' },
  { value: 'CAREER', label: 'Career' },
  { value: 'DISCIPLINARY', label: 'Disciplinary' },
];

const LOG_MODES = [
  { value: 'IN_PERSON', label: 'In person' },
  { value: 'PHONE', label: 'Phone' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'ONLINE', label: 'Online' },
];

const LOG_TYPE_LABELS = Object.fromEntries(LOG_TYPES.map(type => [type.value, type.label]));

// Matches the thresholds the alert engine uses.
const attendanceClass = (percent) => {
  if (percent === null || percent === undefined) return '';
  if (percent < 75) return 'attendance-critical';
  if (percent < 85) return 'attendance-warning';
  return 'attendance-ok';
};

const MentorDashboard = () => {
  // Column names are copied onto the cells so the card layout below
  // 640px can label each value. See hooks/useCardLabels.js.
  const cardTable0 = useCardLabels();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [unassigned, setUnassigned] = useState([]);
  const [pageError, setPageError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  
  const [expandedStudentId, setExpandedStudentId] = useState(null);
  const [newLogText, setNewLogText] = useState('');
  const [newLog, setNewLog] = useState({ type: 'ROUTINE_MEETING', mode: 'IN_PERSON', actionItems: '', followUpDate: '' });
  // The dashboard opens on what needs doing; the full list is one tab away.
  const [tab, setTab] = useState('attention');
  const toast = useToast();

  // Reads go through the cache: a back-click from a student inside the
  // staleness window renders from it with no request at all, and a refetch
  // leaves the previous answer on screen instead of a spinner.
  const studentsQuery = useQuery({
    queryKey: ['mentor', 'students'],
    // The list draws six columns; the full shape carried every semester with
    // every alert and every mentoring remark.
    queryFn: () => api.get('/mentors/students', { params: { view: 'summary' } })
      .then(response => response.data),
  });

  const attentionQuery = useQuery({
    queryKey: ['mentor', 'attention'],
    queryFn: () => api.get('/mentors/attention').then(response => response.data),
  });

  const followUpsQuery = useQuery({
    queryKey: ['mentor', 'follow-ups'],
    queryFn: () => api.get('/mentors/follow-ups').then(response => response.data),
  });

  // The same list the bell in the top bar reads, so the two cannot disagree
  // about how many alerts are open.
  const alertsQuery = useQuery({
    queryKey: ['mentor', 'alerts'],
    queryFn: () => api.get('/alerts/mentor').then(response => response.data),
  });

  const students = studentsQuery.data || [];
  const loading = studentsQuery.isPending;
  const attention = attentionQuery.data || null;
  const attentionLoading = attentionQuery.isPending;
  const followUps = followUpsQuery.data || [];

  // The rows a student expands into - every semester, with its mentoring log
  // - are fetched when somebody actually expands one.
  const detailQuery = useQuery({
    queryKey: ['student', expandedStudentId],
    queryFn: () => api.get(`/students/${expandedStudentId}`).then(response => response.data),
    enabled: Boolean(expandedStudentId),
  });
  
  const [editingStudent, setEditingStudent] = useState(null);
  const [newStudent, setNewStudent] = useState({ 
    name: '', rollNumber: '', department: '', currentYear: '1', currentSemester: '1', currentAcademicYear: new Date().getFullYear(), enrollmentYear: new Date().getFullYear(), email: '' 
  });
  
  const [newSubject, setNewSubject] = useState({ name: '', code: '', department: '', academicYear: new Date().getFullYear(), semester: '1' });
  const navigate = useNavigate();

  const errorMessage = (err, fallback) => err.response?.data?.error || fallback;

  // After a write, mark the affected reads stale rather than re-running a
  // fetch by hand; anything showing that data updates itself.
  const fetchStudents = () => queryClient.invalidateQueries({ queryKey: ['mentor', 'students'] });
  const fetchAttention = () => queryClient.invalidateQueries({ queryKey: ['mentor', 'attention'] });
  const fetchFollowUps = () => queryClient.invalidateQueries({ queryKey: ['mentor', 'follow-ups'] });

  const fetchUnassigned = async () => {
    setPageError('');
    try {
      const { data } = await api.get('/mentors/students/unassigned');
      setUnassigned(data);
    } catch (err) {
      setPageError(errorMessage(err, 'Could not load unassigned students.'));
    }
  };

  const toggleRow = (id) => {
    setExpandedStudentId(prev => prev === id ? null : id);
    setNewLogText('');
  };


  const handleAddLog = async (studentId, semesterRecordId) => {
    if (!newLogText.trim() || !semesterRecordId) return;
    try {
      await api.post('/mentors/logs', {
        studentId,
        semesterRecordId,
        remark: newLogText,
        type: newLog.type,
        mode: newLog.mode,
        actionItems: newLog.actionItems || undefined,
        followUpDate: newLog.followUpDate || undefined,
      });
      setNewLog({ type: 'ROUTINE_MEETING', mode: 'IN_PERSON', actionItems: '', followUpDate: '' });
      setNewLogText('');
      fetchFollowUps();
      fetchStudents();
      // A logged conversation is what clears "nobody has spoken to them".
      fetchAttention();
      queryClient.invalidateQueries({ queryKey: ['student', studentId] });
    } catch (err) {
      setPageError(errorMessage(err, 'Failed to add log.'));
    }
  };

  const handleClaim = async (studentId) => {
    try {
      await api.put('/mentors/claim-student', { studentId });
      setShowAssignModal(false);
      fetchStudents();
    } catch (err) {
      setPageError(errorMessage(err, 'Failed to claim student.'));
    }
  };

  const handleStudentSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingStudent) {
        await api.put(`/students/${editingStudent.id}`, newStudent);
      } else {
        await api.post('/students', newStudent);
      }
      setShowStudentModal(false);
      setEditingStudent(null);
      setNewStudent({ name: '', rollNumber: '', department: '', currentYear: '1', currentSemester: '1', currentAcademicYear: new Date().getFullYear(), enrollmentYear: new Date().getFullYear(), email: '' });
      fetchStudents();
      toast.success(`Student ${editingStudent ? 'updated' : 'created'}.`);
    } catch (err) {
      toast.error(err, 'Could not save that student.');
    }
  };

  const handleDeleteStudent = async (id) => {
    if (!window.confirm("Are you sure you want to delete this student?")) return;
    try {
      await api.delete(`/students/${id}`);
      fetchStudents();
    } catch (err) {
      toast.error(err, 'Could not remove that student.');
    }
  };

  const handleSubjectSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/subjects', {
        ...newSubject,
        academicYear: Number(newSubject.academicYear),
        semester: Number(newSubject.semester)
      });
      setShowSubjectModal(false);
      setNewSubject({ name: '', code: '', department: '', academicYear: new Date().getFullYear(), semester: '1' });
      toast.success('Subject created.');
    } catch (err) {
      toast.error(err, 'Could not create that subject. Check the code is unique.');
    }
  };

  const openEditStudent = (student) => {
    setEditingStudent(student);
    setNewStudent({
      name: student.name,
      rollNumber: student.rollNumber,
      department: student.department,
      currentYear: student.currentYear,
      currentSemester: student.currentSemester,
      currentAcademicYear: student.currentAcademicYear,
      enrollmentYear: student.enrollmentYear,
      email: student.email || ''
    });
    setShowStudentModal(true);
  };

  const filteredStudents = (students || [])?.filter(s => 
    (s?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (s?.rollNumber || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeAlerts = (alertsQuery.data || [])
    .filter(alert => !alert.resolved)
    .map(alert => ({
      ...alert,
      studentName: alert.student?.name,
      rollNumber: alert.student?.rollNumber,
    }));

  return (
    <div className="dashboard-view">
      <header className="page-header" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="icon-badge" style={{ background: 'var(--accent-solid)', padding: '0.75rem', borderRadius: 'var(--radius-md)', color: 'var(--text-on-accent)' }}>
            <Users size={24} />
          </div>
          <div>
            <h1 style={{ margin: 0 }}>My mentees</h1>
            <p className="text-muted">The students assigned to you, and what needs doing</p>
          </div>
        </div>
        <div className="header-stats" style={{ display: 'flex', gap: '2rem' }}>
          <div className="header-stat">
            <label style={{ display: 'block', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>Mentees</label>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-text)' }}>{(students || []).length}</span>
          </div>
          <div className="header-stat">
            <label style={{ display: 'block', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>Alerts this semester</label>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--danger)' }}>{(students || []).filter(s => (s?.semesterRecords?.[0]?.alertCount || 0) > 0).length}</span>
          </div>
        </div>
      </header>

      {pageError && (
        <div className="error-banner" role="alert" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', borderLeft: '4px solid var(--danger)', borderRadius: 'var(--radius-sm)', padding: '0.75rem 1rem', marginBottom: '1.5rem', fontSize: '14px' }}>
          <span>{pageError}</span>
          <button className="btn-icon" onClick={() => setPageError('')} title="Dismiss" style={{ color: 'var(--danger)' }}>&times;</button>
        </div>
      )}

      <div className="action-row" style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <button className="btn btn-primary" onClick={() => { setEditingStudent(null); setNewStudent({ name: '', rollNumber: '', department: '', currentYear: '1', currentSemester: '1', currentAcademicYear: new Date().getFullYear(), enrollmentYear: new Date().getFullYear(), email: '' }); setShowStudentModal(true); }}>
          <Plus size={18} /> Add student
        </button>
        <button className="btn btn-outline" onClick={() => setShowSubjectModal(true)}>
          <BookOpen size={18} /> Add subject
        </button>
        <button className="btn btn-outline" onClick={() => { fetchUnassigned(); setShowAssignModal(true); }}>
          <PlusCircle size={18} /> Assign mentees
        </button>
      </div>

      <div className="dash-tabs" role="tablist" aria-label="Dashboard views">
        <button
          role="tab"
          type="button"
          id="tab-attention"
          aria-selected={tab === 'attention'}
          aria-controls="panel-attention"
          className={`dash-tab ${tab === 'attention' ? 'is-active' : ''}`}
          onClick={() => setTab('attention')}
        >
          Needs attention
          {attention?.total > 0 && <span className="dash-tab-count" aria-live="polite">{attention.total}</span>}
        </button>
        <button
          role="tab"
          type="button"
          id="tab-all"
          aria-selected={tab === 'all'}
          aria-controls="panel-all"
          className={`dash-tab ${tab === 'all' ? 'is-active' : ''}`}
          onClick={() => setTab('all')}
        >
          All mentees
          <span className="dash-tab-count">{(students || []).length}</span>
        </button>
      </div>

      {tab === 'attention' && (
        <div id="panel-attention" role="tabpanel" aria-labelledby="tab-attention">
          <AttentionPanel data={attention} loading={attentionLoading} />
        </div>
      )}

      {/* Alerts Panel */}
      <div className="card mt-4" hidden={tab !== 'all'}>
        <div className="card-header flex-between">
          <h3>Alerts this semester <span className="badge" style={{ background: 'var(--danger)', color: 'var(--text-on-accent)' }}>{activeAlerts.length}</span></h3>
        </div>
        <div className="card-body">
          {(activeAlerts || [])?.length > 0 ? (
            (activeAlerts || []).map((alert, idx) => (
              <AlertItem 
                key={alert.id || idx}
                studentName={alert.studentName || 'Unknown'}
                usn={alert.rollNumber || 'N/A'}
                message={alert.message || 'No details'}
                status={alert.severity?.toLowerCase() || 'medium'}
              />
            ))
          ) : (
            <EmptyState
              compact
              icon={Bell}
              title="No open alerts"
              description="Alerts appear here when marks or attendance fall below the thresholds. Nothing needs your attention right now."
            />
          )}
        </div>
      </div>

      {/* Follow-ups due */}
      <div className="card mt-4" hidden={tab !== 'all'}>
        <div className="card-header flex-between">
          <h3>
            Follow-ups due{' '}
            <span className="badge" style={{ background: followUps.some(f => f.overdue) ? 'var(--danger)' : 'var(--accent-solid)', color: 'var(--text-on-accent)' }}>
              {followUps.length}
            </span>
          </h3>
        </div>
        <div className="card-body">
          {followUps.length === 0 ? (
            <p className="text-muted" style={{ fontSize: '14px', margin: 0 }}>
              Nothing due in the next fortnight. Set a follow-up date when you log an interaction.
            </p>
          ) : (
            <div className="table-responsive">
              <table ref={cardTable0} className="data-table table-cards sticky-first sticky-head">
                <thead>
                  <tr>
                    <th>Due</th>
                    <th>Student</th>
                    <th>Type</th>
                    <th>Agreed action</th>
                    <th style={{ textAlign: 'right' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {followUps.map(item => (
                    <tr key={item.id}>
                      <td className={item.overdue ? 'attendance-critical' : ''}>
                        {new Date(item.followUpDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                        {item.overdue && ' \u00b7 overdue'}
                      </td>
                      <td><strong>{item.student.rollNumber}</strong> {item.student.name}</td>
                      <td>{LOG_TYPE_LABELS[item.type] || item.type}</td>
                      <td>{item.actionItems || item.remark}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn-icon" onClick={() => navigate(`/student/${item.student.id}`)} title="Open student">
                          <Eye size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Students Table */}
      <div id="panel-all" role="tabpanel" aria-labelledby="tab-all" hidden={tab !== 'all'} className="card mt-4" style={{ padding: 0 }}>
        <div className="card-header" style={{ padding: '1.5rem 1.5rem 0 1.5rem' }}>
          <div className="flex-between">
            <h3>My Assigned Students</h3>
            <div className="search-box" style={{ width: '250px', background: 'var(--surface-sunken)', padding: '0.4rem 0.8rem', borderRadius: '20px', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <Search size={16} className="text-muted" />
              <input 
                type="text" 
                placeholder="Search mentees..." 
                style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '13px', width: '100%' }}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="card-body mt-2">
          {loading ? (
            <SkeletonTable rows={6} columns={6} label="Loading your mentees" />
          ) : (
            <div className="table-responsive">
              <table className="data-table table-cards">
                <thead>
                  <tr>
                    <th>Student Identifier</th>
                    <th>Full Name</th>
                    <th>Department</th>
                    <th>Current Academic State</th>
                    <th>Attendance</th>
                    <th>Alert Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(filteredStudents || [])?.map(student => (
                    <React.Fragment key={student.id}>
                      <tr onClick={() => toggleRow(student.id)} style={{ cursor: 'pointer' }}>
                        <td data-label="Roll number"><strong>{student.rollNumber}</strong></td>
                        <td data-label="Name">{student.name}</td>
                        <td data-label="Department">{student.department}</td>
                        <td data-label="Semester">Sem {student.semesterRecords?.[0]?.semester || student.currentSemester}, Year {student.currentYear}</td>
                        <td data-label="Attendance" className={attendanceClass(student.semesterRecords?.[0]?.attendancePercent)}>
                          {student.semesterRecords?.[0]?.attendancePercent == null
                            ? <span className="text-muted">—</span>
                            : `${student.semesterRecords[0].attendancePercent}%`}
                        </td>
                        <td data-label="Alerts">
                          {(student.semesterRecords?.[0]?.alertCount || 0) > 0 ? (
                            <span className="alert-pill alert-high">
                              {student.semesterRecords[0].alertCount} Active
                            </span>
                          ) : (
                            <span className="alert-pill alert-low">Clear</span>
                          )}
                        </td>
                        <td data-label="Actions">
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="btn-icon" onClick={(e) => { e.stopPropagation(); navigate(`/student/${student.id}`); }} title="Open student">
                              <Eye size={18} />
                            </button>
                            <button className="btn-icon" onClick={(e) => { e.stopPropagation(); toggleRow(student.id); }} title="Toggle Logs">
                              {expandedStudentId === student.id ? <ChevronDown size={18} /> : <MessageSquare size={18} />}
                            </button>
                            <button className="btn-icon" onClick={(e) => { e.stopPropagation(); openEditStudent(student); }} title="Edit Student">
                              <PlusCircle size={18} />
                            </button>
                            {can(user, 'student:delete') && (
                              <button className="btn-icon" onClick={(e) => { e.stopPropagation(); handleDeleteStudent(student.id); }} title="Delete Student" style={{ color: 'var(--danger)' }}>
                                &times;
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedStudentId === student.id && (
                        <tr className="expanded-row-bg">
                          <td colSpan="7" style={{ padding: '1.5rem', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', gap: '2rem' }}>
                              <div style={{ flex: 1 }}>
                                <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <MessageSquare size={16} /> Progress Logs History
                                </h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                  {detailQuery.isPending && (
                                    <p className="text-muted">Loading this student's record…</p>
                                  )}
                                  {(detailQuery.data?.semesterRecords || []).map(record => (
                                    <div key={record.id} className="card" style={{ padding: '1rem', background: 'var(--surface-raised)' }}>
                                      <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent-text)' }}>Semester {record.semester}</h5>
                                      {(record.progressLogs || []).length > 0 ? (
                                        <ul style={{ margin: 0, paddingLeft: '1.5rem', color: 'var(--text-primary)', fontSize: '14px' }}>
                                          {(record.progressLogs || []).map(log => (
                                            <li key={log.id} style={{ marginBottom: '0.5rem' }}>
                                              {log?.remark} <span className="text-muted" style={{ fontSize: '11px', marginLeft: '0.5rem' }}>{new Date(log?.date).toLocaleDateString()}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      ) : (
                                        <p className="text-muted" style={{ fontSize: '13px', margin: 0 }}>No logs recorded for this semester.</p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div style={{ width: '300px' }}>
                                <div className="card" style={{ padding: '1rem', background: 'var(--surface-raised)', position: 'sticky', top: '1rem' }}>
                                  <h5 style={{ margin: '0 0 1rem 0' }}>Add Log (Sem {student.semesterRecords?.[0]?.semester || '?'})</h5>
                                  <textarea
                                    className="input-control"
                                    style={{ width: '100%', minHeight: '80px', marginBottom: '0.75rem', padding: '0.5rem', resize: 'vertical' }}
                                    placeholder="What was discussed..."
                                    value={newLogText}
                                    onChange={(e) => setNewLogText(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                  ></textarea>
                                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                    <select
                                      className="input-control"
                                      style={{ flex: 1, fontSize: '12px' }}
                                      value={newLog.type}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => setNewLog({ ...newLog, type: e.target.value })}
                                    >
                                      {LOG_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                                    </select>
                                    <select
                                      className="input-control"
                                      style={{ flex: 1, fontSize: '12px' }}
                                      value={newLog.mode}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => setNewLog({ ...newLog, mode: e.target.value })}
                                    >
                                      {LOG_MODES.map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
                                    </select>
                                  </div>
                                  <input
                                    className="input-control"
                                    style={{ width: '100%', marginBottom: '0.75rem', fontSize: '12px' }}
                                    placeholder="Agreed actions (optional)"
                                    value={newLog.actionItems}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => setNewLog({ ...newLog, actionItems: e.target.value })}
                                  />
                                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Follow up on</label>
                                  <input
                                    type="date"
                                    className="input-control"
                                    style={{ width: '100%', marginBottom: '1rem', fontSize: '12px' }}
                                    value={newLog.followUpDate}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => setNewLog({ ...newLog, followUpDate: e.target.value })}
                                  />
                                  <button 
                                    className="btn btn-primary btn-full" 
                                    onClick={(e) => { e.stopPropagation(); handleAddLog(student.id, student.semesterRecords?.[0]?.id); }}
                                    disabled={!student.semesterRecords?.[0]?.id}
                                  >
                                    Save Log
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                  {filteredStudents.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ padding: 0 }}>
                        {searchTerm ? (
                          <EmptyState
                            compact
                            icon={Search}
                            title={`No mentee matches "${searchTerm}"`}
                            description="Try a roll number or part of a name."
                          />
                        ) : (
                          <EmptyState
                            icon={Users}
                            title="No mentees yet"
                            description="Students appear here once they are assigned to you. You can claim unassigned students, or import a list if you look after a whole section."
                            actionLabel="Import students"
                            actionTo="/import?type=students"
                          />
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Student Modal (Add/Edit) */}
      {showStudentModal && (
        <Modal
          title={editingStudent ? 'Edit student' : 'Add student'}
          size="md"
          onClose={() => setShowStudentModal(false)}
        >
              <form onSubmit={handleStudentSubmit} id="student-form">
                <div style={{ display: 'flex', gap: '1rem' }} className="mb-4">
                  <div className="form-group" style={{ flex: 2 }}>
                    <label>Full Name</label>
                    <input type="text" className="input-control" required value={newStudent.name} onChange={e => setNewStudent({...newStudent, name: e.target.value})} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>USN / Roll No</label>
                    <input type="text" className="input-control" required value={newStudent.rollNumber} onChange={e => setNewStudent({...newStudent, rollNumber: e.target.value})} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }} className="mb-4">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Department</label>
                    <input type="text" className="input-control" required value={newStudent.department} onChange={e => setNewStudent({...newStudent, department: e.target.value})} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Enrollment Year</label>
                    <input type="number" className="input-control" required value={newStudent.enrollmentYear} onChange={e => setNewStudent({...newStudent, enrollmentYear: e.target.value})} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }} className="mb-4">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Current Year</label>
                    <input type="number" className="input-control" required value={newStudent.currentYear} onChange={e => setNewStudent({...newStudent, currentYear: e.target.value})} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Initial Semester</label>
                    <input type="number" className="input-control" required value={newStudent.currentSemester} onChange={e => setNewStudent({...newStudent, currentSemester: e.target.value})} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Academic Year</label>
                    <input type="number" className="input-control" required value={newStudent.currentAcademicYear} onChange={e => setNewStudent({...newStudent, currentAcademicYear: e.target.value})} />
                  </div>
                </div>
                <div className="form-group mb-4">
                  <label>Email Address</label>
                  <input type="email" className="input-control" value={newStudent.email} onChange={e => setNewStudent({...newStudent, email: e.target.value})} />
                </div>
                <div className="modal-actions modal-actions-inline">
                  <button type="button" className="btn btn-outline" onClick={() => setShowStudentModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">{editingStudent ? 'Save changes' : 'Add student'}</button>
                </div>
              </form>
        </Modal>
      )}

      {/* Claim Student Modal */}
      {showAssignModal && (
        <Modal
          title="Claim a student"
          size="md"
          onClose={() => setShowAssignModal(false)}
        >
               <div className="table-responsive">
                 <table className="data-table">
                   <thead><tr><th>Roll No</th><th>Name</th><th>Action</th></tr></thead>
                   <tbody>
                      {(unassigned || []).map(u => (
                        <tr key={u.id}>
                          <td>{u.rollNumber}</td>
                          <td>{u.name}</td>
                          <td>
                            <button className="btn btn-primary btn-sm" onClick={() => handleClaim(u.id)}>Claim</button>
                          </td>
                        </tr>
                      ))}
                      {unassigned.length === 0 && (
                        <tr>
                          <td colSpan="3" style={{ padding: 0 }}>
                            <EmptyState
                              compact
                              icon={Users}
                              title="Nobody is waiting to be claimed"
                              description="Every student in your department already has a mentor."
                            />
                          </td>
                        </tr>
                      )}
                   </tbody>
                 </table>
               </div>
        </Modal>
      )}

      {/* Add Subject Modal */}
      {showSubjectModal && (
        <Modal
          title="Add a subject"
          size="sm"
          onClose={() => setShowSubjectModal(false)}
        >
                <form onSubmit={handleSubjectSubmit}>
                   <div className="form-group mb-4">
                     <label>Subject Name</label>
                     <input type="text" className="input-control" placeholder="e.g. Data Structures" required value={newSubject.name} onChange={e => setNewSubject({...newSubject, name: e.target.value})} />
                   </div>
                   <div style={{ display: 'flex', gap: '1rem' }} className="mb-4">
                     <div className="form-group" style={{ flex: 1 }}>
                       <label>Course Code</label>
                       <input type="text" className="input-control" placeholder="CS101" required value={newSubject.code} onChange={e => setNewSubject({...newSubject, code: e.target.value})} />
                     </div>
                     <div className="form-group" style={{ flex: 1 }}>
                       <label>Academic Year</label>
                       <input type="number" className="input-control" placeholder="2024" required value={newSubject.academicYear} onChange={e => setNewSubject({...newSubject, academicYear: e.target.value})} />
                     </div>
                   </div>
                   <div style={{ display: 'flex', gap: '1rem' }} className="mb-4">
                     <div className="form-group" style={{ flex: 1 }}>
                       <label>Department</label>
                       <input type="text" className="input-control" placeholder="Computer Science" required value={newSubject.department} onChange={e => setNewSubject({...newSubject, department: e.target.value})} />
                     </div>
                     <div className="form-group" style={{ flex: 1 }}>
                       <label>Semester</label>
                       <input type="number" className="input-control" placeholder="1" required value={newSubject.semester} onChange={e => setNewSubject({...newSubject, semester: e.target.value})} />
                     </div>
                   </div>
                   <div className="modal-actions modal-actions-inline">
                     <button type="button" className="btn btn-outline" onClick={() => setShowSubjectModal(false)}>Cancel</button>
                     <button type="submit" className="btn btn-primary">Add subject</button>
                   </div>
                </form>
        </Modal>
      )}
    </div>
  );
};

export default MentorDashboard;
