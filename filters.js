// filters.js - Filters & Pixel Manipulation

/**
 * Applies all active color adjustments, convolutions, and vignette effects 
 * to a target image buffer starting from a baseline ImageData state.
 * 
 * @param {ImageData} baseData - The baseline unedited image from history.
 * @param {Object} s - Object containing active slider settings.
 * @returns {ImageData} - Fully filtered image data ready for rendering.
 */
export function applyFilters(baseData, s) {
  const width = baseData.width;
  const height = baseData.height;
  const len = baseData.data.length;
  
  // Allocate new output image buffer
  const output = new ImageData(width, height);
  const src = baseData.data;
  const dst = output.data;

  // Cache slider calculations
  const bVal = s.brightness * 2.55; // -255 to 255
  const cVal = s.contrast;          // -100 to 100
  const cFactor = (259 * (cVal + 255)) / (255 * (259 - cVal));
  const expVal = Math.pow(2, s.exposure / 50); // multiplier
  const satVal = 1 + s.saturation / 100;
  const gsVal = s.grayscale / 100;
  const sepiaVal = s.sepia / 100;
  const invVal = s.invert / 100;
  const hlVal = s.highlights / 100;
  const shVal = s.shadows / 100;

  // Hue rotation matrix parameters
  const hueAngle = (s.hueRotate * Math.PI) / 180;
  const cosH = Math.cos(hueAngle);
  const sinH = Math.sin(hueAngle);
  
  const m00 = 0.213 + cosH * 0.787 - sinH * 0.213;
  const m01 = 0.715 - cosH * 0.715 - sinH * 0.715;
  const m02 = 0.072 - cosH * 0.072 + sinH * 0.928;
  const m10 = 0.213 - cosH * 0.213 + sinH * 0.143;
  const m11 = 0.715 + cosH * 0.285 + sinH * 0.140;
  const m12 = 0.072 - cosH * 0.072 - sinH * 0.283;
  const m20 = 0.213 - cosH * 0.213 - sinH * 0.787;
  const m21 = 0.715 - cosH * 0.715 + sinH * 0.715;
  const m22 = 0.072 + cosH * 0.928 + sinH * 0.072;

  // Vignette parameters
  const centerX = width / 2;
  const centerY = height / 2;
  const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY) || 1;
  const vigAmount = s.vignette / 100;

  // Fast single-pass pixel loop for color adjustments
  for (let i = 0; i < len; i += 4) {
    let r = src[i];
    let g = src[i + 1];
    let b = src[i + 2];
    const a = src[i + 3];

    // 1. Exposure & Brightness
    r = r * expVal + bVal;
    g = g * expVal + bVal;
    b = b * expVal + bVal;

    // 2. Contrast (about center 128)
    r = cFactor * (r - 128) + 128;
    g = cFactor * (g - 128) + 128;
    b = cFactor * (b - 128) + 128;

    // Calculate intermediate luminance for highlights/shadows
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    // 3. Highlights & Shadows
    if (hlVal !== 0 && lum > 128) {
      const hlFactor = 1 + hlVal * ((lum - 128) / 128);
      r *= hlFactor;
      g *= hlFactor;
      b *= hlFactor;
    }
    if (shVal !== 0 && lum < 128) {
      const shFactor = 1 + shVal * ((128 - lum) / 128);
      r *= shFactor;
      g *= shFactor;
      b *= shFactor;
    }

    // 4. Hue Rotation
    if (s.hueRotate !== 0) {
      const currR = r;
      const currG = g;
      const currB = b;
      r = currR * m00 + currG * m01 + currB * m02;
      g = currR * m10 + currG * m11 + currB * m12;
      b = currR * m20 + currG * m21 + currB * m22;
    }

    // 5. Saturation
    if (s.saturation !== 0) {
      const currLum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = currLum + (r - currLum) * satVal;
      g = currLum + (g - currLum) * satVal;
      b = currLum + (b - currLum) * satVal;
    }

    // 6. Grayscale
    if (s.grayscale > 0) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = r + (gray - r) * gsVal;
      g = g + (gray - g) * gsVal;
      b = b + (gray - b) * gsVal;
    }

    // 7. Sepia
    if (s.sepia > 0) {
      const sr = 0.393 * r + 0.769 * g + 0.189 * b;
      const sg = 0.349 * r + 0.686 * g + 0.168 * b;
      const sb = 0.272 * r + 0.534 * g + 0.131 * b;
      r = r + (sr - r) * sepiaVal;
      g = g + (sg - g) * sepiaVal;
      b = b + (sb - b) * sepiaVal;
    }

    // 8. Invert
    if (s.invert > 0) {
      r = r + (255 - r * 2) * invVal;
      g = g + (255 - g * 2) * invVal;
      b = b + (255 - b * 2) * invVal;
    }

    // 9. Vignette Effect
    if (s.vignette > 0) {
      const idx = i / 4;
      const py = (idx / width) | 0;
      const px = idx % width;
      
      const dx = px - centerX;
      const dy = py - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy) / maxDistance;
      const factor = 1 - vigAmount * Math.pow(dist, 2.5); // smooth falloff

      r *= factor;
      g *= factor;
      b *= factor;
    }

    // Clip pixel values to 0-255 boundaries
    dst[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    dst[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    dst[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    dst[i + 3] = a;
  }

  // Apply Convolution Pass 1: Blur
  let convoluted = output;
  if (s.blur > 0) {
    convoluted = applyBoxBlur(convoluted, s.blur);
  }

  // Apply Convolution Pass 2: Sharpen
  if (s.sharpen > 0) {
    convoluted = applySharpen(convoluted, s.sharpen);
  }

  return convoluted;
}

/**
 * Slide-window 1D-based box blur approximation.
 * Performance is O(width * height), executing instantly regardless of radius.
 */
function applyBoxBlur(imageData, radius) {
  const r = Math.floor(radius);
  if (r <= 0) return imageData;

  const w = imageData.width;
  const h = imageData.height;
  const src = imageData.data;
  const dst = new Uint8ClampedArray(src.length);

  // Horizontal blur pass
  for (let y = 0; y < h; y++) {
    const rowOffset = y * w * 4;
    let rSum = 0, gSum = 0, bSum = 0, aSum = 0;

    // Load initial slide window
    for (let x = -r; x <= r; x++) {
      const cx = Math.min(w - 1, Math.max(0, x));
      const idx = rowOffset + cx * 4;
      rSum += src[idx];
      gSum += src[idx + 1];
      bSum += src[idx + 2];
      aSum += src[idx + 3];
    }

    for (let x = 0; x < w; x++) {
      const outIdx = rowOffset + x * 4;
      const count = 2 * r + 1;
      
      dst[outIdx] = rSum / count;
      dst[outIdx + 1] = gSum / count;
      dst[outIdx + 2] = bSum / count;
      dst[outIdx + 3] = aSum / count;

      // Slide window right: subtract trailing and add leading
      const lx = Math.min(w - 1, Math.max(0, x - r));
      const rx = Math.min(w - 1, Math.max(0, x + r + 1));
      const lIdx = rowOffset + lx * 4;
      const rIdx = rowOffset + rx * 4;

      rSum += src[rIdx] - src[lIdx];
      gSum += src[rIdx + 1] - src[lIdx + 1];
      bSum += src[rIdx + 2] - src[lIdx + 2];
      aSum += src[rIdx + 3] - src[lIdx + 3];
    }
  }

  // Vertical blur pass
  const finalData = new ImageData(w, h);
  const finalDst = finalData.data;

  for (let x = 0; x < w; x++) {
    let rSum = 0, gSum = 0, bSum = 0, aSum = 0;

    // Load initial slide window
    for (let y = -r; y <= r; y++) {
      const cy = Math.min(h - 1, Math.max(0, y));
      const idx = (cy * w + x) * 4;
      rSum += dst[idx];
      gSum += dst[idx + 1];
      bSum += dst[idx + 2];
      aSum += dst[idx + 3];
    }

    for (let y = 0; y < h; y++) {
      const outIdx = (y * w + x) * 4;
      const count = 2 * r + 1;

      finalDst[outIdx] = rSum / count;
      finalDst[outIdx + 1] = gSum / count;
      finalDst[outIdx + 2] = bSum / count;
      finalDst[outIdx + 3] = aSum / count;

      // Slide window down: subtract trailing and add leading
      const ty = Math.min(h - 1, Math.max(0, y - r));
      const by = Math.min(h - 1, Math.max(0, y + r + 1));
      const tIdx = (ty * w + x) * 4;
      const bIdx = (by * w + x) * 4;

      rSum += dst[bIdx] - dst[tIdx];
      gSum += dst[bIdx + 1] - dst[tIdx + 1];
      bSum += dst[bIdx + 2] - dst[tIdx + 2];
      aSum += dst[bIdx + 3] - dst[tIdx + 3];
    }
  }

  return finalData;
}

/**
 * 3x3 kernel sharpen filter. Blend factor scales contrast differences relative to adjacent pixels.
 */
function applySharpen(imageData, amount) {
  const w = imageData.width;
  const h = imageData.height;
  const src = imageData.data;
  const output = new ImageData(w, h);
  const dst = output.data;
  const factor = amount / 100;

  for (let y = 0; y < h; y++) {
    const rowOffset = y * w * 4;
    
    for (let x = 0; x < w; x++) {
      const idx = rowOffset + x * 4;

      // Border pixels: bypass convolutions to prevent out of bounds
      if (y === 0 || y === h - 1 || x === 0 || x === w - 1) {
        dst[idx] = src[idx];
        dst[idx + 1] = src[idx + 1];
        dst[idx + 2] = src[idx + 2];
        dst[idx + 3] = src[idx + 3];
        continue;
      }

      const up = idx - w * 4;
      const down = idx + w * 4;
      const left = idx - 4;
      const right = idx + 4;

      // Standard Unsharp Sharpening convolution kernel: 
      // [ 0, -1,  0 ]
      // [-1,  5, -1 ]
      // [ 0, -1,  0 ]
      for (let c = 0; c < 3; c++) {
        const val = src[idx + c];
        const conv = val * 5 - src[up + c] - src[down + c] - src[left + c] - src[right + c];
        
        let blended = val + (conv - val) * factor;
        
        dst[idx + c] = blended < 0 ? 0 : blended > 255 ? 255 : blended;
      }
      dst[idx + 3] = src[idx + 3]; // Preserve opacity
    }
  }

  return output;
}
