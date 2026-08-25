import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Bar, Doughnut } from '../components/Charts';
import { Users, GraduationCap, AlertTriangle, TrendingUp, Search, Eye, ChevronDown, MessageSquare } from 'lucide-react';
import StatCard from '../components/StatCard';
import { useCardLabels } from '../hooks/useCardLabels';
import { useToast } from '../components/useToast';


const HODDashboard = () => {
  // Column names are copied onto the cells so the card layout below
  // 640px can label each value. See hooks/useCardLabels.js.
  const cardTable0 = useCardLabels();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState('overview');
  const [analytics, setAnalytics] = useState(null);
  const [students, setStudents] = useState([]);
  const [mentors, setMentors] = useState([]);
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [expandedStudentId, setExpandedStudentId] = useState(null);

  const toggleRow = (id) => {
    setExpandedStudentId(prev => prev === id ? null : id);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resAn, resStd, resMen] = await Promise.all([
        api.get('/analytics/hod'),
        api.get('/hod/students'),
        api.get('/hod/mentors')
      ]);
      setAnalytics(resAn.data);
      setStudents(resStd.data);
      setMentors(resMen.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignMentor = async (studentId, mentorId) => {
    try {
      await api.put(`/hod/students/${studentId}/assign`, { mentorId });
      fetchData();
      toast.success('Mentor assigned.');
    } catch (error) {
      // Usually the mentor is at their cap, and the server says which -
      // a bare "Assignment failed" threw that away.
      toast.error(error, 'Could not assign that mentor.');
    }
  };

  const performanceData = {
    labels: ['Pass', 'Fail'],
    datasets: [{
      label: 'Performance Distribution',
      data: [analytics?.performanceOverview?.pass || 0, analytics?.performanceOverview?.fail || 0],
      backgroundColor: ['#22c55e', '#ef4444'],
      borderRadius: 4
    }],
  };

  const alertData = {
    labels: analytics?.alertStats?.byType?.map(a => a.type) || [],
    datasets: [{
      data: analytics?.alertStats?.byType?.map(a => a.count) || [],
      backgroundColor: ['#ef4444', '#eab308', '#4696DA', '#3574AA', '#235179'],
      borderWidth: 0,
    }],
  };

  const mentorDistData = {
    labels: analytics?.mentorDistribution?.map(m => m.name) || [],
    datasets: [{
      label: 'Students Assigned',
      data: analytics?.mentorDistribution?.map(m => m.studentCount) || [],
      backgroundColor: '#4696DA',
      borderRadius: 4
    }]
  };

  const chartOptions = { 
    responsive: true, 
    maintainAspectRatio: false, 
    plugins: { 
      legend: { display: false },
      tooltip: {
        padding: 12,
        cornerRadius: 8
      }
    }, 
    scales: { 
      y: { 
        beginAtZero: true, 
        grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
        ticks: { font: { size: 11 } }
      }, 
      x: { 
        grid: { display: false },
        ticks: { font: { size: 11 } }
      } 
    } 
  };

  const doughnutOptions = { 
    responsive: true, 
    maintainAspectRatio: false, 
    plugins: { legend: { position: 'bottom' } }, 
    cutout: '70%' 
  };

  const renderOverview = () => (
    <>
      <div className="stats-grid mt-4">
        <StatCard title="Total Students" value={analytics?.totalStudents || 0} icon={Users} type="primary" />
        <StatCard title="Active Mentors" value={analytics?.totalMentors || 0} icon={GraduationCap} type="info" />
        <StatCard title="At-Risk Students" value={analytics?.alertStats?.totalActive || 0} icon={AlertTriangle} type="danger" />
        <StatCard 
          title="Pass Rate" 
          value={`${(analytics?.performanceOverview?.total || 0) > 0 ? Math.round((analytics.performanceOverview.pass / analytics.performanceOverview.total) * 100) : 0}%`} 
          icon={TrendingUp} 
          type="success" 
        />
      </div>

      <div className="mt-4 panel-grid panel-grid-even">
        <div className="card">
          <div className="card-header"><h3>Semester-wise Performance</h3></div>
          <div className="card-body" style={{ height: '250px' }}>
            {analytics?.performanceOverview?.total > 0 ? (
              <Bar
                data={performanceData}
                options={chartOptions}
                label="Passes and failures by semester"
                summary={`${analytics?.performanceOverview?.pass || 0} passes and `
                  + `${analytics?.performanceOverview?.fail || 0} failures across the department.`}
              />
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="text-muted">No data available</div>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3>Active Alerts by Type</h3></div>
          <div className="card-body" style={{ height: '250px' }}>
            {alertData.labels.length > 0 ? (
              <Doughnut
                data={alertData}
                options={doughnutOptions}
                label="Open alerts by type"
                summary={(analytics?.alertStats?.byType || [])
                  .map(item => `${item.type.toLowerCase().replace(/_/g, ' ')}: ${item.count}`)
                  .join(', ')}
              />
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="text-muted">No alerts yet</div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 panel-grid panel-grid-wide">
        <div className="card">
          <div className="card-header"><h3>Mentor Workload</h3></div>
          <div className="card-body" style={{ height: '300px' }}>
            {mentorDistData.labels.length > 0 ? (
              <Bar
                data={mentorDistData}
                options={chartOptions}
                label="Number of mentees per mentor"
                summary={(analytics?.mentorDistribution || [])
                  .map(item => `${item.name}: ${item.studentCount}`)
                  .join(', ')}
              />
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="text-muted">No assignments found</div>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3>Recent Critical Alerts</h3></div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {analytics?.recentAlerts?.map(alert => (
                <div key={alert.id} style={{ padding: '0.75rem', background: 'var(--danger-soft)', borderLeft: '4px solid var(--danger)', borderRadius: '4px' }}>
                  <div style={{ fontWeight: '600', fontSize: '13px' }}>{alert.student?.name || 'Unknown'} ({alert.student?.rollNumber || 'N/A'})</div>
                  <div style={{ fontSize: '12px', color: 'var(--danger-fg)' }}>{alert.message}</div>
                </div>
              ))}
              {(!analytics?.recentAlerts || analytics?.recentAlerts?.length === 0) && <p className="text-muted">No recent critical alerts.</p>}
            </div>
          </div>
        </div>
      </div>
    </>
  );

  const renderStudents = () => {
    const filtered = (students || []).filter(s => (s?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || (s?.rollNumber || '').toLowerCase().includes(searchTerm.toLowerCase()));
    
    return (
      <div className="card mt-4" style={{ padding: 0 }}>
        <div className="card-header" style={{ padding: '1.5rem 1.5rem 0 1.5rem' }}>
          <div className="flex-between">
            <h3>Students in your department</h3>
            {/* Was a hard 250px, which does not fit beside a heading on a
                phone. */}
            <div className="filter-box">
              <Search size={16} className="text-muted" aria-hidden="true" />
              <label htmlFor="hod-student-filter" className="sr-only">Filter students</label>
              <input
                id="hod-student-filter"
                type="search"
                placeholder="Filter by USN or name…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>
        
        <div className="card-body">
          <div className="table-responsive">
            <table ref={cardTable0} className="data-table table-cards sticky-first sticky-head">
              <thead>
                <tr>
                  <th>USN</th>
                  <th>Name</th>
                  <th>Current Sem</th>
                  <th>Alerts</th>
                  <th>Mentor</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {(filtered || [])?.map(s => (
                  <React.Fragment key={s.id}>
                    <tr onClick={() => toggleRow(s.id)} style={{ cursor: 'pointer' }}>
                      <td><strong>{s.rollNumber}</strong></td>
                      <td>{s.name}</td>
                      <td>Sem {s.semesterRecords?.[0]?.semester || s.currentSemester}</td>
                      <td>
                        {(s.semesterRecords?.[0]?.alerts || [])?.length > 0 ? (
                          <span className="alert-pill alert-high">{s.semesterRecords[0].alerts.length} Active</span>
                        ) : (
                          <span className="alert-pill alert-low">On Track</span>
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <select 
                          className="input-control" 
                          style={{ padding: '0.2rem 0.5rem', fontSize: '12px' }}
                          value={s.mentor?.id || ''} 
                          onChange={(e) => handleAssignMentor(s.id, e.target.value)}
                        >
                          <option value="">-- Unassigned --</option>
                          {(mentors || [])?.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="btn-icon" onClick={(e) => { e.stopPropagation(); navigate(`/student/${s.id}`); }} title="Open student">
                            <Eye size={18} />
                          </button>
                          <button className="btn-icon" onClick={(e) => { e.stopPropagation(); toggleRow(s.id); }} title="Toggle Logs">
                            {expandedStudentId === s.id ? <ChevronDown size={18} /> : <MessageSquare size={18} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedStudentId === s.id && (
                      <tr className="expanded-row-bg">
                        <td colSpan="6" style={{ padding: '1.5rem', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                          <div className="detail-columns">
                            <div style={{ flex: 1 }}>
                              <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <MessageSquare size={16} /> Progress Logs History
                              </h4>
                              <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                                {(s.semesterRecords || []).map(record => (
                                  <div key={record.id} className="card" style={{ padding: '1rem', background: 'var(--surface-raised)', minWidth: '300px', flex: 1 }}>
                                    <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent-text)' }}>Semester {record.semester}</h5>
                                    {(record.progressLogs || []).length > 0 ? (
                                      <ul style={{ margin: 0, paddingLeft: '1.5rem', color: 'var(--text-primary)', fontSize: '14px' }}>
                                        {(record.progressLogs || []).map(log => (
                                          <li key={log.id} style={{ marginBottom: '0.5rem' }}>
                                            {log?.remark} <br/><span className="text-muted" style={{ fontSize: '11px' }}>{new Date(log?.date).toLocaleDateString()} - {log.mentor?.name}</span>
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
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderMentors = () => (
    <div className="mt-4">
      <div className="flex-between mb-4">
         <h3>Active Academic Mentors</h3>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
         {(mentors || [])?.map(m => (
           <div key={m.id} className="card">
             <div className="flex-between mb-4">
                <div>
                  <h4 style={{ margin: 0 }}>{m?.name || 'Mentor'}</h4>
                  <small className="text-muted">{m?.email || 'N/A'}</small>
                </div>
                <div className="user-avatar" style={{ width: '32px', height: '32px' }}>{m?.name?.charAt(0) || 'M'}</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-sunken)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
                <span style={{ fontSize: '12px', fontWeight: '500' }}>Mentees Assigned</span>
                <span className="badge" style={{ background: 'var(--accent-solid)', color: 'var(--text-on-accent)' }}>{m?._count?.students || 0}</span>
              </div>
           </div>
         ))}
      </div>
    </div>
  );

  return (
    <div className="dashboard-view">
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
          <div className="icon-badge" style={{ background: 'var(--accent-solid)', padding: '0.75rem', borderRadius: 'var(--radius-md)', color: 'var(--text-on-accent)' }}>
            <TrendingUp size={24} />
          </div>
          <div>
            <h1>Department dashboard</h1>
            <p className="text-muted">Marks, attendance and alerts across your department</p>
          </div>
        </div>
      </div>

      <div className="tabs mt-4" style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border)' }}>
         <button className={`btn ${activeTab==='overview'?'btn-primary':'btn-outline'}`} style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottom: activeTab==='overview' ? '2px solid var(--accent-solid)' : 'none' }} onClick={()=>setActiveTab('overview')}>Overview</button>
         <button className={`btn ${activeTab==='students'?'btn-primary':'btn-outline'}`} style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottom: activeTab==='students' ? '2px solid var(--accent-solid)' : 'none' }} onClick={()=>setActiveTab('students')}>Students</button>
         <button className={`btn ${activeTab==='mentors'?'btn-primary':'btn-outline'}`} style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottom: activeTab==='mentors' ? '2px solid var(--accent-solid)' : 'none' }} onClick={()=>setActiveTab('mentors')}>Mentors</button>
      </div>

      {loading ? (
        <div style={{ padding: '4rem', textAlign: 'center' }} className="text-muted">Fetching institutional intelligence...</div>
      ) : (
        <>
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'students' && renderStudents()}
          {activeTab === 'mentors' && renderMentors()}
        </>
      )}
    </div>
  );
};

export default HODDashboard;
