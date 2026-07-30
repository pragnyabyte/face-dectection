const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { dbQuery, dbGet, dbRun } = require('../db/database');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'faces');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// POST /api/face/enroll - Store face descriptors, image, student info & auto-mark attendance
router.post('/enroll', async (req, res) => {
  try {
    const { 
      student_id, 
      name, 
      roll_number, 
      department, 
      email, 
      phone, 
      gender,
      descriptors, 
      sample_image_base64,
      mark_attendance 
    } = req.body;

    if (!student_id || !descriptors || !Array.isArray(descriptors) || descriptors.length === 0) {
      return res.status(400).json({ success: false, message: 'Student ID and face descriptors are required.' });
    }

    // 1. Check if student exists; if not, create student record automatically
    let student = await dbGet('SELECT * FROM students WHERE student_id = ?', [student_id]);
    if (!student) {
      if (!name || !roll_number || !department) {
        return res.status(400).json({ success: false, message: 'Full Name, Roll Number, and Department are required for new student registration.' });
      }
      const sResult = await dbRun(
        `INSERT INTO students (student_id, name, roll_number, department, email, phone, gender, face_enrolled) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [student_id, name, roll_number, department, email || '', phone || '', gender || 'Other']
      );
      student = { id: sResult.id, student_id, name, roll_number, department, email, phone, gender, face_enrolled: 1 };
    } else {
      await dbRun('UPDATE students SET face_enrolled = 1 WHERE student_id = ?', [student_id]);
    }

    // 2. Save face image photo file to disk
    let savedImagePath = null;
    if (sample_image_base64) {
      const base64Data = sample_image_base64.replace(/^data:image\/\w+;base64,/, '');
      const fileName = `${student_id}_${Date.now()}.jpg`;
      savedImagePath = path.join('uploads', 'faces', fileName);
      const fullPath = path.join(__dirname, '..', savedImagePath);
      fs.writeFileSync(fullPath, base64Data, { encoding: 'base64' });
    }

    // 3. Save face descriptors in DB
    for (const desc of descriptors) {
      const descJson = typeof desc === 'string' ? desc : JSON.stringify(desc);
      await dbRun(
        `INSERT INTO face_embeddings (student_id, descriptor_json, image_path) VALUES (?, ?, ?)`,
        [student_id, descJson, savedImagePath]
      );
    }

    // 4. Mark attendance automatically if requested
    let attendanceRecord = null;
    if (mark_attendance) {
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const currentTimestamp = now.getTime();

      const hour = now.getHours();
      const minute = now.getMinutes();
      const isLate = (hour > 9) || (hour === 9 && minute > 15);
      const status = isLate ? 'Late' : 'Present';

      const attResult = await dbRun(
        `INSERT INTO attendance (student_id, date, time, timestamp, status, mode, confidence) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [student_id, dateStr, timeStr, currentTimestamp, status, 'Face AI', 99.2]
      );

      await dbRun(
        `INSERT INTO notifications (title, message, type) VALUES (?, ?, ?)`,
        ['New Face Registered & Marked Present', `Enrolled & marked attendance for ${student.name} (${student_id})`, 'success']
      );

      attendanceRecord = {
        id: attResult.id,
        student_id: student.student_id,
        name: student.name,
        date: dateStr,
        time: timeStr,
        status,
        mode: 'Face AI'
      };
    }

    res.json({
      success: true,
      message: `Face photo & descriptors saved for ${student.name}! ${mark_attendance ? 'Attendance marked PRESENT.' : ''}`,
      student,
      attendance: attendanceRecord,
      photo_url: savedImagePath ? `/${savedImagePath.replace(/\\/g, '/')}` : null
    });
  } catch (err) {
    console.error('Error during face enrollment:', err);
    res.status(500).json({ success: false, message: 'Failed to process face enrollment and attendance.' });
  }
});

// GET /api/face/descriptors - Retrieve all enrolled descriptors for live matching
router.get('/descriptors', async (req, res) => {
  try {
    const rows = await dbQuery(`
      SELECT e.student_id, e.descriptor_json, s.name, s.roll_number, s.department, s.email
      FROM face_embeddings e
      JOIN students s ON e.student_id = s.student_id
      WHERE s.face_enrolled = 1
    `);

    const grouped = {};
    rows.forEach(row => {
      if (!grouped[row.student_id]) {
        grouped[row.student_id] = {
          student_id: row.student_id,
          name: row.name,
          roll_number: row.roll_number,
          department: row.department,
          email: row.email,
          descriptors: []
        };
      }
      try {
        const descArray = JSON.parse(row.descriptor_json);
        grouped[row.student_id].descriptors.push(descArray);
      } catch (e) {
        // Skip malformed descriptors
      }
    });

    const result = Object.values(grouped);
    res.json({ success: true, count: result.length, enrolled_students: result });
  } catch (err) {
    console.error('Error fetching face descriptors:', err);
    res.status(500).json({ success: false, message: 'Database error fetching face descriptors' });
  }
});

module.exports = router;
