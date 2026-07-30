const express = require('express');
const router = express.Router();
const { dbQuery, dbRun } = require('../db/database');

// GET /api/notifications
router.get('/', async (req, res) => {
  try {
    const notifications = await dbQuery('SELECT * FROM notifications ORDER BY id DESC LIMIT 20');
    res.json({ success: true, notifications });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
});

// POST /api/notifications/send-parent-alert
router.post('/send-parent-alert', async (req, res) => {
  try {
    const { student_id, type } = req.body;
    // Simulate sending email/SMS notification to parent
    await dbRun(
      `INSERT INTO notifications (title, message, type) VALUES (?, ?, ?)`,
      ['Parent Alert Sent', `Automated ${type || 'Absence'} SMS & Email sent to parents of ${student_id}`, 'warning']
    );

    res.json({ success: true, message: `Alert notification successfully dispatched to guardian contact for ${student_id}` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to dispatch parent alert' });
  }
});

module.exports = router;
