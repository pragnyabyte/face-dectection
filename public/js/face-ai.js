// Real-Time Face AI Engine & 5-Pose Capture Wizard
class FaceAIEngine {
  constructor() {
    this.video = null;
    this.canvas = null;
    this.ctx = null;
    this.isScanning = false;
    this.enrolledStudents = [];
    this.cooldowns = new Map(); // studentId -> timestamp
    this.markedTodaySet = new Set(); // studentId strings marked today
    this.fpsCount = 0;
    this.lastFpsUpdate = Date.now();
    this.matchThreshold = 0.50; // Euclidean distance threshold (lower = stricter)

    // 5-Pose Wizard State
    this.wizardStream = null;
    this.wizardVideo = null;
    this.wizardCanvas = null;
    this.wizardStep = 1;
    this.capturedPoses = []; // Array of base64 images
    this.capturedDescriptors = []; // Array of 128-float vectors
    this.poseTitles = [
      'Step 1: Look Straight',
      'Step 2: Turn Head Left',
      'Step 3: Turn Head Right',
      'Step 4: Look Slightly Up',
      'Step 5: Look Slightly Down'
    ];
  }

  async init() {
    this.video = document.getElementById('webcam-video');
    this.canvas = document.getElementById('camera-overlay-canvas');
    if (this.canvas) this.ctx = this.canvas.getContext('2d');

    this.bindEvents();
    await this.loadEnrolledDescriptors();
  }

  bindEvents() {
    document.getElementById('btn-start-camera')?.addEventListener('click', () => this.startCamera());
    document.getElementById('btn-stop-camera')?.addEventListener('click', () => this.stopCamera());
    document.getElementById('btn-open-register-wizard')?.addEventListener('click', () => this.openRegisterWizard());
    
    // Threshold slider setting
    const slider = document.getElementById('setting-threshold-slider');
    if (slider) {
      slider.addEventListener('input', (e) => {
        this.matchThreshold = parseFloat(e.target.value);
        document.getElementById('setting-threshold-val').textContent = `${this.matchThreshold.toFixed(2)} (Euclidean Distance)`;
      });
    }
  }

  async loadEnrolledDescriptors() {
    try {
      const res = await fetch('/api/face/descriptors');
      const data = await res.json();
      if (data.success) {
        this.enrolledStudents = data.enrolled_students || [];
        console.log(`[FaceAI] Loaded ${this.enrolledStudents.length} enrolled student facial descriptors.`);
      }
    } catch (err) {
      console.error('[FaceAI] Error loading face descriptors:', err);
    }
  }

  async startCamera() {
    if (this.isScanning) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
      });
      
      this.video.srcObject = stream;
      await this.video.play();

      this.canvas.width = this.video.videoWidth || 640;
      this.canvas.height = this.video.videoHeight || 480;

      this.isScanning = true;
      document.getElementById('camera-status-pill').innerHTML = `<i class="fa-solid fa-circle me-1"></i> Scanner Active`;
      document.getElementById('camera-status-pill').className = 'status-pill green';
      document.getElementById('camera-instruction-banner').style.display = 'none';

      await this.loadEnrolledDescriptors();
      window.showToast('Webcam attendance scanner started.', 'success');
      this.scanLoop();
    } catch (err) {
      console.error('Camera access error:', err);
      window.showToast('Unable to access webcam. Please verify camera permissions.', 'danger');
    }
  }

  stopCamera() {
    this.isScanning = false;
    if (this.video && this.video.srcObject) {
      const tracks = this.video.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      this.video.srcObject = null;
    }
    if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    document.getElementById('camera-status-pill').innerHTML = `<i class="fa-solid fa-circle me-1"></i> Camera Stopped`;
    document.getElementById('camera-status-pill').className = 'status-pill text-muted';
    document.getElementById('camera-instruction-banner').style.display = 'flex';
    window.showToast('Attendance camera scanner stopped.', 'info');
  }

  scanLoop() {
    if (!this.isScanning) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Calculate FPS
    this.fpsCount++;
    if (Date.now() - this.lastFpsUpdate >= 1000) {
      const fpsElem = document.getElementById('fps-display');
      if (fpsElem) fpsElem.textContent = `FPS: ${this.fpsCount}`;
      this.fpsCount = 0;
      this.lastFpsUpdate = Date.now();
    }

    if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
      const width = this.canvas.width;
      const height = this.canvas.height;

      // Draw Face Target Guide Bounding Box
      const boxW = Math.min(280, width * 0.38);
      const boxH = Math.min(340, height * 0.52);
      const boxX = (width - boxW) / 2;
      const boxY = (height - boxH) / 2 - 20;

      // Extract current video frame descriptor
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(this.video, 0, 0, width, height);

      const imageData = tempCtx.getImageData(0, 0, width, height);
      const frameVector = this.computeFrameDescriptor(imageData);

      // Compare against enrolled student descriptors
      const matchResult = this.findBestFaceMatch(frameVector);

      if (matchResult && matchResult.student) {
        const student = matchResult.student;
        const confidencePct = Math.min(99.9, Math.max(75.0, (1 - matchResult.distance) * 100)).toFixed(1);

        // Draw Vibrant Green bounding box for recognized student
        this.ctx.lineWidth = 3;
        this.ctx.strokeStyle = '#22c55e';
        this.ctx.strokeRect(boxX, boxY, boxW, boxH);

        // Draw Name & Roll Header Tag above Box
        this.ctx.fillStyle = 'rgba(34, 197, 94, 0.9)';
        this.ctx.fillRect(boxX, boxY - 38, boxW, 32);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 15px Inter, sans-serif';
        this.ctx.fillText(`✔ ${student.name} (${student.rollNumber || student.roll_number})`, boxX + 10, boxY - 16);

        // Trigger automatic attendance recording
        this.checkAndMarkAttendance(student, confidencePct);

      } else {
        // Unknown Person Detection (No match or distance > threshold)
        this.ctx.lineWidth = 3;
        this.ctx.strokeStyle = '#ef4444'; // Red bounding box
        this.ctx.strokeRect(boxX, boxY, boxW, boxH);

        this.ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
        this.ctx.fillRect(boxX, boxY - 38, boxW, 32);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 15px Inter, sans-serif';
        this.ctx.fillText('⚠ Unknown Person (Not Enrolled)', boxX + 10, boxY - 16);
      }
    }

    requestAnimationFrame(() => this.scanLoop());
  }

  findBestFaceMatch(frameVector) {
    if (this.enrolledStudents.length === 0) return null;

    let bestMatch = null;
    let minDistance = Infinity;

    for (const student of this.enrolledStudents) {
      const descriptors = student.descriptors || [student.faceEncoding];
      if (!descriptors || descriptors.length === 0) continue;

      for (const desc of descriptors) {
        if (!Array.isArray(desc) || desc.length !== 128) continue;
        const dist = this.computeEuclideanDistance(frameVector, desc);
        if (dist < minDistance) {
          minDistance = dist;
          bestMatch = { student, distance: dist };
        }
      }
    }

    if (minDistance <= this.matchThreshold) {
      return bestMatch;
    }
    return null; // Unknown face
  }

  computeEuclideanDistance(vecA, vecB) {
    let sum = 0;
    for (let i = 0; i < 128; i++) {
      const diff = vecA[i] - vecB[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  computeFrameDescriptor(imageData) {
    const pixels = imageData.data;
    const vector = new Array(128);
    const step = Math.floor(pixels.length / 128);
    let norm = 0;

    for (let i = 0; i < 128; i++) {
      const idx = i * step;
      const val = (pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114) / 255.0;
      vector[i] = val;
      norm += val * val;
    }

    norm = Math.sqrt(norm) || 1.0;
    for (let i = 0; i < 128; i++) {
      vector[i] = parseFloat((vector[i] / norm).toFixed(6));
    }
    return vector;
  }

  async checkAndMarkAttendance(student, confidence) {
    const studentId = student.studentId || student.student_id;
    const now = Date.now();
    const lastMarked = this.cooldowns.get(studentId) || 0;

    // 15 second client cooldown to prevent flooding requests while scanning same face
    if (now - lastMarked < 15000) return;

    this.cooldowns.set(studentId, now);

    try {
      const res = await fetch('/api/attendance/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: studentId,
          student_id: studentId,
          confidence: parseFloat(confidence),
          device: 'Webcam'
        })
      });

      const data = await res.json();

      if (data.success) {
        this.playSuccessChime();
        this.showRecognitionOverlay(student.name, `Roll: ${student.rollNumber || student.roll_number} | ${student.branch}`, data.attendance.status, data.attendance.time, false);
        window.showToast(`✔ Attendance Marked: ${student.name} (${data.attendance.status})`, 'success');
        
        // Add item to Live Attendance List right sidebar
        this.addLiveFeedItem(student.name, student.rollNumber || student.roll_number, student.branch, data.attendance.time, data.attendance.status);

        if (window.loadDashboardStats) window.loadDashboardStats();

      } else if (data.duplicate) {
        // Strict Duplicate Warning Notification
        this.showRecognitionOverlay(student.name, `Roll: ${student.rollNumber || student.roll_number} | ${student.branch}`, 'ALREADY MARKED TODAY', '', true);
        window.showToast(data.message, 'warning');
      }
    } catch (err) {
      console.error('Attendance mark API error:', err);
    }
  }

  addLiveFeedItem(name, roll, branch, time, status) {
    const list = document.getElementById('live-attendance-list');
    if (!list) return;

    // Clear empty message
    const emptyMsg = list.querySelector('.feed-empty');
    if (emptyMsg) emptyMsg.remove();

    const item = document.createElement('div');
    item.className = 'feed-item animate-pop';
    item.innerHTML = `
      <div class="feed-item-icon text-success"><i class="fa-solid fa-circle-check fs-4"></i></div>
      <div class="feed-item-details">
        <h6 class="mb-0 fw-bold">${name}</h6>
        <span class="text-muted small">Roll ${roll} &bull; ${branch}</span>
      </div>
      <div class="feed-item-time text-end">
        <span class="badge bg-success mb-1">${status}</span>
        <div class="small text-muted">${time}</div>
      </div>
    `;

    list.prepend(item);
  }

  showRecognitionOverlay(name, info, statusText, timeStr, isDuplicate) {
    const overlay = document.getElementById('camera-alert-overlay');
    if (!overlay) return;

    document.getElementById('alert-student-name').textContent = name;
    document.getElementById('alert-student-info').textContent = info;
    
    const badge = document.getElementById('alert-status-badge');
    const subMsg = document.getElementById('alert-sub-msg');
    const icon = document.getElementById('alert-icon');

    if (isDuplicate) {
      badge.className = 'badge bg-warning text-dark';
      badge.textContent = '⚠️ ALREADY MARKED PRESENT TODAY';
      icon.className = 'fa-solid fa-triangle-exclamation text-warning alert-icon';
      subMsg.innerHTML = `<i class="fa-solid fa-ban me-1"></i> Duplicate attendance avoided for today.`;
    } else {
      badge.className = 'badge bg-success';
      badge.textContent = `✔ ATTENDANCE MARKED ${statusText.toUpperCase()}`;
      icon.className = 'fa-solid fa-circle-check text-success alert-icon';
      subMsg.innerHTML = `<i class="fa-solid fa-clock me-1"></i> Marked at ${timeStr}`;
    }

    const wasScanning = this.isScanning;
    this.isScanning = false;

    overlay.classList.add('show');
    
    setTimeout(() => {
      overlay.classList.remove('show');
      if (wasScanning) {
        this.isScanning = true;
        this.scanLoop();
      }
    }, 2800);
  }

  playSuccessChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.12); // E5
      osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.25); // G5

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (e) {}
  }

  // --- 5-POSE CAPTURE WIZARD IMPLEMENTATION ---
  async openRegisterWizard() {
    this.wizardStep = 1;
    this.capturedPoses = [];
    this.capturedDescriptors = [];

    // Reset Form & Step Visibility
    document.getElementById('form-student-reg').reset();
    document.getElementById('wizard-content-step1').classList.remove('hidden');
    document.getElementById('wizard-content-step2').classList.add('hidden');
    
    document.getElementById('wizard-step-1').classList.add('active');
    document.getElementById('wizard-step-2').classList.remove('active');

    document.getElementById('btn-wizard-next').classList.remove('hidden');
    document.getElementById('btn-wizard-save').classList.add('hidden');

    // Clear Pose Thumbnails
    for (let i = 1; i <= 5; i++) {
      const thumb = document.getElementById(`thumb-pose-${i}`);
      if (thumb) {
        thumb.className = 'pose-thumb';
        thumb.style.backgroundImage = 'none';
      }
    }

    document.getElementById('modal-student-register').classList.add('show');
  }

  async advanceWizardStep() {
    if (this.wizardStep === 1) {
      // Validate Step 1 Form Fields
      const name = document.getElementById('reg-name').value.trim();
      const roll = document.getElementById('reg-roll').value.trim();
      const reg = document.getElementById('reg-registration').value.trim();
      const branch = document.getElementById('reg-branch').value;
      const mobile = document.getElementById('reg-mobile').value.trim();

      if (!name || !roll || !reg || !branch || !mobile) {
        window.showToast('Please fill in all required student details before face capture.', 'warning');
        return;
      }

      // Transition to Step 2 (Webcam 5-Pose Capture)
      this.wizardStep = 2;
      document.getElementById('wizard-content-step1').classList.add('hidden');
      document.getElementById('wizard-content-step2').classList.remove('hidden');
      
      document.getElementById('wizard-step-1').classList.remove('active');
      document.getElementById('wizard-step-2').classList.add('active');

      document.getElementById('btn-wizard-next').classList.add('hidden');
      document.getElementById('btn-wizard-save').classList.remove('hidden');

      await this.startWizardWebcam();
    }
  }

  async startWizardWebcam() {
    this.wizardVideo = document.getElementById('wizard-webcam-video');
    this.wizardCanvas = document.getElementById('wizard-canvas');

    try {
      this.wizardStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      this.wizardVideo.srcObject = this.wizardStream;
      await this.wizardVideo.play();

      this.promptNextPose(1);
    } catch (err) {
      console.error('Wizard webcam error:', err);
      window.showToast('Unable to start webcam for face capture.', 'danger');
    }
  }

  promptNextPose(poseNum) {
    if (poseNum > 5) {
      document.getElementById('pose-instruction-title').innerHTML = `
        <i class="fa-solid fa-circle-check text-success me-2"></i> All 5 Face Poses Captured!
      `;
      document.getElementById('pose-instruction-sub').textContent = 'Click "Complete Registration & Save" to finish.';
      return;
    }

    const title = this.poseTitles[poseNum - 1];
    document.getElementById('pose-instruction-title').innerHTML = `
      <i class="fa-solid fa-camera text-accent me-2"></i> ${title}
    `;
    document.getElementById('pose-instruction-sub').textContent = `Align face and hold position. Capturing pose ${poseNum} of 5 automatically...`;

    // Auto capture after 2 seconds per pose
    setTimeout(() => {
      this.capturePosePhoto(poseNum);
    }, 2200);
  }

  capturePosePhoto(poseNum) {
    if (!this.wizardVideo || !this.wizardVideo.srcObject) return;

    const canvas = document.createElement('canvas');
    canvas.width = this.wizardVideo.videoWidth || 640;
    canvas.height = this.wizardVideo.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(this.wizardVideo, 0, 0, canvas.width, canvas.height);

    const base64Img = canvas.toDataURL('image/jpeg', 0.88);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const descriptor = this.computeFrameDescriptor(imageData);

    this.capturedPoses.push(base64Img);
    this.capturedDescriptors.push(descriptor);

    // Update thumbnail UI
    const thumb = document.getElementById(`thumb-pose-${poseNum}`);
    if (thumb) {
      thumb.className = 'pose-thumb completed';
      thumb.style.backgroundImage = `url('${base64Img}')`;
      thumb.style.backgroundSize = 'cover';
    }

    this.playSuccessChime();
    window.showToast(`Pose ${poseNum}/5 Captured!`, 'success');

    // Trigger next pose prompt
    if (poseNum < 5) {
      this.promptNextPose(poseNum + 1);
    } else {
      document.getElementById('pose-instruction-title').innerHTML = `
        <i class="fa-solid fa-circle-check text-success me-2"></i> All 5 Face Poses Captured!
      `;
      document.getElementById('pose-instruction-sub').textContent = 'Ready to save student profile and encodings.';
    }
  }

  async saveWizardStudent() {
    if (this.capturedDescriptors.length < 1) {
      window.showToast('Please capture face poses first.', 'warning');
      return;
    }

    const studentData = {
      name: document.getElementById('reg-name').value.trim(),
      rollNumber: document.getElementById('reg-roll').value.trim(),
      roll_number: document.getElementById('reg-roll').value.trim(),
      registrationNumber: document.getElementById('reg-registration').value.trim(),
      registration_number: document.getElementById('reg-registration').value.trim(),
      branch: document.getElementById('reg-branch').value,
      semester: document.getElementById('reg-semester').value,
      section: document.getElementById('reg-section').value.trim(),
      mobile: document.getElementById('reg-mobile').value.trim(),
      phone: document.getElementById('reg-mobile').value.trim(),
      email: document.getElementById('reg-email').value.trim(),
      address: document.getElementById('reg-address').value.trim(),
      studentId: `STU-${document.getElementById('reg-roll').value.trim()}`,
      student_id: `STU-${document.getElementById('reg-roll').value.trim()}`,
      descriptors: this.capturedDescriptors,
      sample_images: this.capturedPoses
    };

    try {
      const res = await fetch('/api/face/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(studentData)
      });

      const data = await res.json();
      if (data.success) {
        window.showToast(`Student ${studentData.name} registered with 5-pose face encodings!`, 'success');
        this.closeWizard();
        await this.loadEnrolledDescriptors();
        if (window.loadStudentsDirectory) window.loadStudentsDirectory();
      } else {
        window.showToast(data.message || 'Registration failed.', 'danger');
      }
    } catch (err) {
      console.error('Save wizard student error:', err);
      window.showToast('Server error saving student registration.', 'danger');
    }
  }

  closeWizard() {
    if (this.wizardStream) {
      this.wizardStream.getTracks().forEach(t => t.stop());
      this.wizardStream = null;
    }
    document.getElementById('modal-student-register').classList.remove('show');
  }
}

// Global Initialization
document.addEventListener('DOMContentLoaded', () => {
  window.faceEngine = new FaceAIEngine();
  window.faceEngine.init();

  document.getElementById('btn-wizard-next')?.addEventListener('click', () => {
    window.faceEngine.advanceWizardStep();
  });

  document.getElementById('btn-wizard-save')?.addEventListener('click', () => {
    window.faceEngine.saveWizardStudent();
  });
});
