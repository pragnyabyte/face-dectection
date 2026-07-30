# VisioFace AI - Face Detection Attendance System 🚀

An Artificial Intelligence (AI) and Computer Vision Attendance System designed for Schools, Colleges, Offices, and Training Institutes. It recognizes registered faces, auto-marks attendance in real-time, logs entry/exit check-outs, and generates visual analytics reports with PDF, Excel, and CSV export.

---

## 🌟 Key Features

- **🔐 Dedicated Role-Based Authentication**: Separate portals for Admin, Teacher, and Student logins with password encryption (`bcryptjs`) & JWT sessions.
- **📷 Real-Time WebCam Face Recognition**: Low-latency camera scanner running on HTML5 Canvas & WebGL with confidence scoring.
- **🟢 / 🔴 Dual Scan Modes (Check-In & Check-Out)**: Supports arrival entry scanning and departure exit scanning with instant database status recording.
- **👤 Guided Face Enrollment Studio**: Capture 30 multi-angle face snapshot frames & store AI embeddings.
- **⚡ Instant Photo Capture on New Scan**: Camera snapshot preview pop-up for quick student enrollment.
- **🛡️ Anti-Spoofing & Liveness Detection**: Strict blink liveness verification and mask detection indicators.
- **📊 Analytics Dashboard**: KPI statistics cards, 7-day attendance trend line chart, department breakdowns, and real-time live activity feed.
- **📝 Attendance Logs & Interactive Filtering**: Filter attendance records by date, department, and status (Present, Late, Check-Out, Absent) with one-click reset.
- **📁 Multi-Format Report Exports**: One-click export to **PDF**, **Excel (.xlsx)**, and **CSV**.

---

## 🛠️ Technology Stack

- **Frontend**: HTML5, Vanilla CSS (Modern Glassmorphism Theme), JavaScript (ES6+), Chart.js, SheetJS XLSX, html2pdf.js
- **Backend**: Node.js, Express.js, Cors, Multer, bcryptjs, JSONWebToken
- **Database**: Embedded SQLite (`attendance.db`)
- **AI Processing**: Client Web AI Engine + Python OpenCV (`face_engine.py`)

---

## 🚀 Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/face-detection-attendance-system.git
   cd face-detection-attendance-system
   ```

2. **Install Node.js dependencies**:
   ```bash
   npm install
   ```

3. **Start the application server**:
   ```bash
   npm start
   ```

4. **Access the application**:
   Open [http://localhost:3000](http://localhost:3000) in your web browser.

---

## 🔑 Default Credentials

| Role | Username | Password |
|---|---|---|
| **Admin** | `admin` | `admin123` |
| **Teacher** | `teacher` | `teacher123` |
| **Student** | `student` | `student123` |
