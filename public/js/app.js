// Global State Management
const state = {
  currentUser: { username: 'admin', role: 'admin', name: 'System Administrator' },
  students: [],
  enrolledFaces: [],
  attendanceLogs: [],
  settings: {
    confidenceThreshold: 85,
    cooldownMinutes: 5,
    blinkLiveness: true,
    parentAlerts: true
  }
};

// DOM Content Loaded Handler
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initLoginHandlers();
  initNavigation();
  initThemeToggle();
  initModals();
  checkExistingSession();

  // Polling for live clock & notifications
  setInterval(updateClock, 1000);
});

let selectedRole = 'admin';
let authMode = 'login'; // 'login' or 'signup'

// Initialize Login & Sign Up Handlers
function initLoginHandlers() {
  // Log In / Sign Up Mode Switcher
  const loginTabBtn = document.getElementById('tab-btn-login');
  const signupTabBtn = document.getElementById('tab-btn-signup');
  const switchModeBtn = document.getElementById('btn-switch-mode');
  const alertBox = document.getElementById('login-alert-box');

  function setAuthMode(mode) {
    authMode = mode;
    hideLoginAlert();

    if (mode === 'login') {
      loginTabBtn?.classList.add('active');
      signupTabBtn?.classList.remove('active');
      document.getElementById('form-login')?.classList.remove('hidden');
      document.getElementById('form-signup')?.classList.add('hidden');
      document.getElementById('auth-switch-prompt').textContent = "Don't have an account? ";
      if (switchModeBtn) switchModeBtn.textContent = 'Sign Up Now';
    } else {
      signupTabBtn?.classList.add('active');
      loginTabBtn?.classList.remove('active');
      document.getElementById('form-signup')?.classList.remove('hidden');
      document.getElementById('form-login')?.classList.add('hidden');
      document.getElementById('auth-switch-prompt').textContent = 'Already have an account? ';
      if (switchModeBtn) switchModeBtn.textContent = 'Log In Here';
    }
  }

  loginTabBtn?.addEventListener('click', () => setAuthMode('login'));
  signupTabBtn?.addEventListener('click', () => setAuthMode('signup'));
  switchModeBtn?.addEventListener('click', () => setAuthMode(authMode === 'login' ? 'signup' : 'login'));

  // Role Pill Switcher
  const rolePills = document.querySelectorAll('.role-pill');
  rolePills.forEach(pill => {
    pill.addEventListener('click', () => {
      rolePills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      selectedRole = pill.getAttribute('data-role');

      const label = document.getElementById('login-user-label');
      if (label) {
        if (selectedRole === 'admin') label.textContent = 'Admin Username';
        else if (selectedRole === 'teacher') label.textContent = 'Teacher Username';
        else label.textContent = 'Student ID / Username';
      }
    });
  });

  // Password Visibility Toggle
  document.getElementById('btn-toggle-password')?.addEventListener('click', () => {
    const pwdInput = document.getElementById('login-password');
    const icon = document.getElementById('btn-toggle-password').querySelector('i');
    if (pwdInput.type === 'password') {
      pwdInput.type = 'text';
      icon.className = 'fa-solid fa-eye-slash';
    } else {
      pwdInput.type = 'password';
      icon.className = 'fa-solid fa-eye';
    }
  });

  // Log In Form Submission
  document.getElementById('form-login')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideLoginAlert();

    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    if (!username || !password) {
      showLoginAlert('Please enter both your username and password.');
      return;
    }

    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, role: selectedRole })
    });

    if (res.success) {
      state.currentUser = res.user;
      localStorage.setItem('visioface_token', res.token);
      localStorage.setItem('visioface_user', JSON.stringify(res.user));

      showToast(`Welcome back, ${res.user.name}! Logged in as ${res.user.role.toUpperCase()}`, 'success');
      launchAppForUser(res.user);
    } else {
      // Show specific error messages for invalid username vs wrong password
      showLoginAlert(res.message || 'Authentication failed. Please verify credentials.');
      showToast(res.message, 'danger');
    }
  });

  // Sign Up Form Submission
  document.getElementById('form-signup')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideLoginAlert();

    const name = document.getElementById('signup-name').value.trim();
    const username = document.getElementById('signup-username').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;

    if (!name || !username || !password) {
      showLoginAlert('Full Name, Username, and Password are required to Sign Up.');
      return;
    }

    const res = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, username, email, password, role: selectedRole })
    });

    if (res.success) {
      showToast(res.message, 'success');
      document.getElementById('login-username').value = username;
      document.getElementById('login-password').value = password;
      setAuthMode('login');
    } else {
      showLoginAlert(res.message || 'Failed to create account.');
      showToast(res.message, 'danger');
    }
  });

  // Logout Handler
  document.getElementById('btn-logout')?.addEventListener('click', () => {
    localStorage.removeItem('visioface_token');
    localStorage.removeItem('visioface_user');
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    showToast('Signed out successfully.', 'info');
  });
}

function showLoginAlert(msg) {
  const box = document.getElementById('login-alert-box');
  const msgEl = document.getElementById('login-alert-msg');
  if (box && msgEl) {
    msgEl.textContent = msg;
    box.classList.remove('hidden');
  }
}

function hideLoginAlert() {
  const box = document.getElementById('login-alert-box');
  if (box) box.classList.add('hidden');
}

function quickFillLogin(username, password, role) {
  document.getElementById('login-username').value = username;
  document.getElementById('login-password').value = password;
  
  const pill = document.querySelector(`.role-pill[data-role="${role}"]`);
  if (pill) pill.click();
}

function checkExistingSession() {
  const savedUser = localStorage.getItem('visioface_user');
  if (savedUser) {
    try {
      const user = JSON.parse(savedUser);
      state.currentUser = user;
      launchAppForUser(user);
    } catch (e) {
      document.getElementById('login-screen').classList.remove('hidden');
    }
  } else {
    document.getElementById('login-screen').classList.remove('hidden');
  }
}

function launchAppForUser(user) {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  document.getElementById('current-user-name').textContent = user.name;
  document.getElementById('current-user-role').textContent = user.role.toUpperCase();

  // Filter Sidebar Navigation based on Role
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    const tab = link.getAttribute('data-tab');
    if (user.role === 'student') {
      if (tab === 'dashboard' || tab === 'attendance-logs') link.classList.remove('hidden');
      else link.classList.add('hidden');
    } else if (user.role === 'teacher') {
      if (tab === 'settings') link.classList.add('hidden');
      else link.classList.remove('hidden');
    } else {
      link.classList.remove('hidden');
    }
  });

  switchTab('dashboard');
  loadStudents();
  loadDashboardStats();
}

// Live Clock Initializer
function initClock() {
  updateClock();
}

function updateClock() {
  const now = new Date();
  const timeEl = document.getElementById('live-time');
  const dateEl = document.getElementById('live-date');
  if (timeEl) timeEl.textContent = now.toLocaleTimeString('en-US');
  if (dateEl) {
    const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
    dateEl.textContent = now.toLocaleDateString('en-US', options);
  }
}

// Navigation & Tab Switcher
function initNavigation() {
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      const targetTab = link.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });
}

function switchTab(tabId) {
  // Update sidebar buttons
  document.querySelectorAll('.nav-link').forEach(btn => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Hide all tab views and show target view
  document.querySelectorAll('.tab-view').forEach(view => {
    view.classList.remove('active');
  });

  const activeView = document.getElementById(`view-${tabId}`);
  if (activeView) {
    activeView.classList.add('active');
  }

  // Trigger tab-specific initialization hooks
  if (tabId === 'dashboard') {
    loadDashboardStats();
  } else if (tabId === 'students') {
    loadStudents();
  } else if (tabId === 'attendance-logs') {
    loadAttendanceLogs();
  } else if (tabId === 'reports') {
    if (window.renderReports) window.renderReports();
  } else if (tabId === 'enrollment') {
    populateEnrollmentStudentSelect();
  }
}

// Dark/Light Theme Toggle
function initThemeToggle() {
  const toggleBtn = document.getElementById('btn-theme-toggle');
  if (!toggleBtn) return;
  
  toggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    toggleBtn.innerHTML = newTheme === 'dark' ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
    showToast(`Switched to ${newTheme} theme mode`, 'info');
  });
}

// API Helper
async function apiFetch(endpoint, options = {}) {
  try {
    const response = await fetch(endpoint, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    return await response.json();
  } catch (err) {
    console.error(`API Fetch Error (${endpoint}):`, err);
    showToast('Network error contacting server', 'danger');
    return { success: false, message: 'Network failure' };
  }
}

// Load Students Directory
async function loadStudents() {
  const deptFilter = document.getElementById('student-dept-filter')?.value || 'All';
  const search = document.getElementById('student-search-input')?.value || '';

  const res = await apiFetch(`/api/students?department=${encodeURIComponent(deptFilter)}&search=${encodeURIComponent(search)}`);
  if (res.success) {
    state.students = res.students;
    renderStudentsTable(state.students);
    populateEnrollmentStudentSelect();
  }
}

function renderStudentsTable(students) {
  const tbody = document.getElementById('students-table-body');
  if (!tbody) return;

  if (students.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No students found matching your criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = students.map(s => `
    <tr>
      <td><span class="fw-bold text-accent">${s.student_id}</span></td>
      <td>
        <div class="d-flex align-items-center gap-2">
          <i class="fa-solid fa-circle-user text-muted"></i>
          <span class="fw-semibold">${s.name}</span>
        </div>
      </td>
      <td>${s.roll_number}</td>
      <td><span class="badge bg-info">${s.department}</span></td>
      <td>${s.email || s.phone || 'N/A'}</td>
      <td>
        ${s.face_enrolled 
          ? '<span class="badge bg-success"><i class="fa-solid fa-check me-1"></i> Enrolled</span>' 
          : '<span class="badge bg-warning"><i class="fa-solid fa-triangle-exclamation me-1"></i> Pending</span>'}
      </td>
      <td>
        <button class="btn btn-sm btn-outline me-1" onclick="openEnrollForStudent('${s.student_id}')" title="Enroll Face">
          <i class="fa-solid fa-camera"></i>
        </button>
        <button class="btn btn-sm btn-danger" onclick="deleteStudent('${s.student_id}')" title="Delete Student">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

// Delete Student
async function deleteStudent(studentId) {
  if (!confirm(`Are you sure you want to delete student ${studentId}?`)) return;

  const res = await apiFetch(`/api/students/${studentId}`, { method: 'DELETE' });
  if (res.success) {
    showToast(`Student ${studentId} deleted successfully`, 'success');
    loadStudents();
    loadDashboardStats();
  } else {
    showToast(res.message || 'Failed to delete student', 'danger');
  }
}

// Load Dashboard Statistics
async function loadDashboardStats() {
  const res = await apiFetch('/api/reports/dashboard');
  if (res.success) {
    const { stats, recentActivity } = res;
    document.getElementById('kpi-total-students').textContent = stats.totalStudents;
    document.getElementById('kpi-present-today').textContent = stats.presentToday;
    document.getElementById('kpi-absent-today').textContent = stats.absentToday;
    document.getElementById('kpi-late-sub').textContent = `${stats.lateToday} Late Arrivals`;
    document.getElementById('kpi-rate').textContent = `${stats.attendancePercentage}%`;
    document.getElementById('kpi-rate-fill').style.width = `${stats.attendancePercentage}%`;

    // Render Recent Feed
    const feedContainer = document.getElementById('dashboard-feed-list');
    if (feedContainer) {
      if (recentActivity.length === 0) {
        feedContainer.innerHTML = `<div class="feed-empty">No attendance scans recorded today yet.</div>`;
      } else {
        feedContainer.innerHTML = recentActivity.map(item => `
          <div class="feed-item">
            <div class="feed-left">
              <div class="feed-avatar">
                <i class="fa-solid fa-user"></i>
              </div>
              <div class="feed-info">
                <span class="feed-title">${item.name} (${item.student_id})</span>
                <span class="feed-time">${item.department} | ${item.mode}</span>
              </div>
            </div>
            <div>
              <span class="badge ${item.status === 'Present' ? 'bg-success' : 'bg-warning'}">${item.status} - ${item.time}</span>
            </div>
          </div>
        `).join('');
      }
    }

    // Render Trend Chart if Chart.js is ready
    if (window.renderTrendChart) window.renderTrendChart(res.trend);
  }
}

// Load Attendance Logs with Filters
async function loadAttendanceLogs() {
  const date = document.getElementById('log-date-filter')?.value || '';
  const dept = document.getElementById('log-dept-filter')?.value || 'All';
  const status = document.getElementById('log-status-filter')?.value || 'All';

  const res = await apiFetch(`/api/attendance/history?date=${encodeURIComponent(date)}&department=${encodeURIComponent(dept)}&status=${encodeURIComponent(status)}`);
  if (res.success) {
    state.attendanceLogs = res.logs;
    const tbody = document.getElementById('logs-table-body');
    if (!tbody) return;

    if (res.logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted"><i class="fa-solid fa-circle-exclamation me-2 text-warning"></i> No attendance records found for selected date, department, or status filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = res.logs.map(log => {
      let statusBadge = '<span class="badge bg-success"><i class="fa-solid fa-right-to-bracket me-1"></i> Present</span>';
      if (log.status === 'Check-Out') {
        statusBadge = '<span class="badge bg-danger"><i class="fa-solid fa-right-from-bracket me-1"></i> Check-Out</span>';
      } else if (log.status === 'Late') {
        statusBadge = '<span class="badge bg-warning"><i class="fa-solid fa-clock me-1"></i> Late</span>';
      } else if (log.status === 'Absent') {
        statusBadge = '<span class="badge bg-secondary"><i class="fa-solid fa-user-xmark me-1"></i> Absent</span>';
      }

      return `
        <tr>
          <td class="fw-semibold">${log.date}</td>
          <td>${log.time}</td>
          <td><span class="fw-bold text-accent">${log.student_id}</span></td>
          <td class="fw-semibold">${log.name}</td>
          <td><span class="badge bg-info">${log.department}</span></td>
          <td>${statusBadge}</td>
          <td>${log.mode}</td>
          <td>${log.confidence || 98.5}%</td>
        </tr>
      `;
    }).join('');
  }
}

// Modals & Filters Management
function initFilterHandlers() {
  // Filter Apply Button
  document.getElementById('btn-apply-log-filters')?.addEventListener('click', () => {
    loadAttendanceLogs();
    showToast('Applied attendance log filters', 'info');
  });

  // Filter Reset Button
  document.getElementById('btn-reset-log-filters')?.addEventListener('click', () => {
    const dateInput = document.getElementById('log-date-filter');
    const deptSelect = document.getElementById('log-dept-filter');
    const statusSelect = document.getElementById('log-status-filter');
    if (dateInput) dateInput.value = '';
    if (deptSelect) deptSelect.value = 'All';
    if (statusSelect) statusSelect.value = 'All';
    loadAttendanceLogs();
    showToast('Cleared attendance log filters', 'info');
  });

  // Instant Change Filter Listeners
  ['log-date-filter', 'log-dept-filter', 'log-status-filter'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => loadAttendanceLogs());
  });

  // Check-In vs Check-Out Scan Mode Pills
  const modePills = document.querySelectorAll('.scan-mode-pill-box .mode-pill');
  modePills.forEach(pill => {
    pill.addEventListener('click', () => {
      modePills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const scanMode = pill.getAttribute('data-mode');
      if (window.faceEngine) window.faceEngine.scanMode = scanMode;
      showToast(`Camera scanner mode set to: ${scanMode.toUpperCase()}`, scanMode === 'Check-Out' ? 'warning' : 'success');
    });
  });
}

function initModals() {
  initFilterHandlers();

  // Add Student Modal Open
  const addBtn = document.getElementById('btn-open-add-student-modal');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      document.getElementById('modal-add-student').classList.add('show');
    });
  }

  // Manual Attendance Modal Open
  const manualBtn = document.getElementById('btn-open-manual-modal');
  if (manualBtn) {
    manualBtn.addEventListener('click', () => {
      populateManualStudentSelect();
      document.getElementById('modal-manual-attendance').classList.add('show');
    });
  }

  // Close buttons
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close');
      document.getElementById(modalId)?.classList.remove('show');
    });
  });

  // Save Student Form Handler
  document.getElementById('btn-save-student')?.addEventListener('click', async () => {
    const student_id = document.getElementById('modal-student-id').value.trim();
    const name = document.getElementById('modal-student-name').value.trim();
    const roll_number = document.getElementById('modal-student-roll').value.trim();
    const department = document.getElementById('modal-student-dept').value;
    const email = document.getElementById('modal-student-email').value.trim();
    const phone = document.getElementById('modal-student-phone').value.trim();

    if (!student_id || !name || !roll_number) {
      showToast('Please fill all required student fields', 'warning');
      return;
    }

    const res = await apiFetch('/api/students', {
      method: 'POST',
      body: JSON.stringify({ student_id, name, roll_number, department, email, phone })
    });

    if (res.success) {
      showToast('Student registered successfully!', 'success');
      document.getElementById('modal-add-student').classList.remove('show');
      loadStudents();
      loadDashboardStats();
    } else {
      showToast(res.message || 'Failed to save student', 'danger');
    }
  });

  // Save Manual Attendance Handler
  document.getElementById('btn-submit-manual-attendance')?.addEventListener('click', async () => {
    const student_id = document.getElementById('manual-student-select').value;
    const date = document.getElementById('manual-date-input').value;
    const status = document.getElementById('manual-status-select').value;

    if (!student_id) {
      showToast('Select a student first', 'warning');
      return;
    }

    const res = await apiFetch('/api/attendance/manual', {
      method: 'POST',
      body: JSON.stringify({ student_id, date, status })
    });

    if (res.success) {
      showToast(res.message, 'success');
      document.getElementById('modal-manual-attendance').classList.remove('show');
      loadAttendanceLogs();
      loadDashboardStats();
    } else {
      showToast(res.message || 'Failed to record manual entry', 'danger');
    }
  });

  // Save Quick Enrollment Handler (from Camera Scan)
  document.getElementById('btn-save-quick-enroll')?.addEventListener('click', async () => {
    const student_id = document.getElementById('quick-student-id').value.trim();
    const name = document.getElementById('quick-name').value.trim();
    const roll_number = document.getElementById('quick-roll').value.trim();
    const department = document.getElementById('quick-dept').value;
    const email = document.getElementById('quick-email').value.trim();
    const mark_attendance = document.getElementById('quick-mark-attendance').checked;

    if (!student_id || !name || !roll_number) {
      showToast('Please fill all required student fields', 'warning');
      return;
    }

    const capturedData = window.faceEngine?.currentCapturedData;
    if (!capturedData) {
      showToast('No captured face data found. Please capture from camera first.', 'danger');
      return;
    }

    const res = await apiFetch('/api/face/enroll', {
      method: 'POST',
      body: JSON.stringify({
        student_id,
        name,
        roll_number,
        department,
        email,
        descriptors: capturedData.descriptors,
        sample_image_base64: capturedData.base64Image,
        mark_attendance
      })
    });

    if (res.success) {
      showToast(res.message, 'success');
      document.getElementById('modal-quick-enroll').classList.remove('show');

      if (window.faceEngine) {
        window.faceEngine.playSuccessChime();
        window.faceEngine.loadEnrolledDescriptors();
      }

      loadStudents();
      loadDashboardStats();
      loadAttendanceLogs();
      if (window.renderReports) window.renderReports();
    } else {
      showToast(res.message || 'Failed to register student and mark attendance.', 'danger');
    }
  });
}

function populateEnrollmentStudentSelect() {
  const select = document.getElementById('enroll-student-select');
  if (!select) return;
  select.innerHTML = `<option value="">-- Select Student for Enrollment --</option>` +
    state.students.map(s => `<option value="${s.student_id}">${s.name} (${s.student_id} - ${s.department}) ${s.face_enrolled ? '✓ Enrolled' : ''}</option>`).join('');
}

function populateManualStudentSelect() {
  const select = document.getElementById('manual-student-select');
  if (!select) return;
  select.innerHTML = `<option value="">-- Choose Student --</option>` +
    state.students.map(s => `<option value="${s.student_id}">${s.name} (${s.student_id})</option>`).join('');

  const dateInput = document.getElementById('manual-date-input');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
}

function openEnrollForStudent(studentId) {
  switchTab('enrollment');
  const select = document.getElementById('enroll-student-select');
  if (select) {
    select.value = studentId;
    select.dispatchEvent(new Event('change'));
  }
}

// Toast Notification Toast Generator
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'fa-info-circle';
  if (type === 'success') icon = 'fa-circle-check text-success';
  if (type === 'danger') icon = 'fa-circle-xmark text-danger';
  if (type === 'warning') icon = 'fa-triangle-exclamation text-warning';

  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

window.showToast = showToast;
window.switchTab = switchTab;
window.openEnrollForStudent = openEnrollForStudent;
window.deleteStudent = deleteStudent;
window.quickFillLogin = quickFillLogin;
