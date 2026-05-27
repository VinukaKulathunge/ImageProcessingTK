// basic.js - Basic Image Operations

import { state } from './state.js';
import { applyImageData, render } from './canvas.js';

export let cropBox = { x: 0, y: 0, w: 0, h: 0, active: false };
export let perspectiveBox = null; // Defined in transform.js if needed, but we keep cropBox here

// Grab handle size in screen-pixels
const HANDLE_SIZE = 12;

/**
 * Initializes the crop bounding box in the center, taking up 80% of canvas dimensions.
 */
export function initCropBox(width, height, aspectPreset = 'free') {
  let w = width * 0.8;
  let h = height * 0.8;

  if (aspectPreset === '1:1') {
    const side = Math.min(w, h);
    w = side;
    h = side;
  } else if (aspectPreset === '4:3') {
    if (w / h > 4 / 3) {
      w = h * (4 / 3);
    } else {
      h = w * (3 / 4);
    }
  } else if (aspectPreset === '16:9') {
    if (w / h > 16 / 9) {
      w = h * (16 / 9);
    } else {
      h = w * (9 / 16);
    }
  }

  cropBox.x = (width - w) / 2;
  cropBox.y = (height - h) / 2;
  cropBox.w = w;
  cropBox.h = h;
  cropBox.active = true;
}

/**
 * Renders the semi-transparent overlay, white borders, grid lines (rule of thirds), 
 * and interactive corner/edge drag handles on top of the main canvas.
 */
export function drawCropOverlay(ctx, canvasWidth, canvasHeight) {
  if (!cropBox.active) return;

  const { x, y, w, h } = cropBox;

  ctx.save();

  // 1. Draw dark semi-transparent tint outside the crop box
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  // Top strip
  ctx.fillRect(0, 0, canvasWidth, y);
  // Bottom strip
  ctx.fillRect(0, y + h, canvasWidth, canvasHeight - (y + h));
  // Left strip
  ctx.fillRect(0, y, x, h);
  // Right strip
  ctx.fillRect(x + w, y, canvasWidth - (x + w), h);

  // 2. Draw border
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);

  // 3. Draw Rule of Thirds grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  
  // Vertical lines
  ctx.beginPath();
  ctx.moveTo(x + w / 3, y);
  ctx.lineTo(x + w / 3, y + h);
  ctx.moveTo(x + (2 * w) / 3, y);
  ctx.lineTo(x + (2 * w) / 3, y + h);
  
  // Horizontal lines
  ctx.moveTo(x, y + h / 3);
  ctx.lineTo(x + w, y + h / 3);
  ctx.moveTo(x, y + (2 * h) / 3);
  ctx.lineTo(x + w, y + (2 * h) / 3);
  ctx.stroke();

  // 4. Draw interactive grab handles at the corners and mid-points
  ctx.fillStyle = '#3b82f6'; // Bright UI blue
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;

  const handles = getCropHandles();
  for (const [key, box] of Object.entries(handles)) {
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeRect(box.x, box.y, box.w, box.h);
  }

  ctx.restore();
}

/**
 * Returns bounding boxes for all 8 grab handles in canvas pixel space.
 */
export function getCropHandles() {
  const { x, y, w, h } = cropBox;
  const hs = HANDLE_SIZE;
  const halfHs = hs / 2;

  return {
    'top-left':     { x: x - halfHs,     y: y - halfHs,     w: hs, h: hs },
    'top-right':    { x: x + w - halfHs, y: y - halfHs,     w: hs, h: hs },
    'bottom-left':  { x: x - halfHs,     y: y + h - halfHs, w: hs, h: hs },
    'bottom-right': { x: x + w - halfHs, y: y + h - halfHs, w: hs, h: hs },
    'top-edge':     { x: x + w/2 - halfHs, y: y - halfHs,     w: hs, h: hs },
    'bottom-edge':  { x: x + w/2 - halfHs, y: y + h - halfHs, w: hs, h: hs },
    'left-edge':    { x: x - halfHs,     y: y + h/2 - halfHs, w: hs, h: hs },
    'right-edge':   { x: x + w - halfHs, y: y + h/2 - halfHs, w: hs, h: hs }
  };
}

/**
 * Detects which handle is under the canvas-relative mouse coordinates.
 */
export function getHandleAtPosition(mx, my) {
  if (!cropBox.active) return null;
  const handles = getCropHandles();
  
  for (const [key, box] of Object.entries(handles)) {
    if (mx >= box.x && mx <= box.x + box.w && my >= box.y && my <= box.y + box.h) {
      return key;
    }
  }

  // Check if pointer is inside the crop rectangle to support panning the crop box
  if (mx >= cropBox.x && mx <= cropBox.x + cropBox.w && my >= cropBox.y && my <= cropBox.y + cropBox.h) {
    return 'move';
  }

  return null;
}

/**
 * Updates the crop box coordinates given mouse deltas and aspect ratio locks.
 */
export function updateCropBox(handle, dx, dy, aspectPreset = 'free', canvasWidth, canvasHeight) {
  let { x, y, w, h } = cropBox;

  let ratio = null;
  if (aspectPreset === '1:1') ratio = 1.0;
  if (aspectPreset === '4:3') ratio = 4 / 3;
  if (aspectPreset === '16:9') ratio = 16 / 9;

  const minDim = 30; // Minimum crop size

  if (handle === 'move') {
    // Pan entire crop box
    cropBox.x = Math.max(0, Math.min(canvasWidth - w, x + dx));
    cropBox.y = Math.max(0, Math.min(canvasHeight - h, y + dy));
    return;
  }

  // Top edge & corners
  if (handle.includes('top')) {
    const newY = Math.max(0, Math.min(y + h - minDim, y + dy));
    const actualDy = newY - y;
    y = newY;
    h -= actualDy;

    if (ratio) {
      // Maintain aspect ratio: adjust width from center or edge
      const targetW = h * ratio;
      const wDiff = targetW - w;
      if (handle === 'top-left') {
        x = Math.max(0, x - wDiff);
        w = y + h - minDim ? h * ratio : w;
      } else if (handle === 'top-right') {
        w = Math.min(canvasWidth - x, h * ratio);
      } else {
        // top-edge: adjust both sides
        x = Math.max(0, x - wDiff / 2);
        w = targetW;
      }
    }
  }

  // Bottom edge & corners
  if (handle.includes('bottom')) {
    h = Math.max(minDim, Math.min(canvasHeight - y, h + dy));
    
    if (ratio) {
      const targetW = h * ratio;
      const wDiff = targetW - w;
      if (handle === 'bottom-left') {
        x = Math.max(0, x - wDiff);
        w = targetW;
      } else if (handle === 'bottom-right') {
        w = Math.min(canvasWidth - x, targetW);
      } else {
        // bottom-edge
        x = Math.max(0, x - wDiff / 2);
        w = targetW;
      }
    }
  }

  // Left edge & corners (if not ratio-locked or ratio adjusting already handled)
  if (handle.includes('left') && !ratio) {
    const newX = Math.max(0, Math.min(x + w - minDim, x + dx));
    const actualDx = newX - x;
    x = newX;
    w -= actualDx;
  }

  // Right edge & corners
  if (handle.includes('right') && !ratio) {
    w = Math.max(minDim, Math.min(canvasWidth - x, w + dx));
  }

  // Aspect ratio adjustments if dragging vertical side-edges in locked ratios
  if (ratio && (handle === 'left-edge' || handle === 'right-edge')) {
    if (handle === 'left-edge') {
      const newX = Math.max(0, Math.min(x + w - minDim, x + dx));
      const actualDx = newX - x;
      x = newX;
      w -= actualDx;
    } else {
      w = Math.max(minDim, Math.min(canvasWidth - x, w + dx));
    }
    h = w / ratio;
    // Keep in bounds
    if (y + h > canvasHeight) {
      h = canvasHeight - y;
      w = h * ratio;
    }
  }

  // Bounds enforcement
  cropBox.x = Math.max(0, x);
  cropBox.y = Math.max(0, y);
  cropBox.w = Math.max(minDim, w);
  cropBox.h = Math.max(minDim, h);
}

/**
 * Extracts the cropped region of the image, adjusts canvas size, and pushes new step to history.
 */
export function applyCrop(canvas) {
  if (!cropBox.active) return;

  const { x, y, w, h } = cropBox;
  const ctx = canvas.getContext('2d');
  
  // Grab crop bounding pixels
  const croppedData = ctx.getImageData(x, y, w, h);

  // Resize canvas dimensions to cropped region
  canvas.width = w;
  canvas.height = h;
  ctx.putImageData(croppedData, 0, 0);

  // Push to state history
  applyImageData(croppedData, true);
  cropBox.active = false;
}

/**
 * Rotates the image in 90 degree increments clockwise.
 */
export function rotate90(canvas, direction = 'cw') {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  // Create offscreen canvas with swapped dimensions
  const offscreen = document.createElement('canvas');
  offscreen.width = h;
  offscreen.height = w;
  const oCtx = offscreen.getContext('2d');

  oCtx.save();
  if (direction === 'cw') {
    oCtx.translate(h, 0);
    oCtx.rotate(Math.PI / 2);
  } else {
    oCtx.translate(0, w);
    oCtx.rotate(-Math.PI / 2);
  }
  
  oCtx.drawImage(canvas, 0, 0);
  oCtx.restore();

  // Swaps dimensions
  canvas.width = h;
  canvas.height = w;
  ctx.drawImage(offscreen, 0, 0);

  const rotatedData = ctx.getImageData(0, 0, h, w);
  applyImageData(rotatedData, true);
}

/**
 * Performs custom free rotation by custom angle values.
 * Fills corner voids with transparent space, and renders.
 */
export function rotateFreeAngle(canvas, degrees, pushToHistory = false) {
  const angleRad = (degrees * Math.PI) / 180;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  const sourceData = state.getCurrentState();
  if (!sourceData) return;

  // Create temporary canvas to hold pristine image before rotation
  const temp = document.createElement('canvas');
  temp.width = w;
  temp.height = h;
  const tCtx = temp.getContext('2d');
  tCtx.putImageData(sourceData, 0, 0);

  // Clear visual canvas
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(angleRad);
  ctx.drawImage(temp, -w / 2, -h / 2);
  ctx.restore();

  if (pushToHistory) {
    const rotatedData = ctx.getImageData(0, 0, w, h);
    applyImageData(rotatedData, true);
    state.sliders.rotation = 0; // Reset rotation slider to center post-commit
  } else {
    render();
  }
}

/**
 * Flips the canvas buffer horizontally or vertically.
 */
export function flip(canvas, orientation) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  const offscreen = document.createElement('canvas');
  offscreen.width = w;
  offscreen.height = h;
  const oCtx = offscreen.getContext('2d');

  oCtx.save();
  if (orientation === 'horizontal') {
    oCtx.translate(w, 0);
    oCtx.scale(-1, 1);
  } else {
    oCtx.translate(0, h);
    oCtx.scale(1, -1);
  }
  oCtx.drawImage(canvas, 0, 0);
  oCtx.restore();

  ctx.drawImage(offscreen, 0, 0);
  const flippedData = ctx.getImageData(0, 0, w, h);
  applyImageData(flippedData, true);
}

/**
 * Resizes the image to custom dimensions, applying smooth bicubic/bilinear image smoothing.
 */
export function resize(canvas, targetWidth, targetHeight) {
  const ctx = canvas.getContext('2d');
  
  const offscreen = document.createElement('canvas');
  offscreen.width = targetWidth;
  offscreen.height = targetHeight;
  const oCtx = offscreen.getContext('2d');

  // Enable high-quality image smoothing
  oCtx.imageSmoothingEnabled = true;
  oCtx.imageSmoothingQuality = 'high';
  oCtx.drawImage(canvas, 0, 0, targetWidth, targetHeight);

  canvas.width = targetWidth;
  canvas.height = targetHeight;
  ctx.drawImage(offscreen, 0, 0);

  const resizedData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  applyImageData(resizedData, true);
}

/**
 * Reverts the toolkit state to the original pristine image uploaded, clearing sliders.
 */
export function resetToOriginal(canvas) {
  if (!state.originalImage) return;

  const img = state.originalImage;
  let w = img.width;
  let h = img.height;

  const maxDimension = 2048;
  if (w > maxDimension || h > maxDimension) {
    if (w > h) {
      h = Math.round((h * maxDimension) / w);
      w = maxDimension;
    } else {
      w = Math.round((w * maxDimension) / h);
      h = maxDimension;
    }
  }

  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  const originalData = ctx.getImageData(0, 0, w, h);
  
  // Clear and restart history
  state.clearHistory();
  state.pushHistory(originalData);
  state.resetSliders();

  render();
}
