const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'attendance.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite Database at:', dbPath);
  }
});

// Helper for Promisified Queries
const dbQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

// Initialize Database Tables & Seed Data
async function initDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(async () => {
      try {
        // Users Table
        db.run(`
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin', 'teacher', 'student')),
            name TEXT NOT NULL,
            email TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Students Table
        db.run(`
          CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            roll_number TEXT NOT NULL,
            department TEXT NOT NULL,
            email TEXT,
            phone TEXT,
            gender TEXT DEFAULT 'Other',
            face_enrolled INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Face Embeddings Table
        db.run(`
          CREATE TABLE IF NOT EXISTS face_embeddings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id TEXT NOT NULL,
            descriptor_json TEXT NOT NULL,
            image_path TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
          )
        `);

        // Attendance Table
        db.run(`
          CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id TEXT NOT NULL,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            status TEXT NOT NULL,
            mode TEXT DEFAULT 'Face AI',
            location_lat REAL,
            location_lng REAL,
            confidence REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
          )
        `);

        // Migration check: verify if table constraint prevents 'Check-Out'
        db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='attendance'", async (err, row) => {
          if (row && row.sql && row.sql.includes("CHECK(status IN")) {
            console.log('Migrating attendance table to support Check-Out / Check-In status...');
            db.serialize(() => {
              db.run("ALTER TABLE attendance RENAME TO attendance_old");
              db.run(`
                CREATE TABLE attendance (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  student_id TEXT NOT NULL,
                  date TEXT NOT NULL,
                  time TEXT NOT NULL,
                  timestamp INTEGER NOT NULL,
                  status TEXT NOT NULL,
                  mode TEXT DEFAULT 'Face AI',
                  location_lat REAL,
                  location_lng REAL,
                  confidence REAL,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
                )
              `);
              db.run("INSERT INTO attendance SELECT * FROM attendance_old");
              db.run("DROP TABLE attendance_old");
              console.log('Attendance table migration completed successfully.');
            });
          }
        });

        // System Notifications Table
        db.run(`
          CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT DEFAULT 'info',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Seed Users
        const userCount = await dbGet('SELECT COUNT(*) as count FROM users');
        if (userCount.count === 0) {
          const salt = await bcrypt.genSalt(10);
          const adminPass = await bcrypt.hash('admin123', salt);
          const teacherPass = await bcrypt.hash('teacher123', salt);
          const studentPass = await bcrypt.hash('student123', salt);

          await dbRun(
            `INSERT INTO users (username, password_hash, role, name, email) VALUES (?, ?, ?, ?, ?)`,
            ['admin', adminPass, 'admin', 'System Administrator', 'admin@institution.edu']
          );
          await dbRun(
            `INSERT INTO users (username, password_hash, role, name, email) VALUES (?, ?, ?, ?, ?)`,
            ['teacher', teacherPass, 'teacher', 'Prof. Robert Davis', 'robert.davis@institution.edu']
          );
          await dbRun(
            `INSERT INTO users (username, password_hash, role, name, email) VALUES (?, ?, ?, ?, ?)`,
            ['student', studentPass, 'student', 'Alex Morgan', 'alex.morgan@student.edu']
          );
          console.log('Seeded default users (admin/admin123, teacher/teacher123, student/student123)');
        }

        // Seed Sample Students
        const studentCount = await dbGet('SELECT COUNT(*) as count FROM students');
        if (studentCount.count === 0) {
          const sampleStudents = [
            ['STU-1001', 'Alex Morgan', 'CS-2024-01', 'Computer Science', 'alex.morgan@student.edu', '+1 555-0101', 'Male', 0],
            ['STU-1002', 'Sarah Jenkins', 'EE-2024-05', 'Electrical Engineering', 'sarah.j@student.edu', '+1 555-0102', 'Female', 0],
            ['STU-1003', 'Michael Chen', 'ME-2024-12', 'Mechanical Engineering', 'm.chen@student.edu', '+1 555-0103', 'Male', 0],
            ['STU-1004', 'Priya Sharma', 'IT-2024-08', 'Information Technology', 'p.sharma@student.edu', '+1 555-0104', 'Female', 0],
            ['STU-1005', 'David Miller', 'BA-2024-03', 'Business Admin', 'd.miller@student.edu', '+1 555-0105', 'Male', 0],
            ['STU-1006', 'Emma Watson', 'CS-2024-18', 'Computer Science', 'e.watson@student.edu', '+1 555-0106', 'Female', 0]
          ];

          for (const s of sampleStudents) {
            await dbRun(
              `INSERT INTO students (student_id, name, roll_number, department, email, phone, gender, face_enrolled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              s
            );
          }
          console.log('Seeded sample student directory');

          // Seed Sample Attendance Records for visual demonstration
          const today = new Date().toISOString().split('T')[0];
          const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
          const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];

          const sampleLogs = [
            ['STU-1001', today, '08:55 AM', Date.now() - 3600000, 'Present', 'Face AI', 98.5],
            ['STU-1002', today, '09:02 AM', Date.now() - 3200000, 'Present', 'Face AI', 96.2],
            ['STU-1003', today, '09:18 AM', Date.now() - 2800000, 'Late', 'Face AI', 92.4],
            ['STU-1004', today, '08:50 AM', Date.now() - 3900000, 'Present', 'Face AI', 99.1],
            ['STU-1001', yesterday, '08:52 AM', Date.now() - 86400000, 'Present', 'Face AI', 97.8],
            ['STU-1002', yesterday, '09:05 AM', Date.now() - 86400000 + 300000, 'Late', 'Face AI', 94.0],
            ['STU-1003', yesterday, '08:58 AM', Date.now() - 86400000, 'Present', 'Face AI', 95.6],
            ['STU-1004', yesterday, '08:48 AM', Date.now() - 86400000, 'Present', 'Face AI', 98.9],
            ['STU-1005', yesterday, '09:00 AM', Date.now() - 86400000, 'Present', 'QR Backup', 100.0],
            ['STU-1001', twoDaysAgo, '08:50 AM', Date.now() - 2 * 86400000, 'Present', 'Face AI', 98.0],
            ['STU-1002', twoDaysAgo, '08:59 AM', Date.now() - 2 * 86400000, 'Present', 'Face AI', 96.7],
            ['STU-1004', twoDaysAgo, '08:54 AM', Date.now() - 2 * 86400000, 'Present', 'Face AI', 97.5]
          ];

          for (const log of sampleLogs) {
            await dbRun(
              `INSERT INTO attendance (student_id, date, time, timestamp, status, mode, confidence) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              log
            );
          }
          console.log('Seeded initial attendance logs for visual reporting');
        }

        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
}

module.exports = {
  db,
  dbQuery,
  dbRun,
  dbGet,
  initDatabase
};
