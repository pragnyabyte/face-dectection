const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { dbQuery, dbGet, dbRun } = require('../db/database');

let SecurityLogModel = null;
try {
  SecurityLogModel = require('../models/SecurityLog');
} catch (e) {}

const SNAPSHOTS_DIR = path.join(__dirname, '..', 'uploads', 'security');
if (!fs.existsSync(SNAPSHOTS_DIR)) {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
}

// POST /api/security/log-attempt - Record security verification event & optional snapshot
router.post('/log-attempt', async (req, res) => {
  try {
    const {
      student_id, studentId,
      student_name, studentName,
      recognitionConfidence,
      livenessScore,
      spoofScore,
      faceMatchScore,
      attackType,
      device,
      cameraResolution,
      status,
      failureReason,
      snapshot_base64
    } = req.body;

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const timestamp = now.getTime();
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    const sId = studentId || student_id || 'UNKNOWN';
    const sName = studentName || student_name || 'Unknown Subject';

    let snapshotPath = '';
    if (snapshot_base64) {
      try {
        const base64Data = snapshot_base64.replace(/^data:image\/\w+;base64,/, '');
        const fileName = `sec_${Date.now()}_${sId}.jpg`;
        const relativePath = path.join('uploads', 'security', fileName).replace(/\\/g, '/');
        const fullPath = path.join(__dirname, '..', relativePath);
        fs.writeFileSync(fullPath, base64Data, { encoding: 'base64' });
        snapshotPath = relativePath;
      } catch (err) {
        console.error('Error saving security snapshot photo:', err);
      }
    }

    const logData = {
      studentId: sId,
      studentName: sName,
      date: dateStr,
      time: timeStr,
      timestamp: timestamp,
      recognitionConfidence: Number(recognitionConfidence) || 0,
      livenessScore: Number(livenessScore) || 0,
      spoofScore: Number(spoofScore) || 0,
      faceMatchScore: Number(faceMatchScore) || 0,
      attackType: attackType || 'NONE',
      device: device || 'Webcam Camera',
      cameraResolution: cameraResolution || '640x480',
      ipAddress: clientIp,
      status: status || (spoofScore > 5 ? 'FAILED_SPOOF' : 'PASSED'),
      failureReason: failureReason || (status === 'PASSED' ? 'Verification Passed' : 'Security Alert Triggered'),
      snapshotPath: snapshotPath
    };

    if (process.env.MONGODB_URI && SecurityLogModel) {
      const savedLog = await SecurityLogModel.create(logData);
      return res.json({ success: true, log: savedLog });
    }

    // SQLite Fallback
    const result = await dbRun(
      `INSERT INTO security_logs 
       (student_id, student_name, date, time, timestamp, recognition_confidence, liveness_score, spoof_score, face_match_score, attack_type, device, camera_resolution, ip_address, status, failure_reason, snapshot_path) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        logData.studentId, logData.studentName, logData.date, logData.time, logData.timestamp,
        logData.recognitionConfidence, logData.livenessScore, logData.spoofScore, logData.faceMatchScore,
        logData.attackType, logData.device, logData.cameraResolution, logData.ipAddress,
        logData.status, logData.failureReason, logData.snapshotPath
      ]
    );

    res.json({ success: true, logId: result.id, log: logData });

  } catch (err) {
    console.error('Error logging security attempt:', err);
    res.status(500).json({ success: false, message: 'Failed to record security log.' });
  }
});

// GET /api/security/stats - Aggregate security KPI analytics
router.get('/stats', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    if (process.env.MONGODB_URI && SecurityLogModel) {
      const totalSpoofAttempts = await SecurityLogModel.countDocuments({ status: { $ne: 'PASSED' } });
      const todayFailed = await SecurityLogModel.countDocuments({ date: today, status: { $ne: 'PASSED' } });
      const liveVerifications = await SecurityLogModel.countDocuments({ status: 'PASSED' });
      
      const phoneScreensBlocked = await SecurityLogModel.countDocuments({ attackType: 'PHONE_SCREEN' });
      const printedPhotosBlocked = await SecurityLogModel.countDocuments({ attackType: 'PRINTED_PHOTO' });
      const replayAttacksBlocked = await SecurityLogModel.countDocuments({ attackType: 'VIDEO_REPLAY' });
      const deepfakeAttempts = await SecurityLogModel.countDocuments({ attackType: 'DEEPFAKE' });
      const multiFaceBlocked = await SecurityLogModel.countDocuments({ attackType: 'MULTI_FACE' });
      const unknownPersons = await SecurityLogModel.countDocuments({ studentId: 'UNKNOWN' });

      const recentLogs = await SecurityLogModel.find().sort({ timestamp: -1 }).limit(10);

      return res.json({
        success: true,
        stats: {
          totalSpoofAttempts,
          todayFailed,
          liveVerifications,
          phoneScreensBlocked,
          printedPhotosBlocked,
          replayAttacksBlocked,
          deepfakeAttempts,
          multiFaceBlocked,
          unknownPersons,
          avgVerificationTimeMs: 820
        },
        recentLogs
      });
    }

    // SQLite Aggregations
    const totalSpoof = await dbGet("SELECT COUNT(*) as cnt FROM security_logs WHERE status != 'PASSED'");
    const todayFail = await dbGet("SELECT COUNT(*) as cnt FROM security_logs WHERE date = ? AND status != 'PASSED'", [today]);
    const livePassed = await dbGet("SELECT COUNT(*) as cnt FROM security_logs WHERE status = 'PASSED'");
    const phoneCount = await dbGet("SELECT COUNT(*) as cnt FROM security_logs WHERE attack_type = 'PHONE_SCREEN'");
    const photoCount = await dbGet("SELECT COUNT(*) as cnt FROM security_logs WHERE attack_type = 'PRINTED_PHOTO'");
    const replayCount = await dbGet("SELECT COUNT(*) as cnt FROM security_logs WHERE attack_type = 'VIDEO_REPLAY'");
    const deepfakeCount = await dbGet("SELECT COUNT(*) as cnt FROM security_logs WHERE attack_type = 'DEEPFAKE'");
    const multiFaceCount = await dbGet("SELECT COUNT(*) as cnt FROM security_logs WHERE attack_type = 'MULTI_FACE'");
    const unknownCount = await dbGet("SELECT COUNT(*) as cnt FROM security_logs WHERE student_id = 'UNKNOWN'");

    const recentLogs = await dbQuery("SELECT * FROM security_logs ORDER BY timestamp DESC LIMIT 10");

    res.json({
      success: true,
      stats: {
        totalSpoofAttempts: totalSpoof.cnt || 0,
        todayFailed: todayFail.cnt || 0,
        liveVerifications: livePassed.cnt || 0,
        phoneScreensBlocked: phoneCount.cnt || 0,
        printedPhotosBlocked: photoCount.cnt || 0,
        replayAttacksBlocked: replayCount.cnt || 0,
        deepfakeAttempts: deepfakeCount.cnt || 0,
        multiFaceBlocked: multiFaceCount.cnt || 0,
        unknownPersons: unknownCount.cnt || 0,
        avgVerificationTimeMs: 820
      },
      recentLogs
    });

  } catch (err) {
    console.error('Error fetching security stats:', err);
    res.status(500).json({ success: false, message: 'Server error retrieving security stats.' });
  }
});

// GET /api/security/logs - Filtered security audit logs
router.get('/logs', async (req, res) => {
  try {
    const { status, attackType, search, limit = 50 } = req.query;

    if (process.env.MONGODB_URI && SecurityLogModel) {
      let filter = {};
      if (status && status !== 'All') filter.status = status;
      if (attackType && attackType !== 'All') filter.attackType = attackType;
      if (search) {
        filter.$or = [
          { studentName: new RegExp(search, 'i') },
          { studentId: new RegExp(search, 'i') }
        ];
      }

      const logs = await SecurityLogModel.find(filter).sort({ timestamp: -1 }).limit(Number(limit));
      return res.json({ success: true, logs });
    }

    // SQLite Query
    let sql = 'SELECT * FROM security_logs WHERE 1=1';
    const params = [];

    if (status && status !== 'All') {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (attackType && attackType !== 'All') {
      sql += ' AND attack_type = ?';
      params.push(attackType);
    }
    if (search) {
      sql += ' AND (student_name LIKE ? OR student_id LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(Number(limit));

    const logs = await dbQuery(sql, params);
    res.json({ success: true, logs });

  } catch (err) {
    console.error('Error fetching security logs:', err);
    res.status(500).json({ success: false, message: 'Server error fetching security logs.' });
  }
});

// GET /api/security/export - CSV Export
router.get('/export', async (req, res) => {
  try {
    let logs = [];
    if (process.env.MONGODB_URI && SecurityLogModel) {
      logs = await SecurityLogModel.find().sort({ timestamp: -1 });
    } else {
      logs = await dbQuery('SELECT * FROM security_logs ORDER BY timestamp DESC');
    }

    let csv = 'Timestamp,Date,Time,Student ID,Student Name,Status,Attack Type,Liveness Score,Spoof Score,Face Match Score,Failure Reason,Device\n';
    logs.forEach(l => {
      csv += `"${l.timestamp}","${l.date}","${l.time}","${l.studentId || l.student_id}","${l.studentName || l.student_name}","${l.status}","${l.attackType || l.attack_type}","${l.livenessScore || l.liveness_score}%","${l.spoofScore || l.spoof_score}%","${l.faceMatchScore || l.face_match_score}%","${l.failureReason || l.failure_reason}","${l.device}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=Security_Audit_Logs_${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (err) {
    res.status(500).send('Error exporting security logs.');
  }
});

module.exports = router;
