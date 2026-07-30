const express = require('express');
const router = express.Router();
const { dbQuery, dbGet, dbRun } = require('../db/database');
const { sendParentNotification, getNotificationSettings } = require('../services/notificationService');

let NotificationModel = null;
let StudentModel = null;
try {
  NotificationModel = require('../models/Notification');
  StudentModel = require('../models/Student');
} catch (e) {}

// GET /api/notifications/today - Dashboard KPI stats & recent notification logs
router.get('/today', async (req, res) => {
  try {
    const dateStr = new Date().toISOString().split('T')[0];

    let totalToday = 0;
    let emailSuccess = 0;
    let whatsappSuccess = 0;
    let smsSuccess = 0;
    let failedCount = 0;
    let recentLogs = [];

    if (process.env.MONGODB_URI && NotificationModel) {
      recentLogs = await NotificationModel.find({ date: dateStr }).sort({ timestamp: -1 }).limit(10);
      totalToday = await NotificationModel.countDocuments({ date: dateStr });
      
      const allToday = await NotificationModel.find({ date: dateStr });
      allToday.forEach(n => {
        if (n.deliveryDetails?.emailSent) emailSuccess++;
        if (n.deliveryDetails?.whatsappSent) whatsappSuccess++;
        if (n.deliveryDetails?.smsSent) smsSuccess++;
        if (n.status === 'Failed') failedCount++;
      });
    } else {
      const rows = await dbQuery('SELECT * FROM notifications WHERE date = ? ORDER BY id DESC', [dateStr]);
      totalToday = rows.length;
      recentLogs = rows.slice(0, 10);

      rows.forEach(r => {
        let details = null;
        try {
          if (r.delivery_details) details = JSON.parse(r.delivery_details);
        } catch (e) {}

        if (details?.emailSent) emailSuccess++;
        if (details?.whatsappSent) whatsappSuccess++;
        if (details?.smsSent) smsSuccess++;
        if (r.status === 'Failed') failedCount++;
      });

      recentLogs = recentLogs.map(r => {
        let details = null;
        try {
          if (r.delivery_details) details = JSON.parse(r.delivery_details);
        } catch (e) {}
        return {
          ...r,
          studentId: r.student_id,
          parentName: r.parent_name,
          phoneNumber: r.phone_number,
          deliveryDetails: details || { emailSent: true, whatsappSent: true, smsSent: true }
        };
      });
    }

    res.json({
      success: true,
      stats: {
        totalToday,
        emailSuccess,
        whatsappSuccess,
        smsSuccess,
        failedCount
      },
      recentLogs
    });
  } catch (err) {
    console.error('Error fetching today notification stats:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve notification analytics' });
  }
});

// GET /api/notifications/history - Paginated & filtered notification logs
router.get('/history', async (req, res) => {
  try {
    const { date, status, search } = req.query;

    if (process.env.MONGODB_URI && NotificationModel) {
      const query = {};
      if (date) query.date = date;
      if (status && status !== 'All') query.status = status;
      if (search) {
        query.$or = [
          { studentName: new RegExp(search, 'i') },
          { studentId: new RegExp(search, 'i') },
          { parentName: new RegExp(search, 'i') },
          { email: new RegExp(search, 'i') }
        ];
      }
      const logs = await NotificationModel.find(query).sort({ timestamp: -1 });
      return res.json({ success: true, count: logs.length, logs });
    }

    // SQLite Fallback
    let sql = 'SELECT * FROM notifications WHERE 1=1';
    let params = [];

    if (date) {
      sql += ' AND date = ?';
      params.push(date);
    }
    if (status && status !== 'All') {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (search) {
      sql += ' AND (student_id LIKE ? OR parent_name LIKE ? OR email LIKE ? OR message LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    sql += ' ORDER BY id DESC LIMIT 100';
    const rows = await dbQuery(sql, params);

    const logs = rows.map(r => {
      let details = null;
      try {
        if (r.delivery_details) details = JSON.parse(r.delivery_details);
      } catch (e) {}
      return {
        ...r,
        studentId: r.student_id,
        parentName: r.parent_name,
        phoneNumber: r.phone_number,
        deliveryDetails: details || { emailSent: true, whatsappSent: true, smsSent: true }
      };
    });

    res.json({ success: true, count: logs.length, logs });
  } catch (err) {
    console.error('Error fetching notification history:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve notification logs' });
  }
});

// POST /api/notifications/send - Trigger notification for student manually
router.post('/send', async (req, res) => {
  try {
    const { student_id, studentId } = req.body;
    const targetStudentId = studentId || student_id;

    if (!targetStudentId) {
      return res.status(400).json({ success: false, message: 'Student ID is required' });
    }

    let student = null;
    if (process.env.MONGODB_URI && StudentModel) {
      student = await StudentModel.findOne({ $or: [{ studentId: targetStudentId }, { rollNumber: targetStudentId }] });
    } else {
      student = await dbGet('SELECT * FROM students WHERE student_id = ? OR roll_number = ?', [targetStudentId, targetStudentId]);
    }

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found in directory' });
    }

    const attendance = {
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now(),
      status: 'Present'
    };

    const notifResult = await sendParentNotification(student, attendance);

    res.json({
      success: true,
      message: `Parent notifications dispatched for ${student.name}`,
      notifications: notifResult
    });
  } catch (err) {
    console.error('Error sending notification:', err);
    res.status(500).json({ success: false, message: 'Failed to send notification' });
  }
});

// POST /api/notifications/resend - Resend failed notification
router.post('/resend', async (req, res) => {
  try {
    const { id, notification_id, student_id } = req.body;
    const targetId = id || notification_id;

    let studentId = student_id;
    if (!studentId && targetId) {
      const notifRow = await dbGet('SELECT student_id FROM notifications WHERE id = ?', [targetId]);
      if (notifRow) studentId = notifRow.student_id;
    }

    if (!studentId) {
      return res.status(400).json({ success: false, message: 'Student ID or Notification ID required' });
    }

    let student = null;
    if (process.env.MONGODB_URI && StudentModel) {
      student = await StudentModel.findOne({ $or: [{ studentId }, { rollNumber: studentId }] });
    } else {
      student = await dbGet('SELECT * FROM students WHERE student_id = ? OR roll_number = ?', [studentId, studentId]);
    }

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student details not found for resend' });
    }

    const attendance = {
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now(),
      status: 'Present'
    };

    const notifResult = await sendParentNotification(student, attendance);

    res.json({
      success: true,
      message: `Resent parent notification successfully for ${student.name}`,
      notifications: notifResult
    });
  } catch (err) {
    console.error('Error resending notification:', err);
    res.status(500).json({ success: false, message: 'Failed to resend notification' });
  }
});

// GET /api/notifications/settings - Retrieve channel toggles & API credentials
router.get('/settings', async (req, res) => {
  try {
    const settings = await getNotificationSettings();
    // Mask sensitive passwords for response
    const maskedSettings = {
      ...settings,
      smtpPass: settings.smtpPass ? '********' : '',
      twilioAuthToken: settings.twilioAuthToken ? '********' : ''
    };
    res.json({ success: true, settings: maskedSettings });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch notification settings' });
  }
});

// POST /api/notifications/settings - Update notification toggles & API credentials
router.post('/settings', async (req, res) => {
  try {
    const {
      emailEnabled, whatsappEnabled, smsEnabled,
      smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom,
      twilioAccountSid, twilioAuthToken, twilioPhone, twilioWhatsappPhone
    } = req.body;

    const existing = await dbGet('SELECT * FROM notification_settings WHERE id = 1');

    const finalPass = (smtpPass && smtpPass !== '********') ? smtpPass : (existing?.smtp_pass || '');
    const finalToken = (twilioAuthToken && twilioAuthToken !== '********') ? twilioAuthToken : (existing?.twilio_auth_token || '');

    await dbRun(
      `UPDATE notification_settings SET
        email_enabled = ?,
        whatsapp_enabled = ?,
        sms_enabled = ?,
        smtp_host = ?,
        smtp_port = ?,
        smtp_user = ?,
        smtp_pass = ?,
        smtp_from = ?,
        twilio_account_sid = ?,
        twilio_auth_token = ?,
        twilio_phone = ?,
        twilio_whatsapp_phone = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
      [
        emailEnabled ? 1 : 0,
        whatsappEnabled ? 1 : 0,
        smsEnabled ? 1 : 0,
        smtpHost || 'smtp.gmail.com',
        Number(smtpPort) || 587,
        smtpUser || '',
        finalPass,
        smtpFrom || 'notifications@institution.edu',
        twilioAccountSid || '',
        finalToken,
        twilioPhone || '',
        twilioWhatsappPhone || ''
      ]
    );

    res.json({ success: true, message: 'Parent Notification Settings & Credentials saved successfully!' });
  } catch (err) {
    console.error('Error saving notification settings:', err);
    res.status(500).json({ success: false, message: 'Failed to update notification settings' });
  }
});

// GET /api/notifications/export - Export notification dispatches as CSV
router.get('/export', async (req, res) => {
  try {
    const rows = await dbQuery('SELECT * FROM notifications ORDER BY id DESC');
    let csv = 'ID,Student_ID,Parent_Name,Email,Phone_Number,Date,Time,Status,Delivery_Details\n';

    rows.forEach(r => {
      csv += `"${r.id}","${r.student_id || ''}","${r.parent_name || ''}","${r.email || ''}","${r.phone_number || ''}","${r.date || ''}","${r.time || ''}","${r.status || ''}","${(r.delivery_details || '').replace(/"/g, '""')}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=parent_notifications_report.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).send('Failed to generate notification export');
  }
});

module.exports = router;
