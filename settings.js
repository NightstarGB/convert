formatBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    formatBtns.forEach(b => b.classList.remove('active'));
    
    const targetBtn = e.currentTarget;
    targetBtn.classList.add('active');

    const ext = targetBtn.textContent.trim().toLowerCase();
    currentExtension = ext;
    
    labelBottom.textContent = ext.toUpperCase();
    if (compareTagLeft) {
      compareTagLeft.textContent = ext.toUpperCase();
    }

    if (ext === '.jpg') {
      currentFormat = 'image/jpeg';
      qualityGroup.classList.remove('hidden');
      effortGroup.classList.add('hidden');
    } else if (ext === '.webp') {
      currentFormat = 'image/webp';
      qualityGroup.classList.remove('hidden');
      effortGroup.classList.remove('hidden');
    } else if (ext === '.gif') {
      currentFormat = 'image/gif';
      qualityGroup.classList.add('hidden');
      effortGroup.classList.add('hidden');
    } else if (ext === '.tiff') {
      currentFormat = 'image/tiff';
      qualityGroup.classList.add('hidden');
      effortGroup.classList.add('hidden');
    } else if (ext === '.psd') {

    currentFormat = 'image/vnd.adobe.photoshop';
      qualityGroup.classList.add('hidden');
      effortGroup.classList.add('hidden');
    } else {

      currentFormat = ext === '.png' ? 'image/png' : 'image/avif';
      qualityGroup.classList.add('hidden');
      effortGroup.classList.add('hidden');
    }

    processImage();
  });
});