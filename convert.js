// DOM Element Selectors
const uploadBtn = document.getElementById('upload-btn');
const fileInput = document.getElementById('fileInput');
const previewTop = document.getElementById('preview-top');
const previewBottom = document.getElementById('preview-bottom');
const sizeOriginal = document.getElementById('size-original');
const sizeConverted = document.getElementById('size-converted');
const downloadBtn = document.getElementById('download-btn');
const previewBtn = document.getElementById('preview-btn');

// View Switching
const viewFormat = document.getElementById('view-format');
const viewPreview = document.getElementById('view-preview');

// Sliders and Labels
const qualitySlider = document.getElementById('quality-slider');
const effortSlider = document.getElementById('effort-slider');
const qualityVal = document.getElementById('quality-val');
const effortVal = document.getElementById('effort-val');
const qualityGroup = document.getElementById('quality-group');
const effortGroup = document.getElementById('effort-group');

const labelTop = document.getElementById('label-top');
const labelBottom = document.getElementById('label-bottom');
const formatBtns = document.querySelectorAll('.format-btn');

// Comparison Viewer
const compareWrapper = document.getElementById('compare-wrapper');
const compareOriginal = document.getElementById('compare-original');
const compareConverted = document.getElementById('compare-converted');
const compareRange = document.getElementById('compare-range');
const compareTagLeft = document.getElementById('compare-tag-left');
const compareTagRight = document.getElementById('compare-tag-right');

// App State
let currentImg = null;
let currentBlob = null;
let originalName = 'image';
let currentFormat = 'image/webp';
let currentExtension = '.webp';
let originalObjUrl = null;

// Format bytes helper
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + sizes[i];
}

// 1. Interactive Slider Line Movement
compareRange.addEventListener('input', (e) => {
  compareWrapper.style.setProperty('--pos', e.target.value + '%');
});

// 2. PREVIEW Screen Toggle Button
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

// 3. File Upload Trigger
uploadBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const dotIdx = file.name.lastIndexOf('.');
  originalName = dotIdx !== -1 ? file.name.substring(0, dotIdx) : file.name;
  const inputExt = dotIdx !== -1 ? file.name.substring(dotIdx).toUpperCase() : '.IMG';

  labelTop.textContent = inputExt;
  compareTagRight.textContent = inputExt;
  sizeOriginal.textContent = formatBytes(file.size);

  originalObjUrl = URL.createObjectURL(file);
  const bgStyle = `url('${originalObjUrl}')`;
  
  previewTop.style.backgroundImage = bgStyle;
  compareOriginal.style.backgroundImage = bgStyle;

  currentImg = new Image();
  currentImg.src = originalObjUrl;
  currentImg.onload = () => processImage();
});

// 4. Conversion Engine
function processImage() {
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

    const blobUrl = URL.createObjectURL(blob);
    const bgStyle = `url('${blobUrl}')`;

    previewBottom.style.backgroundImage = bgStyle;
    compareConverted.style.backgroundImage = bgStyle;
  }, currentFormat, quality);
}

// 5. Sliders Input Listeners
qualitySlider.addEventListener('input', (e) => {
  qualityVal.textContent = e.target.value + '%';
  processImage();
});

effortSlider.addEventListener('input', (e) => {
  effortVal.textContent = e.target.value;
});

// 7. Download Trigger
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
});

const searchBar = document.querySelector('.search-bar');

searchBar.addEventListener('input', (e) => {
  const query = e.target.value.trim().toLowerCase();

  formatBtns.forEach(btn => {
    const text = btn.textContent.toLowerCase();
    // Check if format button text matches the search term
    if (text.includes(query)) {
      btn.style.display = 'inline-block';
    } else {
      btn.style.display = 'none';
    }
  });
});

const pasteBtn = document.getElementById('paste-btn');

// Shared function to load an image file into the pipeline
function handleIncomingImage(file) {
  if (!file || !file.type.startsWith('image/')) return;

  const dotIdx = file.name ? file.name.lastIndexOf('.') : -1;
  originalName = (file.name && dotIdx !== -1) ? file.name.substring(0, dotIdx) : 'clipboard-image';
  
  const inputExt = (file.name && dotIdx !== -1) 
    ? file.name.substring(dotIdx).toUpperCase() 
    : '.' + file.type.split('/')[1].toUpperCase();

  labelTop.textContent = inputExt;
  compareTagRight.textContent = inputExt;
  sizeOriginal.textContent = formatBytes(file.size);

  originalObjUrl = URL.createObjectURL(file);
  const bgStyle = `url('${originalObjUrl}')`;
  
  previewTop.style.backgroundImage = bgStyle;
  compareOriginal.style.backgroundImage = bgStyle;

  currentImg = new Image();
  currentImg.src = originalObjUrl;
  currentImg.onload = () => processImage();
}

// 1. Click PASTE button to read clipboard directly
pasteBtn.addEventListener('click', async () => {
  try {
    const clipboardItems = await navigator.clipboard.read();
    for (const item of clipboardItems) {
      const imageType = item.types.find(type => type.startsWith('image/'));
      if (imageType) {
        const blob = await item.getType(imageType);
        handleIncomingImage(blob);
        return;
      }
    }
    alert('No image found in clipboard!');
  } catch (err) {
    alert('Clipboard permission denied or unsupported. Use Ctrl+V instead!');
  }
});

// 2. Global Ctrl+V paste support anywhere on the page
window.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      handleIncomingImage(file);
      break;
    }
  }
});

// Update the regular file input change event to use the shared handler:
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleIncomingImage(file);
});