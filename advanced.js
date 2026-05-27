// advanced.js - Advanced Operations

import { state } from './state.js';
import { applyImageData } from './canvas.js';

// Import local WASM background removal from CDN
import { removeBackground } from 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@latest/+esm';

/**
 * Removes the background of the image entirely in the browser using WebAssembly.
 * Triggers a custom event with progress stats so the UI can render a progress bar.
 */
export async function removeImageBackground(canvas) {
  if (!state.originalImage) return;

  // Convert current canvas state to a blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error("Failed to extract image buffer."));
        return;
      }

      try {
        // Dispatch starting progress event
        dispatchProgress('Downloading & initializing AI model (approx. 40MB on first run)...', 5);

        // Run local neural network
        const resultBlob = await removeBackground(blob, {
          progress: (key, current, total) => {
            // key is 'fetch' or 'compute'
            const percent = Math.round((current / total) * 100);
            let message = '';
            if (key.includes('fetch')) {
              message = `Loading AI models locally: ${percent}%`;
            } else {
              message = `Analyzing image & removing background: ${percent}%`;
            }
            dispatchProgress(message, percent);
          }
        });

        dispatchProgress('Updating canvas...', 98);

        // Render result blob back onto the canvas
        const img = new Image();
        img.onload = () => {
          const ctx = canvas.getContext('2d');
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.clearRect(0, 0, img.width, img.height);
          ctx.drawImage(img, 0, 0);

          const finalData = ctx.getContext('2d').getImageData(0, 0, img.width, img.height);
          applyImageData(finalData, true);

          // Update original image so crop and reset baseline changes to transparency too
          state.originalImage = img;
          
          dispatchProgress('Complete!', 100);
          resolve();
        };
        img.src = URL.createObjectURL(resultBlob);

      } catch (err) {
        console.error("Local background removal error:", err);
        reject(err);
      }
    }, 'image/png');
  });
}

function dispatchProgress(message, percentage) {
  const event = new CustomEvent('bgremovalprogress', {
    detail: { message, percentage }
  });
  document.dispatchEvent(event);
}

/**
 * Applies a 3x3 Sobel operator to highlight edges in the image.
 */
export function applySobelEdgeDetection(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const currentData = ctx.getImageData(0, 0, w, h);
  const src = currentData.data;
  
  const output = new ImageData(w, h);
  const dst = output.data;

  // Sobel Kernels
  // Gx = [-1  0  1]   Gy = [-1 -2 -1]
  //      [-2  0  2]        [ 0  0  0]
  //      [-1  0  1]        [ 1  2  1]
  
  for (let y = 1; y < h - 1; y++) {
    const rowOffset = y * w * 4;
    
    for (let x = 1; x < w - 1; x++) {
      const idx = rowOffset + x * 4;

      let rx = 0, ry = 0;
      let gx = 0, gy = 0;
      let bx = 0, by = 0;

      // 3x3 Convolution Neighborhood
      for (let cy = -1; cy <= 1; cy++) {
        const neighborRow = (y + cy) * w * 4;
        
        for (let cx = -1; cx <= 1; cx++) {
          const nIdx = neighborRow + (x + cx) * 4;
          
          // Sobel weight x
          const wx = cx * (cy === 0 ? 2 : 1);
          // Sobel weight y
          const wy = cy * (cx === 0 ? 2 : 1);

          rx += src[nIdx] * wx;
          ry += src[nIdx] * wy;
          
          gx += src[nIdx + 1] * wx;
          gy += src[nIdx + 1] * wy;
          
          bx += src[nIdx + 2] * wx;
          by += src[nIdx + 2] * wy;
        }
      }

      // Calculate vector magnitudes
      const magR = Math.sqrt(rx * rx + ry * ry);
      const magG = Math.sqrt(gx * gx + gy * gy);
      const magB = Math.sqrt(bx * bx + by * by);

      // Average gradient magnitude for luminance edge representation
      const mag = (magR + magG + magB) / 3;
      const val = mag > 255 ? 255 : mag;

      dst[idx] = val;
      dst[idx + 1] = val;
      dst[idx + 2] = val;
      dst[idx + 3] = src[idx + 3]; // preserve opacity
    }
  }

  // Draw borders
  for (let x = 0; x < w; x++) {
    const topIdx = x * 4;
    const bottomIdx = (h - 1) * w * 4 + x * 4;
    dst[topIdx] = dst[topIdx+1] = dst[topIdx+2] = 0; dst[topIdx+3] = 255;
    dst[bottomIdx] = dst[bottomIdx+1] = dst[bottomIdx+2] = 0; dst[bottomIdx+3] = 255;
  }
  for (let y = 0; y < h; y++) {
    const leftIdx = y * w * 4;
    const rightIdx = y * w * 4 + (w - 1) * 4;
    dst[leftIdx] = dst[leftIdx+1] = dst[leftIdx+2] = 0; dst[leftIdx+3] = 255;
    dst[rightIdx] = dst[rightIdx+1] = dst[rightIdx+2] = 0; dst[rightIdx+3] = 255;
  }

  applyImageData(output, true);
}

/**
 * Performs professional, high-fidelity Luminance-Preserving Histogram Equalization.
 * Equalizes luminance channel to expand contrast and maps colors dynamically without color shifts.
 */
export function applyHistogramEqualization(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const currentData = ctx.getImageData(0, 0, w, h);
  const src = currentData.data;
  const len = src.length;

  const output = new ImageData(w, h);
  const dst = output.data;

  // 1. Calculate luminance values and fill histogram array
  const totalPixels = w * h;
  const hist = new Uint32Array(256);
  const lums = new Uint8Array(totalPixels);

  for (let i = 0; i < len; i += 4) {
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];
    // ITU-R BT.709 luminance
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) | 0;
    
    lums[i / 4] = lum;
    hist[lum]++;
  }

  // 2. Compute Cumulative Distribution Function (CDF)
  const cdf = new Uint32Array(256);
  let accumulated = 0;
  let cdfMin = -1;

  for (let i = 0; i < 256; i++) {
    accumulated += hist[i];
    cdf[i] = accumulated;
    if (cdfMin === -1 && hist[i] > 0) {
      cdfMin = accumulated;
    }
  }

  // 3. Create mapping lookup table
  const equalizedMap = new Uint8Array(256);
  const denominator = totalPixels - cdfMin || 1;

  for (let i = 0; i < 256; i++) {
    const val = Math.round(((cdf[i] - cdfMin) / denominator) * 255);
    equalizedMap[i] = val < 0 ? 0 : val > 255 ? 255 : val;
  }

  // 4. Equalize image, scaling RGB by ratio of equalized-luminance to original-luminance
  for (let i = 0; i < len; i += 4) {
    const pIdx = i / 4;
    const origLum = lums[pIdx];
    const eqLum = equalizedMap[origLum];

    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];

    if (origLum === 0) {
      dst[i] = 0;
      dst[i + 1] = 0;
      dst[i + 2] = 0;
    } else {
      const ratio = eqLum / origLum;
      const newR = r * ratio;
      const newG = g * ratio;
      const newB = b * ratio;

      dst[i] = newR > 255 ? 255 : newR < 0 ? 0 : newR;
      dst[i + 1] = newG > 255 ? 255 : newG < 0 ? 0 : newG;
      dst[i + 2] = newB > 255 ? 255 : newB < 0 ? 0 : newB;
    }
    dst[i + 3] = src[i + 3];
  }

  applyImageData(output, true);
}

/**
 * Applies a 3x3 Median Filter to clean up speckle / salt-and-pepper noise
 * while maintaining crisp edges.
 */
export function applyNoiseReduction(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const currentData = ctx.getImageData(0, 0, w, h);
  const src = currentData.data;

  const output = new ImageData(w, h);
  const dst = output.data;

  // Allocate 9-element arrays for local sorting
  const rArr = new Uint8Array(9);
  const gArr = new Uint8Array(9);
  const bArr = new Uint8Array(9);

  for (let y = 0; y < h; y++) {
    const rowOffset = y * w * 4;
    
    for (let x = 0; x < w; x++) {
      const idx = rowOffset + x * 4;

      // Outer boundaries: just bypass
      if (y === 0 || y === h - 1 || x === 0 || x === w - 1) {
        dst[idx] = src[idx];
        dst[idx + 1] = src[idx + 1];
        dst[idx + 2] = src[idx + 2];
        dst[idx + 3] = src[idx + 3];
        continue;
      }

      let count = 0;
      // Gather 3x3 neighborhood values
      for (let cy = -1; cy <= 1; cy++) {
        const neighborRow = (y + cy) * w * 4;
        
        for (let cx = -1; cx <= 1; cx++) {
          const nIdx = neighborRow + (x + cx) * 4;
          
          rArr[count] = src[nIdx];
          gArr[count] = src[nIdx + 1];
          bArr[count] = src[nIdx + 2];
          count++;
        }
      }

      // Sort arrays (in-place)
      rArr.sort();
      gArr.sort();
      bArr.sort();

      // Median value is index 4 (5th element)
      dst[idx] = rArr[4];
      dst[idx + 1] = gArr[4];
      dst[idx + 2] = bArr[4];
      dst[idx + 3] = src[idx + 3]; // preserve opacity
    }
  }

  applyImageData(output, true);
}
