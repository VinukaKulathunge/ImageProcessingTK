// histogram.js - Live RGB & Luminance Histogram Panel

let histCanvas = null;
let histCtx = null;

/**
 * Initializes the histogram module with a canvas reference.
 */
export function initHistogram(canvasElement) {
  histCanvas = canvasElement;
  histCtx = histCanvas.getContext('2d');
}

/**
 * Calculates RGB values and plots them onto the visual overlay.
 * Employs pixel downsampling to ensure smooth performance when adjusting sliders.
 */
export function updateHistogram(sourceCanvas) {
  if (!histCanvas || !histCtx || !sourceCanvas) return;

  const srcCtx = sourceCanvas.getContext('2d');
  if (!srcCtx) return;

  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  if (width === 0 || height === 0) return;

  let imgData;
  try {
    imgData = srcCtx.getImageData(0, 0, width, height);
  } catch (e) {
    console.warn("Unable to extract canvas image data for histogram render.", e);
    return;
  }

  const data = imgData.data;
  const len = data.length;

  const rHist = new Uint32Array(256);
  const gHist = new Uint32Array(256);
  const bHist = new Uint32Array(256);
  const lHist = new Uint32Array(256);

  // Dynamic step downsampling: We target roughly ~40,000 samples for sub-millisecond speeds
  const totalPixels = len / 4;
  const targetSamples = 40000;
  const step = totalPixels > targetSamples ? Math.ceil(totalPixels / targetSamples) * 4 : 4;

  for (let i = 0; i < len; i += step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Rec. 709 high-performance luminance conversion formula
    const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) | 0;

    rHist[r]++;
    gHist[g]++;
    bHist[b]++;
    lHist[l]++;
  }

  const w = histCanvas.width;
  const h = histCanvas.height;
  histCtx.clearRect(0, 0, w, h);

  // Find max frequency for proportional height calculations
  let maxFreq = 0;
  for (let i = 0; i < 256; i++) {
    if (rHist[i] > maxFreq) maxFreq = rHist[i];
    if (gHist[i] > maxFreq) maxFreq = gHist[i];
    if (bHist[i] > maxFreq) maxFreq = bHist[i];
    if (lHist[i] > maxFreq) maxFreq = lHist[i];
  }
  
  if (maxFreq === 0) maxFreq = 1;

  // Draws one color layer of the histogram
  function drawChannel(hist, fillStyle, strokeStyle) {
    histCtx.beginPath();
    histCtx.moveTo(0, h);

    for (let x = 0; x < 256; x++) {
      const cx = (x / 255) * w;
      const cy = h - (hist[x] / maxFreq) * h * 0.85; // Leave 15% top gutter for clean look
      histCtx.lineTo(cx, cy);
    }

    histCtx.lineTo(w, h);
    histCtx.closePath();
    
    histCtx.fillStyle = fillStyle;
    histCtx.fill();
    histCtx.strokeStyle = strokeStyle;
    histCtx.lineWidth = 1.5;
    histCtx.stroke();
  }

  // Draw channels using 'screen' compositing for beautiful blending in overlap zones
  histCtx.globalCompositeOperation = 'screen';
  
  drawChannel(rHist, 'rgba(239, 68, 68, 0.35)', 'rgba(239, 68, 68, 0.85)');
  drawChannel(gHist, 'rgba(34, 197, 94, 0.35)', 'rgba(34, 197, 94, 0.85)');
  drawChannel(bHist, 'rgba(59, 130, 246, 0.35)', 'rgba(59, 130, 246, 0.85)');
  drawChannel(lHist, 'rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.55)');

  // Reset to default composite mode
  histCtx.globalCompositeOperation = 'source-over';
}
