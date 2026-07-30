const mongoose = require('mongoose');

const SecurityLogSchema = new mongoose.Schema({
  studentId: { type: String, default: 'UNKNOWN' },
  studentName: { type: String, default: 'Unknown Subject' },
  date: { type: String, required: true },
  time: { type: String, required: true },
  timestamp: { type: Number, required: true },
  recognitionConfidence: { type: Number, default: 0 },
  livenessScore: { type: Number, default: 0 },
  spoofScore: { type: Number, default: 0 },
  faceMatchScore: { type: Number, default: 0 },
  attackType: { 
    type: String, 
    enum: ['NONE', 'PHONE_SCREEN', 'PRINTED_PHOTO', 'VIDEO_REPLAY', 'DEEPFAKE', 'MULTI_FACE', 'LOW_LIVENESS', 'UNAUTHORIZED'],
    default: 'NONE' 
  },
  device: { type: String, default: 'Webcam Camera' },
  cameraResolution: { type: String, default: '640x480' },
  ipAddress: { type: String, default: '127.0.0.1' },
  status: { 
    type: String, 
    enum: ['PASSED', 'FAILED_SPOOF', 'FAILED_LIVENESS', 'FAILED_MULTI_FACE', 'REJECTED'],
    default: 'PASSED' 
  },
  failureReason: { type: String, default: 'Verification Passed' },
  snapshotPath: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SecurityLog', SecurityLogSchema);
