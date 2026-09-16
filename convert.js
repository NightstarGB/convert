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
const qualityVal = document.getElementById('quality-val');
const qualityGroup = document.getElementById('quality-group');

const labelTop = document.getElementById('label-top');
const labelBottom = document.getElementById('label-bottom');

const compareWrapper = document.getElementById('compare-wrapper');
const compareOriginal = document.getElementById('compare-original');
const compareConverted = document.getElementById('compare-converted');
const compareRange = document.getElementById('compare-range');
const compareTagLeft = document.getElementById('compare-tag-left');
const compareTagRight = document.getElementById('compare-tag-right');

const mp4Controls = document.getElementById('mp4-controls');
const bitrateControl = document.getElementById('bitrate-control');
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
let conversionGeneration = 0;
let activeGifJob = null;
let gifSettingsTimer = null;

const magickWasm = window['magick-wasm'];
const imageMagickReady = magickWasm
  ? fetch('https://unpkg.com/@imagemagick/magick-wasm@0.0.43/dist/x86/magick.wasm')
      .then(response => {
        if (!response.ok) throw new Error('Unable to download ImageMagick WebAssembly.');
        return response.arrayBuffer();
      })
      .then(wasmBytes => magickWasm.initializeImageMagick(new Uint8Array(wasmBytes)))
  : Promise.reject(new Error('ImageMagick WebAssembly did not load.'));

function magickFormatForExtension(extension) {
  const formatName = extension
    .replace(/^\./, '')
    .split(/[-_]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
  const format = magickWasm?.MagickFormat?.[formatName];
  if (format === undefined) {
    throw new Error(`ImageMagick does not support output format ${extension}.`);
  }
  return format;
}

function imageMimeType(extension) {
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
    '.svgz': 'image/svg+xml',
    '.tif': 'image/tiff',
    '.tiff': 'image/tiff'
  };
  return mimeTypes[extension] || 'application/octet-stream';
}

function showUnsupportedFormat(format, error) {
  const extension = `.${format.toUpperCase()}`;
  console.warn(`ImageMagick export failed for ${extension}:`, error);
  currentBlob = null;
  if (conversionStatus) {
    conversionStatus.classList.add('error');
    conversionStatus.textContent = `Format ${extension} does not support direct image export.`;
  }
}

function normalizedSelectedFormat() {
  return String(currentExtension || '')
    .replace(/^\.+/, '')
    .trim()
    .toLowerCase();
}

function showConvertedBlob(blob) {
  if (!blob) throw new Error('The conversion produced no output.');

  currentBlob = blob;
  sizeConverted.textContent = formatBytes(blob.size);
  updateConversionStatus('Done');

  const blobUrl = URL.createObjectURL(blob);
  previewBottom.style.backgroundImage = `url('${blobUrl}')`;
  if (compareConverted) compareConverted.style.backgroundImage = `url('${blobUrl}')`;
}

function nativeMimeType(format) {
  return {
    webp: 'image/webp',
    avif: 'image/avif',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    jpe: 'image/jpeg',
    jfif: 'image/jpeg'
  }[format];
}

async function convertImageWithNativeCanvas(format) {
  if (!currentImg) throw new Error('The uploaded image is not ready.');

  const canvas = document.createElement('canvas');
  canvas.width = currentImg.width;
  canvas.height = currentImg.height;
  canvas.getContext('2d').drawImage(currentImg, 0, 0);

  const quality = Math.max(0, Math.min(1, (parseInt(qualitySlider?.value) || 100) / 100));
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error(`The browser cannot encode ${format.toUpperCase()}.`));
    }, nativeMimeType(format), quality);
  });

  showConvertedBlob(blob);
}

async function convertImageWithImageMagick(inputFile = currentFile) {
  const selectedFormat = normalizedSelectedFormat();
  try {
    await imageMagickReady;
    const inputBytes = new Uint8Array(await inputFile.arrayBuffer());
    const outputFormat = magickFormatForExtension(currentExtension);

    const outputBytes = await new Promise((resolve, reject) => {
      try {
        magickWasm.ImageMagick.read(inputBytes, image => {
          try {
            if (['ico', 'cur', 'icon'].includes(selectedFormat)) {
              const scale = Math.min(1, 256 / image.width, 256 / image.height);
              if (scale < 1) {
                image.resize(
                  Math.max(1, Math.round(image.width * scale)),
                  Math.max(1, Math.round(image.height * scale))
                );
              }
            }

            image.write(outputFormat, data => resolve(new Uint8Array(data)));
          } catch (error) {
            reject(error);
          }
        });
      } catch (error) {
        reject(error);
      }
    });

    showConvertedBlob(new Blob([outputBytes], { type: imageMimeType(currentExtension) }));
  } catch (error) {
    showUnsupportedFormat(selectedFormat, error);
  }
}

// Cache encoded video cuts to avoid unnecessary re-encoding
const videoCache = {};
const gifMp4Cache = {};
const gifGifCache = {};
const videoFormatNames = new Set([
  'mp4', 'gif', 'mkv', 'webm', 'avi', 'wmv', 'mov', 'mts', 'ts', 'm2ts', 'mpg', 'mpeg', 'flv', 'flx', 'f4v', 'vob', 'm4v',
  '3gp', '3g2', 'mxf', 'ogv', 'h264', 'divx', 'swf', 'amv', 'asf', 'nut', 'a64', 'adx', 'argo_asf', 'argo_cvg', 'ast',
  'avm2', 'avs2', 'avs3', 'cavsvideo', 'crc', 'dash', 'data', 'daud', 'dirac', 'dnxhd', 'dv', 'dvd', 'ffmetadata',
  'fifo_test', 'film_cpk', 'filmstrip', 'framecrc', 'framehash', 'framemd5', 'g726', 'g726le', 'gxf', 'h261', 'h263', 'hash',
  'hds', 'hls', 'image2', 'ircam', 'ismv', 'ivf', 'kvag', 'lrc', 'md5', 'mjpg', 'mkvtimestamp_v2', 'mlp', 'mmf', 'mpeg2video',
  'mxf_d10', 'null', 'obu', 'psp', 'rawvideo', 'rm', 'roq', 'rso', 'rtp', 'rtp_mpegts', 'sap', 'scc', 'segment', 'smjpeg',
  'smoothstreaming', 'sox', 'spdif', 'stream_segment', 'ssegment', 'streamhash', 'tee', 'truehd', 'uncodedframecrc', 'vc1',
  'vc1test', 'vcd', 'w64', 'chk', 'wsaud', 'wtv', 'yuv4mpegpipe'
]);
const audioFormatNames = new Set([
  'mp3', 'aac', 'ac3', 'aif', 'aifc', 'aiff', 'alac', 'alaw', 'alp', 'amr', 'apm', 'aptx', 'aptx_hd', 'au', 'bit', 'caf',
  'codec2', 'codec2raw', 'dfpwm', 'dts', 'eac3', 'f32be', 'f32le', 'f64be', 'f64le', 'flac', 'flo', 'g722', 'gsm', 'latm',
  'lbc', 'm4a', 'm4b', 'mid', 'mp2', 'mulaw', 'oga', 'ogg', 'oma', 'opus', 'pcm', 'qoa', 'qta', 's16be', 's16le', 's24be',
  's24le', 's32be', 's32le', 's8', 'sbc', 'spx', 'tco', 'tta', 'u16be', 'u16le', 'u24be', 'u24le', 'u32be', 'u32le', 'u8',
  'vidc', 'voc', 'wav', 'weba', 'wma', 'wv'
]);

// FFmpeg.wasm is the fallback encoder for the large list of audio/video
// formats. The existing fast browser-native MP4/WEBM/GIF/MP3 paths stay intact.
let ffmpegInstance = null;
let ffmpegLoading = null;
let ffmpegLogHandler = null;
let ffmpegProgressHandler = null;
let ffmpegClassWorkerURL = null;
let ffmpegLastLogs = [];

async function getFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoading) return ffmpegLoading;

  ffmpegLoading = (async () => {
    updateConversionStatus('Loading FFmpeg engine...');

    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
      import('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js'),
      import('https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.2/dist/esm/index.js')
    ]);

    const ffmpeg = new FFmpeg();
    ffmpegLastLogs = [];
    ffmpegLogHandler = ({ message }) => {
      if (!message) return;
      ffmpegLastLogs.push(String(message));
      if (ffmpegLastLogs.length > 40) ffmpegLastLogs.shift();
      console.debug('[FFmpeg]', message);
    };
    ffmpegProgressHandler = ({ progress }) => {
      if (Number.isFinite(progress)) {
        updateConversionStatus(`FFmpeg encoding... ${Math.max(0, Math.min(100, Math.round(progress * 100)))}%`);
      }
    };
    ffmpeg.on('log', ffmpegLogHandler);
    ffmpeg.on('progress', ffmpegProgressHandler);

    const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.15/dist/umd';
    const ffmpegPackageURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm';

    // FFmpeg 0.12 creates its class worker with `new Worker(new URL(...))`.
    // A CDN worker URL is cross-origin from 127.0.0.1:5500, so Chrome blocks it.
    // Host the worker source as a same-origin-safe Blob instead.
    const workerSource = await fetch(`${ffmpegPackageURL}/worker.js`).then(async response => {
      if (!response.ok) throw new Error(`Unable to download FFmpeg worker (${response.status}).`);
      return response.text();
    });
    const localWorkerSource = workerSource
      .replaceAll('"./const.js"', `"${ffmpegPackageURL}/const.js"`)
      .replaceAll("'./const.js'", `'${ffmpegPackageURL}/const.js'`)
      .replaceAll('"./errors.js"', `"${ffmpegPackageURL}/errors.js"`)
      .replaceAll("'./errors.js'", `'${ffmpegPackageURL}/errors.js'`);
    const classWorkerURL = URL.createObjectURL(
      new Blob([localWorkerSource], { type: 'text/javascript' })
    );

    const [coreURL, wasmURL] = await Promise.all([
      toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm')
    ]);

    try {
      await ffmpeg.load({ coreURL, wasmURL, classWorkerURL });
    } catch (error) {
      URL.revokeObjectURL(classWorkerURL);
      throw error;
    }
    ffmpegClassWorkerURL = classWorkerURL;
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })().catch(error => {
    ffmpegLoading = null;
    ffmpegInstance = null;
    if (ffmpegClassWorkerURL) {
      URL.revokeObjectURL(ffmpegClassWorkerURL);
      ffmpegClassWorkerURL = null;
    }
    throw error;
  });

  return ffmpegLoading;
}

function ffmpegSafeName(name, fallback) {
  const cleaned = String(name || fallback)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, 'file');
  return cleaned || fallback;
}

// FFmpeg has many "formats" that are actually codecs, raw streams, test
// muxers, or aliases. Do not blindly append an extension and hope the muxer
// guesses correctly. These mappings make the common requested formats work
// while still allowing FFmpeg to reject genuinely unsupported formats.
function ffmpegOutputConfig(ext, targetType) {
  const e = String(ext || '').toLowerCase();
  // codecs is an ordered list: FFmpeg.wasm builds differ in which optional
  // encoders are compiled in, so we try the requested/native encoder first
  // and then safe built-in alternatives where the container permits them.
  const cfg = { muxer: null, codecs: [], extra: [], mode: 'normal' };

  if (targetType === 'audio') {
    const map = {
      aac: ['adts', ['aac']], ac3: ['ac3', ['ac3']],
      aif: ['aiff', ['pcm_s16be']], aifc: ['aiff', ['pcm_s16be']], aiff: ['aiff', ['pcm_s16be']],
      alac: ['ipod', ['alac']], alaw: ['alaw', ['pcm_alaw']],
      amr: ['amr', ['libopencore_amrnb', 'amr_nb']],
      aptx: ['aptx', ['aptx']], aptx_hd: ['aptx_hd', ['aptx_hd']],
      au: ['au', ['pcm_s16be']], caf: ['caf', ['pcm_s16le']],
      codec2: ['codec2', ['codec2']], codec2raw: ['codec2raw', ['codec2']],
      dfpwm: ['dfpwm', ['dfpwm']], dts: ['dts', ['dca']], eac3: ['eac3', ['eac3']],
      f32be: ['f32be', ['pcm_f32be']], f32le: ['f32le', ['pcm_f32le']],
      f64be: ['f64be', ['pcm_f64be']], f64le: ['f64le', ['pcm_f64le']],
      flac: ['flac', ['flac']], g722: ['g722', ['g722']], gsm: ['gsm', ['gsm']],
      latm: ['latm', ['aac']], lbc: ['lbc', ['lbc']],
      m4a: ['ipod', ['aac']], m4b: ['ipod', ['aac']],
      mid: ['midi', ['midi']], mp2: ['mp2', ['mp2']], mp3: ['mp3', ['libmp3lame', 'mp3']],
      mulaw: ['mulaw', ['pcm_mulaw']], oga: ['oga', ['vorbis']], ogg: ['ogg', ['libvorbis', 'vorbis']],
      oma: ['oma', ['libmp3lame', 'mp3']], opus: ['opus', ['libopus', 'opus']],
      qoa: ['qoa', ['qoa']], s16be: ['s16be', ['pcm_s16be']], s16le: ['s16le', ['pcm_s16le']],
      s24be: ['s24be', ['pcm_s24be']], s24le: ['s24le', ['pcm_s24le']],
      s32be: ['s32be', ['pcm_s32be']], s32le: ['s32le', ['pcm_s32le']], s8: ['s8', ['pcm_s8']],
      sbc: ['sbc', ['sbc']], spx: ['spx', ['libspeex', 'speex']],
      tta: ['tta', ['tta']], u16be: ['u16be', ['pcm_u16be']], u16le: ['u16le', ['pcm_u16le']],
      u24be: ['u24be', ['pcm_u24be']], u24le: ['u24le', ['pcm_u24le']],
      u32be: ['u32be', ['pcm_u32be']], u32le: ['u32le', ['pcm_u32le']], u8: ['u8', ['pcm_u8']],
      vidc: ['vidc', ['pcm_vidc']], voc: ['voc', ['pcm_s16le']], wav: ['wav', ['pcm_s16le']],
      weba: ['webm', ['libopus', 'opus']], wma: ['asf', ['wmav2', 'wmav1']], wv: ['wv', ['wavpack']]
    };
    if (map[e]) { cfg.muxer = map[e][0]; cfg.codecs = map[e][1]; return cfg; }
    cfg.muxer = e;
    return cfg;
  }

  const videoMap = {
    mkv: ['matroska', ['libx264', 'mpeg4', 'ffv1']], webm: ['webm', ['libvpx-vp9', 'libvpx']],
    avi: ['avi', ['mpeg4', 'msmpeg4v2', 'mjpeg']], wmv: ['asf', ['wmv2', 'wmv1', 'msmpeg4v2']],
    mov: ['mov', ['libx264', 'mpeg4', 'mjpeg']], mts: ['mpegts', ['mpeg2video', 'libx264']],
    ts: ['mpegts', ['mpeg2video', 'libx264']], m2ts: ['mpegts', ['mpeg2video', 'libx264']],
    mpg: ['mpeg', ['mpeg2video', 'mpeg1video']], mpeg: ['mpeg', ['mpeg2video', 'mpeg1video']],
    flv: ['flv', ['flv1', 'mpeg4']], f4v: ['flv', ['libx264', 'mpeg4']],
    vob: ['vob', ['mpeg2video']], m4v: ['mp4', ['mpeg4', 'libx264']],
    '3gp': ['3gp', ['h263', 'mpeg4']], '3g2': ['3g2', ['h263', 'mpeg4']],
    mxf: ['mxf', ['mpeg2video', 'mpeg4']], ogv: ['ogg', ['libtheora']],
    h264: ['h264', ['libx264']], divx: ['avi', ['mpeg4']], swf: ['swf', ['flv1', 'flashsv']],
    amv: ['amv', ['amv']], asf: ['asf', ['wmv2', 'msmpeg4v2']], nut: ['nut', ['mpeg4', 'ffv1']],
    a64: ['a64', ['a64multi', 'a64multi5']], ivf: ['ivf', ['libvpx-vp9', 'libvpx', 'libaom-av1']],
    mjpg: ['avi', ['mjpeg']], mpeg2video: ['mpeg2video', ['mpeg2video']],
    obu: ['obu', ['libaom-av1', 'libsvtav1']], rawvideo: ['rawvideo', ['rawvideo']],
    rm: ['rm', ['rv20', 'rv10']], roq: ['roq', ['roqvideo']], rso: ['rso', ['pcm_s16le']],
    rtp: ['rtp', ['mpeg4', 'mpeg2video']], rtp_mpegts: ['rtp_mpegts', ['mpeg2video', 'mpeg4']],
    smjpeg: ['smjpeg', ['mjpeg']], truehd: ['truehd', ['truehd']], vc1: ['asf', ['vc1']],
    vcd: ['vcd', ['mpeg1video']], w64: ['w64', ['pcm_s16le']], yuv4mpegpipe: ['yuv4mpegpipe', ['rawvideo']],
    dv: ['dv', ['dvvideo']], dirac: ['dirac', ['dirac']], dnxhd: ['mxf', ['dnxhd']],
    h261: ['h261', ['h261']], h263: ['h263', ['h263']], cavsvideo: ['cavsvideo', ['cavsvideo']],
    avs2: ['avs2', ['avs2']], avs3: ['avs3', ['avs3']]
  };
  if (videoMap[e]) { cfg.muxer = videoMap[e][0]; cfg.codecs = videoMap[e][1]; return cfg; }

  // These are valid FFmpeg names but are not ordinary encoded video files.
  // They are handled separately instead of pretending that a normal video
  // encode can create them.
  const analysisFormats = new Set(['crc','framecrc','framehash','framemd5','hash','md5','streamhash','uncodedframecrc','null','tee','ffmetadata']);
  if (analysisFormats.has(e)) { cfg.muxer = e; cfg.mode = 'analysis'; return cfg; }

  cfg.muxer = e;
  return cfg;
}

async function execFFmpeg(ffmpeg, args, label) {
  ffmpegLastLogs = [];
  let code;
  try {
    code = await ffmpeg.exec(args);
  } catch (error) {
    const logs = ffmpegLastLogs.slice(-12).join('\n');
    const detail = logs ? `\n\nFFmpeg: ${logs}` : '';
    throw new Error(`${label} failed.${detail}`);
  }
  if (code !== 0) {
    const logs = ffmpegLastLogs.slice(-12).join('\n');
    throw new Error(`${label} failed (FFmpeg exit code ${code}).${logs ? `\n\nFFmpeg: ${logs}` : ''}`);
  }
}

async function convertWithFFmpeg(targetType) {
  if (!currentFile) return;

  const selectedFormat = normalizedSelectedFormat();
  const ffmpeg = await getFFmpeg();
  const inputName = ffmpegSafeName(currentFile.name, `input.${targetType}`);
  const outputName = `output.${selectedFormat}`;
  const inputBytes = new Uint8Array(await currentFile.arrayBuffer());
  await ffmpeg.writeFile(inputName, inputBytes);
  await ffmpeg.deleteFile(outputName).catch(() => {});

  const isAudioTarget = targetType === 'audio';
  const config = ffmpegOutputConfig(selectedFormat, targetType);
  const specialRaw = new Set(['framecrc','framehash','framemd5','hash','md5','streamhash','uncodedframecrc','null','tee','ffmetadata']);
  const targetHeight = parseInt(videoResSelect?.value) || 720;
  const targetFps = parseInt(fpsSlider?.value) || 15;
  const kbps = parseInt(bitrateSlider?.value) || 1500;

  // Some requested names are FFmpeg analysis/metadata muxers rather than
  // encoded media. Let FFmpeg produce their actual output without video/audio
  // encoding flags that would make them fail.
  const buildArgs = (codec = null, minimal = false) => {
    const args = ['-y', '-i', inputName];
    if (isAudioTarget) {
      args.push('-vn');
      if (codec) args.push('-c:a', codec);
    } else if (!minimal && config.mode !== 'analysis' && !specialRaw.has(selectedFormat)) {
      args.push('-vf', `scale=-2:${targetHeight}`, '-r', String(targetFps));
      if (codec) args.push('-c:v', codec);
      if (codec && codec !== 'rawvideo') args.push('-b:v', `${kbps}k`);
    } else if (codec && config.mode !== 'analysis') {
      args.push('-c:v', codec);
    }
    if (config.muxer) args.push('-f', config.muxer);
    args.push(outputName);
    return args;
  };

  // Try every encoder that could legitimately produce this format. This is
  // important because ffmpeg.wasm builds can omit optional encoders even when
  // desktop FFmpeg supports them. A failed candidate is retried with the next
  // compatible encoder instead of immediately reporting "Could not encode".
  const candidates = [...(config.codecs || []), null];
  let lastError = null;
  updateConversionStatus(`FFmpeg preparing ${selectedFormat.toUpperCase()}...`);

  try {
    for (let i = 0; i < candidates.length; i++) {
      const codec = candidates[i];
      await ffmpeg.deleteFile(outputName).catch(() => {});
      try {
        await execFFmpeg(ffmpeg, buildArgs(codec, false), `Could not encode .${selectedFormat}`);
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    // Final minimal attempt: let the muxer select its own native default
    // codec. This fixes containers such as WMV/ASF, AVI, MOV and MKV on wasm
    // builds whose optional encoders differ from the full desktop build.
    if (lastError) {
      await ffmpeg.deleteFile(outputName).catch(() => {});
      try {
        await execFFmpeg(ffmpeg, buildArgs(null, true), `Could not encode .${selectedFormat}`);
        lastError = null;
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) throw lastError;

    const data = await ffmpeg.readFile(outputName);
    if (!data || !data.length) throw new Error(`FFmpeg produced an empty .${selectedFormat} file.`);

    const mime = isAudioTarget ? 'audio/*' : 'video/*';
    showConvertedBlob(new Blob([data], { type: mime }));
    updateConversionStatus('Done');
  } finally {
    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});
  }
}

function isVideoFile(file) {
  return !!file && (
    file.type?.startsWith('video/') ||
    /\.(mp4|gif|mkv|webm|avi|wmv|mov|mts|ts|m2ts|mpg|mpeg|flv|flx|f4v|vob|m4v|3gp|3g2|mxf|ogv|h264|divx|swf|amv|asf|nut|a64|adx|argo_asf|argo_cvg|ast|avm2|avs2|avs3|cavsvideo|crc|dash|data|daud|dirac|dnxhd|dv|dvd|ffmetadata|fifo_test|film_cpk|filmstrip|framecrc|framehash|framemd5|g726|g726le|gxf|h261|h263|hash|hds|hls|image2|ircam|ismv|ivf|kvag|lrc|md5|mjpg|mkvtimestamp_v2|mlp|mmf|mpeg2video|mxf_d10|null|obu|psp|rawvideo|rm|roq|rso|rtp|rtp_mpegts|sap|scc|segment|smjpeg|smoothstreaming|sox|spdif|stream_segment|ssegment|streamhash|tee|truehd|uncodedframecrc|vc1|vc1test|vcd|w64|chk|wsaud|wtv|yuv4mpegpipe)$/i.test(file.name || '')
  );
}

function isGifFile(file) {
  return !!file && (file.type === 'image/gif' || /\.gif$/i.test(file.name || ''));
}

function isAudioFile(file) {
  return !!file && (
    file.type?.startsWith('audio/') ||
    /\.(aac|ac3|aif|aifc|aiff|alac|alaw|alp|amr|apm|aptx|aptx_hd|au|bit|caf|codec2|codec2raw|dfpwm|dts|eac3|f32be|f32le|f64be|f64le|flac|flo|g722|gsm|latm|lbc|m4a|m4b|mid|mp2|mp3|mulaw|oga|ogg|oma|opus|pcm|qoa|qta|s16be|s16le|s24be|s24le|s32be|s32le|s8|sbc|spx|tco|tta|u16be|u16le|u24be|u24le|u32be|u32le|u8|vidc|voc|wav|weba|wma|wv)$/i.test(file.name || '')
  );
}

function mp4U32(value) {
  const out = new Uint8Array(4);
  const view = new DataView(out.buffer);
  view.setUint32(0, Math.max(0, Math.floor(value)) >>> 0);
  return out;
}

function mp4I16(value) {
  const out = new Uint8Array(2);
  const view = new DataView(out.buffer);
  view.setInt16(0, Math.floor(value));
  return out;
}

function mp4I32(value) {
  const out = new Uint8Array(4);
  const view = new DataView(out.buffer);
  view.setInt32(0, Math.floor(value));
  return out;
}

function mp4U16(value) {
  const out = new Uint8Array(2);
  const view = new DataView(out.buffer);
  view.setUint16(0, Math.max(0, Math.floor(value)) & 0xffff);
  return out;
}

function mp4String(value) {
  return new TextEncoder().encode(value);
}

function mp4Concat(...parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function mp4Box(type, ...payloads) {
  const payload = mp4Concat(...payloads);
  return mp4Concat(mp4U32(8 + payload.length), mp4String(type), payload);
}

function mp4FullBox(type, version, flags, ...payloads) {
  const full = new Uint8Array(4);
  full[0] = version & 0xff;
  full[1] = (flags >>> 16) & 0xff;
  full[2] = (flags >>> 8) & 0xff;
  full[3] = flags & 0xff;
  return mp4Box(type, full, ...payloads);
}

function mp4Fixed1616(value) {
  return mp4U32(Math.round(value * 65536));
}

function mp4Fixed88(value) {
  return mp4U16(Math.round(value * 256));
}

function buildMp4FromAvcChunks(chunks, decoderConfig, width, height, fps) {
  if (!chunks.length) throw new Error('H.264 encoder produced no video frames.');
  if (!decoderConfig?.description) throw new Error('H.264 encoder did not provide codec configuration.');

  const description = decoderConfig.description instanceof Uint8Array
    ? decoderConfig.description
    : new Uint8Array(decoderConfig.description);

  const sampleData = chunks.map(chunk => {
    const data = new Uint8Array(chunk.data.length);
    data.set(chunk.data);
    return data;
  });
  const sampleSizes = sampleData.map(data => data.length);
  const sampleDur = 1;
  const timescale = fps;
  const duration = sampleData.length;

  const ftyp = mp4Box(
    'ftyp',
    mp4String('isom'),
    mp4U32(0x00000200),
    mp4String('isom'),
    mp4String('iso2'),
    mp4String('avc1'),
    mp4String('mp41')
  );

  const mdatPayload = mp4Concat(...sampleData);
  const mdat = mp4Box('mdat', mdatPayload);
  const mdatDataOffset = ftyp.length + 8;

  const mvhd = mp4FullBox(
    'mvhd', 0, 0,
    mp4U32(0), mp4U32(0), mp4U32(1000), mp4U32(Math.round(sampleData.length * 1000 / fps)),
    mp4Fixed1616(1), mp4Fixed88(1), new Uint8Array(10),
    mp4Concat(
      mp4U32(0x00010000), mp4U32(0), mp4U32(0),
      mp4U32(0), mp4U32(0x00010000), mp4U32(0),
      mp4U32(0), mp4U32(0), mp4U32(0x40000000)
    ),
    new Uint8Array(24), mp4U32(2)
  );

  const tkhd = mp4FullBox(
    'tkhd', 0, 0x000007,
    mp4U32(0), mp4U32(0), mp4U32(1), mp4U32(0), mp4U32(Math.round(sampleData.length * 1000 / fps)),
    new Uint8Array(8), mp4U16(0), mp4U16(0), mp4U16(0), mp4U16(0),
    mp4Concat(
      mp4U32(0x00010000), mp4U32(0), mp4U32(0),
      mp4U32(0), mp4U32(0x00010000), mp4U32(0),
      mp4U32(0), mp4U32(0), mp4U32(0x40000000)
    ),
    mp4U32(width << 16), mp4U32(height << 16)
  );

  const mdhd = mp4FullBox(
    'mdhd', 0, 0,
    mp4U32(0), mp4U32(0), mp4U32(timescale), mp4U32(duration),
    mp4U16(0x55c4), mp4U16(0)
  );

  const hdlr = mp4FullBox(
    'hdlr', 0, 0,
    mp4U32(0), mp4String('vide'), new Uint8Array(12), mp4String('NS Image Converter'), new Uint8Array([0])
  );

  const vmhd = mp4FullBox('vmhd', 0, 1, mp4U16(0), mp4U16(0), mp4U16(0), mp4U16(0));
  const dinf = mp4Box(
    'dinf',
    mp4Box('dref', new Uint8Array([0, 0, 0, 0]), mp4U32(1), mp4FullBox('url ', 0, 1))
  );

  const avc1 = mp4Box(
    'avc1',
    new Uint8Array(6), mp4U16(1), mp4U16(0), mp4U16(0), mp4U32(0), mp4U32(0), mp4U32(0),
    mp4U16(width), mp4U16(height), mp4Fixed1616(72), mp4Fixed1616(72),
    mp4U32(0), mp4U16(1),
    new Uint8Array(32), mp4U16(0x0018), mp4I16(-1),
    mp4Box('avcC', description),
    mp4Box('btrt', mp4U32(0), mp4U32(0), mp4U32(Math.max(1, Math.round(sampleSizes.reduce((a, b) => a + b, 0) * 8 / (duration / fps))))),
    mp4Box('pasp', mp4U32(1), mp4U32(1))
  );

  const stsd = mp4FullBox('stsd', 0, 0, mp4U32(1), avc1);
  const stts = mp4FullBox('stts', 0, 0, mp4U32(1), mp4U32(sampleData.length), mp4U32(sampleDur));

  const syncSamples = chunks
    .map((chunk, index) => chunk.type === 'key' ? index + 1 : 0)
    .filter(Boolean);
  const stss = syncSamples.length
    ? mp4FullBox('stss', 0, 0, mp4U32(syncSamples.length), ...syncSamples.map(mp4U32))
    : null;

  const stsc = mp4FullBox('stsc', 0, 0, mp4U32(1), mp4U32(1), mp4U32(1), mp4U32(1));
  const stsz = mp4FullBox('stsz', 0, 0, mp4U32(0), mp4U32(sampleSizes.length), ...sampleSizes.map(mp4U32));
  const stco = mp4FullBox('stco', 0, 0, mp4U32(sampleSizes.length), ...sampleSizes.map((_, index) => {
    let offset = mdatDataOffset;
    for (let i = 0; i < index; i++) offset += sampleSizes[i];
    return mp4U32(offset);
  }));

  const stbl = mp4Box('stbl', stsd, stts, ...(stss ? [stss] : []), stsc, stsz, stco);
  const minf = mp4Box('minf', vmhd, dinf, stbl);
  const mdia = mp4Box('mdia', mdhd, hdlr, minf);
  const trak = mp4Box('trak', tkhd, mdia);
  const moov = mp4Box('moov', mvhd, trak);

  return new Blob([ftyp, mdat, moov], { type: 'video/mp4' });
}

async function convertGifToGif() {
  if (!isGifFile(currentFile)) return;

  const processingFile = currentFile;
  const sourceMaxBytes = Math.max(1, processingFile.size || 1);
  const requestedHeight = parseInt(videoResSelect?.value) || 720;
  const requestedFps = parseInt(fpsSlider?.value) || 15;
  const cacheKey = `${processingFile.size}_${processingFile.lastModified || 0}_${requestedHeight}_${requestedFps}_capped`;

  if (gifGifCache[cacheKey]) {
    currentBlob = gifGifCache[cacheKey];
    currentExtension = '.gif';
    labelBottom.textContent = '.GIF';
    if (compareTagLeft) compareTagLeft.textContent = '.GIF';
    sizeConverted.textContent = formatBytes(currentBlob.size);
    updateConversionStatus('Done');
    return;
  }

  updateConversionStatus('Preparing GIF → GIF...');
  sizeConverted.textContent = '0B';

  try {
    if (typeof ImageDecoder === 'undefined') {
      throw new Error('This browser does not support animated GIF decoding needed for GIF → GIF. Please use the latest Chrome or Edge.');
    }
    if (typeof GIF === 'undefined') {
      throw new Error('GIF encoder is still loading. Please wait a moment and try again.');
    }

    const bytes = new Uint8Array(await processingFile.arrayBuffer());
    const metadataDecoder = new ImageDecoder({ data: bytes, type: 'image/gif' });
    await metadataDecoder.tracks.ready;
    const metadataTrack = metadataDecoder.tracks.selectedTrack;
    if (!metadataTrack || !metadataTrack.frameCount) throw new Error('The GIF contains no decodable frames.');

    const firstDecoded = await metadataDecoder.decode({ frameIndex: 0 });
    const firstImage = firstDecoded.image;
    const sourceWidth = firstImage.displayWidth || firstImage.codedWidth || metadataTrack.displayWidth || metadataTrack.codedWidth;
    const sourceHeight = firstImage.displayHeight || firstImage.codedHeight || metadataTrack.displayHeight || metadataTrack.codedHeight;
    firstImage.close();
    metadataDecoder.close();

    if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth < 1 || sourceHeight < 1) {
      throw new Error('Could not determine the GIF dimensions.');
    }

    // A GIF source must never expose output resolutions larger than the source.
    // This also prevents a 480p GIF from silently being rendered at 1080p/720p.
    refreshVideoResolutionOptions(sourceHeight);
    const maxTargetHeight = Math.min(requestedHeight, sourceHeight);

    // GIF encoding is inherently capable of getting larger than the source.
    // Start with the user's requested settings, then automatically step down
    // quality, FPS and resolution until the result is <= the source size.
    const resolutionSteps = Array.from(new Set([
      maxTargetHeight,
      720, 480, 360, 240, 144
    ].map(h => Math.min(h, sourceHeight))))
      .filter(h => h >= GIF_MIN_HEIGHT)
      .sort((a, b) => b - a);
    if (!resolutionSteps.includes(maxTargetHeight)) resolutionSteps.unshift(maxTargetHeight);

    const fpsSteps = Array.from(new Set([
      requestedFps,
      Math.max(GIF_MIN_FPS, Math.floor(requestedFps * 0.75)),
      Math.max(GIF_MIN_FPS, Math.floor(requestedFps * 0.5)),
      Math.max(GIF_MIN_FPS, Math.floor(requestedFps * 0.33)),
      10, 5, 2, 1
    ])).filter(fps => fps >= GIF_MIN_FPS && fps <= requestedFps);

    // gif.js uses a larger quality number for a more aggressive palette reduction.
    // Try the requested/default palette first, then progressively reduce color detail.
    const qualitySteps = [10, 20, 30];
    const candidates = [];
    const addCandidate = (height, fps, quality) => {
      const key = `${height}x${fps}q${quality}`;
      if (!candidates.some(c => c.key === key)) candidates.push({ key, height, fps, quality });
    };

    // Preserve the user's requested settings for as long as possible.
    addCandidate(maxTargetHeight, requestedFps, 10);
    addCandidate(maxTargetHeight, requestedFps, 20);
    addCandidate(maxTargetHeight, requestedFps, 30);
    for (const fps of fpsSteps.slice(1)) addCandidate(maxTargetHeight, fps, 30);
    for (const height of resolutionSteps.slice(1)) {
      addCandidate(height, requestedFps, 30);
      for (const fps of fpsSteps.slice(1)) addCandidate(height, fps, 30);
    }

    const encodeAttempt = async ({ height: targetHeight, fps: targetFps, quality }) => {
      const decoder = new ImageDecoder({ data: bytes, type: 'image/gif' });
      await decoder.tracks.ready;
      const track = decoder.tracks.selectedTrack;
      if (!track || !track.frameCount) throw new Error('The GIF contains no decodable frames.');

      const scale = Math.min(1, targetHeight / sourceHeight);
      let outputWidth = Math.max(2, Math.round(sourceWidth * scale));
      let outputHeight = Math.max(2, Math.round(sourceHeight * scale));
      if (outputWidth % 2) outputWidth -= 1;
      if (outputHeight % 2) outputHeight -= 1;
      outputWidth = Math.max(2, outputWidth);
      outputHeight = Math.max(2, outputHeight);

      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: false });
      if (!ctx) {
        decoder.close();
        throw new Error('Unable to create the GIF conversion canvas.');
      }

      const encoder = new GIF({
        workers: Math.max(2, Math.min(4, navigator.hardwareConcurrency || 2)),
        quality,
        width: outputWidth,
        height: outputHeight,
        repeat: 0,
        workerScript: 'gif.worker.js'
      });

      let sampleIndex = 0;
      let sampleTime = 0;
      let gifTime = 0;
      const frameDurationFallback = Math.round(1000000 / targetFps);
      const frameStep = 1000000 / targetFps;
      const maxFrames = calculateGifFrameLimit(60 * 60 * 24, targetFps);
      const frameCount = track.frameCount;

      updateConversionStatus(`Extracting GIF frames... 0% • ${outputWidth}×${outputHeight} / ${targetFps} FPS`);

      try {
        for (let frameIndex = 0; frameIndex < frameCount && sampleIndex < maxFrames; frameIndex++) {
          const decoded = await decoder.decode({ frameIndex });
          const image = decoded.image;
          const duration = Math.max(1000, image.duration || frameDurationFallback);
          const frameStart = gifTime;
          const frameEnd = gifTime + duration;

          while (sampleTime < frameEnd && sampleIndex < maxFrames) {
            if (sampleTime >= frameStart) {
              ctx.clearRect(0, 0, outputWidth, outputHeight);
              ctx.drawImage(image, 0, 0, outputWidth, outputHeight);
              encoder.addFrame(ctx, {
                copy: true,
                delay: Math.max(1, Math.round(1000 / targetFps))
              });
              sampleIndex++;
            }
            sampleTime += frameStep;
          }

          gifTime = frameEnd;
          image.close();
          if (frameIndex % Math.max(1, Math.floor(frameCount / 20)) === 0 || frameIndex === frameCount - 1) {
            updateConversionStatus(`Extracting GIF frames... ${Math.round((frameIndex + 1) / frameCount * 100)}% • ${outputWidth}×${outputHeight} / ${targetFps} FPS`);
          }
        }
      } catch (error) {
        decoder.close();
        encoder.abort?.();
        throw error;
      }

      decoder.close();
      if (sampleIndex === 0) {
        encoder.abort?.();
        throw new Error('The GIF contains no usable frames.');
      }

      updateConversionStatus(`Encoding GIF in background... 0% • ${outputWidth}×${outputHeight} / ${targetFps} FPS`);
      const blob = await new Promise((resolve, reject) => {
        // GIF.js can emit progress events out of order (especially with multiple workers).
        // Clamp the displayed value so the UI can never move backwards during an attempt.
        let lastProgress = 0;
        encoder.on('progress', p => {
          const rawProgress = Number(p);
          const progress = Number.isFinite(rawProgress) ? Math.max(0, Math.min(1, rawProgress)) : lastProgress;
          lastProgress = Math.max(lastProgress, progress);
          updateConversionStatus(`Encoding GIF in background... ${Math.round(lastProgress * 100)}% • ${outputWidth}×${outputHeight} / ${targetFps} FPS`);
        });
        encoder.on('finished', resolve);
        encoder.on('abort', () => reject(new Error('GIF encoding was aborted.')));
        encoder.on('error', reject);
        encoder.render();
      });

      if (!blob || !blob.size) throw new Error('GIF → GIF produced an empty file.');
      return blob;
    };

    let bestBlob = null;
    let bestCandidate = null;

    for (const candidate of candidates) {
      updateConversionStatus(`Optimizing GIF size... ${candidate.height}p / ${candidate.fps} FPS`);
      const blob = await encodeAttempt(candidate);
      bestBlob = blob;
      bestCandidate = candidate;

      if (blob.size <= sourceMaxBytes) {
        break;
      }
    }

    if (!bestBlob || !bestBlob.size) throw new Error('GIF → GIF produced an empty file.');

    currentBlob = bestBlob;
    currentExtension = '.gif';
    labelBottom.textContent = '.GIF';
    if (compareTagLeft) compareTagLeft.textContent = '.GIF';
    gifGifCache[cacheKey] = bestBlob;
    sizeConverted.textContent = formatBytes(bestBlob.size);

    if (bestBlob.size <= sourceMaxBytes) {
      const reduced = bestBlob.size < sourceMaxBytes;
      updateConversionStatus(
        `Done • ${formatBytes(sourceMaxBytes)} → ${formatBytes(bestBlob.size)}${reduced ? ' • auto-reduced to stay within source size' : ''}`
      );
    } else {
      // This should only happen for an unusually difficult/long GIF where even
      // the strongest safe settings cannot fit. Never pretend the size cap was met.
      updateConversionStatus(`Done • ${formatBytes(sourceMaxBytes)} → ${formatBytes(bestBlob.size)} • minimum available settings`);
    }

    const blobUrl = URL.createObjectURL(bestBlob);
    previewBottom.style.backgroundImage = `url('${blobUrl}')`;
    if (compareConverted) compareConverted.style.backgroundImage = `url('${blobUrl}')`;
  } catch (error) {
    updateConversionStatus('Failed');
    console.error('GIF → GIF failed:', error);
    alert(error?.message || 'Could not convert GIF to GIF.');
  }
}

async function convertGifToMp4() {
  if (!isGifFile(currentFile)) return;

  const processingFile = currentFile;
  const targetHeight = parseInt(videoResSelect?.value) || 720;
  const targetFps = parseInt(fpsSlider?.value) || 15;
  const kbps = parseInt(bitrateSlider?.value) || 1500;
  const cacheKey = `${processingFile.size}_${processingFile.lastModified || 0}_${targetHeight}_${targetFps}_${kbps}`;

  if (gifMp4Cache[cacheKey]) {
    currentBlob = gifMp4Cache[cacheKey];
    currentExtension = '.mp4';
    labelBottom.textContent = '.MP4';
    if (compareTagLeft) compareTagLeft.textContent = '.MP4';
    sizeConverted.textContent = formatBytes(currentBlob.size);
    updateConversionStatus('Done');
    return;
  }

  updateConversionStatus('Preparing GIF → MP4...');
  sizeConverted.textContent = '0B';

  try {
    if (typeof ImageDecoder === 'undefined') {
      throw new Error('This browser does not support animated GIF decoding needed for GIF → MP4. Please use the latest Chrome or Edge.');
    }
    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
      throw new Error('This browser does not support H.264 WebCodecs needed for GIF → MP4. Please use the latest Chrome or Edge.');
    }

    updateConversionStatus('Loading GIF → MP4 encoder...');
    const bytes = new Uint8Array(await processingFile.arrayBuffer());
    const decoder = new ImageDecoder({ data: bytes, type: 'image/gif' });
    await decoder.tracks.ready;
    const track = decoder.tracks.selectedTrack;
    if (!track || !track.frameCount) throw new Error('The GIF contains no decodable frames.');

    // Some GIFs report 0/undefined dimensions on the track until a frame is decoded.
    // Decode the first frame before calculating the output size so VideoEncoder never
    // receives NaN dimensions.
    const firstDecoded = await decoder.decode({ frameIndex: 0 });
    const firstImage = firstDecoded.image;
    const sourceWidth = firstImage.displayWidth || firstImage.codedWidth || track.displayWidth || track.codedWidth;
    const sourceHeight = firstImage.displayHeight || firstImage.codedHeight || track.displayHeight || track.codedHeight;
    firstImage.close();
    if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth < 1 || sourceHeight < 1) {
      throw new Error('Could not determine the GIF dimensions.');
    }
    const scale = Math.min(1, targetHeight / sourceHeight);
    let outputHeight = Math.max(2, Math.round(sourceHeight * scale));
    let outputWidth = Math.max(2, Math.round(sourceWidth * scale));
    if (outputWidth % 2) outputWidth -= 1;
    if (outputHeight % 2) outputHeight -= 1;

    const codecCandidates = ['avc1.4d0034', 'avc1.42001f'];
    let codec = null;
    for (const candidate of codecCandidates) {
      try {
        const support = await VideoEncoder.isConfigSupported({
          codec: candidate,
          width: outputWidth,
          height: outputHeight,
          bitrate: kbps * 1000,
          framerate: targetFps,
          avc: { format: 'avc' },
          latencyMode: 'realtime'
        });
        if (support.supported) {
          codec = candidate;
          break;
        }
      } catch (_) {}
    }
    if (!codec) throw new Error(`H.264 encoding is not supported at ${outputWidth}×${outputHeight} on this browser/device.`);

    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
    if (!ctx) throw new Error('Unable to create the GIF conversion canvas.');

    const encodedChunks = [];
    let decoderConfig = null;
    let encoderError = null;
    const encoder = new VideoEncoder({
      output(chunk, metadata) {
        if (!decoderConfig && metadata?.decoderConfig) decoderConfig = metadata.decoderConfig;
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        encodedChunks.push({
          type: chunk.type,
          timestamp: chunk.timestamp,
          duration: chunk.duration,
          data
        });
      },
      error(error) {
        encoderError = error;
      }
    });

    encoder.configure({
      codec,
      width: outputWidth,
      height: outputHeight,
      bitrate: kbps * 1000,
      framerate: targetFps,
      latencyMode: 'realtime',
      avc: { format: 'avc' }
    });

    let sampleIndex = 0;
    let sampleTime = 0;
    let gifTime = 0;
    const frameCount = track.frameCount;
    const frameDurationFallback = 100000;

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
      const decoded = await decoder.decode({ frameIndex });
      const image = decoded.image;
      const duration = Math.max(1000, image.duration || frameDurationFallback);
      const frameStart = gifTime;
      const frameEnd = gifTime + duration;

      while (sampleTime < frameEnd && sampleIndex < 1800) {
        if (sampleTime >= frameStart) {
          ctx.clearRect(0, 0, outputWidth, outputHeight);
          ctx.drawImage(image, 0, 0, outputWidth, outputHeight);
          const frame = new VideoFrame(canvas, {
            timestamp: sampleTime,
            duration: Math.round(1000000 / targetFps)
          });
          encoder.encode(frame, { keyFrame: sampleIndex === 0 || sampleIndex % Math.max(1, targetFps * 2) === 0 });
          frame.close();
          sampleIndex++;
          if (encoder.encodeQueueSize > 8) await encoder.flush();
          if (sampleIndex % Math.max(1, Math.floor(Math.max(1, frameCount) / 20)) === 0) {
            updateConversionStatus(`Encoding GIF → MP4... ${Math.round((frameIndex + 1) / frameCount * 100)}%`);
          }
        }
        sampleTime += 1000000 / targetFps;
      }

      gifTime = frameEnd;
      image.close();
      if (sampleIndex >= 1800) break;
    }

    if (sampleIndex === 0) {
      const decoded = await decoder.decode({ frameIndex: 0 });
      const image = decoded.image;
      ctx.drawImage(image, 0, 0, outputWidth, outputHeight);
      const frame = new VideoFrame(canvas, { timestamp: 0, duration: Math.round(1000000 / targetFps) });
      encoder.encode(frame, { keyFrame: true });
      frame.close();
      image.close();
      sampleIndex = 1;
    }

    updateConversionStatus('Encoding GIF → MP4... 100%');
    await encoder.flush();
    encoder.close();
    decoder.close();
    if (encoderError) throw encoderError;

    const blob = buildMp4FromAvcChunks(encodedChunks, decoderConfig, outputWidth, outputHeight, targetFps);
    if (!blob.size) throw new Error('GIF → MP4 produced an empty file.');

    currentBlob = blob;
    currentExtension = '.mp4';
    labelBottom.textContent = '.MP4';
    if (compareTagLeft) compareTagLeft.textContent = '.MP4';
    gifMp4Cache[cacheKey] = blob;
    sizeConverted.textContent = formatBytes(blob.size);
    updateConversionStatus('Done');

    const blobUrl = URL.createObjectURL(blob);
    previewBottom.style.backgroundImage = `url('${blobUrl}')`;
    if (compareConverted) compareConverted.style.backgroundImage = `url('${blobUrl}')`;
  } catch (error) {
    updateConversionStatus('Failed');
    console.error('GIF → MP4 failed:', error);
    alert(error?.message || 'Could not convert GIF to MP4.');
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + sizes[i];
}

function updateConversionStatus(status) {
  if (conversionStatus) {
    conversionStatus.classList.remove('error');
    conversionStatus.textContent = status;
  }
}

const GIF_MAX_BYTES = 8 * 1024 * 1024;
const GIF_MIN_HEIGHT = 144;
const GIF_MIN_FPS = 1;

// GIF frame count is determined ONLY by video duration × selected FPS.
// Resolution must never silently change the requested frame count.
function calculateGifFrameLimit(duration, targetFps) {
  const requestedFrames = Math.floor(duration * targetFps);
  return Math.max(1, Math.min(1800, requestedFrames));
}

function refreshGifFrameLimit(restart = false) {
  if (!isVideoFile(currentFile) || normalizedSelectedFormat() !== 'gif') return;

  const duration = Math.max(
    0.5,
    (parseInt(trimEnd?.value) || 30) - (parseInt(trimStart?.value) || 0)
  );
  const targetHeight = parseInt(videoResSelect?.value) || 720;
  const targetFps = parseInt(fpsSlider?.value) || 15;
  const frameLimit = calculateGifFrameLimit(duration, targetFps);
  if (activeGifJob && !restart) {
    updateConversionStatus(`Extracting GIF frames... 0/${frameLimit}`);
  }
  return frameLimit;
}

function scheduleGifSettingsUpdate() {
  refreshGifFrameLimit();
  clearTimeout(gifSettingsTimer);
  gifSettingsTimer = setTimeout(() => processImage(), 150);
}

function updateTrimDisplay() {
  const startSec = parseInt(trimStart?.value) || 0;
  const endSec = parseInt(trimEnd?.value) || 0;
  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  if (trimVal) trimVal.textContent = `${formatTime(startSec)} - ${formatTime(endSec)}`;
}

function refreshVideoResolutionOptions(sourceHeight = null) {
  if (!videoResSelect) return;

  const height = Number(sourceHeight) || Number(videoResSelect.dataset.sourceHeight) || 0;
  videoResSelect.dataset.sourceHeight = height ? String(height) : '';

  Array.from(videoResSelect.options).forEach(option => {
    const optionHeight = parseInt(option.value, 10);
    option.hidden = !!height && optionHeight > height;
  });

  const selected = videoResSelect.selectedOptions[0];
  if (selected?.hidden) {
    const available = Array.from(videoResSelect.options).find(option => !option.hidden);
    if (available) {
      videoResSelect.value = available.value;
      videoResSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
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
  scheduleGifSettingsUpdate();
});
trimStart?.addEventListener('change', scheduleGifSettingsUpdate);

trimEnd?.addEventListener('input', () => {
  if (parseInt(trimEnd.value) <= parseInt(trimStart.value)) {
    trimEnd.value = parseInt(trimStart.value) + 1;
  }
  updateTrimDisplay();
  scheduleGifSettingsUpdate();
});
trimEnd?.addEventListener('change', scheduleGifSettingsUpdate);

bitrateSlider?.addEventListener('input', (e) => {
  const kbps = e.target.value;
  if (bitrateVal) {
    bitrateVal.textContent = kbps > 2000 ? `High (${(kbps / 1000).toFixed(1)} Mbps)` : `Low (${kbps} kbps)`;
  }
});
bitrateSlider?.addEventListener('change', processImage);
videoResSelect?.addEventListener('change', scheduleGifSettingsUpdate);

fpsSlider?.addEventListener('input', (e) => {
  if (fpsVal) fpsVal.textContent = `${e.target.value} FPS`;
  scheduleGifSettingsUpdate();
});
fpsSlider?.addEventListener('change', scheduleGifSettingsUpdate);

qualitySlider?.addEventListener('input', (e) => {
  if (qualityVal) qualityVal.textContent = e.target.value + '%';
  if (isVideoFile(currentFile)) return;
  processImage();
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
  if (!isVideoFile(processingFile)) return;

  const targetHeight = parseInt(videoResSelect?.value) || 720;
  const targetFps = parseInt(fpsSlider?.value) || 15;
  const start = 0;
  const kbps = parseInt(bitrateSlider?.value) || 1500;
  const cacheKey = `${processingFile.name}_${processingFile.size}_${processingFile.lastModified || 0}_${normalizedSelectedFormat()}_${targetHeight}_${targetFps}_${kbps}`;

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

    const selectedVideoTarget = normalizedSelectedFormat();
    const mimeTypes = selectedVideoTarget === 'webm'
      ? [
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm'
        ]
      : [
          'video/mp4;codecs=h264,aac',
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm'
        ];
    const mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) {
      throw new Error(`${selectedVideoTarget.toUpperCase()} encoding is not supported by this browser.`);
    }

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

    const end = video.duration;
    const ctx = canvas.getContext('2d');
    recorder.start(100);
    const sizeStartedAt = performance.now();
    const sizeTicker = setInterval(() => {
      const elapsed = (performance.now() - sizeStartedAt) / 1000;
      sizeConverted.textContent = formatBytes(Math.max(0, elapsed * kbps * 1000 / 8));
    }, 120);
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
    clearInterval(sizeTicker);

    currentBlob = new Blob(chunks, { type: mimeType });
    videoCache[cacheKey] = currentBlob;
    sizeConverted.textContent = formatBytes(currentBlob.size);
    updateConversionStatus('Done');

    const blobUrl = URL.createObjectURL(currentBlob);
    previewBottom.style.backgroundImage = `url('${blobUrl}')`;
    if (compareConverted) compareConverted.style.backgroundImage = `url('${blobUrl}')`;
  } catch (err) {
    updateConversionStatus('Failed');
    const sourceExt = String(processingFile.name || '').split('.').pop()?.toUpperCase() || 'VIDEO';
    const message = /Unable to read this video/i.test(err.message || '')
      ? `${sourceExt} input cannot be decoded by this browser's native video decoder. MP4/WEBM/GIF export is available when the browser can decode the source.`
      : err.message;
    alert(message);
  } finally {
    URL.revokeObjectURL(videoUrl);
  }
}


async function convertVideoToMp3() {
  const processingFile = currentFile;
  if (!processingFile) return;
  if (typeof lamejs === 'undefined') {
    throw new Error('MP3 encoder is still loading, please wait a moment.');
  }

  updateConversionStatus('Decoding audio from MP4...');
  sizeConverted.textContent = '0B';

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error('Audio decoding is not supported in this browser.');
  }

  const audioContext = new AudioContextClass();
  try {
    const arrayBuffer = await processingFile.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const channels = Math.min(2, Math.max(1, audioBuffer.numberOfChannels));
    const sampleRate = audioBuffer.sampleRate;
    const bitrate = 128;
    const encoder = new lamejs.Mp3Encoder(channels, sampleRate, bitrate);
    const samplesPerChunk = 1152;
    const totalSamples = audioBuffer.length;
    const left = audioBuffer.getChannelData(0);
    const right = channels === 2 ? audioBuffer.getChannelData(1) : null;
    const mp3Chunks = [];

    const floatToInt16 = (value) => {
      const clamped = Math.max(-1, Math.min(1, value));
      return clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
    };

    for (let offset = 0; offset < totalSamples; offset += samplesPerChunk) {
      const end = Math.min(offset + samplesPerChunk, totalSamples);
      const leftSamples = new Int16Array(end - offset);
      for (let i = offset; i < end; i += 1) {
        leftSamples[i - offset] = floatToInt16(left[i]);
      }

      let encoded;
      if (channels === 2) {
        const rightSamples = new Int16Array(end - offset);
        for (let i = offset; i < end; i += 1) {
          rightSamples[i - offset] = floatToInt16(right[i]);
        }
        encoded = encoder.encodeBuffer(leftSamples, rightSamples);
      } else {
        encoded = encoder.encodeBuffer(leftSamples);
      }

      if (encoded.length > 0) mp3Chunks.push(new Int8Array(encoded));
      sizeConverted.textContent = formatBytes(mp3Chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
      updateConversionStatus(`Encoding MP3... ${Math.round((end / totalSamples) * 100)}%`);
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    const flushed = encoder.flush();
    if (flushed.length > 0) mp3Chunks.push(new Int8Array(flushed));

    const blob = new Blob(mp3Chunks, { type: 'audio/mpeg' });
    if (!blob.size) throw new Error('MP4 → MP3 produced an empty file.');

    currentBlob = blob;
    currentExtension = '.mp3';
    labelBottom.textContent = '.MP3';
    if (compareTagLeft) compareTagLeft.textContent = '.MP3';
    sizeConverted.textContent = formatBytes(blob.size);
    updateConversionStatus('Done');

    const blobUrl = URL.createObjectURL(blob);
    previewBottom.style.backgroundImage = 'none';
    if (compareConverted) compareConverted.style.backgroundImage = `url('${blobUrl}')`;
  } finally {
    await audioContext.close().catch(() => {});
  }
}

async function processImage() {
  const jobGeneration = conversionGeneration;
  const selectedFormat = normalizedSelectedFormat();
  currentExtension = `.${selectedFormat}`;

  // REDUCE SIZE is an MP4 bitrate control only. Its visibility is based on the OUTPUT format,
  // so MP4 → GIF and GIF → GIF never show the bitrate control.
  const isMp4Target = ['mp4', 'webm'].includes(selectedFormat) && (isVideoFile(currentFile) || isTextFile(currentFile));
  const bitrateControl = document.getElementById('bitrate-control');
  if (bitrateControl) {
    const showBitrate = isMp4Target;
    bitrateControl.classList.toggle('hidden', !showBitrate);
    bitrateControl.style.display = showBitrate ? '' : 'none';
  }

  if (selectedFormat === 'mp3' && (isVideoFile(currentFile) || isAudioFile(currentFile))) {
    try {
      await convertVideoToMp3();
    } catch (error) {
      updateConversionStatus('Failed');
      alert(error.message || 'Could not convert the source to MP3.');
    }
    return;
  }

  if (selectedFormat !== 'gif' && activeGifJob) {
    activeGifJob.cancel?.();
    activeGifJob.encoder?.abort?.();
    activeGifJob = null;
  }

  if (isTextFile(currentFile) && currentFormat === 'video/mp4') {
    convertTextToVideo();
    return;
  }

  if (isVideoFile(currentFile) && (currentFormat === 'video/mp4' || currentFormat === 'video/webm')) {
    processVideo();
    return;
  }

  // GIF → GIF is a real re-encode so Resolution + FPS can reduce the source.
  if (selectedFormat === 'gif' && isGifFile(currentFile)) {
    if (bitrateControl) bitrateControl.classList.add('hidden');
    if (mp4Controls) mp4Controls.classList.remove('hidden');
    convertGifToGif();
    return;
  }

  // Animated GIF → MP4 uses browser-side WebCodecs.
  // Keep this isolated so existing image/GIF/MP4 paths are untouched.
  if (selectedFormat === 'mp4' && isGifFile(currentFile)) {
    convertGifToMp4();
    return;
  }

  if (isVideoFile(currentFile) && selectedFormat === 'gif') {
    if (typeof GIF === 'undefined') {
      alert('GIF worker library is still loading, please wait a moment!');
      return;
    }

    updateConversionStatus('Preparing GIF...');
    activeGifJob?.cancel?.();
    activeGifJob?.encoder?.abort?.();
    const gifJob = { cancel: null, encoder: null };
    activeGifJob = gifJob;
    const videoUrl = URL.createObjectURL(currentFile);
    const startSec = 0;
    const requestedFps = parseInt(fpsSlider?.value) || 15;
    const requestedHeight = parseInt(videoResSelect?.value) || 720;

    // Keep the selected FPS exact. Resolution must not silently lower FPS or
    // change the number of frames; the only frame-count cap is 1800 frames.
    const effectiveFps = requestedFps;

    const metadataVideo = document.createElement('video');
    metadataVideo.src = videoUrl;
    metadataVideo.muted = true;
    metadataVideo.playsInline = true;

    try {
      await new Promise((resolve, reject) => {
        metadataVideo.onloadedmetadata = resolve;
        metadataVideo.onerror = () => reject(new Error('Unable to read this video.'));
      });

      const duration = Math.max(0.5, metadataVideo.duration);
      const scaleForRequestedHeight = Math.min(1, requestedHeight / metadataVideo.videoHeight);
      const requestedWidth = Math.max(2, Math.round(metadataVideo.videoWidth * scaleForRequestedHeight));
      const requestedOutHeight = Math.max(2, Math.round(metadataVideo.videoHeight * scaleForRequestedHeight));
      const frameCount = calculateGifFrameLimit(duration, effectiveFps);
      const frameCanvas = document.createElement('canvas');
      frameCanvas.width = requestedWidth;
      frameCanvas.height = requestedOutHeight;
      const frameContext = frameCanvas.getContext('2d', { willReadFrequently: false });
      const frames = [];

      if (effectiveFps !== requestedFps) {
        updateConversionStatus(`Optimizing for live UI... ${requestedWidth}×${requestedOutHeight} / ${effectiveFps} FPS`);
      } else {
        updateConversionStatus(`Extracting GIF frames... 0/${frameCount}`);
      }

      const seekTo = (time) => new Promise((resolve, reject) => {
        if (jobGeneration !== conversionGeneration) {
          reject(new DOMException('GIF conversion cancelled.', 'AbortError'));
          return;
        }
        const cleanup = () => {
          if (gifJob.cancel === cancel) gifJob.cancel = null;
          metadataVideo.removeEventListener('seeked', onSeeked);
          metadataVideo.removeEventListener('error', onError);
        };
        const onSeeked = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); reject(new Error('Unable to seek video while generating GIF.')); };
        const cancel = () => { cleanup(); reject(new DOMException('GIF conversion cancelled.', 'AbortError')); };
        gifJob.cancel = cancel;
        metadataVideo.addEventListener('seeked', onSeeked, { once: true });
        metadataVideo.addEventListener('error', onError, { once: true });
        metadataVideo.currentTime = Math.min(time, Math.max(0, metadataVideo.duration - 0.001));
      });

      for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
        await seekTo(startSec + frameIndex / effectiveFps);
        if (jobGeneration !== conversionGeneration) throw new DOMException('GIF conversion cancelled.', 'AbortError');
        frameContext.clearRect(0, 0, frameCanvas.width, frameCanvas.height);
        frameContext.drawImage(metadataVideo, 0, 0, frameCanvas.width, frameCanvas.height);
        // Copy the pixels now; the encoder will process them in Web Workers later.
        frames.push(new ImageData(frameContext.getImageData(0, 0, frameCanvas.width, frameCanvas.height).data, frameCanvas.width, frameCanvas.height));
        updateConversionStatus(`Extracting GIF frames... ${frameIndex + 1}/${frameCount}`);
        // Yield to the browser so scrolling/clicks/paint remain responsive.
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      if (jobGeneration !== conversionGeneration) throw new DOMException('GIF conversion cancelled.', 'AbortError');

      updateConversionStatus(`Encoding GIF in background... 0%`);
      const workerCount = Math.max(1, Math.min(2, (navigator.hardwareConcurrency || 2) - 1));
      const encoder = new GIF({
        workers: workerCount,
        quality: 10,
        width: frameCanvas.width,
        height: frameCanvas.height,
        repeat: 0,
        workerScript: 'gif.worker.js'
      });
      gifJob.encoder = encoder;

      const finished = new Promise((resolve, reject) => {
        encoder.on('progress', (progress) => {
          if (jobGeneration !== conversionGeneration) return;
          updateConversionStatus(`Encoding GIF in background... ${Math.round(progress * 100)}%`);
        });
        encoder.on('finished', resolve);
        encoder.on('abort', () => reject(new DOMException('GIF conversion cancelled.', 'AbortError')));
      });

      for (const frame of frames) {
        encoder.addFrame(frame, { delay: 1000 / effectiveFps });
      }
      frames.length = 0;
      encoder.render();

      const blob = await finished;
      if (jobGeneration === conversionGeneration) {
        showConvertedBlob(blob);
        if (effectiveFps !== requestedFps) {
          updateConversionStatus(`Done • ${frameCanvas.width}×${frameCanvas.height} / ${effectiveFps} FPS (memory-safe)`);
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError' && jobGeneration === conversionGeneration) {
        updateConversionStatus('GIF failed');
        alert(error.message || 'Could not generate animated GIF from this video.');
      }
    } finally {
      gifJob.cancel = null;
      gifJob.encoder = null;
      if (activeGifJob === gifJob) activeGifJob = null;
      URL.revokeObjectURL(videoUrl);
    }
    return;
  }

  // All requested audio outputs use the FFmpeg.wasm fallback. This prevents
  // audio formats such as AAC/AC3/IRCAM/FLAC/etc. from falling through to
  // ImageMagick or being mislabeled as unsupported video.
  if (audioFormatNames.has(selectedFormat) && selectedFormat !== 'mp3') {
    try {
      await convertWithFFmpeg('audio');
    } catch (error) {
      currentBlob = null;
      updateConversionStatus(`.${selectedFormat.toUpperCase()} conversion failed`);
      alert(error.message || `Could not encode .${selectedFormat}.`);
    }
    return;
  }

  // All remaining video formats use FFmpeg.wasm. MP4/WEBM/GIF keep their
  // existing optimized browser-native paths above. This fixes errors such as
  // "Format .OBU does not support direct image export".
  if (videoFormatNames.has(selectedFormat) && !['mp4', 'webm', 'gif'].includes(selectedFormat)) {
    try {
      await convertWithFFmpeg('video');
    } catch (error) {
      currentBlob = null;
      updateConversionStatus(`.${selectedFormat.toUpperCase()} conversion failed`);
      alert(error.message || `Could not encode .${selectedFormat}.`);
    }
    return;
  }

  if (isVideoFile(currentFile) && currentFormat.startsWith('image/')) {
    updateConversionStatus('Extracting frame...');
    const video = document.createElement('video');
    video.src = URL.createObjectURL(currentFile);
    video.muted = true;

    video.onloadedmetadata = () => {
      const startSec = parseInt(trimStart?.value) || 0;
      video.currentTime = Math.min(startSec, Math.max(0, video.duration - 0.1));
    };

    video.onseeked = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      try {
        const nativeFormats = new Set(['webp', 'avif', 'png', 'jpg', 'jpeg', 'jpe', 'jfif']);
        if (nativeFormats.has(selectedFormat)) {
          const quality = Math.max(0, Math.min(1, (parseInt(qualitySlider?.value) || 100) / 100));
          const outputBlob = await new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
              if (blob) resolve(blob);
              else reject(new Error(`The browser cannot encode ${selectedFormat.toUpperCase()}.`));
            }, nativeMimeType(selectedFormat), quality);
          });
          showConvertedBlob(outputBlob);
        } else {
          const frameBlob = await new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
              if (blob) resolve(blob);
              else reject(new Error('Unable to capture a video frame.'));
            }, 'image/png');
          });
          await convertImageWithImageMagick(frameBlob);
        }
      } catch (error) {
        updateConversionStatus('Failed');
        alert(error.message || 'Image conversion failed.');
      }
    };
    return;
  }

  if (!currentFile) return;

  updateConversionStatus('Encoding...');
  sizeConverted.textContent = '0B';
  try {
    const nativeFormats = new Set(['webp', 'avif', 'png', 'jpg', 'jpeg', 'jpe', 'jfif']);
    if (nativeFormats.has(selectedFormat)) {
      await convertImageWithNativeCanvas(selectedFormat);
    } else {
      await convertImageWithImageMagick();
    }
  } catch (error) {
    updateConversionStatus('Failed');
    alert(error.message || 'ImageMagick conversion failed.');
  }
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
  document.querySelectorAll('.format-btn').forEach(btn => {
    const text = btn.textContent.toLowerCase();
    btn.style.display = text.includes(query) ? 'inline-block' : 'none';
  });
});

function handleIncomingImage(file) {
  if (!file) return;
  conversionGeneration += 1;
  clearTimeout(gifSettingsTimer);
  activeGifJob?.cancel?.();
  activeGifJob?.encoder?.abort?.();
  activeGifJob = null;
  currentFile = file;
  currentBlob = null;

  // Keep video controls tied to the selected output. GIF never uses bitrate; MP4 does.
  const selectedOutput = normalizedSelectedFormat();
  mp4Controls?.classList.toggle('hidden', !['gif', 'mp4'].includes(selectedOutput));
  const showBitrate = selectedOutput === 'mp4';
  bitrateControl?.classList.toggle('hidden', !showBitrate);
  if (bitrateControl) bitrateControl.style.display = showBitrate ? '' : 'none';
  if (['gif', 'mp4'].includes(selectedOutput)) refreshVideoResolutionOptions();
  currentTextContent = null;
  updateConversionStatus('Ready');
  sizeConverted.textContent = '0B';

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
  } else if (file.type.startsWith('image/') || /\.(gif|png|jpe?g|webp|avif|bmp|tiff?)$/i.test(file.name || '')) {
    const bgStyle = `url('${originalObjUrl}')`;
    previewTop.style.backgroundImage = bgStyle;
    if (compareOriginal) compareOriginal.style.backgroundImage = bgStyle;

    currentImg = new Image();
    currentImg.src = originalObjUrl;
    currentImg.onload = () => {
      if (isGifFile(file) && ['gif', 'mp4'].includes(normalizedSelectedFormat())) {
        refreshVideoResolutionOptions(currentImg.naturalHeight || currentImg.height);
      }
      processImage();
    };
  } else if (isVideoFile(file)) {
    // Treat original video as output instantly without immediate auto-encoding
    currentBlob = file;
    sizeConverted.textContent = formatBytes(file.size);
    updateConversionStatus('Done');

    const tempVideo = document.createElement('video');
    tempVideo.src = originalObjUrl;
    tempVideo.onloadedmetadata = () => {
      setupVideoDurations(tempVideo.duration);
      refreshVideoResolutionOptions(tempVideo.videoHeight);
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