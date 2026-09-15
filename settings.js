formatBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    formatBtns.forEach(b => b.classList.remove('active'));
    
    const targetBtn = e.currentTarget;
    targetBtn.classList.add('active');

    const ext = targetBtn.textContent.trim().toLowerCase();
    currentExtension = ext;

    labelBottom.textContent = ext.toUpperCase();
    if (compareTagLeft) compareTagLeft.textContent = ext.toUpperCase();

    // Default visibility resets
    qualityGroup.classList.add('hidden');
    effortGroup.classList.add('hidden');
    mp4Controls.classList.add('hidden');

    if (ext === '.jpg') {
      currentFormat = 'image/jpeg';
      qualityGroup.classList.remove('hidden');
    } else if (ext === '.webp') {
      currentFormat = 'image/webp';
      qualityGroup.classList.remove('hidden');
      effortGroup.classList.remove('hidden');
    } else if (ext === '.mp4') {
      currentFormat = 'video/mp4';
      mp4Controls.classList.remove('hidden'); // Reveal Video Settings
    } else if (ext === '.mp3') {
      currentFormat = 'audio/mp3';
    } else if (ext === '.txt') {
      currentFormat = 'text/plain';
    } else if (ext === '.gif') {
      currentFormat = 'image/gif';
    } else if (ext === '.tiff') {
      currentFormat = 'image/tiff';
    } else if (ext === '.psd') {
      currentFormat = 'image/vnd.adobe.photoshop';
    } else {
      currentFormat = 'image/png';
    }

    processImage();
  });
});