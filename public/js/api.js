const API_BASE = '';

async function request(url, options = {}) {
  options.headers = options.headers || {};
  options.headers['Content-Type'] = 'application/json';

  const res = await fetch(API_BASE + url, options);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Server error occurred');
  }
  return data;
}

const api = {
  getStats: () => request('/dashboard/stats'),

  getStudents: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request('/students?' + query);
  },

  getStudent: (id) => request(`/students/${id}`),

  createStudent: (data) => request('/students', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  updateStudent: (id, data) => request(`/students/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),

  deleteStudent: (id) => request(`/students/${id}`, {
    method: 'DELETE'
  }),

  getCourses: () => request('/courses'),

  createCourse: (data) => request('/courses', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  getEnrollments: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request('/enrollments?' + query);
  },

  createEnrollment: (data) => request('/enrollments', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  deleteEnrollment: (id) => request(`/enrollments/${id}`, {
    method: 'DELETE'
  }),

  login: (credentials) => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials)
  })
};
