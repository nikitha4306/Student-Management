let currentTab = 'dashboard';
let studentState = {
  page: 1,
  limit: 10,
  q: '',
  course_id: '',
  sort_by: 'id',
  order: 'asc'
};

let courseListCache = [];
let studentListCache = [];
let chartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
  initIcons();
  initEvents();
  loadAllData();
});

function initIcons() {
  if (window.lucide) {
    lucide.createIcons();
  }
}

function initEvents() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });

  document.getElementById('quickAddBtn').addEventListener('click', () => {
    if (currentTab === 'courses') {
      openCourseModal();
    } else if (currentTab === 'enrollments') {
      openEnrollmentModal();
    } else {
      openStudentModal();
    }
  });

  document.getElementById('exportBtn').addEventListener('click', handleExport);
  const authBtn = document.getElementById('authBtn');
  if (authBtn) {
    authBtn.addEventListener('click', () => openModal('authModal'));
  }

  // Student Search, Filter, Sort & Pagination
  const studentSearch = document.getElementById('studentSearch');
  let searchTimer;
  studentSearch.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      studentState.q = e.target.value.trim();
      studentState.page = 1;
      loadStudents();
    }, 300);
  });

  document.getElementById('courseFilter').addEventListener('change', (e) => {
    studentState.course_id = e.target.value;
    studentState.page = 1;
    loadStudents();
  });

  document.getElementById('sortBySelect').addEventListener('change', (e) => {
    studentState.sort_by = e.target.value;
    loadStudents();
  });

  document.getElementById('sortOrderBtn').addEventListener('click', () => {
    studentState.order = studentState.order === 'asc' ? 'desc' : 'asc';
    loadStudents();
  });

  document.querySelectorAll('.data-table th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (studentState.sort_by === col) {
        studentState.order = studentState.order === 'asc' ? 'desc' : 'asc';
      } else {
        studentState.sort_by = col;
        studentState.order = 'asc';
      }
      loadStudents();
    });
  });

  document.getElementById('pageSizeSelect').addEventListener('change', (e) => {
    studentState.limit = parseInt(e.target.value);
    studentState.page = 1;
    loadStudents();
  });

  document.getElementById('prevPageBtn').addEventListener('click', () => {
    if (studentState.page > 1) {
      studentState.page--;
      loadStudents();
    }
  });

  document.getElementById('nextPageBtn').addEventListener('click', () => {
    studentState.page++;
    loadStudents();
  });

  document.getElementById('addCourseBtn').addEventListener('click', openCourseModal);
  document.getElementById('addEnrollmentBtn').addEventListener('click', openEnrollmentModal);

  // Forms
  document.getElementById('studentForm').addEventListener('submit', handleStudentSubmit);
  document.getElementById('courseForm').addEventListener('submit', handleCourseSubmit);
  document.getElementById('enrollmentForm').addEventListener('submit', handleEnrollmentSubmit);
  document.getElementById('authForm').addEventListener('submit', handleAuthSubmit);

  // Input Real-Time Validations
  document.getElementById('studentEmail').addEventListener('input', validateStudentInputs);
  document.getElementById('studentPhone').addEventListener('input', validateStudentInputs);

  // Duplicate Check on Enrollment Selection
  document.getElementById('enrollStudentSelect').addEventListener('change', checkDuplicateEnrollment);
  document.getElementById('enrollCourseSelect').addEventListener('change', checkDuplicateEnrollment);

  // Modal Closers
  document.querySelectorAll('[modal-close]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal-backdrop');
      if (modal) closeModal(modal.id);
    });
  });
}

function switchTab(tabName) {
  currentTab = tabName;
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  document.querySelectorAll('.view-section').forEach(sec => {
    sec.classList.toggle('active', sec.id === `view-${tabName}`);
  });

  const titles = {
    dashboard: { title: 'Dashboard Overview', sub: 'Track total students, course counts, and enrollment stats in real-time' },
    students: { title: 'Student Management', sub: 'View, search, edit, filter, and add student records' },
    courses: { title: 'Course Catalog', sub: 'Explore available course programs and manage curriculums' },
    enrollments: { title: 'Enrollment Hub', sub: 'Allocate students to courses and monitor enrollment status' }
  };

  if (titles[tabName]) {
    document.getElementById('pageTitle').innerText = titles[tabName].title;
    document.getElementById('pageSubtitle').innerText = titles[tabName].sub;
  }

  const quickBtn = document.getElementById('quickAddBtn');
  if (tabName === 'courses') {
    quickBtn.innerHTML = `<i data-lucide="plus"></i> Create Course`;
  } else if (tabName === 'enrollments') {
    quickBtn.innerHTML = `<i data-lucide="user-plus"></i> Enrol Student`;
  } else {
    quickBtn.innerHTML = `<i data-lucide="plus"></i> Add Student`;
  }
  initIcons();

  if (tabName === 'dashboard') loadDashboard();
  if (tabName === 'students') loadStudents();
  if (tabName === 'courses') loadCourses();
  if (tabName === 'enrollments') loadEnrollments();
}

async function loadAllData() {
  await loadCoursesDropdown();
  await loadDashboard();
  await loadStudents();
}

async function loadDashboard() {
  try {
    const stats = await api.getStats();
    document.getElementById('statTotalStudents').innerText = stats.totalStudents || 0;
    document.getElementById('statTotalCourses').innerText = stats.totalCourses || 0;
    document.getElementById('statTotalEnrollments').innerText = stats.totalEnrollments || 0;
    document.getElementById('statActiveStudents').innerText = stats.activeStudents || 0;

    renderCourseMiniList(stats.courseCounts || []);
    renderCourseChart(stats.courseCounts || []);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderCourseMiniList(list) {
  const container = document.getElementById('courseMiniList');
  if (list.length === 0) {
    container.innerHTML = `<p class="stat-desc">No courses found</p>`;
    return;
  }
  container.innerHTML = list.map(item => `
    <div class="mini-item">
      <span class="mini-title">${item.name}</span>
      <span class="mini-badge">${item.count} Enrolled</span>
    </div>
  `).join('');
}

function renderCourseChart(list) {
  const ctx = document.getElementById('courseChart').getContext('2d');
  const labels = list.map(i => i.name);
  const data = list.map(i => i.count);

  if (chartInstance) {
    chartInstance.destroy();
  }

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Enrolled Students',
        data: data,
        backgroundColor: '#3b82f6',
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, color: '#64748b' },
          grid: { color: '#e2e8f0' }
        },
        x: {
          ticks: { color: '#64748b' },
          grid: { display: false }
        }
      }
    }
  });
}

async function loadCoursesDropdown() {
  try {
    courseListCache = await api.getCourses();
    
    const filterSelect = document.getElementById('courseFilter');
    const studentSelect = document.getElementById('studentCourse');
    const enrollSelect = document.getElementById('enrollCourseSelect');

    const optionsHtml = courseListCache.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    filterSelect.innerHTML = `<option value="">All Courses</option>` + optionsHtml;
    studentSelect.innerHTML = `<option value="">Select a Course</option>` + optionsHtml;
    enrollSelect.innerHTML = `<option value="">Choose a Course</option>` + optionsHtml;
  } catch (err) {
    console.error(err);
  }
}

async function loadStudents() {
  try {
    const res = await api.getStudents(studentState);
    const tbody = document.getElementById('studentTableBody');
    studentListCache = res.students;

    if (res.students.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="padding: 3rem; text-align: center;">
            <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem; color: var(--text-muted);">
              <i data-lucide="user-x" style="width: 36px; height: 36px; opacity: 0.5;"></i>
              <strong style="color: var(--text-secondary); font-size: 1rem;">No students found</strong>
              <span style="font-size: 0.85rem;">Click "Add Student" above to create your first student entry.</span>
            </div>
          </td>
        </tr>`;
    } else {
      tbody.innerHTML = res.students.map(s => `
        <tr>
          <td>#${s.id}</td>
          <td><strong>${escapeHtml(s.name)}</strong></td>
          <td>${escapeHtml(s.email)}</td>
          <td>${escapeHtml(s.phone)}</td>
          <td>${s.course_name ? `<span class="badge badge-enrolled">${escapeHtml(s.course_name)}</span>` : '<span class="stat-desc">Not Enrolled</span>'}</td>
          <td>${s.date_of_joining}</td>
          <td><span class="badge ${s.status === 'Active' ? 'badge-active' : 'badge-inactive'}">${s.status}</span></td>
          <td class="text-right">
            <div class="action-btns">
              <button class="btn btn-secondary btn-icon-only" onclick="editStudent(${s.id})" title="Edit"><i data-lucide="edit-3"></i></button>
              <button class="btn btn-danger btn-icon-only" onclick="confirmDeleteStudent(${s.id})" title="Delete"><i data-lucide="trash-2"></i></button>
            </div>
          </td>
        </tr>
      `).join('');
    }

    document.getElementById('paginationInfo').innerText = `Showing ${res.students.length} of ${res.total} students`;
    document.getElementById('pageIndicator').innerText = `Page ${res.page} of ${res.totalPages}`;
    document.getElementById('prevPageBtn').disabled = (res.page <= 1);
    document.getElementById('nextPageBtn').disabled = (res.page >= res.totalPages);

    populateStudentDropdown(res.students);
    initIcons();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function populateStudentDropdown(students) {
  const select = document.getElementById('enrollStudentSelect');
  select.innerHTML = `<option value="">Choose a Student</option>` + students.map(s => `<option value="${s.id}">${s.name} (${s.email})</option>`).join('');
}

async function loadCourses() {
  try {
    const courses = await api.getCourses();
    courseListCache = courses;
    const grid = document.getElementById('coursesGrid');

    if (courses.length === 0) {
      grid.innerHTML = `<p class="stat-desc">No courses available.</p>`;
      return;
    }

    grid.innerHTML = courses.map(c => `
      <div class="course-card">
        <div>
          <span class="course-code">${c.code}</span>
          <h3 class="course-title">${escapeHtml(c.name)}</h3>
          <p class="course-desc">${escapeHtml(c.description || 'No description available.')}</p>
        </div>
        <div class="course-meta">
          <span>⏱️ ${escapeHtml(c.duration)}</span>
          <span>👨‍🏫 ${escapeHtml(c.instructor)}</span>
          <span>🎓 ${c.enrolled_count} Enrolled</span>
        </div>
      </div>
    `).join('');

    initIcons();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadEnrollments() {
  try {
    const enrollments = await api.getEnrollments();
    const tbody = document.getElementById('enrollmentTableBody');

    if (enrollments.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="padding: 3rem; text-align: center;">
            <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem; color: var(--text-muted);">
              <i data-lucide="bookmark-x" style="width: 36px; height: 36px; opacity: 0.5;"></i>
              <strong style="color: var(--text-secondary); font-size: 1rem;">No enrollments yet</strong>
              <span style="font-size: 0.85rem;">Click "Enrol Student into Course" to register your first course enrollment.</span>
            </div>
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = enrollments.map(e => `
      <tr>
        <td>#ENR-${e.id}</td>
        <td><strong>${escapeHtml(e.student_name)}</strong></td>
        <td>${escapeHtml(e.student_email)}</td>
        <td><span class="badge badge-enrolled">${escapeHtml(e.course_name)} (${e.course_code})</span></td>
        <td>${e.enrollment_date}</td>
        <td><span class="badge ${e.status === 'Completed' ? 'badge-completed' : 'badge-active'}">${e.status}</span></td>
        <td><strong>${e.grade || 'N/A'}</strong></td>
        <td class="text-right">
          <button class="btn btn-danger btn-icon-only" onclick="confirmDeleteEnrollment(${e.id})" title="Remove"><i data-lucide="trash-2"></i></button>
        </td>
      </tr>
    `).join('');

    initIcons();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function validateStudentInputs() {
  const emailInput = document.getElementById('studentEmail');
  const phoneInput = document.getElementById('studentPhone');
  const emailErr = document.getElementById('emailError');
  const phoneErr = document.getElementById('phoneError');
  let isValid = true;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailInput.value && !emailRegex.test(emailInput.value)) {
    emailErr.innerText = 'Enter a valid email address';
    isValid = false;
  } else {
    emailErr.innerText = '';
  }

  const phoneRegex = /^[0-9+\-\s()]{7,15}$/;
  if (phoneInput.value && !phoneRegex.test(phoneInput.value)) {
    phoneErr.innerText = 'Enter a valid phone number (at least 7 digits)';
    isValid = false;
  } else {
    phoneErr.innerText = '';
  }

  return isValid;
}

async function checkDuplicateEnrollment() {
  const studentId = document.getElementById('enrollStudentSelect').value;
  const courseId = document.getElementById('enrollCourseSelect').value;
  const errorSpan = document.getElementById('enrollDuplicateError');

  if (!studentId || !courseId) {
    errorSpan.innerText = '';
    return;
  }

  try {
    const enrollments = await api.getEnrollments({ student_id: studentId, course_id: courseId });
    if (enrollments.length > 0) {
      errorSpan.innerText = '⚠️ Warning: This student is already enrolled in this course.';
    } else {
      errorSpan.innerText = '';
    }
  } catch (err) {
    console.error(err);
  }
}

function openStudentModal(id = null) {
  document.getElementById('studentForm').reset();
  document.getElementById('studentId').value = '';
  document.getElementById('emailError').innerText = '';
  document.getElementById('phoneError').innerText = '';

  if (id) {
    document.getElementById('studentModalTitle').innerText = 'Edit Student';
    const student = studentListCache.find(s => s.id === id);
    if (student) {
      document.getElementById('studentId').value = student.id;
      document.getElementById('studentName').value = student.name;
      document.getElementById('studentEmail').value = student.email;
      document.getElementById('studentPhone').value = student.phone;
      document.getElementById('studentCourse').value = student.course_id || '';
      document.getElementById('studentJoiningDate').value = student.date_of_joining;
      document.getElementById('studentStatus').value = student.status;
    }
  } else {
    document.getElementById('studentModalTitle').innerText = 'Add New Student';
    document.getElementById('studentJoiningDate').value = new Date().toISOString().split('T')[0];
  }

  openModal('studentModal');
}

function editStudent(id) {
  openStudentModal(id);
}

async function confirmDeleteStudent(id) {
  if (confirm('Are you sure you want to delete this student record?')) {
    try {
      await api.deleteStudent(id);
      showToast('Student deleted successfully', 'success');
      loadStudents();
      loadDashboard();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}

async function confirmDeleteEnrollment(id) {
  if (confirm('Are you sure you want to remove this course enrollment?')) {
    try {
      await api.deleteEnrollment(id);
      showToast('Enrollment removed successfully', 'success');
      loadEnrollments();
      loadDashboard();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}

async function handleStudentSubmit(e) {
  e.preventDefault();
  if (!validateStudentInputs()) return;

  const id = document.getElementById('studentId').value;
  const payload = {
    name: document.getElementById('studentName').value.trim(),
    email: document.getElementById('studentEmail').value.trim(),
    phone: document.getElementById('studentPhone').value.trim(),
    course_id: document.getElementById('studentCourse').value || null,
    date_of_joining: document.getElementById('studentJoiningDate').value,
    status: document.getElementById('studentStatus').value
  };

  try {
    if (id) {
      await api.updateStudent(id, payload);
      showToast('Student updated successfully', 'success');
    } else {
      await api.createStudent(payload);
      showToast('Student created successfully', 'success');
    }
    closeModal('studentModal');
    loadStudents();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openCourseModal() {
  document.getElementById('courseForm').reset();
  openModal('courseModal');
}

async function handleCourseSubmit(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById('courseName').value.trim(),
    code: document.getElementById('courseCode').value.trim(),
    duration: document.getElementById('courseDuration').value.trim(),
    instructor: document.getElementById('courseInstructor').value.trim(),
    description: document.getElementById('courseDescription').value.trim()
  };

  try {
    await api.createCourse(payload);
    showToast('Course created successfully', 'success');
    closeModal('courseModal');
    loadCoursesDropdown();
    if (currentTab === 'courses') loadCourses();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openEnrollmentModal() {
  document.getElementById('enrollmentForm').reset();
  document.getElementById('enrollmentDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('enrollDuplicateError').innerText = '';
  openModal('enrollmentModal');
}

async function handleEnrollmentSubmit(e) {
  e.preventDefault();
  const payload = {
    student_id: document.getElementById('enrollStudentSelect').value,
    course_id: document.getElementById('enrollCourseSelect').value,
    enrollment_date: document.getElementById('enrollmentDate').value,
    status: document.getElementById('enrollmentStatus').value
  };

  try {
    await api.createEnrollment(payload);
    showToast('Student enrolled successfully', 'success');
    closeModal('enrollmentModal');
    if (currentTab === 'enrollments') loadEnrollments();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const credentials = {
    email: document.getElementById('authEmail').value,
    password: document.getElementById('authPassword').value
  };

  try {
    const data = await api.login(credentials);
    document.getElementById('userName').innerText = data.user.name;
    document.getElementById('userRole').innerText = data.user.role;
    document.getElementById('userAvatar').innerText = data.user.name.charAt(0);
    showToast('Signed in successfully', 'success');
    closeModal('authModal');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function handleExport() {
  if (currentTab === 'enrollments') {
    window.location.href = '/enrollments/export';
  } else {
    window.location.href = '/students/export';
  }
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

function showToast(msg, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerText = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
