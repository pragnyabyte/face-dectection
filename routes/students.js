const express = require('express');
const router = express.Router();
const { dbQuery, dbGet, dbRun } = require('../db/database');

// GET /api/students - List all students or filter by query
router.get('/', async (req, res) => {
  try {
    const { department, search } = req.query;
    let sql = 'SELECT * FROM students WHERE 1=1';
    let params = [];

    if (department && department !== 'All') {
      sql += ' AND department = ?';
      params.push(department);
    }

    if (search) {
      sql += ' AND (name LIKE ? OR student_id LIKE ? OR roll_number LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    sql += ' ORDER BY id DESC';
    const students = await dbQuery(sql, params);
    res.json({ success: true, count: students.length, students });
  } catch (err) {
    console.error('Error fetching students:', err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// GET /api/students/:student_id - Get single student profile
router.get('/:student_id', async (req, res) => {
  try {
    const student = await dbGet('SELECT * FROM students WHERE student_id = ?', [req.params.student_id]);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    
    const embeddings = await dbQuery('SELECT id, created_at FROM face_embeddings WHERE student_id = ?', [req.params.student_id]);
    res.json({ success: true, student, face_samples: embeddings.length });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error retrieving student profile' });
  }
});

// POST /api/students - Add new student
router.post('/', async (req, res) => {
  try {
    const { student_id, name, roll_number, department, email, phone, gender } = req.body;

    if (!student_id || !name || !roll_number || !department) {
      return res.status(400).json({ success: false, message: 'Student ID, Name, Roll Number, and Department are required.' });
    }

    const existing = await dbGet('SELECT id FROM students WHERE student_id = ? OR roll_number = ?', [student_id, roll_number]);
    if (existing) {
      return res.status(400).json({ success: false, message: 'Student ID or Roll Number already exists in the system.' });
    }

    const result = await dbRun(
      `INSERT INTO students (student_id, name, roll_number, department, email, phone, gender, face_enrolled) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [student_id, name, roll_number, department, email || '', phone || '', gender || 'Other']
    );

    res.status(201).json({
      success: true,
      message: 'Student registered successfully!',
      student: { id: result.id, student_id, name, roll_number, department }
    });
  } catch (err) {
    console.error('Error adding student:', err);
    res.status(500).json({ success: false, message: 'Server error while adding student' });
  }
});

// PUT /api/students/:student_id - Update student info
router.put('/:student_id', async (req, res) => {
  try {
    const { name, roll_number, department, email, phone, gender } = req.body;
    const student_id = req.params.student_id;

    const existing = await dbGet('SELECT id FROM students WHERE student_id = ?', [student_id]);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    await dbRun(
      `UPDATE students SET name = ?, roll_number = ?, department = ?, email = ?, phone = ?, gender = ? WHERE student_id = ?`,
      [name, roll_number, department, email || '', phone || '', gender || 'Other', student_id]
    );

    res.json({ success: true, message: 'Student details updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update student details' });
  }
});

// DELETE /api/students/:student_id - Delete student
router.delete('/:student_id', async (req, res) => {
  try {
    const student_id = req.params.student_id;
    await dbRun('DELETE FROM face_embeddings WHERE student_id = ?', [student_id]);
    await dbRun('DELETE FROM attendance WHERE student_id = ?', [student_id]);
    const result = await dbRun('DELETE FROM students WHERE student_id = ?', [student_id]);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    res.json({ success: true, message: 'Student and related records deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete student record' });
  }
});

module.exports = router;
