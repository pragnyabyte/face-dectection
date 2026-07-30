const express = require('express');
const router = express.Router();
const { dbQuery, dbGet } = require('../db/database');

// GET /api/reports/dashboard - Summary stats and chart metrics
router.get('/dashboard', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const totalStudentsRow = await dbGet('SELECT COUNT(*) as count FROM students');
    const totalStudents = totalStudentsRow ? totalStudentsRow.count : 0;

    const presentTodayRow = await dbGet(
      'SELECT COUNT(DISTINCT student_id) as count FROM attendance WHERE date = ? AND status IN ("Present", "Late")',
      [today]
    );
    const presentToday = presentTodayRow ? presentTodayRow.count : 0;

    const lateTodayRow = await dbGet(
      'SELECT COUNT(DISTINCT student_id) as count FROM attendance WHERE date = ? AND status = "Late"',
      [today]
    );
    const lateToday = lateTodayRow ? lateTodayRow.count : 0;

    const absentToday = Math.max(0, totalStudents - presentToday);
    const attendancePercentage = totalStudents > 0 ? ((presentToday / totalStudents) * 100).toFixed(1) : 0;

    // Department breakdown
    const deptRows = await dbQuery(`
      SELECT department, COUNT(*) as total_students
      FROM students
      GROUP BY department
    `);

    const deptStats = [];
    for (const d of deptRows) {
      const pRow = await dbGet(`
        SELECT COUNT(DISTINCT a.student_id) as present_count
        FROM attendance a
        JOIN students s ON a.student_id = s.student_id
        WHERE a.date = ? AND s.department = ? AND a.status IN ("Present", "Late")
      `, [today, d.department]);

      const present = pRow ? pRow.present_count : 0;
      deptStats.push({
        department: d.department,
        total: d.total_students,
        present,
        absent: Math.max(0, d.total_students - present),
        percentage: d.total_students > 0 ? ((present / d.total_students) * 100).toFixed(1) : 0
      });
    }

    // 7-day trend
    const trend = [];
    for (let i = 6; i >= 0; i--) {
      const dDate = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
      const countRow = await dbGet(
        'SELECT COUNT(DISTINCT student_id) as count FROM attendance WHERE date = ? AND status IN ("Present", "Late")',
        [dDate]
      );
      const dayName = new Date(dDate).toLocaleDateString('en-US', { weekday: 'short' });
      trend.push({
        date: dDate,
        day: dayName,
        present: countRow ? countRow.count : 0,
        total: totalStudents
      });
    }

    // Recent activity stream
    const recentActivity = await dbQuery(`
      SELECT a.id, a.student_id, a.time, a.status, a.mode, s.name, s.department
      FROM attendance a
      JOIN students s ON a.student_id = s.student_id
      WHERE a.date = ?
      ORDER BY a.id DESC LIMIT 10
    `, [today]);

    res.json({
      success: true,
      stats: {
        totalStudents,
        presentToday,
        lateToday,
        absentToday,
        attendancePercentage
      },
      departments: deptStats,
      trend,
      recentActivity
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ success: false, message: 'Failed to calculate dashboard statistics' });
  }
});

// GET /api/reports/export/csv - Download CSV report
router.get('/export/csv', async (req, res) => {
  try {
    const { date, department } = req.query;
    let sql = `
      SELECT a.date, a.time, a.student_id, s.name, s.roll_number, s.department, a.status, a.mode, a.confidence
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

    sql += ' ORDER BY a.date DESC, a.time ASC';
    const rows = await dbQuery(sql, params);

    let csvContent = 'Date,Time,Student ID,Name,Roll Number,Department,Status,Mode,Confidence (%)\n';
    rows.forEach(r => {
      csvContent += `"${r.date}","${r.time}","${r.student_id}","${r.name}","${r.roll_number}","${r.department}","${r.status}","${r.mode}","${r.confidence || 100}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=attendance_report_${date || 'all'}.csv`);
    res.status(200).send(csvContent);
  } catch (err) {
    console.error('CSV Export Error:', err);
    res.status(500).json({ success: false, message: 'Failed to export CSV report' });
  }
});

module.exports = router;
