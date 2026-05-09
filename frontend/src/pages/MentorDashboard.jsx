import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Search, Plus, BookOpen, Eye, PlusCircle, Users } from 'lucide-react';
import AlertItem from '../components/AlertItem';

const MentorDashboard = () => {
  const { user } = useAuth();
  const [students, setStudents] = useState([]);
  const [unassigned, setUnassigned] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  
  const [editingStudent, setEditingStudent] = useState(null);
  const [newStudent, setNewStudent] = useState({ 
    name: '', rollNumber: '', department: '', currentYear: '1', currentSemester: '1', currentAcademicYear: new Date().getFullYear(), enrollmentYear: new Date().getFullYear(), email: '' 
  });
  
  const [newSubject, setNewSubject] = useState({ name: '', code: '', department: '', academicYear: new Date().getFullYear(), semester: '1' });
  const navigate = useNavigate();

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/mentors/students');
      setStudents(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUnassigned = async () => {
    try {
      const { data } = await api.get('/hod/students/unassigned');
      setUnassigned(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleClaim = async (studentId) => {
    try {
      await api.put('/mentors/claim-student', { studentId });
      setShowAssignModal(false);
      fetchStudents();
    } catch (err) {
      alert("Failed to claim student");
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
    } catch (err) {
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
                    <th>Alert Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(filteredStudents || [])?.map(student => (
                    <tr key={student.id}>
                      <td><strong>{student.rollNumber}</strong></td>
                      <td>{student.name}</td>
                      <td>{student.department}</td>
                      <td>Sem {student.semesterRecords?.[0]?.semester || student.currentSemester}, Year {student.currentYear}</td>
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
                          <button className="btn-icon" onClick={() => navigate(`/student/${student.id}`)} title="View Longitudinal Profile">
                            <Eye size={18} />
                          </button>
                          <button className="btn-icon" onClick={() => openEditStudent(student)} title="Edit Student">
                            <PlusCircle size={18} />
                          </button>
                          {user?.role === 'ADMIN' && (
                            <button className="btn-icon" onClick={() => handleDeleteStudent(student.id)} title="Delete Student" style={{ color: 'var(--danger)' }}>
                              &times;
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredStudents.length === 0 && (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }} className="text-muted">
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
