// Face Enrollment Studio Wizard
class FaceEnrollmentStudio {
  constructor() {
    this.video = null;
    this.canvas = null;
    this.ctx = null;
    this.stream = null;
    this.capturedDescriptors = [];
    this.sampleImageBase64 = null;
    this.isCapturing = false;
    this.totalFramesNeeded = 30;
  }

  init() {
    this.video = document.getElementById('enroll-video');
    this.canvas = document.getElementById('enroll-canvas');
    if (this.canvas) this.ctx = this.canvas.getContext('2d');

    this.bindEvents();
  }

  bindEvents() {
    const studentSelect = document.getElementById('enroll-student-select');
    if (studentSelect) {
      studentSelect.addEventListener('change', (e) => this.handleStudentSelect(e.target.value));
    }

    document.getElementById('btn-start-enroll')?.addEventListener('click', () => this.startEnrollmentCapture());
    document.getElementById('btn-save-enroll')?.addEventListener('click', () => this.saveEnrollmentData());
  }

  async handleStudentSelect(studentId) {
    const card = document.getElementById('enroll-student-card');
    if (!studentId) {
      card?.classList.add('hidden');
      return;
    }

    try {
      const res = await fetch(`/api/students/${studentId}`);
      const data = await res.json();
      if (data.success) {
        const s = data.student;
        document.getElementById('enroll-preview-name').textContent = s.name;
        document.getElementById('enroll-preview-id').textContent = `ID: ${s.student_id} | ${s.department}`;
        
        const pill = document.getElementById('enroll-status-pill');
        if (s.face_enrolled) {
          pill.className = 'badge bg-success';
          pill.textContent = 'Already Enrolled (Can Re-enroll)';
        } else {
          pill.className = 'badge bg-warning';
          pill.textContent = 'Pending Face Registration';
        }
        card?.classList.remove('hidden');
      }
    } catch (e) {
      console.error('Error fetching student preview:', e);
    }
  }

  async startEnrollmentCapture() {
    const studentId = document.getElementById('enroll-student-select')?.value;
    if (!studentId) {
      window.showToast('Please select a student first.', 'warning');
      return;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });
      this.video.srcObject = this.stream;
      await this.video.play();

      this.canvas.width = this.video.videoWidth || 640;
      this.canvas.height = this.video.videoHeight || 480;

      this.capturedDescriptors = [];
      this.isCapturing = true;

      document.getElementById('btn-start-enroll').classList.add('hidden');
      document.getElementById('btn-save-enroll').classList.add('hidden');

      window.showToast('Capture started. Look directly at camera and rotate head slightly.', 'info');
      this.captureLoop();
    } catch (err) {
      console.error('Camera stream error during enrollment:', err);
      window.showToast('Failed to start webcam for enrollment.', 'danger');
    }
  }

  captureLoop() {
    if (!this.isCapturing) return;

    if (this.capturedDescriptors.length < this.totalFramesNeeded) {
      // Capture current video frame to canvas
      this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

      // Generate 128-dimensional synthetic face descriptor vector from frame canvas pixels
      const frameData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      const descriptor = this.computeFrameDescriptor(frameData);
      this.capturedDescriptors.push(descriptor);

      // Store Base64 sample image from 15th frame
      if (this.capturedDescriptors.length === 15) {
        this.sampleImageBase64 = this.canvas.toDataURL('image/jpeg', 0.85);
      }

      // Update progress UI
      const count = this.capturedDescriptors.length;
      const pct = Math.round((count / this.totalFramesNeeded) * 100);

      document.getElementById('enroll-progress-badge').textContent = `${count} / ${this.totalFramesNeeded} Frames`;
      document.getElementById('enroll-progress-fill').style.width = `${pct}%`;
      document.getElementById('enroll-progress-text').textContent = `Capturing Frame ${count}... Tilt head slightly (${pct}%)`;

      setTimeout(() => this.captureLoop(), 100);
    } else {
      // Capture complete!
      this.isCapturing = false;
      document.getElementById('enroll-progress-text').textContent = '✓ 30 Face Frame Samples Captured Successfully!';
      document.getElementById('btn-save-enroll').classList.remove('hidden');

      // Stop camera stream
      if (this.stream) {
        this.stream.getTracks().forEach(t => t.stop());
      }
      window.showToast('Face sample capture complete! Click "Save & Finish Registration".', 'success');
    }
  }

  // Generate 128-dimensional normalized descriptor float array from pixel buffer
  computeFrameDescriptor(imageData) {
    const pixels = imageData.data;
    const vector = new Array(128);
    const step = Math.floor(pixels.length / 128);

    let norm = 0;
    for (let i = 0; i < 128; i++) {
      const idx = i * step;
      // Convert RGB pixel to normalized intensity
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

  async saveEnrollmentData() {
    const studentId = document.getElementById('enroll-student-select')?.value;
    if (!studentId || this.capturedDescriptors.length === 0) return;

    try {
      const res = await fetch('/api/face/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          descriptors: this.capturedDescriptors,
          sample_image_base64: this.sampleImageBase64
        })
      });

      const data = await res.json();
      if (data.success) {
        window.showToast(data.message, 'success');
        document.getElementById('btn-save-enroll').classList.add('hidden');
        document.getElementById('btn-start-enroll').classList.remove('hidden');
        document.getElementById('enroll-progress-fill').style.width = '0%';
        document.getElementById('enroll-progress-badge').textContent = '0 / 30 Frames';

        // Refresh global state & scanner descriptors
        if (window.faceEngine) window.faceEngine.loadEnrolledDescriptors();
        if (window.switchTab) window.switchTab('students');
      } else {
        window.showToast(data.message || 'Enrollment save failed', 'danger');
      }
    } catch (err) {
      console.error('Error saving face enrollment:', err);
      window.showToast('Server error while saving enrollment data.', 'danger');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.enrollmentStudio = new FaceEnrollmentStudio();
  window.enrollmentStudio.init();
});
