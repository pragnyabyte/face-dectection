const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

let mongoose = null;
try {
  mongoose = require('mongoose');
} catch (e) {
  console.log('Mongoose not installed locally, operating in SQLite mode.');
}

const dbPath = path.join(__dirname, 'attendance.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening SQLite database:', err.message);
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
  // Connect to MongoDB if MONGODB_URI is provided
  if (process.env.MONGODB_URI) {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('Connected to MongoDB via Mongoose!');
    } catch (mErr) {
      console.warn('MongoDB connection warning:', mErr.message, '- continuing with SQLite database.');
    }
  }

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

        // Students Table with complete specification fields
        db.run(`
          CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            roll_number TEXT UNIQUE NOT NULL,
            registration_number TEXT,
            branch TEXT NOT NULL,
            department TEXT NOT NULL,
            semester TEXT DEFAULT '1',
            section TEXT DEFAULT 'A',
            mobile TEXT,
            phone TEXT,
            email TEXT,
            address TEXT,
            photo_path TEXT,
            gender TEXT DEFAULT 'Other',
            face_enrolled INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Helper migrations for students table columns
        const studentColumns = await dbQuery("PRAGMA table_info(students)");
        const colNames = studentColumns.map(c => c.name);
        
        if (!colNames.includes('registration_number')) {
          db.run("ALTER TABLE students ADD COLUMN registration_number TEXT");
        }
        if (!colNames.includes('branch')) {
          db.run("ALTER TABLE students ADD COLUMN branch TEXT");
        }
        if (!colNames.includes('semester')) {
          db.run("ALTER TABLE students ADD COLUMN semester TEXT DEFAULT '1'");
        }
        if (!colNames.includes('section')) {
          db.run("ALTER TABLE students ADD COLUMN section TEXT DEFAULT 'A'");
        }
        if (!colNames.includes('mobile')) {
          db.run("ALTER TABLE students ADD COLUMN mobile TEXT");
        }
        if (!colNames.includes('address')) {
          db.run("ALTER TABLE students ADD COLUMN address TEXT");
        }
        if (!colNames.includes('photo_path')) {
          db.run("ALTER TABLE students ADD COLUMN photo_path TEXT");
        }
        if (!colNames.includes('parent_name')) {
          db.run("ALTER TABLE students ADD COLUMN parent_name TEXT");
        }
        if (!colNames.includes('parent_mobile')) {
          db.run("ALTER TABLE students ADD COLUMN parent_mobile TEXT");
        }
        if (!colNames.includes('parent_whatsapp')) {
          db.run("ALTER TABLE students ADD COLUMN parent_whatsapp TEXT");
        }
        if (!colNames.includes('parent_email')) {
          db.run("ALTER TABLE students ADD COLUMN parent_email TEXT");
        }
        if (!colNames.includes('emergency_contact')) {
          db.run("ALTER TABLE students ADD COLUMN emergency_contact TEXT");
        }

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
            mode TEXT DEFAULT 'Webcam',
            location_lat REAL,
            location_lng REAL,
            confidence REAL DEFAULT 98.5,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
          )
        `);

        // System Notifications & Parent Delivery Logs Table
        db.run(`
          CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id TEXT,
            parent_name TEXT,
            email TEXT,
            phone_number TEXT,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT DEFAULT 'info',
            notification_type TEXT DEFAULT 'All',
            date TEXT,
            time TEXT,
            timestamp INTEGER,
            status TEXT DEFAULT 'Sent',
            error_message TEXT,
            delivery_details TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        const notifCols = await dbQuery("PRAGMA table_info(notifications)");
        const notifColNames = notifCols.map(c => c.name);
        if (!notifColNames.includes('student_id')) db.run("ALTER TABLE notifications ADD COLUMN student_id TEXT");
        if (!notifColNames.includes('parent_name')) db.run("ALTER TABLE notifications ADD COLUMN parent_name TEXT");
        if (!notifColNames.includes('email')) db.run("ALTER TABLE notifications ADD COLUMN email TEXT");
        if (!notifColNames.includes('phone_number')) db.run("ALTER TABLE notifications ADD COLUMN phone_number TEXT");
        if (!notifColNames.includes('notification_type')) db.run("ALTER TABLE notifications ADD COLUMN notification_type TEXT DEFAULT 'All'");
        if (!notifColNames.includes('date')) db.run("ALTER TABLE notifications ADD COLUMN date TEXT");
        if (!notifColNames.includes('time')) db.run("ALTER TABLE notifications ADD COLUMN time TEXT");
        if (!notifColNames.includes('timestamp')) db.run("ALTER TABLE notifications ADD COLUMN timestamp INTEGER");
        if (!notifColNames.includes('status')) db.run("ALTER TABLE notifications ADD COLUMN status TEXT DEFAULT 'Sent'");
        if (!notifColNames.includes('error_message')) db.run("ALTER TABLE notifications ADD COLUMN error_message TEXT");
        if (!notifColNames.includes('delivery_details')) db.run("ALTER TABLE notifications ADD COLUMN delivery_details TEXT");

        // Notification Settings Table
        await dbRun(`
          CREATE TABLE IF NOT EXISTS notification_settings (
            id INTEGER PRIMARY KEY DEFAULT 1,
            email_enabled INTEGER DEFAULT 1,
            whatsapp_enabled INTEGER DEFAULT 1,
            sms_enabled INTEGER DEFAULT 1,
            smtp_host TEXT DEFAULT 'smtp.gmail.com',
            smtp_port INTEGER DEFAULT 587,
            smtp_user TEXT DEFAULT '',
            smtp_pass TEXT DEFAULT '',
            smtp_from TEXT DEFAULT '',
            twilio_account_sid TEXT DEFAULT '',
            twilio_auth_token TEXT DEFAULT '',
            twilio_phone TEXT DEFAULT '',
            twilio_whatsapp_phone TEXT DEFAULT '',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        const settingsCount = await dbGet('SELECT COUNT(*) as count FROM notification_settings');
        if (settingsCount.count === 0) {
          await dbRun(
            `INSERT INTO notification_settings (id, email_enabled, whatsapp_enabled, sms_enabled, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, twilio_account_sid, twilio_auth_token, twilio_phone, twilio_whatsapp_phone)
             VALUES (1, 1, 1, 1, 'smtp.gmail.com', 587, '', '', 'notifications@institution.edu', '', '', '', '')`
          );
        }

        // Seed Users if empty
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
            ['student', studentPass, 'student', 'Rahul Kumar', 'rahul.k@institution.edu']
          );
          console.log('Seeded default users (admin/admin123, teacher/teacher123, student/student123)');
        }

        // Seed Sample Students if empty
        const studentCount = await dbGet('SELECT COUNT(*) as count FROM students');
        if (studentCount.count === 0) {
          const sampleStudents = [
            ['STU-101', 'Rahul Kumar', '101', 'REG-2024-101', 'Computer Science', 'Computer Science', 'Semester 6', 'A', '+91 9876543210', '+91 9876543210', 'rahul.k@institution.edu', 'Mr. Suresh Kumar', '+91 9876500001', '+91 9876500001', 'suresh.k@gmail.com', '+91 9876500099', 'New Delhi, India', 0],
            ['STU-102', 'Amit Das', '102', 'REG-2024-102', 'Information Technology', 'Information Technology', 'Semester 6', 'B', '+91 9876543211', '+91 9876543211', 'amit.d@institution.edu', 'Mrs. Sunita Das', '+91 9876500002', '+91 9876500002', 'sunita.d@gmail.com', '+91 9876500098', 'Kolkata, India', 0],
            ['STU-103', 'Priya Sharma', '103', 'REG-2024-103', 'Electrical Engineering', 'Electrical Engineering', 'Semester 4', 'A', '+91 9876543212', '+91 9876543212', 'priya.s@institution.edu', 'Mr. Rajesh Sharma', '+91 9876500003', '+91 9876500003', 'rajesh.s@gmail.com', '+91 9876500097', 'Mumbai, India', 0],
            ['STU-104', 'Sneha Patel', '104', 'REG-2024-104', 'Mechanical Engineering', 'Mechanical Engineering', 'Semester 4', 'A', '+91 9876543213', '+91 9876543213', 'sneha.p@institution.edu', 'Mrs. Anjali Patel', '+91 9876500004', '+91 9876500004', 'anjali.p@gmail.com', '+91 9876500096', 'Ahmedabad, India', 0],
            ['STU-105', 'Vikram Singh', '105', 'REG-2024-105', 'Civil Engineering', 'Civil Engineering', 'Semester 2', 'B', '+91 9876543214', '+91 9876543214', 'vikram.s@institution.edu', 'Mr. Mahendra Singh', '+91 9876500005', '+91 9876500005', 'mahendra.s@gmail.com', '+91 9876500095', 'Jaipur, India', 0]
          ];

          for (const s of sampleStudents) {
            await dbRun(
              `INSERT INTO students (student_id, name, roll_number, registration_number, branch, department, semester, section, mobile, phone, email, parent_name, parent_mobile, parent_whatsapp, parent_email, emergency_contact, address, face_enrolled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              s
            );
          }
          console.log('Seeded sample student directory with complete parent contact information');

          // Seed Sample Attendance Records
          const today = new Date().toISOString().split('T')[0];
          const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
          const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];

          const sampleLogs = [
            ['STU-101', today, '09:31 AM', Date.now() - 3600000, 'Present', 'Webcam', 98.5],
            ['STU-102', today, '09:32 AM', Date.now() - 3200000, 'Present', 'Webcam', 96.2],
            ['STU-103', today, '09:34 AM', Date.now() - 2800000, 'Present', 'Webcam', 99.1],
            ['STU-104', today, '09:48 AM', Date.now() - 1200000, 'Late', 'Webcam', 92.4],
            ['STU-101', yesterday, '09:28 AM', Date.now() - 86400000, 'Present', 'Webcam', 97.8],
            ['STU-102', yesterday, '09:46 AM', Date.now() - 86400000 + 300000, 'Late', 'Webcam', 94.0],
            ['STU-103', yesterday, '09:30 AM', Date.now() - 86400000, 'Present', 'Webcam', 98.9],
            ['STU-105', yesterday, '09:33 AM', Date.now() - 86400000, 'Present', 'Webcam', 95.5],
            ['STU-101', twoDaysAgo, '09:25 AM', Date.now() - 2 * 86400000, 'Present', 'Webcam', 98.0],
            ['STU-102', twoDaysAgo, '09:30 AM', Date.now() - 2 * 86400000, 'Present', 'Webcam', 96.7],
            ['STU-103', twoDaysAgo, '09:29 AM', Date.now() - 2 * 86400000, 'Present', 'Webcam', 97.5]
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
