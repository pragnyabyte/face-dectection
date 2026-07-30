const nodemailer = require('nodemailer');
const { dbGet, dbRun, dbQuery } = require('../db/database');

let NotificationModel = null;
try {
  NotificationModel = require('../models/Notification');
} catch (e) {}

// Get Active Notification Settings
async function getNotificationSettings() {
  try {
    const row = await dbGet('SELECT * FROM notification_settings WHERE id = 1');
    if (row) {
      return {
        emailEnabled: Boolean(row.email_enabled),
        whatsappEnabled: Boolean(row.whatsapp_enabled),
        smsEnabled: Boolean(row.sms_enabled),
        smtpHost: row.smtp_host || process.env.SMTP_HOST || 'smtp.gmail.com',
        smtpPort: row.smtp_port || process.env.SMTP_PORT || 587,
        smtpUser: row.smtp_user || process.env.SMTP_USER || '',
        smtpPass: row.smtp_pass || process.env.SMTP_PASS || '',
        smtpFrom: row.smtp_from || process.env.SMTP_FROM || 'notifications@institution.edu',
        twilioAccountSid: row.twilio_account_sid || process.env.TWILIO_ACCOUNT_SID || '',
        twilioAuthToken: row.twilio_auth_token || process.env.TWILIO_AUTH_TOKEN || '',
        twilioPhone: row.twilio_phone || process.env.TWILIO_PHONE || '',
        twilioWhatsappPhone: row.twilio_whatsapp_phone || process.env.TWILIO_WHATSAPP_PHONE || ''
      };
    }
  } catch (err) {
    console.warn('Could not load notification settings from DB:', err.message);
  }

  return {
    emailEnabled: true,
    whatsappEnabled: true,
    smsEnabled: true,
    smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: process.env.SMTP_PORT || 587,
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS || '',
    smtpFrom: process.env.SMTP_FROM || 'notifications@institution.edu',
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
    twilioPhone: process.env.TWILIO_PHONE || '',
    twilioWhatsappPhone: process.env.TWILIO_WHATSAPP_PHONE || ''
  };
}

// 1. Email Channel
async function sendEmailNotification(student, attendance, settings) {
  if (!settings.emailEnabled) {
    return { success: true, skipped: true, channel: 'Email', message: 'Email disabled in settings' };
  }

  const parentName = student.parent_name || student.parentName || 'Parent';
  const parentEmail = student.parent_email || student.parentEmail || student.email || 'parent@institution.edu';
  const studentName = student.name;
  const timeStr = attendance.time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const dateStr = attendance.date || new Date().toISOString().split('T')[0];
  const deptStr = student.department || student.branch || 'General';

  const subject = 'Attendance Confirmation';
  const textBody = `Hello Mr./Mrs. ${parentName},

This is to inform you that your child ${studentName} has successfully entered the campus.

Entry Time: ${timeStr}
Date: ${dateStr}
Department: ${deptStr}
Status: Present

Thank you.
AI Face Recognition Attendance System`;

  try {
    if (settings.smtpUser && settings.smtpPass) {
      const transporter = nodemailer.createTransport({
        host: settings.smtpHost,
        port: Number(settings.smtpPort),
        secure: Number(settings.smtpPort) === 465,
        auth: { user: settings.smtpUser, pass: settings.smtpPass }
      });

      await transporter.sendMail({
        from: settings.smtpFrom,
        to: parentEmail,
        subject,
        text: textBody
      });
      console.log(`📧 SMTP Email sent successfully to ${parentEmail}`);
      return { success: true, channel: 'Email', recipient: parentEmail };
    } else {
      console.log(`📧 [Simulated Email Sent] To: ${parentEmail} | Subject: ${subject}`);
      return { success: true, simulated: true, channel: 'Email', recipient: parentEmail };
    }
  } catch (err) {
    console.error('Email Notification Error:', err.message);
    return { success: false, channel: 'Email', error: err.message, recipient: parentEmail };
  }
}

// 2. WhatsApp Channel
async function sendWhatsappNotification(student, attendance, settings) {
  if (!settings.whatsappEnabled) {
    return { success: true, skipped: true, channel: 'WhatsApp', message: 'WhatsApp disabled in settings' };
  }

  const parentName = student.parent_name || student.parentName || 'Parent';
  const parentWhatsapp = student.parent_whatsapp || student.parentWhatsApp || student.parent_mobile || student.mobile || '+919876543210';
  const studentName = student.name;
  const timeStr = attendance.time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const dateStr = attendance.date || new Date().toISOString().split('T')[0];

  const message = `Hello ${parentName},

Your child ${studentName} has entered the campus.

🕒 Time: ${timeStr} 📅 Date: ${dateStr}
Attendance Status: ✅ Present

Thank you.`;

  try {
    if (settings.twilioAccountSid && settings.twilioAuthToken && settings.twilioWhatsappPhone) {
      const auth = Buffer.from(`${settings.twilioAccountSid}:${settings.twilioAuthToken}`).toString('base64');
      const params = new URLSearchParams({
        From: `whatsapp:${settings.twilioWhatsappPhone}`,
        To: `whatsapp:${parentWhatsapp}`,
        Body: message
      });

      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${settings.twilioAccountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });

      if (!res.ok) throw new Error(`Twilio API status ${res.status}`);
      console.log(`📱 WhatsApp delivered via Twilio to ${parentWhatsapp}`);
      return { success: true, channel: 'WhatsApp', recipient: parentWhatsapp };
    } else {
      console.log(`📱 [Simulated WhatsApp Delivered] To: ${parentWhatsapp}`);
      return { success: true, simulated: true, channel: 'WhatsApp', recipient: parentWhatsapp };
    }
  } catch (err) {
    console.error('WhatsApp Notification Error:', err.message);
    return { success: false, channel: 'WhatsApp', error: err.message, recipient: parentWhatsapp };
  }
}

// 3. SMS Channel
async function sendSmsNotification(student, attendance, settings) {
  if (!settings.smsEnabled) {
    return { success: true, skipped: true, channel: 'SMS', message: 'SMS disabled in settings' };
  }

  const parentMobile = student.parent_mobile || student.parentMobile || student.mobile || '+919876543210';
  const studentName = student.name;
  const timeStr = attendance.time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const message = `Attendance Alert
${studentName} entered campus successfully.
Time: ${timeStr}
Status: Present`;

  try {
    if (settings.twilioAccountSid && settings.twilioAuthToken && settings.twilioPhone) {
      const auth = Buffer.from(`${settings.twilioAccountSid}:${settings.twilioAuthToken}`).toString('base64');
      const params = new URLSearchParams({
        From: settings.twilioPhone,
        To: parentMobile,
        Body: message
      });

      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${settings.twilioAccountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });

      if (!res.ok) throw new Error(`Twilio SMS API status ${res.status}`);
      console.log(`📩 SMS delivered via Twilio to ${parentMobile}`);
      return { success: true, channel: 'SMS', recipient: parentMobile };
    } else {
      console.log(`📩 [Simulated SMS Delivered] To: ${parentMobile}`);
      return { success: true, simulated: true, channel: 'SMS', recipient: parentMobile };
    }
  } catch (err) {
    console.error('SMS Notification Error:', err.message);
    return { success: false, channel: 'SMS', error: err.message, recipient: parentMobile };
  }
}

// Main Dispatcher Function
async function sendParentNotification(student, attendance) {
  const settings = await getNotificationSettings();

  const [emailRes, whatsappRes, smsRes] = await Promise.all([
    sendEmailNotification(student, attendance, settings),
    sendWhatsappNotification(student, attendance, settings),
    sendSmsNotification(student, attendance, settings)
  ]);

  const allSuccess = emailRes.success && whatsappRes.success && smsRes.success;
  const anySuccess = emailRes.success || whatsappRes.success || smsRes.success;
  const overallStatus = allSuccess ? 'Sent' : (anySuccess ? 'Partial' : 'Failed');

  const errorMessages = [emailRes.error, whatsappRes.error, smsRes.error].filter(Boolean).join(' | ');

  const parentName = student.parent_name || student.parentName || 'Parent';
  const parentEmail = student.parent_email || student.parentEmail || student.email || '';
  const parentPhone = student.parent_mobile || student.parentMobile || student.mobile || '';

  const dateStr = attendance.date || new Date().toISOString().split('T')[0];
  const timeStr = attendance.time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const timestamp = attendance.timestamp || Date.now();

  const deliveryDetails = {
    emailSent: emailRes.success,
    whatsappSent: whatsappRes.success,
    smsSent: smsRes.success,
    emailError: emailRes.error || '',
    whatsappError: whatsappRes.error || '',
    smsError: smsRes.error || ''
  };

  // 1. Save to MongoDB if available
  if (process.env.MONGODB_URI && NotificationModel) {
    try {
      await NotificationModel.create({
        studentId: student.student_id || student.studentId,
        studentName: student.name,
        parentName,
        email: parentEmail,
        phoneNumber: parentPhone,
        type: 'All',
        date: dateStr,
        time: timeStr,
        timestamp,
        status: overallStatus,
        errorMessage: errorMessages,
        deliveryDetails
      });
    } catch (mErr) {
      console.warn('Error saving notification to MongoDB:', mErr.message);
    }
  }

  // 2. Save to SQLite
  try {
    const sId = student.student_id || student.studentId;
    const title = 'Parent Attendance Alert';
    const message = `Automated Email/WhatsApp/SMS notification dispatched for ${student.name}`;

    await dbRun(
      `INSERT INTO notifications (student_id, parent_name, email, phone_number, title, message, type, notification_type, date, time, timestamp, status, error_message, delivery_details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sId,
        parentName,
        parentEmail,
        parentPhone,
        title,
        message,
        overallStatus === 'Failed' ? 'danger' : 'success',
        'All',
        dateStr,
        timeStr,
        timestamp,
        overallStatus,
        errorMessages,
        JSON.stringify(deliveryDetails)
      ]
    );
  } catch (sqErr) {
    console.error('Error saving notification to SQLite:', sqErr.message);
  }

  return {
    sent: anySuccess,
    overallStatus,
    emailSent: emailRes.success,
    whatsappSent: whatsappRes.success,
    smsSent: smsRes.success,
    deliveryDetails
  };
}

module.exports = {
  getNotificationSettings,
  sendParentNotification,
  sendEmailNotification,
  sendWhatsappNotification,
  sendSmsNotification
};
