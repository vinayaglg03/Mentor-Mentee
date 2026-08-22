import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/useAuth';
import { Search, Plus, BookOpen, Eye, PlusCircle, Users, ChevronDown, MessageSquare } from 'lucide-react';
import AlertItem from '../components/AlertItem';
import { can } from '../lib/permissions';
import './MarksEntry.css';

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
  const { user } = useAuth();
  const [students, setStudents] = useState([]);
  const [unassigned, setUnassigned] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  
  const [expandedStudentId, setExpandedStudentId] = useState(null);
  const [newLogText, setNewLogText] = useState('');
  const [newLog, setNewLog] = useState({ type: 'ROUTINE_MEETING', mode: 'IN_PERSON', actionItems: '', followUpDate: '' });
  const [followUps, setFollowUps] = useState([]);
  
  const [editingStudent, setEditingStudent] = useState(null);
  const [newStudent, setNewStudent] = useState({ 
    name: '', rollNumber: '', department: '', currentYear: '1', currentSemester: '1', currentAcademicYear: new Date().getFullYear(), enrollmentYear: new Date().getFullYear(), email: '' 
  });
  
  const [newSubject, setNewSubject] = useState({ name: '', code: '', department: '', academicYear: new Date().getFullYear(), semester: '1' });
  const navigate = useNavigate();

  useEffect(() => {
    fetchStudents();
    fetchFollowUps();
  }, []);

  const errorMessage = (err, fallback) => err.response?.data?.error || fallback;

  const fetchStudents = async () => {
    setLoading(true);
    setPageError('');
    try {
      const { data } = await api.get('/mentors/students');
      setStudents(data);
    } catch (err) {
      setPageError(errorMessage(err, 'Could not load your mentees.'));
    } finally {
      setLoading(false);
    }
  };

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

  const fetchFollowUps = async () => {
    try {
      const { data } = await api.get('/mentors/follow-ups');
      setFollowUps(data);
    } catch (err) {
      console.error(err);
    }
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
      fetchFollowUps();
      setNewLogText('');
      fetchStudents();
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
      alert(`Student ${editingStudent ? 'updated' : 'created'} successfully`);
    } catch (err) {
      alert(err.response?.data?.error || "Failed to process student");
    }
  };

  const handleDeleteStudent = async (id) => {
    if (!window.confirm("Are you sure you want to delete this student?")) return;
    try {
      await api.delete(`/students/${id}`);
      fetchStudents();
    } catch {
      alert("Failed to delete student. Only admins can delete students.");
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
      alert("Subject created successfully");
    } catch (err) {
      alert(err.response?.data?.error || "Failed to create subject. Ensure code is unique.");
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

  const activeAlerts = (students || [])?.flatMap(s => 
    (s?.semesterRecords?.[0]?.alerts || [])?.map(a => ({ ...a, studentName: s.name, rollNumber: s.rollNumber }))
  );

  return (
    <div className="dashboard-view">
      <header className="page-header" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="icon-badge" style={{ background: 'var(--c-primary)', padding: '0.75rem', borderRadius: 'var(--radius-md)', color: 'white' }}>
            <Users size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.85rem', margin: 0 }}>Academic Mentor Terminal</h1>
            <p className="text-muted">Personalized longitudinal tracking for your assigned mentees</p>
          </div>
        </div>
        <div className="header-stats" style={{ display: 'flex', gap: '2rem' }}>
          <div className="header-stat">
            <label style={{ display: 'block', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--fg-muted)', fontWeight: 700 }}>Total Mentees</label>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--c-primary)' }}>{(students || []).length}</span>
          </div>
          <div className="header-stat">
            <label style={{ display: 'block', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--fg-muted)', fontWeight: 700 }}>Active Alerts</label>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--danger)' }}>{(students || []).filter(s => s?.semesterRecords?.[0]?.alerts?.length > 0).length}</span>
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
          <Plus size={18} /> New Student
        </button>
        <button className="btn btn-outline" onClick={() => setShowSubjectModal(true)}>
          <BookOpen size={18} /> Define Subject
        </button>
        <button className="btn btn-outline" onClick={() => { fetchUnassigned(); setShowAssignModal(true); }}>
          <PlusCircle size={18} /> Manage Assignments
        </button>
      </div>

      {/* Alerts Panel */}
      <div className="card mt-4">
        <div className="card-header flex-between">
          <h3>Current Alerts <span className="badge" style={{ background: 'var(--danger)', color: 'white' }}>{activeAlerts.length}</span></h3>
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
            <p className="text-muted" style={{ fontSize: '14px' }}>All students are on track in their current semester.</p>
          )}
        </div>
      </div>

      {/* Follow-ups due */}
      <div className="card mt-4">
        <div className="card-header flex-between">
          <h3>
            Follow-ups due{' '}
            <span className="badge" style={{ background: followUps.some(f => f.overdue) ? 'var(--danger)' : 'var(--c-primary)', color: 'white' }}>
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
              <table className="data-table">
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
      <div className="card mt-4" style={{ padding: 0 }}>
        <div className="card-header" style={{ padding: '1.5rem 1.5rem 0 1.5rem' }}>
          <div className="flex-between">
            <h3>My Assigned Students</h3>
            <div className="search-box" style={{ width: '250px', background: '#f4f7fa', padding: '0.4rem 0.8rem', borderRadius: '20px', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
            <div style={{ padding: '2rem', textAlign: 'center' }} className="text-muted">Loading mentees...</div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
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
                        <td><strong>{student.rollNumber}</strong></td>
                        <td>{student.name}</td>
                        <td>{student.department}</td>
                        <td>Sem {student.semesterRecords?.[0]?.semester || student.currentSemester}, Year {student.currentYear}</td>
                        <td className={attendanceClass(student.semesterRecords?.[0]?.attendancePercent)}>
                          {student.semesterRecords?.[0]?.attendancePercent == null
                            ? <span className="text-muted">—</span>
                            : `${student.semesterRecords[0].attendancePercent}%`}
                        </td>
                        <td>
                          {(student.semesterRecords?.[0]?.alerts || [])?.length > 0 ? (
                            <span className="alert-pill alert-high">
                              {student.semesterRecords[0].alerts.length} Active
                            </span>
                          ) : (
                            <span className="alert-pill alert-low">Clear</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="btn-icon" onClick={(e) => { e.stopPropagation(); navigate(`/student/${student.id}`); }} title="View Longitudinal Profile">
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
                          <td colSpan="7" style={{ padding: '1.5rem', background: '#f8fafc', borderBottom: '1px solid var(--border-color)' }}>
                            <div style={{ display: 'flex', gap: '2rem' }}>
                              <div style={{ flex: 1 }}>
                                <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <MessageSquare size={16} /> Progress Logs History
                                </h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                  {(student.semesterRecords || []).map(record => (
                                    <div key={record.id} className="card" style={{ padding: '1rem', background: 'white' }}>
                                      <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--c-primary)' }}>Semester {record.semester}</h5>
                                      {(record.progressLogs || []).length > 0 ? (
                                        <ul style={{ margin: 0, paddingLeft: '1.5rem', color: 'var(--c-darkest)', fontSize: '14px' }}>
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
                                <div className="card" style={{ padding: '1rem', background: 'white', position: 'sticky', top: '1rem' }}>
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
                                  <label style={{ fontSize: '11px', color: 'var(--fg-muted)' }}>Follow up on</label>
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
                      <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }} className="text-muted">
                        No mentees found.
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
        <div className="modal">
          <div className="modal-content card" style={{ maxWidth: '600px' }}>
            <div className="flex-between mb-4 border-bottom pb-2" style={{ padding: '1rem 1.5rem' }}>
              <h3>{editingStudent ? 'Edit Student' : 'Add New Student'}</h3>
              <button className="btn-icon" onClick={() => setShowStudentModal(false)}>&times;</button>
            </div>
            <div style={{ padding: '0 1.5rem 1.5rem' }}>
              <form onSubmit={handleStudentSubmit}>
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
                <div className="flex-between" style={{ gap: '1rem' }}>
                  <button type="button" className="btn btn-outline btn-full" onClick={() => setShowStudentModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary btn-full">{editingStudent ? 'Update Student' : 'Create Student'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Claim Student Modal */}
      {showAssignModal && (
        <div className="modal">
          <div className="modal-content card">
             <div className="flex-between mb-4 border-bottom pb-2" style={{ padding: '1rem 1.5rem' }}>
                <h3>Claim Unassigned Student</h3>
                <button className="btn-icon" onClick={() => setShowAssignModal(false)}>&times;</button>
             </div>
             <div style={{ padding: '0 1.5rem 1.5rem' }}>
               <div className="table-responsive" style={{ maxHeight: '400px' }}>
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
                      {unassigned.length === 0 && <tr><td colSpan="3" style={{ textAlign: 'center', padding: '1rem' }}>No unassigned students found.</td></tr>}
                   </tbody>
                 </table>
               </div>
             </div>
          </div>
        </div>
      )}

      {/* Add Subject Modal */}
      {showSubjectModal && (
        <div className="modal">
          <div className="modal-content card" style={{ maxWidth: '500px' }}>
              <div className="flex-between mb-4 border-bottom pb-2" style={{ padding: '1rem 1.5rem' }}>
                <h3>Add New Subject</h3>
                <button className="btn-icon" onClick={() => setShowSubjectModal(false)}>&times;</button>
              </div>
              <div style={{ padding: '0 1.5rem 1.5rem' }}>
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
                   <div className="flex-between" style={{ gap: '1rem' }}>
                     <button type="button" className="btn btn-outline btn-full" onClick={() => setShowSubjectModal(false)}>Cancel</button>
                     <button type="submit" className="btn btn-primary btn-full">Create Subject</button>
                   </div>
                </form>
              </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MentorDashboard;
