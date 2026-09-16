const experimentalImageFormats = [
  '.SVG', '.APNG', '.JPT', '.PBM', '.PGM', '.PNG00', '.PNG24', '.PNG32', '.PNG48', '.PNG64', '.PNG8',
  '.SF3', '.ANI', '.ICNS', '.APF',
  '.JPEG', '.jxl', '.ico', '.bmp', '.cur', '.hdr', '.jpe', '.mat', '.phm', '.pfm', '.pgn',
  '.pnm', '.ppm', '.tiff', '.jfif', '.eps', '.psd', '.tif', '.a', '.aai', '.ai',
  '.art', '.avs', '.b', '.bgr', '.bgra', '.bgro', '.bmp2', '.bmp3', '.brf', '.cal',
  '.cals', '.cin', '.cip', '.cmyk', '.cmyka', '.dcx', '.dds', '.dpx', '.dxt1', '.dxt5',
  '.epdf', '.epi', '.eps2', '.eps3', '.epsf', '.epsi', '.ept', '.ept2', '.ept3', '.exr',
  '.farbfeld', '.fax', '.ff', '.fit', '.fits', '.fl32', '.fts', '.ftxt', '.g', '.g3',
  '.g4', '.gif87', '.gray', '.graya', '.group4', '.hrz', '.icb', '.icon', '.info', '.ipl',
  '.isobrl', '.isobrl6', '.j2c', '.j2k', '.jng', '.jp2', '.jpc', '.jpm', '.jps', '.map',
  '.miff', '.mng', '.mono', '.mtv', '.o', '.otb', '.pal', '.palm', '.pam', '.pcd', '.pcds',
  '.pcl', '.pct', '.pcx', '.pdb', '.pgx', '.picon', '.pict', '.pjpeg', '.ps', '.ps1', '.ps2',
  '.ps3', '.psb', '.ptif', '.qoi', '.r', '.ras', '.rgb', '.rgba', '.rgbo', '.rgf', '.sgi',
  '.six', '.sixel', '.sparse-color', '.strimg', '.sun', '.svgz', '.tga', '.tiff64', '.ubrl',
  '.ubrl6', '.uil', '.uyvy', '.vda', '.vicar', '.viff', '.vips', '.vst', '.wbmp', '.wpg',
  '.xbm', '.xpm', '.xv', '.ycbcr', '.ycbcra', '.yuv'
];

const videoFormats = [
  '.mp4', '.gif', '.mkv', '.webm', '.avi', '.wmv', '.mov', '.mts', '.ts', '.m2ts', '.mpg', '.mpeg',
  '.flv', '.flx', '.f4v', '.vob', '.m4v', '.3gp', '.3g2', '.mxf', '.ogv', '.h264', '.divx', '.swf', '.amv', '.asf', '.nut',
  '.a64', '.adx', '.argo_asf', '.argo_cvg', '.ast', '.avm2', '.avs2', '.avs3', '.cavsvideo', '.crc', '.dash', '.data', '.daud',
  '.dirac', '.dnxhd', '.dv', '.dvd', '.ffmetadata', '.fifo_test', '.film_cpk', '.filmstrip', '.framecrc', '.framehash',
  '.framemd5', '.g726', '.g726le', '.gxf', '.h261', '.h263', '.hash', '.hds', '.hls', '.image2', '.ircam', '.ismv', '.ivf',
  '.kvag', '.lrc', '.md5', '.mjpg', '.mkvtimestamp_v2', '.mlp', '.mmf', '.mpeg2video', '.mxf_d10', '.null', '.obu', '.psp',
  '.rawvideo', '.rm', '.roq', '.rso', '.rtp', '.rtp_mpegts', '.sap', '.scc', '.segment', '.smjpeg', '.smoothstreaming',
  '.sox', '.spdif', '.stream_segment', '.ssegment', '.streamhash', '.tee', '.truehd', '.uncodedframecrc', '.vc1', '.vc1test',
  '.vcd', '.w64', '.chk', '.wsaud', '.wtv', '.yuv4mpegpipe'
];


const audioFormats = [
  '.mp3', '.aac', '.ac3', '.aif', '.aifc', '.aiff', '.alac', '.alaw', '.alp', '.amr', '.apm', '.aptx', '.aptx_hd',
  '.au', '.bit', '.caf', '.codec2', '.codec2raw', '.dfpwm', '.dts', '.eac3', '.f32be', '.f32le', '.f64be', '.f64le',
  '.flac', '.flo', '.g722', '.gsm', '.latm', '.lbc', '.m4a', '.m4b', '.mid', '.mp2', '.mulaw', '.oga', '.ogg', '.oma',
  '.opus', '.pcm', '.qoa', '.qta', '.s16be', '.s16le', '.s24be', '.s24le', '.s32be', '.s32le', '.s8', '.sbc', '.spx',
  '.tco', '.tta', '.u16be', '.u16le', '.u24be', '.u24le', '.u32be', '.u32le', '.u8', '.vidc', '.voc', '.wav', '.weba',
  '.wma', '.wv'
];


const videoFormatsGrid = document.getElementById('video-formats-grid');

// Keep the format list in one place so newly added FFmpeg-style formats are
// visible without duplicating a huge block of HTML. MP4/GIF stay first.
videoFormats.filter(format => !['.mp4', '.gif'].includes(format)).forEach((format) => {
  const button = document.createElement('button');
  button.className = 'format-btn';
  button.dataset.format = format;
  button.dataset.ext = format;
  button.textContent = format;
  videoFormatsGrid?.appendChild(button);
});

const audioFormatsGrid = document.getElementById('audio-formats-grid');

// Keep MP3 first in HTML, then add the requested audio formats.
audioFormats.filter(format => format !== '.mp3').forEach((format) => {
  const button = document.createElement('button');
  button.className = 'format-btn';
  button.dataset.format = format;
  button.dataset.ext = format;
  button.textContent = format;
  audioFormatsGrid?.appendChild(button);
});

const imageFormatsGrid = document.getElementById('image-formats-grid');

experimentalImageFormats.forEach((format) => {
  const button = document.createElement('button');
  button.className = 'format-btn';
  button.dataset.format = format;
  button.dataset.ext = format;
  button.textContent = format;
  imageFormatsGrid?.appendChild(button);
});

const formatBtns = document.querySelectorAll('.format-btn');

formatBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    formatBtns.forEach(b => b.classList.remove('active'));
    
    const targetBtn = e.currentTarget;
    targetBtn.classList.add('active');

    const ext = targetBtn.textContent.trim().toLowerCase();
    currentExtension = ext;

    labelBottom.textContent = ext.toUpperCase();
    if (compareTagLeft) compareTagLeft.textContent = ext.toUpperCase();

    qualityGroup.classList.add('hidden');
    mp4Controls.classList.add('hidden');
    bitrateControl?.classList.add('hidden');
    if (bitrateControl) bitrateControl.style.display = 'none';

    if (ext === '.svg' || ext === '.apng' || ext === '.jpt' || ext === '.pbm' || ext === '.pgm' || ext === '.png00' || ext === '.png24' || ext === '.png32' || ext === '.png48' || ext === '.png64' || ext === '.png8' || ext === '.sf3' || ext === '.ani' || ext === '.icns' || ext === '.apf') {
      currentFormat = 'image/*';
    } else if (ext === '.jpg') {
      currentFormat = 'image/jpeg';
      qualityGroup.classList.remove('hidden');
      if (qualitySlider) { qualitySlider.value = '80'; }
      if (qualityVal) qualityVal.textContent = '80%';
    } else if (ext === '.webp') {
      currentFormat = 'image/webp';
      qualityGroup.classList.remove('hidden');
      if (qualitySlider) { qualitySlider.value = '80'; }
      if (qualityVal) qualityVal.textContent = '80%';
    } else if (ext === '.mp4' || ext === '.webm') {
      currentFormat = ext === '.mp4' ? 'video/mp4' : 'video/webm';
      mp4Controls.classList.remove('hidden');
      // MP4/WebM output: keep REDUCE SIZE visible. Lower bitrate = smaller file.
      bitrateControl?.classList.remove('hidden');
      if (bitrateControl) bitrateControl.style.display = 'flex';
      refreshVideoResolutionOptions();
      if (fpsSlider) { fpsSlider.max = '60'; fpsSlider.value = String(Math.min(60, parseInt(fpsSlider.value) || 30)); }
      if (fpsVal) fpsVal.textContent = `${fpsSlider?.value || 30} FPS`;
    } else if (audioFormats.includes(ext)) {
      currentFormat = 'audio/*';
      if (ext === '.mp3') currentFormat = 'audio/mp3';
    } else if (ext === '.txt') {
      currentFormat = 'text/plain';
    } else if (ext === '.gif') {
      currentFormat = 'image/gif';
      if (currentFile?.type.startsWith('video/') || currentFile?.type === 'image/gif' || /\.gif$/i.test(currentFile?.name || '')) {
        // GIF → GIF is intentionally configurable: Resolution + FPS reduce the GIF.
        mp4Controls.classList.remove('hidden');
        bitrateControl?.classList.add('hidden');
        if (bitrateControl) bitrateControl.style.display = 'none';
        refreshVideoResolutionOptions();
        if (fpsSlider) { fpsSlider.max = '30'; fpsSlider.value = String(Math.min(30, parseInt(fpsSlider.value) || 15)); }
        if (fpsVal) fpsVal.textContent = `${fpsSlider?.value || 15} FPS`;
      }
    } else if (videoFormats.includes(ext)) {
      currentFormat = 'video/*';
      mp4Controls.classList.remove('hidden');
      if (bitrateControl) bitrateControl.style.display = 'none';
      bitrateControl?.classList.add('hidden');
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