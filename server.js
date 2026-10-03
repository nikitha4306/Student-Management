const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
  return /^[0-9+\-\s()]{7,15}$/.test(phone);
}

app.post('/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  db.get(`SELECT id, name, email, role FROM users WHERE email = ? AND password = ?`, [email, password], (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    res.json({ token: 'demo-jwt-token-' + user.id, user });
  });
});

app.get('/dashboard/stats', (req, res) => {
  const stats = {};

  db.get(`SELECT COUNT(*) as count FROM students`, (err, sRow) => {
    stats.totalStudents = sRow ? sRow.count : 0;

    db.get(`SELECT COUNT(*) as count FROM courses`, (err, cRow) => {
      stats.totalCourses = cRow ? cRow.count : 0;

      db.get(`SELECT COUNT(*) as count FROM enrollments`, (err, eRow) => {
        stats.totalEnrollments = eRow ? eRow.count : 0;

        db.get(`SELECT COUNT(*) as count FROM students WHERE status = 'Active'`, (err, aRow) => {
          stats.activeStudents = aRow ? aRow.count : 0;

          const sql = `
            SELECT c.id, c.name, COUNT(e.id) as count 
            FROM courses c 
            LEFT JOIN enrollments e ON c.id = e.course_id 
            GROUP BY c.id
          `;

          db.all(sql, (err, rows) => {
            stats.courseCounts = rows || [];
            res.json(stats);
          });
        });
      });
    });
  });
});

app.get('/students', (req, res) => {
  const q = req.query.q || '';
  const courseId = req.query.course_id || '';
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const sortBy = req.query.sort_by || 'id';
  const order = req.query.order === 'desc' ? 'DESC' : 'ASC';
  const offset = (page - 1) * limit;

  let whereClauses = [];
  let params = [];

  if (q) {
    whereClauses.push(`(s.name LIKE ? OR s.email LIKE ? OR s.phone LIKE ?)`);
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  if (courseId) {
    whereClauses.push(`s.course_id = ?`);
    params.push(courseId);
  }

  const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

  const countSql = `SELECT COUNT(*) as count FROM students s ${whereSql}`;

  db.get(countSql, params, (err, row) => {
    const total = row ? row.count : 0;
    const totalPages = Math.ceil(total / limit) || 1;

    let validSortColumns = ['id', 'name', 'email', 'phone', 'date_of_joining', 'status', 'course_name'];
    let sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'id';
    if (sortColumn === 'course_name') sortColumn = 'c.name';
    else sortColumn = 's.' + sortColumn;

    const dataSql = `
      SELECT s.*, c.name as course_name 
      FROM students s 
      LEFT JOIN courses c ON s.course_id = c.id 
      ${whereSql}
      ORDER BY ${sortColumn} ${order}
      LIMIT ? OFFSET ?
    `;

    db.all(dataSql, [...params, limit, offset], (err, students) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ students: students || [], total, page, totalPages, limit });
    });
  });
});

app.get('/students/export', (req, res) => {
  const sql = `
    SELECT s.id, s.name, s.email, s.phone, c.name as course, s.date_of_joining, s.status 
    FROM students s 
    LEFT JOIN courses c ON s.course_id = c.id
  `;

  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    let csv = 'ID,Name,Email,Phone,Course,Date of Joining,Status\n';
    (rows || []).forEach(r => {
      csv += `"${r.id}","${r.name}","${r.email}","${r.phone}","${r.course || 'N/A'}","${r.date_of_joining}","${r.status}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=students_export.csv');
    res.send(csv);
  });
});

app.get('/students/:id', (req, res) => {
  const sql = `
    SELECT s.*, c.name as course_name 
    FROM students s 
    LEFT JOIN courses c ON s.course_id = c.id 
    WHERE s.id = ?
  `;
  db.get(sql, [req.params.id], (err, student) => {
    if (err || !student) return res.status(404).json({ error: 'Student not found' });
    res.json(student);
  });
});

app.post('/students', (req, res) => {
  const { name, email, phone, course_id, date_of_joining, status } = req.body;

  if (!name || !email || !phone || !date_of_joining) {
    return res.status(400).json({ error: 'Name, Email, Phone, and Date of Joining are required' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address format' });
  }

  if (!isValidPhone(phone)) {
    return res.status(400).json({ error: 'Invalid phone number format' });
  }

  const sql = `INSERT INTO students (name, email, phone, course_id, date_of_joining, status) VALUES (?, ?, ?, ?, ?, ?)`;
  const values = [name, email, phone, course_id || null, date_of_joining, status || 'Active'];

  db.run(sql, values, function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed: students.email')) {
        return res.status(400).json({ error: 'A student with this email already exists' });
      }
      return res.status(500).json({ error: err.message });
    }

    const studentId = this.lastID;

    if (course_id) {
      const enrollSql = `INSERT OR IGNORE INTO enrollments (student_id, course_id, enrollment_date, status) VALUES (?, ?, ?, ?)`;
      db.run(enrollSql, [studentId, course_id, date_of_joining, 'Enrolled']);
    }

    res.status(201).json({ id: studentId, message: 'Student added successfully' });
  });
});

app.put('/students/:id', (req, res) => {
  const { name, email, phone, course_id, date_of_joining, status } = req.body;

  if (!name || !email || !phone || !date_of_joining) {
    return res.status(400).json({ error: 'Name, Email, Phone, and Date of Joining are required' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address format' });
  }

  if (!isValidPhone(phone)) {
    return res.status(400).json({ error: 'Invalid phone number format' });
  }

  const sql = `UPDATE students SET name = ?, email = ?, phone = ?, course_id = ?, date_of_joining = ?, status = ? WHERE id = ?`;
  const values = [name, email, phone, course_id || null, date_of_joining, status || 'Active', req.params.id];

  db.run(sql, values, function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed: students.email')) {
        return res.status(400).json({ error: 'A student with this email already exists' });
      }
      return res.status(500).json({ error: err.message });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    res.json({ message: 'Student updated successfully' });
  });
});

app.delete('/students/:id', (req, res) => {
  db.run(`DELETE FROM students WHERE id = ?`, [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Student not found' });
    res.json({ message: 'Student deleted successfully' });
  });
});

app.get('/courses', (req, res) => {
  const sql = `
    SELECT c.*, COUNT(e.id) as enrolled_count 
    FROM courses c 
    LEFT JOIN enrollments e ON c.id = e.course_id 
    GROUP BY c.id 
    ORDER BY c.name ASC
  `;

  db.all(sql, [], (err, courses) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(courses || []);
  });
});

app.post('/courses', (req, res) => {
  const { name, code, duration, instructor, description } = req.body;

  if (!name || !duration) {
    return res.status(400).json({ error: 'Course Name and Duration are required' });
  }

  const courseCode = code || 'CRS-' + Math.floor(100 + Math.random() * 900);
  const courseInstructor = instructor || 'Staff Instructor';

  const sql = `INSERT INTO courses (name, code, duration, instructor, description) VALUES (?, ?, ?, ?, ?)`;
  const values = [name, courseCode, duration, courseInstructor, description || ''];

  db.run(sql, values, function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed: courses.code')) {
        return res.status(400).json({ error: 'A course with this code already exists' });
      }
      return res.status(500).json({ error: err.message });
    }
    res.status(201).json({ id: this.lastID, message: 'Course created successfully' });
  });
});

app.get('/courses/:id', (req, res) => {
  db.get(`SELECT * FROM courses WHERE id = ?`, [req.params.id], (err, course) => {
    if (err || !course) return res.status(404).json({ error: 'Course not found' });
    res.json(course);
  });
});

app.put('/courses/:id', (req, res) => {
  const { name, code, duration, instructor, description } = req.body;
  if (!name || !duration) {
    return res.status(400).json({ error: 'Course Name and Duration are required' });
  }

  const sql = `UPDATE courses SET name = ?, code = ?, duration = ?, instructor = ?, description = ? WHERE id = ?`;
  db.run(sql, [name, code, duration, instructor, description, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Course updated successfully' });
  });
});

app.delete('/courses/:id', (req, res) => {
  db.run(`DELETE FROM courses WHERE id = ?`, [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Course deleted successfully' });
  });
});

app.get('/enrollments', (req, res) => {
  const studentId = req.query.student_id;
  const courseId = req.query.course_id;

  let whereClauses = [];
  let params = [];

  if (studentId) {
    whereClauses.push(`e.student_id = ?`);
    params.push(studentId);
  }
  if (courseId) {
    whereClauses.push(`e.course_id = ?`);
    params.push(courseId);
  }

  const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

  const sql = `
    SELECT e.*, s.name as student_name, s.email as student_email, c.name as course_name, c.code as course_code 
    FROM enrollments e 
    JOIN students s ON e.student_id = s.id 
    JOIN courses c ON e.course_id = c.id 
    ${whereSql}
    ORDER BY e.created_at DESC
  `;

  db.all(sql, params, (err, enrollments) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(enrollments || []);
  });
});

app.get('/enrollments/export', (req, res) => {
  const sql = `
    SELECT e.id, s.name as student_name, s.email as student_email, c.name as course_name, e.enrollment_date, e.status, e.grade 
    FROM enrollments e 
    JOIN students s ON e.student_id = s.id 
    JOIN courses c ON e.course_id = c.id
  `;

  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    let csv = 'ID,Student Name,Student Email,Course Name,Enrollment Date,Status,Grade\n';
    (rows || []).forEach(r => {
      csv += `"${r.id}","${r.student_name}","${r.student_email}","${r.course_name}","${r.enrollment_date}","${r.status}","${r.grade}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=enrollments_export.csv');
    res.send(csv);
  });
});

app.post('/enrollments', (req, res) => {
  const { student_id, course_id, enrollment_date, status, grade } = req.body;

  if (!student_id || !course_id) {
    return res.status(400).json({ error: 'Student and Course selections are required' });
  }

  db.get(`SELECT id FROM enrollments WHERE student_id = ? AND course_id = ?`, [student_id, course_id], (err, existing) => {
    if (existing) {
      return res.status(400).json({ error: 'This student is already enrolled in the selected course' });
    }

    const enrDate = enrollment_date || new Date().toISOString().split('T')[0];
    const sql = `INSERT INTO enrollments (student_id, course_id, enrollment_date, status, grade) VALUES (?, ?, ?, ?, ?)`;
    const values = [student_id, course_id, enrDate, status || 'Enrolled', grade || 'N/A'];

    db.run(sql, values, function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'This student is already enrolled in the selected course' });
        }
        return res.status(500).json({ error: err.message });
      }

      db.run(`UPDATE students SET course_id = ? WHERE id = ?`, [course_id, student_id]);

      res.status(201).json({ id: this.lastID, message: 'Student enrolled successfully' });
    });
  });
});

app.delete('/enrollments/:id', (req, res) => {
  db.run(`DELETE FROM enrollments WHERE id = ?`, [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Enrollment deleted successfully' });
  });
});

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON payload format' });
  }
  next();
});

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const ALT_PORT = Number(PORT) + 1;
    console.log(`Port ${PORT} is already in use. Switching automatically to http://localhost:${ALT_PORT}...`);
    app.listen(ALT_PORT, () => {
      console.log(`Server running on http://localhost:${ALT_PORT}`);
    });
  } else {
    console.error(err);
  }
});

