const uploadBtn = document.getElementById('upload-btn');
const fileInput = document.getElementById('fileInput');
const previewTop = document.getElementById('preview-top');
const previewBottom = document.getElementById('preview-bottom');
const sizeOriginal = document.getElementById('size-original');
const sizeConverted = document.getElementById('size-converted');
const conversionStatus = document.getElementById('conversion-status');
const downloadBtn = document.getElementById('download-btn');
const previewBtn = document.getElementById('preview-btn');

const viewFormat = document.getElementById('view-format');
const viewPreview = document.getElementById('view-preview');

const qualitySlider = document.getElementById('quality-slider');
const effortSlider = document.getElementById('effort-slider');
const qualityVal = document.getElementById('quality-val');
const effortVal = document.getElementById('effort-val');
const qualityGroup = document.getElementById('quality-group');
const effortGroup = document.getElementById('effort-group');

const labelTop = document.getElementById('label-top');
const labelBottom = document.getElementById('label-bottom');
const formatBtns = document.querySelectorAll('.format-btn');

const compareWrapper = document.getElementById('compare-wrapper');
const compareOriginal = document.getElementById('compare-original');
const compareConverted = document.getElementById('compare-converted');
const compareRange = document.getElementById('compare-range');
const compareTagLeft = document.getElementById('compare-tag-left');
const compareTagRight = document.getElementById('compare-tag-right');

const mp4Controls = document.getElementById('mp4-controls');
const trimStart = document.getElementById('trim-start');
const trimEnd = document.getElementById('trim-end');
const trimVal = document.getElementById('trim-val');
const bitrateSlider = document.getElementById('bitrate-slider');
const bitrateVal = document.getElementById('bitrate-val');
const videoResSelect = document.getElementById('video-res-select');

function updateTrimDisplay() {
  const startSec = parseInt(trimStart.value);
  const endSec = parseInt(trimEnd.value);
  
  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  trimVal.textContent = `${formatTime(startSec)} - ${formatTime(endSec)}`;
}

trimStart?.addEventListener('input', () => {
  if (parseInt(trimStart.value) >= parseInt(trimEnd.value)) {
    trimStart.value = trimEnd.value - 1;
  }
  updateTrimDisplay();
});
trimStart?.addEventListener('change', processImage);

trimEnd?.addEventListener('input', () => {
  if (parseInt(trimEnd.value) <= parseInt(trimStart.value)) {
    trimEnd.value = parseInt(trimStart.value) + 1;
  }
  updateTrimDisplay();
});
trimEnd?.addEventListener('change', processImage);

bitrateSlider?.addEventListener('input', (e) => {
  const kbps = e.target.value;
  bitrateVal.textContent = kbps > 2000 ? `High (${(kbps / 1000).toFixed(1)} Mbps)` : `Low (${kbps} kbps)`;
});

videoResSelect?.addEventListener('change', processImage);
bitrateSlider?.addEventListener('change', processImage);

let currentImg = null;
let currentBlob = null;
let currentFile = null;
let originalName = 'image';
let currentFormat = 'image/webp';
let currentExtension = '.webp';
let originalObjUrl = null;

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + sizes[i];
}

function updateConversionStatus(status) {
  if (conversionStatus) conversionStatus.textContent = status;
}

compareRange.addEventListener('input', (e) => {
  compareWrapper.style.setProperty('--pos', e.target.value + '%');
});

previewBtn.addEventListener('click', () => {
  const isPreviewHidden = viewPreview.style.display === 'none';
  if (isPreviewHidden) {
    viewFormat.style.display = 'none';
    viewPreview.style.display = 'flex';
    previewBtn.classList.add('active');
  } else {
    viewPreview.style.display = 'none';
    viewFormat.style.display = 'block';
    previewBtn.classList.remove('active');
  }
});

uploadBtn.addEventListener('click', () => fileInput.click());

async function processVideo() {
  const processingFile = currentBlob?.type?.startsWith('video/') ? currentBlob : currentFile;
  if (!processingFile || !processingFile.type.startsWith('video/')) return;
  sizeConverted.textContent = formatBytes(processingFile.size);

  const video = document.createElement('video');
  const videoUrl = URL.createObjectURL(processingFile);
  video.src = videoUrl;
  video.muted = true;
  video.playsInline = true;

  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error('Unable to read this video.'));
    });

    const requestedStart = Math.max(0, parseInt(trimStart.value) || 0);
    const start = Math.min(requestedStart, Math.max(0, video.duration - 0.01));
    const requestedEnd = parseInt(trimEnd.value) || video.duration;
    const end = Math.min(video.duration, Math.max(start + 0.1, requestedEnd));
    const targetHeight = parseInt(videoResSelect.value) || video.videoHeight;
    const scale = Math.min(1, targetHeight / video.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(2, Math.round(video.videoHeight * scale));

    if (!canvas.captureStream || !video.captureStream || !window.MediaRecorder) {
      throw new Error('Video conversion is not supported in this browser.');
    }

    const canvasStream = canvas.captureStream();
    const sourceStream = video.captureStream();
    sourceStream.getAudioTracks().forEach(track => canvasStream.addTrack(track));
    const mimeTypes = [
      'video/mp4;codecs=h264,aac',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    const mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error('No supported video format is available.');
    if (mimeType.startsWith('video/mp4')) {
      currentExtension = '.mp4';
    } else {
      currentExtension = '.webm';
      labelBottom.textContent = '.WEBM';
      if (compareTagLeft) compareTagLeft.textContent = '.WEBM';
    }

    const chunks = [];
    const recorder = new MediaRecorder(canvasStream, {
      mimeType,
      videoBitsPerSecond: parseInt(bitrateSlider.value) * 1000
    });
    let encodedSize = 0;
    const recordingFinished = new Promise((resolve, reject) => {
      recorder.ondataavailable = e => {
        if (e.data.size) {
          chunks.push(e.data);
          encodedSize += e.data.size;
          sizeConverted.textContent = formatBytes(encodedSize);
        }
      };
      recorder.onerror = () => reject(new Error('Video recording failed.'));
      recorder.onstop = resolve;
    });

    await new Promise((resolve, reject) => {
      const targetTime = Math.min(start, Math.max(0, video.duration - 0.01));
      let settled = false;
      const finishSeek = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      video.onseeked = finishSeek;
      video.onerror = () => reject(new Error('Unable to seek this video.'));
      video.currentTime = targetTime;
      if (Math.abs(video.currentTime - targetTime) < 0.01) {
        requestAnimationFrame(finishSeek);
      }
    });

    const ctx = canvas.getContext('2d');
    const recordingDuration = Math.max(0.1, end - start);
    let recordingStartedAt = 0;
    const drawFrame = () => {
      const elapsed = (performance.now() - recordingStartedAt) / 1000;
      if (elapsed >= recordingDuration || video.currentTime >= end || video.ended) {
        if (recorder.state !== 'inactive') recorder.stop();
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      requestAnimationFrame(drawFrame);
    };

    recorder.start(250);
    recordingStartedAt = performance.now();
    await video.play();
    drawFrame();
    await recordingFinished;

    currentBlob = new Blob(chunks, { type: mimeType });
    sizeConverted.textContent = formatBytes(currentBlob.size);
    updateConversionStatus('Done');
    const blobUrl = URL.createObjectURL(currentBlob);
    previewBottom.style.backgroundImage = `url('${blobUrl}')`;
    compareConverted.style.backgroundImage = `url('${blobUrl}')`;
  } catch (error) {
    currentBlob = processingFile;
    sizeConverted.textContent = formatBytes(processingFile.size);
    updateConversionStatus('Done (original file)');
    alert(error.message);
  } finally {
    video.pause();
    URL.revokeObjectURL(videoUrl);
  }
}

function processImage() {
  if (currentFile?.type.startsWith('video/') && currentFormat === 'video/mp4') {
    processVideo();
    return;
  }
  if (!currentImg) return;

  const canvas = document.createElement('canvas');
  canvas.width = currentImg.width;
  canvas.height = currentImg.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(currentImg, 0, 0);

  const quality = parseInt(qualitySlider.value) / 100;

  canvas.toBlob((blob) => {
    if (!blob) return;
    currentBlob = blob;
    sizeConverted.textContent = formatBytes(blob.size);
    updateConversionStatus('Done');

    const blobUrl = URL.createObjectURL(blob);
    const bgStyle = `url('${blobUrl}')`;

    previewBottom.style.backgroundImage = bgStyle;
    compareConverted.style.backgroundImage = bgStyle;
  }, currentFormat, quality);
}

qualitySlider.addEventListener('input', (e) => {
  qualityVal.textContent = e.target.value + '%';
  processImage();
});

effortSlider.addEventListener('input', (e) => {
  effortVal.textContent = e.target.value;
});

downloadBtn.addEventListener('click', () => {
  if (!currentBlob) {
    alert('Please upload an image first!');
    return;
  }
  const url = URL.createObjectURL(currentBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${originalName}-converted${currentExtension}`;
  a.click();
  URL.revokeObjectURL(url);
  updateConversionStatus('Downloading...');
  setTimeout(() => updateConversionStatus('Ready'), 1000);
});

const searchBar = document.querySelector('.search-bar');

searchBar.addEventListener('input', (e) => {
  const query = e.target.value.trim().toLowerCase();

  formatBtns.forEach(btn => {
    const text = btn.textContent.toLowerCase();
    if (text.includes(query)) {
      btn.style.display = 'inline-block';
    } else {
      btn.style.display = 'none';
    }
  });
});

const pasteBtn = document.getElementById('paste-btn');

function handleIncomingImage(file) {
  if (!file) return;
  currentFile = file;
  updateConversionStatus('Initializing...');

  // 1. Extract file name and extension
  const dotIdx = file.name ? file.name.lastIndexOf('.') : -1;
  originalName = (file.name && dotIdx !== -1) ? file.name.substring(0, dotIdx) : 'uploaded-file';
  
  const inputExt = (file.name && dotIdx !== -1) 
    ? file.name.substring(dotIdx).toUpperCase() 
    : '.' + (file.type ? file.type.split('/')[1].toUpperCase() : 'FILE');

  // 2. Update sidebar header & stats
  labelTop.textContent = inputExt;
  if (compareTagRight) compareTagRight.textContent = inputExt;
  sizeOriginal.textContent = formatBytes(file.size);

  originalObjUrl = URL.createObjectURL(file);

  // 3. Handle Images vs Other Media
  if (file.type.startsWith('image/')) {
    const bgStyle = `url('${originalObjUrl}')`;
    previewTop.style.backgroundImage = bgStyle;
    if (compareOriginal) compareOriginal.style.backgroundImage = bgStyle;

    currentImg = new Image();
    currentImg.src = originalObjUrl;
    currentImg.onload = () => processImage();
  } else {
    currentImg = null;
    currentBlob = file;
    sizeConverted.textContent = formatBytes(file.size);
    updateConversionStatus('Done');
    previewTop.style.backgroundImage = 'none';
    previewBottom.style.backgroundImage = 'none';
    if (compareOriginal) compareOriginal.style.backgroundImage = 'none';
    if (compareConverted) compareConverted.style.backgroundImage = 'none';
    if (file.type.startsWith('video/') && currentFormat === 'video/mp4') {
      processVideo();
    }
  }
}

pasteBtn.addEventListener('click', async () => {
  try {
    const clipboardItems = await navigator.clipboard.read();
    for (const item of clipboardItems) {
      const type = item.types.find(type => type.startsWith('image/')) || item.types[0];
      if (type) {
        const blob = await item.getType(type);
        handleIncomingImage(blob);
        return;
      }
    }
    alert('No supported file found in clipboard!');
  } catch (err) {
    alert('Clipboard permission denied or unsupported. Use Ctrl+V instead!');
  }
});

window.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    const file = item.getAsFile();
    if (file) {
      handleIncomingImage(file);
      break;
    }
  }
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleIncomingImage(file);
});