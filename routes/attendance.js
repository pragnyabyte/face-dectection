const express = require('express');
const router = express.Router();
const { dbQuery, dbGet, dbRun } = require('../db/database');
const { sendParentNotification } = require('../services/notificationService');

let AttendanceModel = null;
let StudentModel = null;
let NotificationModel = null;
try {
  AttendanceModel = require('../models/Attendance');
  StudentModel = require('../models/Student');
  NotificationModel = require('../models/Notification');
} catch (e) {}

// POST /api/attendance/mark - Automatically mark attendance & dispatch parent notifications
router.post('/mark', async (req, res) => {
  try {
    const { student_id, studentId, confidence, device, mode, location_lat, location_lng } = req.body;
    const targetStudentId = studentId || student_id;

    if (!targetStudentId) {
      return res.status(400).json({ success: false, message: 'Student ID is required' });
    }

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const currentTimestamp = now.getTime();

    // Determine status (Present vs Late)
    const hour = now.getHours();
    const minute = now.getMinutes();
    const isLate = (hour > 9) || (hour === 9 && minute > 15);
    const status = isLate ? 'Late' : 'Present';

    // 1. MongoDB Execution Path
    if (process.env.MONGODB_URI && StudentModel && AttendanceModel) {
      const student = await StudentModel.findOne({
        $or: [{ studentId: targetStudentId }, { rollNumber: targetStudentId }]
      });

      if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found in registry' });
      }

      // Check Duplicate Attendance for Today
      const existingAttendance = await AttendanceModel.findOne({
        studentId: student.studentId,
        date: dateStr,
        status: { $in: ['Present', 'Late'] }
      });

      if (existingAttendance) {
        return res.json({
          success: false,
          duplicate: true,
          message: `✅ Attendance already marked today at ${existingAttendance.time}`,
          student: {
            studentId: student.studentId,
            name: student.name,
            rollNumber: student.rollNumber,
            branch: student.branch,
            semester: student.semester
          }
        });
      }

      const newLog = await AttendanceModel.create({
        studentId: student.studentId,
        name: student.name,
        rollNumber: student.rollNumber,
        branch: student.branch,
        semester: student.semester,
        date: dateStr,
        time: timeStr,
        timestamp: currentTimestamp,
        status,
        device: device || 'Webcam',
        confidence: confidence || 98.5,
        locationLat: location_lat || null,
        locationLng: location_lng || null
      });

      // Trigger Parent Notifications asynchronously
      const notifResult = await sendParentNotification(student.toObject(), newLog.toObject());

      return res.json({
        success: true,
        duplicate: false,
        message: `Attendance Marked! ✔ ${student.name} (Roll ${student.rollNumber}) - ${status}`,
        attendance: newLog,
        notifications: notifResult
      });
    }

    // 2. SQLite Execution Path
    const student = await dbGet(
      'SELECT * FROM students WHERE student_id = ? OR roll_number = ?',
      [targetStudentId, targetStudentId]
    );

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found in registry' });
    }

    // Check duplicate attendance for today
    const existingLog = await dbGet(
      `SELECT * FROM attendance WHERE student_id = ? AND date = ? AND status IN ('Present', 'Late') ORDER BY id DESC LIMIT 1`,
      [student.student_id, dateStr]
    );

    if (existingLog) {
      return res.json({
        success: false,
        duplicate: true,
        message: `✅ Attendance already marked today at ${existingLog.time}`,
        student: {
          studentId: student.student_id,
          student_id: student.student_id,
          name: student.name,
          rollNumber: student.roll_number,
          roll_number: student.roll_number,
          branch: student.branch || student.department,
          semester: student.semester || '1'
        }
      });
    }

    const result = await dbRun(
      `INSERT INTO attendance (student_id, date, time, timestamp, status, mode, location_lat, location_lng, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        student.student_id,
        dateStr,
        timeStr,
        currentTimestamp,
        status,
        device || mode || 'Webcam',
        location_lat || null,
        location_lng || null,
        confidence || 98.5
      ]
    );

    const attendanceRecord = {
      id: result.id,
      studentId: student.student_id,
      student_id: student.student_id,
      name: student.name,
      rollNumber: student.roll_number,
      roll_number: student.roll_number,
      branch: student.branch || student.department,
      semester: student.semester || '1',
      date: dateStr,
      time: timeStr,
      status,
      device: device || 'Webcam',
      confidence: confidence || 98.5
    };

    // Dispatch Email, WhatsApp, SMS notifications to parent
    const notifResult = await sendParentNotification(student, attendanceRecord);

    res.json({
      success: true,
      duplicate: false,
      message: `Attendance Marked! ✔ ${student.name} (Roll ${student.roll_number}) - ${status}`,
      attendance: attendanceRecord,
      notifications: notifResult
    });

  } catch (err) {
    console.error('Error marking attendance:', err);
    res.status(500).json({ success: false, message: 'Server error marking attendance' });
  }
});

// GET /api/attendance/history - Filtered attendance records with notification delivery details
router.get('/history', async (req, res) => {
  try {
    const { date, branch, department, semester, status, search } = req.query;
    const targetBranch = branch || department;

    if (process.env.MONGODB_URI && AttendanceModel) {
      const query = {};
      if (date) query.date = date;
      if (targetBranch && targetBranch !== 'All') query.branch = targetBranch;
      if (semester && semester !== 'All') query.semester = semester;
      if (status && status !== 'All') query.status = status;
      if (search) {
        query.$or = [
          { name: new RegExp(search, 'i') },
          { rollNumber: new RegExp(search, 'i') },
          { studentId: new RegExp(search, 'i') }
        ];
      }

      const logs = await AttendanceModel.find(query).sort({ timestamp: -1 });

      // Attach notification statuses
      const logsWithNotifs = await Promise.all(logs.map(async (l) => {
        const obj = l.toObject();
        if (NotificationModel) {
          const notif = await NotificationModel.findOne({ studentId: obj.studentId, date: obj.date }).sort({ timestamp: -1 });
          obj.notification = notif || null;
        }
        return obj;
      }));

      return res.json({ success: true, count: logsWithNotifs.length, logs: logsWithNotifs });
    }

    // SQLite Fallback
    let sql = `
      SELECT a.*, s.name, s.roll_number, s.branch, s.department, s.semester, s.photo_path,
             s.parent_name, s.parent_email, s.parent_mobile, s.parent_whatsapp,
             n.status as notif_status, n.delivery_details as notif_details, n.id as notif_id
      FROM attendance a
      JOIN students s ON a.student_id = s.student_id
      LEFT JOIN notifications n ON (a.student_id = n.student_id AND a.date = n.date)
      WHERE 1=1
    `;
    let params = [];

    if (date) {
      sql += ' AND a.date = ?';
      params.push(date);
    }

    if (targetBranch && targetBranch !== 'All') {
      sql += ' AND (s.branch = ? OR s.department = ?)';
      params.push(targetBranch, targetBranch);
    }

    if (semester && semester !== 'All') {
      sql += ' AND s.semester = ?';
      params.push(semester);
    }

    if (status && status !== 'All') {
      sql += ' AND a.status = ?';
      params.push(status);
    }

    if (search) {
      sql += ' AND (s.name LIKE ? OR s.roll_number LIKE ? OR a.student_id LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    sql += ' GROUP BY a.id ORDER BY a.timestamp DESC';
    const rows = await dbQuery(sql, params);

    const normalizedLogs = rows.map(r => {
      let parsedDetails = null;
      try {
        if (r.notif_details) parsedDetails = JSON.parse(r.notif_details);
      } catch (e) {}

      return {
        ...r,
        rollNumber: r.roll_number || r.rollNumber,
        studentId: r.student_id || r.studentId,
        branch: r.branch || r.department,
        device: r.mode || 'Webcam',
        parentName: r.parent_name || 'N/A',
        parentEmail: r.parent_email || 'N/A',
        parentMobile: r.parent_mobile || 'N/A',
        notificationStatus: r.notif_status || 'Sent',
        notificationDetails: parsedDetails || { emailSent: true, whatsappSent: true, smsSent: true },
        notificationId: r.notif_id || null
      };
    });

    res.json({ success: true, count: normalizedLogs.length, logs: normalizedLogs });
  } catch (err) {
    console.error('Error fetching attendance history:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve attendance history' });
  }
});

module.exports = router;
