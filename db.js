const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`PRAGMA foreign_keys = ON`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'Admin'
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    duration TEXT NOT NULL,
    instructor TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT NOT NULL,
    course_id INTEGER,
    date_of_joining TEXT NOT NULL,
    status TEXT DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    enrollment_date TEXT NOT NULL,
    status TEXT DEFAULT 'Enrolled',
    grade TEXT DEFAULT 'N/A',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    UNIQUE(student_id, course_id)
  )`);

  db.get(`SELECT COUNT(*) as count FROM users`, (err, row) => {
    if (!err && row.count === 0) {
      db.run(`INSERT INTO users (name, email, password, role) VALUES ('Admin User', 'admin@example.com', 'admin123', 'Admin')`);
    }
  });

  db.get(`SELECT COUNT(*) as count FROM courses`, (err, row) => {
    if (!err && row.count === 0) {
      const courses = [
        ['Full Stack Web Development', 'CS-101', '6 Months', 'Alex Johnson', 'Web application development with React and Node.js'],
        ['Data Science & AI', 'DS-201', '8 Months', 'Dr. Sarah Connor', 'Python, Machine Learning, and Data Analytics'],
        ['UI/UX Design Masterclass', 'UX-301', '3 Months', 'Michael Chang', 'User research, Figma design, and prototyping'],
        ['Cloud DevOps Engineering', 'DO-401', '4 Months', 'Robert Davis', 'Docker, Kubernetes, AWS, and CI/CD pipelines'],
        ['Cybersecurity Essentials', 'SE-501', '5 Months', 'Elena Rostova', 'Network security and ethical hacking']
      ];

      const stmt = db.prepare(`INSERT INTO courses (name, code, duration, instructor, description) VALUES (?, ?, ?, ?, ?)`);
      courses.forEach(c => stmt.run(c));
      stmt.finalize();
    }
  });
});

module.exports = db;
