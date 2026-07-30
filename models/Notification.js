const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  studentId: { type: String, required: true },
  studentName: { type: String, default: '' },
  parentName: { type: String, default: '' },
  email: { type: String, default: '' },
  phoneNumber: { type: String, default: '' },
  type: { type: String, default: 'All' }, // 'Email', 'WhatsApp', 'SMS', 'All'
  date: { type: String, required: true },
  time: { type: String, required: true },
  timestamp: { type: Number, default: Date.now },
  status: { type: String, default: 'Sent' }, // 'Sent', 'Failed', 'Partial'
  errorMessage: { type: String, default: '' },
  deliveryDetails: {
    emailSent: { type: Boolean, default: false },
    whatsappSent: { type: Boolean, default: false },
    smsSent: { type: Boolean, default: false },
    emailError: { type: String, default: '' },
    whatsappError: { type: String, default: '' },
    smsError: { type: String, default: '' }
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
