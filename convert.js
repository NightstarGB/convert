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
const fpsSlider = document.getElementById('fps-slider');
const fpsVal = document.getElementById('fps-val');
const pasteBtn = document.getElementById('paste-btn');
const searchBar = document.querySelector('.search-bar');

let currentImg = null;
let currentBlob = null;
let currentFile = null;
let currentTextContent = null;
let originalName = 'image';
let currentFormat = 'image/webp';
let currentExtension = '.webp';
let originalObjUrl = null;

// Cache encoded video cuts to avoid unnecessary re-encoding
const videoCache = {};

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

function updateTrimDisplay() {
  const startSec = parseInt(trimStart?.value) || 0;
  const endSec = parseInt(trimEnd?.value) || 0;
  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  if (trimVal) trimVal.textContent = `${formatTime(startSec)} - ${formatTime(endSec)}`;
}

function setupVideoDurations(duration) {
  const rounded = Math.floor(duration) || 30;
  if (trimStart) trimStart.max = rounded;
  if (trimEnd) {
    trimEnd.max = rounded;
    trimEnd.value = rounded;
  }
  updateTrimDisplay();
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
  if (bitrateVal) {
    bitrateVal.textContent = kbps > 2000 ? `High (${(kbps / 1000).toFixed(1)} Mbps)` : `Low (${kbps} kbps)`;
  }
});
bitrateSlider?.addEventListener('change', processImage);
videoResSelect?.addEventListener('change', processImage);

fpsSlider?.addEventListener('input', (e) => {
  if (fpsVal) fpsVal.textContent = `${e.target.value} FPS`;
});
fpsSlider?.addEventListener('change', processImage);

qualitySlider?.addEventListener('input', (e) => {
  if (qualityVal) qualityVal.textContent = e.target.value + '%';
  processImage();
});

effortSlider?.addEventListener('input', (e) => {
  if (effortVal) effortVal.textContent = e.target.value;
});

compareRange?.addEventListener('input', (e) => {
  compareWrapper?.style.setProperty('--pos', e.target.value + '%');
});

previewBtn?.addEventListener('click', () => {
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

uploadBtn?.addEventListener('click', () => fileInput?.click());

function isTextFile(file) {
  return file?.type === 'text/plain' || /\.txt$/i.test(file?.name || '');
}

function drawTextFrame(ctx, text, width, height) {
  ctx.fillStyle = '#09090b';
  ctx.fillRect(0, 0, width, height);

  const fontSize = Math.max(18, Math.min(42, Math.round(width / 32)));
  const lineHeight = Math.round(fontSize * 1.45);
  const horizontalPadding = Math.round(width * 0.08);
  const maxWidth = width - horizontalPadding * 2;
  ctx.font = `${fontSize}px monospace`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const lines = [];
  for (const paragraph of text.replace(/\r\n/g, '\n').split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }

    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }

  const visibleLines = lines.length || 1;
  const startY = Math.max(24, (height - visibleLines * lineHeight) / 2);
  lines.forEach((line, index) => {
    ctx.fillText(line, width / 2, startY + index * lineHeight);
  });
}

async function convertTextToVideo() {
  if (currentTextContent === null || currentFormat !== 'video/mp4') return;

  const targetHeight = parseInt(videoResSelect?.value) || 720;
  const targetWidth = Math.round((targetHeight * 16) / 9);
  const targetFps = 30;
  const start = Math.max(0, parseInt(trimStart?.value) || 0);
  const end = Math.max(start + 0.1, parseInt(trimEnd?.value) || 5);
  const duration = Math.max(0.1, end - start);
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  if (!canvas.captureStream || !window.MediaRecorder) {
    updateConversionStatus('Failed');
    alert('Text-to-video conversion is not supported in this browser.');
    return;
  }

  updateConversionStatus('Encoding...');
  sizeConverted.textContent = '0B';
  const ctx = canvas.getContext('2d');
  drawTextFrame(ctx, currentTextContent, canvas.width, canvas.height);
  const stream = canvas.captureStream(targetFps);
  const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=h264')
    ? 'video/mp4;codecs=h264'
    : 'video/webm';
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: (parseInt(bitrateSlider?.value) || 1500) * 1000
  });
  const chunks = [];
  let recordedBytes = 0;

  const recordingFinished = new Promise((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (!event.data?.size) return;
      chunks.push(event.data);
      recordedBytes += event.data.size;
      sizeConverted.textContent = formatBytes(recordedBytes);
    };
    recorder.onerror = () => reject(new Error('Text-to-video recording failed.'));
    recorder.onstop = resolve;
  });

  recorder.start(100);
  const startedAt = performance.now();
  const renderLoop = () => {
    if (performance.now() - startedAt >= duration * 1000) {
      if (recorder.state !== 'inactive') recorder.stop();
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    drawTextFrame(ctx, currentTextContent, canvas.width, canvas.height);
    requestAnimationFrame(renderLoop);
  };
  renderLoop();

  try {
    await recordingFinished;
    currentBlob = new Blob(chunks, { type: mimeType });
    currentExtension = mimeType.startsWith('video/mp4') ? '.mp4' : '.webm';
    labelBottom.textContent = currentExtension.toUpperCase();
    if (compareTagLeft) compareTagLeft.textContent = currentExtension.toUpperCase();
    sizeConverted.textContent = formatBytes(currentBlob.size);
    updateConversionStatus('Done');

    const blobUrl = URL.createObjectURL(currentBlob);
    previewBottom.style.backgroundImage = `url('${blobUrl}')`;
    if (compareConverted) compareConverted.style.backgroundImage = `url('${blobUrl}')`;
  } catch (error) {
    updateConversionStatus('Failed');
    alert(error.message);
  }
}

async function processVideo() {
  const processingFile = currentFile;
  if (!processingFile || !processingFile.type.startsWith('video/')) return;

  const targetHeight = parseInt(videoResSelect?.value) || 720;
  const targetFps = parseInt(fpsSlider?.value) || 15;
  const start = Math.max(0, parseInt(trimStart?.value) || 0);
  const end = Math.max(start + 0.1, parseInt(trimEnd?.value) || 30);
  const kbps = parseInt(bitrateSlider?.value) || 1500;
  const cacheKey = `${targetHeight}_${targetFps}_${start}_${end}_${kbps}`;

  // Return cached result immediately if parameters match
  if (videoCache[cacheKey]) {
    currentBlob = videoCache[cacheKey];
    sizeConverted.textContent = formatBytes(currentBlob.size);
    updateConversionStatus('Done');
    const blobUrl = URL.createObjectURL(currentBlob);
    previewBottom.style.backgroundImage = `url('${blobUrl}')`;
    if (compareConverted) compareConverted.style.backgroundImage = `url('${blobUrl}')`;
    return;
  }

  updateConversionStatus('Encoding...');
  sizeConverted.textContent = '0B';

  const video = document.createElement('video');
  const videoUrl = URL.createObjectURL(processingFile);
  video.src = videoUrl;
  video.muted = true;
  video.playsInline = true;

  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Unable to read this video.'));
    });

    const scale = Math.min(1, targetHeight / video.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round((video.videoWidth * scale) / 2) * 2);
    canvas.height = Math.max(2, Math.round((video.videoHeight * scale) / 2) * 2);

    if (!canvas.captureStream || !video.captureStream || !window.MediaRecorder) {
      throw new Error('Video conversion is not supported in this browser.');
    }

    const canvasStream = canvas.captureStream(targetFps);
    const sourceStream = video.captureStream();
    sourceStream.getAudioTracks().forEach(track => canvasStream.addTrack(track));

    const mimeTypes = [
      'video/mp4;codecs=h264,aac',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    const mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'video/webm';

    if (mimeType.startsWith('video/mp4')) {
      currentExtension = '.mp4';
      labelBottom.textContent = '.MP4';
      if (compareTagLeft) compareTagLeft.textContent = '.MP4';
    } else {
      currentExtension = '.webm';
      labelBottom.textContent = '.WEBM';
      if (compareTagLeft) compareTagLeft.textContent = '.WEBM';
    }

    const chunks = [];
    const recorder = new MediaRecorder(canvasStream, {
      mimeType,
      videoBitsPerSecond: kbps * 1000
    });

    let currentRecordedBytes = 0;
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
        currentRecordedBytes += e.data.size;
        sizeConverted.textContent = formatBytes(currentRecordedBytes);
      }
    };

    const recordingFinished = new Promise((resolve) => {
      recorder.onstop = resolve;
    });

    video.currentTime = start;
    await new Promise(r => video.onseeked = r);

    const ctx = canvas.getContext('2d');
    recorder.start(100);
    await video.play();

    const renderLoop = () => {
      if (video.currentTime >= end || video.paused || video.ended) {
        if (recorder.state !== 'inactive') recorder.stop();
        video.pause();
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      requestAnimationFrame(renderLoop);
    };

    renderLoop();
    await recordingFinished;

    currentBlob = new Blob(chunks, { type: mimeType });
    videoCache[cacheKey] = currentBlob;
    sizeConverted.textContent = formatBytes(currentBlob.size);
    updateConversionStatus('Done');

    const blobUrl = URL.createObjectURL(currentBlob);
    previewBottom.style.backgroundImage = `url('${blobUrl}')`;
    if (compareConverted) compareConverted.style.backgroundImage = `url('${blobUrl}')`;
  } catch (err) {
    updateConversionStatus('Failed');
    alert(err.message);
  } finally {
    URL.revokeObjectURL(videoUrl);
  }
}

async function processImage() {
  if (isTextFile(currentFile) && currentFormat === 'video/mp4') {
    convertTextToVideo();
    return;
  }

  if (currentFile?.type.startsWith('video/') && currentFormat === 'video/mp4') {
    processVideo();
    return;
  }

  if (currentFile?.type.startsWith('video/') && currentExtension === '.gif') {
    if (typeof gifshot === 'undefined') {
      alert('GIF library is still loading, please wait a moment!');
      return;
    }

    updateConversionStatus('Generating animated GIF...');
    const videoUrl = URL.createObjectURL(currentFile);
    const startSec = parseInt(trimStart?.value) || 0;
    const endSec = parseInt(trimEnd?.value) || (startSec + 3);
    const targetFps = parseInt(fpsSlider?.value) || 15;
    const targetHeight = parseInt(videoResSelect?.value) || 720;
    const quality = parseInt(qualitySlider?.value) || 100;

    const duration = Math.max(0.5, Math.min(10, endSec - startSec));

    const metadataVideo = document.createElement('video');
    metadataVideo.src = videoUrl;
    metadataVideo.muted = true;
    await new Promise((resolve, reject) => {
      metadataVideo.onloadedmetadata = resolve;
      metadataVideo.onerror = () => reject(new Error('Unable to read this video.'));
    });
    const scale = Math.min(1, targetHeight / metadataVideo.videoHeight);
    const gifWidth = Math.max(2, Math.round(metadataVideo.videoWidth * scale));
    const gifHeight = Math.max(2, Math.round(metadataVideo.videoHeight * scale));
    metadataVideo.removeAttribute('src');
    metadataVideo.load();

    gifshot.createGIF({
      video: [videoUrl],
      offset: startSec,
      numFrames: Math.max(1, Math.round(duration * targetFps)),
      gifWidth,
      gifHeight,
      interval: 1 / targetFps,
      sampleInterval: Math.max(1, Math.round(101 - quality))
    }, function (obj) {
      URL.revokeObjectURL(videoUrl);
      if (!obj.error) {
        fetch(obj.image)
          .then(res => res.blob())
          .then(blob => {
            currentBlob = blob;
            sizeConverted.textContent = formatBytes(blob.size);
            updateConversionStatus('Done');

            const blobUrl = URL.createObjectURL(blob);
            previewBottom.style.backgroundImage = `url('${blobUrl}')`;
            if (compareConverted) compareConverted.style.backgroundImage = `url('${blobUrl}')`;
          });
      } else {
        updateConversionStatus('GIF failed');
        alert('Could not generate animated GIF from this video.');
      }
    });
    return;
  }

  if (currentFile?.type.startsWith('video/') && currentFormat.startsWith('image/')) {
    updateConversionStatus('Extracting frame...');
    const video = document.createElement('video');
    video.src = URL.createObjectURL(currentFile);
    video.muted = true;

    video.onloadedmetadata = () => {
      const startSec = parseInt(trimStart?.value) || 0;
      video.currentTime = Math.min(startSec, Math.max(0, video.duration - 0.1));
    };

    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const quality = parseInt(qualitySlider.value) / 100;
      canvas.toBlob((blob) => {
        if (!blob) return;
        currentBlob = blob;
        sizeConverted.textContent = formatBytes(blob.size);
        updateConversionStatus('Done');

        const blobUrl = URL.createObjectURL(blob);
        previewBottom.style.backgroundImage = `url('${blobUrl}')`;
        if (compareConverted) compareConverted.style.backgroundImage = `url('${blobUrl}')`;
      }, currentFormat, quality);
    };
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
    previewBottom.style.backgroundImage = `url('${blobUrl}')`;
    if (compareConverted) compareConverted.style.backgroundImage = `url('${blobUrl}')`;
  }, currentFormat, quality);
}

downloadBtn?.addEventListener('click', () => {
  if (!currentBlob) {
    alert('Please upload a file first!');
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

searchBar?.addEventListener('input', (e) => {
  const query = e.target.value.trim().toLowerCase();
  formatBtns.forEach(btn => {
    const text = btn.textContent.toLowerCase();
    btn.style.display = text.includes(query) ? 'inline-block' : 'none';
  });
});

function handleIncomingImage(file) {
  if (!file) return;
  currentFile = file;
  currentTextContent = null;
  updateConversionStatus('Ready');

  const dotIdx = file.name ? file.name.lastIndexOf('.') : -1;
  originalName = (file.name && dotIdx !== -1) ? file.name.substring(0, dotIdx) : 'uploaded-file';
  
  const inputExt = (file.name && dotIdx !== -1) 
    ? file.name.substring(dotIdx).toUpperCase() 
    : '.' + (file.type ? file.type.split('/')[1].toUpperCase() : 'FILE');

  labelTop.textContent = isTextFile(file) ? '.TXT' : inputExt;
  if (compareTagRight) compareTagRight.textContent = inputExt;
  sizeOriginal.textContent = formatBytes(file.size);

  originalObjUrl = URL.createObjectURL(file);

  if (isTextFile(file)) {
    const reader = new FileReader();
    reader.onload = () => {
      currentTextContent = String(reader.result || '');
      labelTop.textContent = '.TXT';
      sizeOriginal.textContent = formatBytes(file.size);
      currentBlob = file;
      sizeConverted.textContent = formatBytes(file.size);
      setupVideoDurations(5);
      previewTop.style.backgroundImage = 'none';
      previewBottom.style.backgroundImage = 'none';
      if (compareOriginal) compareOriginal.style.backgroundImage = 'none';
      if (compareConverted) compareConverted.style.backgroundImage = 'none';
      if (currentFormat === 'video/mp4') convertTextToVideo();
    };
    reader.onerror = () => {
      updateConversionStatus('Failed');
      alert('Unable to read the text file.');
    };
    reader.readAsText(file);
  } else if (file.type.startsWith('image/')) {
    const bgStyle = `url('${originalObjUrl}')`;
    previewTop.style.backgroundImage = bgStyle;
    if (compareOriginal) compareOriginal.style.backgroundImage = bgStyle;

    currentImg = new Image();
    currentImg.src = originalObjUrl;
    currentImg.onload = () => processImage();
  } else if (file.type.startsWith('video/')) {
    // Treat original video as output instantly without immediate auto-encoding
    currentBlob = file;
    sizeConverted.textContent = formatBytes(file.size);
    updateConversionStatus('Done');

    const tempVideo = document.createElement('video');
    tempVideo.src = originalObjUrl;
    tempVideo.onloadedmetadata = () => {
      setupVideoDurations(tempVideo.duration);
    };

    previewTop.style.backgroundImage = 'none';
    previewBottom.style.backgroundImage = 'none';
    if (compareOriginal) compareOriginal.style.backgroundImage = 'none';
    if (compareConverted) compareConverted.style.backgroundImage = 'none';
  } else {
    currentImg = null;
    currentBlob = file;
    sizeConverted.textContent = formatBytes(file.size);
    updateConversionStatus('Done');
    previewTop.style.backgroundImage = 'none';
    previewBottom.style.backgroundImage = 'none';
    if (compareOriginal) compareOriginal.style.backgroundImage = 'none';
    if (compareConverted) compareConverted.style.backgroundImage = 'none';
  }
}

pasteBtn?.addEventListener('click', async () => {
  try {
    const clipboardItems = await navigator.clipboard.read();
    for (const item of clipboardItems) {
      const type = item.types.find(t => t.startsWith('image/')) || item.types[0];
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

fileInput?.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleIncomingImage(file);
});