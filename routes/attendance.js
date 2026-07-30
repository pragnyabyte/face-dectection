const express = require('express');
const router = express.Router();
const { dbQuery, dbGet, dbRun } = require('../db/database');

// POST /api/attendance/mark - Automatically mark attendance (Check-In or Check-Out)
router.post('/mark', async (req, res) => {
  try {
    const { student_id, confidence, mode, scan_type, location_lat, location_lng } = req.body;

    if (!student_id) {
      return res.status(400).json({ success: false, message: 'Student ID is required' });
    }

    const student = await dbGet('SELECT * FROM students WHERE student_id = ?', [student_id]);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const currentTimestamp = now.getTime();

    // Determine Status based on scan_type (Check-In vs Check-Out)
    let status = 'Present';
    const isExitScan = (scan_type === 'Check-Out' || scan_type === 'Exit');

    if (isExitScan) {
      status = 'Check-Out';
    } else {
      const hour = now.getHours();
      const minute = now.getMinutes();
      const isLate = (hour > 9) || (hour === 9 && minute > 15);
      status = isLate ? 'Late' : 'Present';
    }

    // Check duplicate cooldown (within last 30 seconds for same scan_type)
    const recent = await dbGet(
      `SELECT * FROM attendance WHERE student_id = ? AND date = ? AND status = ? AND (timestamp > ?) ORDER BY timestamp DESC LIMIT 1`,
      [student_id, dateStr, status, currentTimestamp - 30000]
    );

    if (recent) {
      return res.json({
        success: false,
        duplicate: true,
        message: `Already recorded ${status} for ${student.name} at ${recent.time}. Please wait before scanning again.`,
        student: { student_id: student.student_id, name: student.name }
      });
    }

    const result = await dbRun(
      `INSERT INTO attendance (student_id, date, time, timestamp, status, mode, location_lat, location_lng, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        student_id,
        dateStr,
        timeStr,
        currentTimestamp,
        status,
        mode || 'Face AI',
        location_lat || null,
        location_lng || null,
        confidence || 98.5
      ]
    );

    // Notification
    const notifTitle = isExitScan ? 'Exit Scan (Check-Out)' : 'Entry Scan (Check-In)';
    await dbRun(
      `INSERT INTO notifications (title, message, type) VALUES (?, ?, ?)`,
      [notifTitle, `${student.name} (${student.roll_number}) scanned ${status} at ${timeStr}`, isExitScan ? 'warning' : 'success']
    );

    res.json({
      success: true,
      duplicate: false,
      message: `${isExitScan ? 'Departure (Check-Out)' : 'Entry (Check-In)'} recorded for ${student.name}! Status: ${status}`,
      attendance: {
        id: result.id,
        student_id: student.student_id,
        name: student.name,
        roll_number: student.roll_number,
        department: student.department,
        date: dateStr,
        time: timeStr,
        status,
        mode: mode || 'Face AI',
        confidence: confidence || 98.5
      }
    });
  } catch (err) {
    console.error('Error marking attendance:', err);
    res.status(500).json({ success: false, message: 'Server error marking attendance' });
  }
});

// GET /api/attendance/history - Filtered attendance records
router.get('/history', async (req, res) => {
  try {
    const { date, department, status, student_id, search } = req.query;

    let sql = `
      SELECT a.id, a.student_id, a.date, a.time, a.status, a.mode, a.confidence, a.location_lat, a.location_lng,
             s.name, s.roll_number, s.department
      FROM attendance a
      JOIN students s ON a.student_id = s.student_id
      WHERE 1=1
    `;
    let params = [];

    if (date) {
      sql += ' AND a.date = ?';
      params.push(date);
    }
    if (department && department !== 'All') {
      sql += ' AND s.department = ?';
      params.push(department);
    }
    if (status && status !== 'All') {
      sql += ' AND a.status = ?';
      params.push(status);
    }
    if (student_id) {
      sql += ' AND a.student_id = ?';
      params.push(student_id);
    }
    if (search) {
      sql += ' AND (s.name LIKE ? OR s.roll_number LIKE ? OR a.student_id LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    sql += ' ORDER BY a.id DESC';
    const logs = await dbQuery(sql, params);
    res.json({ success: true, count: logs.length, logs });
  } catch (err) {
    console.error('Error fetching attendance logs:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve attendance logs' });
  }
});

// POST /api/attendance/manual - Manual entry or override by Admin/Teacher
router.post('/manual', async (req, res) => {
  try {
    const { student_id, date, time, status } = req.body;
    if (!student_id || !status) {
      return res.status(400).json({ success: false, message: 'Student ID and Status are required' });
    }

    const student = await dbGet('SELECT * FROM students WHERE student_id = ?', [student_id]);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const logDate = date || new Date().toISOString().split('T')[0];
    const logTime = time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const timestamp = new Date(`${logDate} ${logTime}`).getTime() || Date.now();

    await dbRun(
      `INSERT INTO attendance (student_id, date, time, timestamp, status, mode, confidence) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [student_id, logDate, logTime, timestamp, status, 'Manual Override', 100.0]
    );

    res.json({ success: true, message: `Manual attendance recorded for ${student.name}` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to record manual attendance' });
  }
});

module.exports = router;
