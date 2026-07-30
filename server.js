const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const { initDatabase } = require('./db/database');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static Asset Directories
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
const { router: authRoutes } = require('./routes/auth');
const studentRoutes = require('./routes/students');
const faceRoutes = require('./routes/face');
const attendanceRoutes = require('./routes/attendance');
const reportRoutes = require('./routes/reports');
const notificationRoutes = require('./routes/notifications');
const securityRoutes = require('./routes/security');

app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/face', faceRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/security', securityRoutes);

// SPA Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize Database and Start Server
initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`====================================================`);
      console.log(`🚀 Face Detection Attendance System running!`);
      console.log(`🌐 Local Web Server: http://localhost:${PORT}`);
      console.log(`====================================================`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
