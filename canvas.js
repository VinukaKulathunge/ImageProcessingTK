// canvas.js - Core Canvas and View Manager

import { state } from './state.js';
import { updateHistogram } from './histogram.js';

let mainCanvas = null;
let mainCtx = null;
let offscreenCanvas = null;
let offscreenCtx = null;

/**
 * Initialize the canvases with references.
 */
export function initCanvas(canvasElement) {
  mainCanvas = canvasElement;
  mainCtx = mainCanvas.getContext('2d');
  offscreenCanvas = document.createElement('canvas');
  offscreenCtx = offscreenCanvas.getContext('2d');
}

export function getCanvas() {
  return mainCanvas;
}

export function getContext() {
  return mainCtx;
}

export function getOffscreenCanvas() {
  return offscreenCanvas;
}

export function getOffscreenContext() {
  return offscreenCtx;
}

/**
 * Loads an image from File object or URL, performs dynamic downscaling, 
 * resets the central state & slider configurations, and does an initial render.
 */
export function loadImageToCanvas(fileOrUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      state.originalWidth = img.width;
      state.originalHeight = img.height;

      // Downscale to prevent browser lags and out-of-memory crashes for massive images
      const maxDimension = 2048;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
        console.log(`Optimized image size from ${img.width}x${img.height} to ${width}x${height}`);
      }

      // Configure main and offscreen canvases
      mainCanvas.width = width;
      mainCanvas.height = height;
      mainCtx.drawImage(img, 0, 0, width, height);

      offscreenCanvas.width = width;
      offscreenCanvas.height = height;
      offscreenCtx.drawImage(img, 0, 0, width, height);

      // Store references
      state.originalImage = img;

      // Reset history and load base state
      state.clearHistory();
      const initialData = mainCtx.getImageData(0, 0, width, height);
      state.pushHistory(initialData);
      state.resetSliders();

      // Reset zoom styles
      resetZoom();
      render();

      resolve(img);
    };

    img.onerror = (err) => {
      reject(err);
    };

    if (fileOrUrl instanceof File) {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target.result;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(fileOrUrl);
    } else {
      img.src = fileOrUrl;
    }
  });
}

/**
 * Standard visual rendering loop. Renders the active history buffer or original 
 * buffer (before/after mode), updates crop boxes, and updates the live histogram.
 */
export function render() {
  if (!state.originalImage) return;

  const currentData = state.getCurrentState();
  if (!currentData) return;

  if (state.beforeAfterMode) {
    // Draw original image scaled down directly onto current canvas coordinates
    mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
    mainCtx.drawImage(state.originalImage, 0, 0, mainCanvas.width, mainCanvas.height);
  } else {
    // Draw the latest committed/working state
    mainCtx.putImageData(currentData, 0, 0);
  }

  // Update live histogram
  updateHistogram(mainCanvas);
}

/**
 * Applies a new ImageData buffer to the canvas, committing to history (default) 
 * or updating the current working stack pointer (during active dragging).
 */
export function applyImageData(imageData, pushToHistory = true) {
  if (pushToHistory) {
    state.pushHistory(imageData);
  } else {
    // In-place edit of the current state for high-performance slider response
    const top = state.historyStack[state.historyIndex];
    if (top) {
      top.data.set(imageData.data);
    }
  }
  render();
}

/**
 * Zoom manager functions to handle dynamic Figma-like canvas viewport operations.
 */
export function resetZoom() {
  state.zoom = 'fit';
  updateZoomStyle();
}

export function zoomIn() {
  if (typeof state.zoom === 'number') {
    state.zoom = Math.min(4.0, state.zoom + 0.25);
  } else {
    state.zoom = 1.25;
  }
  updateZoomStyle();
}

export function zoomOut() {
  if (typeof state.zoom === 'number') {
    state.zoom = Math.max(0.1, state.zoom - 0.25);
  } else {
    state.zoom = 0.75;
  }
  updateZoomStyle();
}

export function setZoomLevel(level) {
  state.zoom = level;
  updateZoomStyle();
}

function updateZoomStyle() {
  if (!mainCanvas) return;
  const container = mainCanvas.parentElement;
  if (!container) return;

  if (state.zoom === 'fit') {
    mainCanvas.style.maxWidth = '100%';
    mainCanvas.style.maxHeight = '100%';
    mainCanvas.style.width = 'auto';
    mainCanvas.style.height = 'auto';
    mainCanvas.style.transform = 'none';
    state.zoomLevel = 1;
  } else {
    state.zoomLevel = state.zoom;
    mainCanvas.style.maxWidth = 'none';
    mainCanvas.style.maxHeight = 'none';
    mainCanvas.style.width = `${mainCanvas.width * state.zoomLevel}px`;
    mainCanvas.style.height = `${mainCanvas.height * state.zoomLevel}px`;
    mainCanvas.style.transform = 'none';
  }

  // Dispatch a global zoom event so the UI updates the zoom indicator text
  const event = new CustomEvent('zoomchange', { detail: { zoom: state.zoom } });
  document.dispatchEvent(event);
}
