// ==============================
// AMIS Application Logic
// ==============================

// Realistic Mock Data
const mockStudents = [
  { usn: "1RV21CS001", name: "Aarav Sharma", sem: 5, mentor: "Dr. Smith", attendance: 92, cgpa: 9.1, status: "low", alertMsg: "" },
  { usn: "1RV21CS015", name: "Priya Patel", sem: 5, mentor: "Dr. Smith", attendance: 71, cgpa: 6.8, status: "medium", alertMsg: "Low attendance in core subjects" },
  { usn: "1RV21CS042", name: "Rahul Verma", sem: 5, mentor: "Dr. Rao", attendance: 45, cgpa: 5.2, status: "high", alertMsg: "Critical attendance, failing 2 subjects" },
  { usn: "1RV21CS058", name: "Ananya Singh", sem: 5, mentor: "Dr. Smith", attendance: 98, cgpa: 9.5, status: "low", alertMsg: "" },
  { usn: "1RV21CS077", name: "Vikram Reddy", sem: 5, mentor: "Dr. Rao", attendance: 85, cgpa: 7.9, status: "low", alertMsg: "" },
  { usn: "1RV21CS091", name: "Sneha Gupta", sem: 5, mentor: "Dr. Smith", attendance: 60, cgpa: 6.1, status: "high", alertMsg: "Sudden drop in performance" },
  { usn: "1RV21CS110", name: "Karan Desai", sem: 5, mentor: "Dr. Rao", attendance: 78, cgpa: 7.4, status: "medium", alertMsg: "Missed internal assessments" },
];

const mockStats = {
  totalStudents: mockStudents.length,
  atRisk: mockStudents.filter(s => s.status === 'high').length,
  topPerformers: mockStudents.filter(s => s.cgpa >= 9.0).length,
  activeMentors: 12
};

// Application State
const app = {
  user: null,
  chartsInstance: {},

  init() {
    this.checkAuth();
    this.setupEventListeners();
  },

  // --- Routing & Auth ---
  checkAuth() {
    const savedUser = localStorage.getItem('amis_user');
    if (savedUser) {
      this.user = JSON.parse(savedUser);
      this.navigateTo('dashboard');
    } else {
      this.navigateTo('landing');
    }
  },

  login(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const role = document.getElementById('login-role').value;
    
    // Simulate API call and set user
    this.user = {
      name: email.split('@')[0] || 'User',
      role: role,
    };
    
    // For demo: if Mentor role, make their name 'Dr. Smith' to match mock data
    if (role === 'Mentor') {
      this.user.name = "Dr. Smith";
    } else {
      this.user.name = "Prof. Anderson"; // HOD
    }

    localStorage.setItem('amis_user', JSON.stringify(this.user));
    this.navigateTo('dashboard');
  },

  signup(e) {
    e.preventDefault();
    const name = document.getElementById('signup-name').value;
    const role = document.getElementById('signup-role').value;

    this.user = { name, role };
    localStorage.setItem('amis_user', JSON.stringify(this.user));
    this.navigateTo('dashboard');
  },

  logout() {
    this.user = null;
    localStorage.removeItem('amis_user');
    this.navigateTo('landing');
  },

  navigateTo(view) {
    // Hide all views
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));

    switch(view) {
      case 'landing':
        document.getElementById('landing-view').classList.add('active');
        break;
      case 'login':
        document.getElementById('auth-view').classList.add('active');
        this.toggleAuthMode('login');
        break;
      case 'signup':
        document.getElementById('auth-view').classList.add('active');
        this.toggleAuthMode('signup');
        break;
      case 'dashboard':
        if (!this.user) {
          this.navigateTo('login');
          return;
        }
        document.getElementById('dashboard-view').classList.add('active');
        this.renderDashboard();
        break;
    }
  },

  toggleAuthMode(mode) {
    if (mode === 'login') {
      document.getElementById('login-section').classList.remove('d-none');
      document.getElementById('signup-section').classList.add('d-none');
    } else {
      document.getElementById('login-section').classList.add('d-none');
      document.getElementById('signup-section').classList.remove('d-none');
    }
  },

  // --- Dashboard Rendering ---
  renderDashboard() {
    // Topbar User Info
    document.getElementById('user-greeting').innerText = `Welcome, ${this.user.name}`;
    document.getElementById('user-role-badge').innerText = this.user.role;
    
    // Reset Dashboards
    document.getElementById('hod-dashboard').classList.add('d-none');
    document.getElementById('mentor-dashboard').classList.add('d-none');

    // Sidebar Links
    const navUl = document.getElementById('sidebar-nav-links');
    navUl.innerHTML = ''; // clear

    if (this.user.role === 'HOD') {
      document.getElementById('hod-dashboard').classList.remove('d-none');
      
      navUl.innerHTML = `
        <li><a href="#" class="active"><i class="fa-solid fa-chart-pie"></i> Analytics Overview</a></li>
        <li><a href="#"><i class="fa-solid fa-users"></i> Department Students</a></li>
        <li><a href="#"><i class="fa-solid fa-chalkboard-user"></i> Manage Mentors</a></li>
        <li><a href="#"><i class="fa-solid fa-gear"></i> Settings</a></li>
      `;
      this.initHODDashboard();
    } else if (this.user.role === 'Mentor') {
      document.getElementById('mentor-dashboard').classList.remove('d-none');
      
      navUl.innerHTML = `
        <li><a href="#" class="active"><i class="fa-solid fa-users"></i> My Mentees</a></li>
        <li><a href="#"><i class="fa-solid fa-file-lines"></i> Progress Logs</a></li>
        <li><a href="#"><i class="fa-solid fa-bell"></i> Alerts</a></li>
      `;
      this.initMentorDashboard();
    }
  },

  // --- HOD Specific ---
  initHODDashboard() {
    // Populate Stats
    document.getElementById('hod-total-students').innerText = mockStats.totalStudents;
    document.getElementById('hod-at-risk').innerText = mockStats.atRisk;
    document.getElementById('hod-top-performers').innerText = mockStats.topPerformers;
    document.getElementById('hod-active-mentors').innerText = mockStats.activeMentors;

    this.renderHODStudentTable();
    this.renderHODCharts();
  },

  renderHODStudentTable() {
    const tbody = document.querySelector('#hod-students-table tbody');
    const filter = document.getElementById('hod-filter-status').value;
    
    tbody.innerHTML = '';
    
    mockStudents.forEach(stu => {
      if (filter !== 'all' && stu.status !== filter) return;

      const alertPill = this.getAlertHTML(stu.status);
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${stu.usn}</strong></td>
        <td>${stu.name}</td>
        <td>${stu.sem}</td>
        <td>${stu.mentor}</td>
        <td><strong>${stu.cgpa}</strong></td>
        <td>${alertPill}</td>
      `;
      tbody.appendChild(tr);
    });
  },

  renderHODCharts() {
    // Destroy previous if exist
    if(this.chartsInstance.perf) this.chartsInstance.perf.destroy();
    if(this.chartsInstance.alerts) this.chartsInstance.alerts.destroy();

    const ctxPerf = document.getElementById('hodPerformanceChart').getContext('2d');
    this.chartsInstance.perf = new Chart(ctxPerf, {
      type: 'bar',
      data: {
        labels: ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4', 'Sem 5'],
        datasets: [{
          label: 'Avg Department CGPA',
          data: [7.8, 8.1, 7.9, 8.3, 8.4],
          backgroundColor: '#4696DA',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: false, min: 5, max: 10 } }
      }
    });

    const ctxAlerts = document.getElementById('hodAlertsChart').getContext('2d');
    this.chartsInstance.alerts = new Chart(ctxAlerts, {
      type: 'doughnut',
      data: {
        labels: ['On Track', 'Medium Risk', 'High Risk'],
        datasets: [{
          data: [
            mockStudents.filter(s => s.status === 'low').length,
            mockStudents.filter(s => s.status === 'medium').length,
            mockStudents.filter(s => s.status === 'high').length
          ],
          backgroundColor: ['#22c55e', '#eab308', '#ef4444'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        cutout: '70%',
        plugins: { legend: { position: 'bottom' } }
      }
    });
  },

  // --- Mentor Specific ---
  initMentorDashboard() {
    this.renderMentorStudents();
    this.renderMentorAlerts();
  },

  getMentorStudents() {
    return mockStudents.filter(s => s.mentor === this.user.name);
  },

  renderMentorStudents() {
    const tbody = document.querySelector('#mentor-students-table tbody');
    tbody.innerHTML = '';
    
    const myStudents = this.getMentorStudents();

    myStudents.forEach(stu => {
      const alertPill = this.getAlertHTML(stu.status);
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${stu.usn}</strong></td>
        <td>${stu.name}</td>
        <td>${stu.sem}</td>
        <td>${stu.attendance}%</td>
        <td><strong>${stu.cgpa}</strong></td>
        <td>${alertPill}</td>
        <td>
          <button class="btn-icon" title="View Logs"><i class="fa-solid fa-eye"></i></button>
          <button class="btn-icon" title="Add Log"><i class="fa-solid fa-plus-circle"></i></button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  },

  renderMentorAlerts() {
    const container = document.getElementById('mentor-alerts-container');
    container.innerHTML = '';
    
    const myStudents = this.getMentorStudents();
    
    // Sort so high alerts show first
    const alerts = myStudents.filter(s => s.status !== 'low').sort((a,b) => {
      if(a.status === 'high' && b.status !== 'high') return -1;
      return 1;
    });

    document.getElementById('mentor-high-alerts-count').innerText = alerts.length;

    if (alerts.length === 0) {
      container.innerHTML = '<p class="text-success"><i class="fa-solid fa-check-circle"></i> All students are on track.</p>';
      return;
    }

    alerts.forEach(s => {
      const div = document.createElement('div');
      div.className = `alert-item mode-${s.status}`;
      
      div.innerHTML = `
        <div class="alert-content">
          <h4>${s.name} (${s.usn})</h4>
          <p>${s.alertMsg}</p>
        </div>
        <button class="btn btn-outline" style="font-size: 12px; padding: 0.3rem 0.6rem;">Action</button>
      `;
      container.appendChild(div);
    });
  },

  // --- Helpers & Modals ---
  getAlertHTML(status) {
    if (status === 'high') return '<span class="alert-pill alert-high"><i class="fa-solid fa-circle-exclamation"></i> Critical</span>';
    if (status === 'medium') return '<span class="alert-pill alert-medium"><i class="fa-solid fa-triangle-exclamation"></i> Warning</span>';
    return '<span class="alert-pill alert-low"><i class="fa-solid fa-check"></i> Good</span>';
  },

  showAddStudentModal() {
    document.getElementById('add-student-modal').classList.remove('d-none');
  },
  
  closeModals() {
    document.getElementById('add-student-modal').classList.add('d-none');
  },

  addStudent(e) {
    e.preventDefault();
    const name = document.getElementById('add-stu-name').value;
    const usn = document.getElementById('add-stu-usn').value;
    const sem = document.getElementById('add-stu-sem').value;
    const cgpa = document.getElementById('add-stu-cgpa').value;

    mockStudents.push({
      usn,
      name,
      sem: parseInt(sem),
      mentor: this.user.name,
      attendance: 100,
      cgpa: parseFloat(cgpa),
      status: "low",
      alertMsg: ""
    });

    this.closeModals();
    e.target.reset(); // clear form
    this.renderMentorStudents();
    this.renderMentorAlerts();
  },

  setupEventListeners() {
    document.getElementById('login-form').addEventListener('submit', (e) => this.login(e));
    document.getElementById('signup-form').addEventListener('submit', (e) => this.signup(e));
    document.getElementById('add-student-form').addEventListener('submit', (e) => this.addStudent(e));
    
    // Close modal on outside click
    document.getElementById('add-student-modal').addEventListener('click', (e) => {
      if(e.target.id === 'add-student-modal') this.closeModals();
    });
  }
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
