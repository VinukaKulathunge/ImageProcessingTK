// ui.js - Event Handling and UI Orchestrator

import { state } from './state.js';
import { 
  initCanvas, 
  loadImageToCanvas, 
  render, 
  applyImageData,
  getCanvas, 
  zoomIn, 
  zoomOut, 
  setZoomLevel 
} from './canvas.js';
import { 
  initHistogram 
} from './histogram.js';
import { 
  initCropBox, 
  drawCropOverlay, 
  getHandleAtPosition, 
  updateCropBox, 
  applyCrop, 
  rotate90, 
  rotateFreeAngle, 
  flip, 
  resize, 
  resetToOriginal,
  cropBox
} from './basic.js';
import { 
  applyFilters 
} from './filters.js';
import { 
  initPerspectivePoints, 
  drawPerspectiveOverlay, 
  getPerspectivePointAt, 
  applyPerspectiveWarp, 
  applyLensDistortion, 
  perspectivePoints,
  perspectiveActive,
  setPerspectiveActive
} from './transform.js';
import { 
  removeImageBackground, 
  applySobelEdgeDetection, 
  applyHistogramEqualization, 
  applyNoiseReduction 
} from './advanced.js';
import { 
  exportImage 
} from './export.js';

// DOM Element Selectors
const dropZone = document.getElementById('drop-zone');
const uploadBox = document.getElementById('upload-box');
const filePickerMain = document.getElementById('file-picker-main');
const filePickerTop = document.getElementById('file-picker-top');
const mainCanvas = document.getElementById('main-canvas');
const histCanvas = document.getElementById('histogram-canvas');
const historyContainer = document.getElementById('history-container');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingStatus = document.getElementById('loading-status');
const loadingPercentage = document.getElementById('loading-percentage');
const statusDimensions = document.getElementById('status-dimensions');
const statusHoverColor = document.getElementById('status-hover-color');

// Zoom DOM Elements
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const selectZoom = document.getElementById('select-zoom');

// Undo/Redo Buttons
const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');
const btnCompare = document.getElementById('btn-compare');

// Tab Panels
const tabButtons = document.querySelectorAll('.tab-btn');
const panels = document.querySelectorAll('.panel-content');

// Dynamic Slider & Input Listeners
const sliders = document.querySelectorAll('input[type="range"]');

// Aspect ratio crop controls
const aspectButtons = document.querySelectorAll('.preset-btn');
const btnCropEnable = document.getElementById('btn-crop-enable');
const btnCropApply = document.getElementById('btn-crop-apply');

// Perspective controls
const btnPerspectiveEnable = document.getElementById('btn-perspective-enable');
const btnPerspectiveApply = document.getElementById('btn-perspective-apply');

// Dragging tracking state variables
let activeCropHandle = null;
let activePerspectivePointIdx = -1;
let prevMouseX = 0;
let prevMouseY = 0;
let activeRatioPreset = 'free';

// Active baseline ImageData for cumulative filters
let committedFilterBaseline = null;

// History Action Labels
const actionLabels = {
  upload: 'Original Upload',
  crop: 'Crop Applied',
  rotate: 'Rotate Canvas',
  flip: 'Flip Image',
  resize: 'Resize Canvas',
  sobel: 'Sobel Edge Map',
  eq: 'Hist Equalized',
  noise: 'Noise Reduction',
  bgremove: 'Background Removed',
  distortion: 'Lens Corrected',
  filter: 'Color Adjustments'
};

/**
 * Initialize all modules and bind layout interactions.
 */
document.addEventListener('DOMContentLoaded', () => {
  // Initialize canvas modules
  initCanvas(mainCanvas);
  initHistogram(histCanvas);
  
  setupDragAndDrop();
  setupTabSystem();
  setupZoomControls();
  setupHistoryControls();
  setupSliders();
  setupBasicControls();
  setupTransformControls();
  setupAdvancedControls();
  setupExportControls();
  setupCanvasMouseListeners();
  setupKeyboardShortcuts();
});

/**
 * Maps screen pointer events to relative coordinates on the visual canvas.
 */
function getCanvasMouseCoords(e) {
  const rect = mainCanvas.getBoundingClientRect();
  
  // Calculate relative coordinate percentages matching actual canvas pixel grid
  const scaleX = mainCanvas.width / rect.width;
  const scaleY = mainCanvas.height / rect.height;
  
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  
  return { x, y };
}

/**
 * File Pickers & Drag Drop events
 */
function setupDragAndDrop() {
  const handleFiles = async (files) => {
    if (files.length === 0) return;
    const file = files[0];
    
    showOverlaySpinner('Loading image...', 10);
    try {
      await loadImageToCanvas(file);
      
      // Hide upload screen
      dropZone.classList.add('hidden');
      
      // Set initial dimensions footer
      statusDimensions.textContent = `${mainCanvas.width} x ${mainCanvas.height} px`;
      
      // Save filter baseline reference
      committedFilterBaseline = state.getCurrentState();
      
      updateHistoryUI();
      hideOverlaySpinner();
    } catch (err) {
      console.error(err);
      alert("Error loading image file.");
      hideOverlaySpinner();
    }
  };

  uploadBox.addEventListener('click', () => filePickerMain.click());
  filePickerMain.addEventListener('change', (e) => handleFiles(e.target.files));
  filePickerTop.addEventListener('change', (e) => handleFiles(e.target.files));

  // Drag over effects
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadBox.classList.add('dragover');
  });
  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    uploadBox.classList.remove('dragover');
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadBox.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });
}

/**
 * Accordion Sidebar tab switcher
 */
function setupTabSystem() {
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      document.getElementById(targetId).classList.add('active');

      // Deactivate overlays if changing tabs to keep views clean
      deactivateCropMode();
      deactivatePerspectiveMode();
      render();
    });
  });
}

/**
 * Figma-like viewport zoom bindings
 */
function setupZoomControls() {
  btnZoomIn.addEventListener('click', zoomIn);
  btnZoomOut.addEventListener('click', zoomOut);
  
  selectZoom.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'fit') {
      setZoomLevel('fit');
    } else {
      setZoomLevel(parseFloat(val));
    }
  });

  // Listener to synchronize top selector text when user zooms via buttons
  document.addEventListener('zoomchange', (e) => {
    const zoomVal = e.detail.zoom;
    if (zoomVal === 'fit') {
      selectZoom.value = 'fit';
    } else {
      // Find closest option value
      const floatVal = parseFloat(zoomVal);
      const opt = Array.from(selectZoom.options).find(o => Math.abs(parseFloat(o.value) - floatVal) < 0.05);
      if (opt) {
        selectZoom.value = opt.value;
      } else {
        // Create custom value indicator option if it's custom
        selectZoom.value = 'fit';
      }
    }
  });
}

/**
 * Central history stacks (Undo, Redo, Before/After)
 */
function setupHistoryControls() {
  const triggerUndo = () => {
    const previous = state.undo();
    if (previous) {
      deactivateCropMode();
      deactivatePerspectiveMode();
      resetFilterSlidersToNeutral();
      committedFilterBaseline = previous;
      applyImageData(previous, false);
      updateHistoryUI();
    }
  };

  const triggerRedo = () => {
    const next = state.redo();
    if (next) {
      deactivateCropMode();
      deactivatePerspectiveMode();
      resetFilterSlidersToNeutral();
      committedFilterBaseline = next;
      applyImageData(next, false);
      updateHistoryUI();
    }
  };

  btnUndo.addEventListener('click', triggerUndo);
  btnRedo.addEventListener('click', triggerRedo);

  // Before/after compare events
  const startCompare = () => {
    state.beforeAfterMode = true;
    render();
  };

  const endCompare = () => {
    state.beforeAfterMode = false;
    render();
  };

  btnCompare.addEventListener('mousedown', startCompare);
  btnCompare.addEventListener('mouseup', endCompare);
  btnCompare.addEventListener('mouseleave', endCompare);
  btnCompare.addEventListener('touchstart', (e) => { e.preventDefault(); startCompare(); });
  btnCompare.addEventListener('touchend', endCompare);
}

/**
 * Filter Slider events mapping
 */
function setupSliders() {
  sliders.forEach(slider => {
    const name = slider.id.replace('slider-', '');
    const valueSpan = document.getElementById(`val-${name}`);

    slider.addEventListener('input', () => {
      // Update UI slider text indicators
      let text = slider.value;
      if (name === 'rotation' || name === 'hueRotate') text += '°';
      if (name === 'grayscale' || name === 'sepia' || name === 'invert') text += '%';
      if (name === 'blur') text += 'px';
      if (valueSpan) valueSpan.textContent = text;

      // Realtime preview filters (without pushing to history)
      if (name === 'rotation') {
        rotateFreeAngle(mainCanvas, parseFloat(slider.value), false);
      } else if (name === 'barrelDistortion') {
        applyLensDistortion(mainCanvas, parseFloat(slider.value), false);
      } else {
        // standard sliders
        state.sliders[name] = parseFloat(slider.value);
        if (committedFilterBaseline) {
          const filtered = applyFilters(committedFilterBaseline, state.sliders);
          applyImageData(filtered, false);
        }
      }
    });

    // Commit change on drag release (pushing to history)
    slider.addEventListener('change', () => {
      if (name === 'rotation') {
        rotateFreeAngle(mainCanvas, parseFloat(slider.value), true);
        commitStructuralChange(actionLabels.rotate);
      } else if (name === 'barrelDistortion') {
        applyLensDistortion(mainCanvas, parseFloat(slider.value), true);
        commitStructuralChange(actionLabels.distortion);
      } else {
        // Freeze slide filters
        state.sliders[name] = parseFloat(slider.value);
        if (committedFilterBaseline) {
          const filtered = applyFilters(committedFilterBaseline, state.sliders);
          applyImageData(filtered, true);
          commitStructuralChange(actionLabels.filter);
        }
      }
    });
  });
}

/**
 * Basic Panel operations (Flips, CCW/CW, Resize, Reset All)
 */
function setupBasicControls() {
  document.getElementById('btn-rotate-cw').addEventListener('click', () => {
    rotate90(mainCanvas, 'cw');
    commitStructuralChange(actionLabels.rotate);
  });

  document.getElementById('btn-rotate-ccw').addEventListener('click', () => {
    rotate90(mainCanvas, 'ccw');
    commitStructuralChange(actionLabels.rotate);
  });

  document.getElementById('btn-flip-h').addEventListener('click', () => {
    flip(mainCanvas, 'horizontal');
    commitStructuralChange(actionLabels.flip);
  });

  document.getElementById('btn-flip-v').addEventListener('click', () => {
    flip(mainCanvas, 'vertical');
    commitStructuralChange(actionLabels.flip);
  });

  // Size constraints on inputs
  const inputW = document.getElementById('input-resize-w');
  const inputH = document.getElementById('input-resize-h');
  const checkRatio = document.getElementById('check-resize-ratio');

  const syncDimensions = () => {
    if (state.originalImage) {
      inputW.value = mainCanvas.width;
      inputH.value = mainCanvas.height;
    }
  };

  // Populate fields when first loaded or rendered
  document.addEventListener('zoomchange', syncDimensions);
  
  inputW.addEventListener('input', () => {
    if (checkRatio.checked && state.originalImage) {
      const ratio = mainCanvas.height / mainCanvas.width;
      inputH.value = Math.round(parseFloat(inputW.value) * ratio) || '';
    }
  });

  inputH.addEventListener('input', () => {
    if (checkRatio.checked && state.originalImage) {
      const ratio = mainCanvas.width / mainCanvas.height;
      inputW.value = Math.round(parseFloat(inputH.value) * ratio) || '';
    }
  });

  document.getElementById('btn-apply-resize').addEventListener('click', () => {
    const w = parseInt(inputW.value, 10);
    const h = parseInt(inputH.value, 10);
    if (w > 0 && h > 0) {
      resize(mainCanvas, w, h);
      commitStructuralChange(actionLabels.resize);
    }
  });

  document.getElementById('btn-reset-image').addEventListener('click', () => {
    if (confirm("Revert image back to pristine uploaded state? All edit history will be lost.")) {
      resetToOriginal(mainCanvas);
      deactivateCropMode();
      deactivatePerspectiveMode();
      resetFilterSlidersToNeutral();
      committedFilterBaseline = state.getCurrentState();
      updateHistoryUI();
    }
  });
}

/**
 * Transform Panel: Crop bounding overlays & 4-Corner perspective warping
 */
function setupTransformControls() {
  // Preset ratio buttons
  aspectButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      aspectButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeRatioPreset = btn.getAttribute('data-ratio');

      if (cropBox.active) {
        initCropBox(mainCanvas.width, mainCanvas.height, activeRatioPreset);
        render();
      }
    });
  });

  // Enable/Disable Crop overlay button
  btnCropEnable.addEventListener('click', () => {
    deactivatePerspectiveMode();
    if (cropBox.active) {
      deactivateCropMode();
    } else {
      initCropBox(mainCanvas.width, mainCanvas.height, activeRatioPreset);
      btnCropEnable.classList.add('primary');
      btnCropApply.disabled = false;
    }
    render();
  });

  // Crop commit
  btnCropApply.addEventListener('click', () => {
    if (cropBox.active) {
      applyCrop(mainCanvas);
      commitStructuralChange(actionLabels.crop);
      deactivateCropMode();
    }
  });

  // Perspective activation
  btnPerspectiveEnable.addEventListener('click', () => {
    deactivateCropMode();
    if (perspectiveActive) {
      deactivatePerspectiveMode();
    } else {
      initPerspectivePoints(mainCanvas.width, mainCanvas.height);
      btnPerspectiveEnable.classList.add('primary');
      btnPerspectiveApply.disabled = false;
    }
    render();
  });

  // Warp Perspective commit
  btnPerspectiveApply.addEventListener('click', () => {
    if (perspectiveActive) {
      applyPerspectiveWarp(mainCanvas);
      commitStructuralChange(actionLabels.crop); // Represented as cropped/warped shape
      deactivatePerspectiveMode();
    }
  });
}

function deactivateCropMode() {
  cropBox.active = false;
  btnCropEnable.classList.remove('primary');
  btnCropApply.disabled = true;
}

function deactivatePerspectiveMode() {
  perspectivePoints.length = 0;
  setPerspectiveActive(false);
  btnPerspectiveEnable.classList.remove('primary');
  btnPerspectiveApply.disabled = true;
}

/**
 * Advanced Panel operations: Sobel, Noise, Equalization & Local WASM background-removal
 */
function setupAdvancedControls() {
  document.getElementById('btn-sobel-edge').addEventListener('click', () => {
    showOverlaySpinner('Running edge detection convolution...', 30);
    setTimeout(() => {
      applySobelEdgeDetection(mainCanvas);
      commitStructuralChange(actionLabels.sobel);
      hideOverlaySpinner();
    }, 100);
  });

  document.getElementById('btn-hist-eq').addEventListener('click', () => {
    showOverlaySpinner('Computing equalized luminance...', 35);
    setTimeout(() => {
      applyHistogramEqualization(mainCanvas);
      commitStructuralChange(actionLabels.eq);
      hideOverlaySpinner();
    }, 100);
  });

  document.getElementById('btn-noise-reduce').addEventListener('click', () => {
    showOverlaySpinner('Sorting neighbor pixel channels...', 25);
    setTimeout(() => {
      applyNoiseReduction(mainCanvas);
      commitStructuralChange(actionLabels.noise);
      hideOverlaySpinner();
    }, 100);
  });

  // Local Background removal WASM execution
  const btnRemoveBg = document.getElementById('btn-remove-bg');
  btnRemoveBg.addEventListener('click', async () => {
    showOverlaySpinner('Starting background removal model...', 5);
    
    // Bind progress listeners
    const onProgress = (e) => {
      const { message, percentage } = e.detail;
      loadingStatus.textContent = message;
      loadingPercentage.textContent = `${percentage}%`;
    };
    document.addEventListener('bgremovalprogress', onProgress);

    try {
      await removeImageBackground(mainCanvas);
      commitStructuralChange(actionLabels.bgremove);
    } catch (err) {
      console.error(err);
      alert("Failed to remove background. Error: " + err.message);
    } finally {
      document.removeEventListener('bgremovalprogress', onProgress);
      hideOverlaySpinner();
    }
  });
}

/**
 * Export controls (Format switching & dynamic scale overrides)
 */
function setupExportControls() {
  const formatSelect = document.getElementById('select-export-format');
  const qualityGroup = document.getElementById('group-export-quality');
  const sliderQuality = document.getElementById('slider-export-quality');
  const valQuality = document.getElementById('val-export-quality');

  formatSelect.addEventListener('change', () => {
    const val = formatSelect.value;
    if (val === 'png') {
      qualityGroup.style.display = 'none';
    } else {
      qualityGroup.style.display = 'flex';
    }
  });

  sliderQuality.addEventListener('input', () => {
    valQuality.textContent = `${sliderQuality.value}%`;
  });

  // Resolution override scaling inputs
  const inputW = document.getElementById('input-export-w');
  const inputH = document.getElementById('input-export-h');
  const checkRatio = document.getElementById('check-export-ratio');

  // Set default export override placeholders when loaded
  document.addEventListener('zoomchange', () => {
    if (state.originalImage) {
      inputW.placeholder = mainCanvas.width;
      inputH.placeholder = mainCanvas.height;
    }
  });

  inputW.addEventListener('input', () => {
    if (checkRatio.checked && state.originalImage && inputW.value) {
      const ratio = mainCanvas.height / mainCanvas.width;
      inputH.value = Math.round(parseFloat(inputW.value) * ratio) || '';
    }
  });

  inputH.addEventListener('input', () => {
    if (checkRatio.checked && state.originalImage && inputH.value) {
      const ratio = mainCanvas.width / mainCanvas.height;
      inputW.value = Math.round(parseFloat(inputH.value) * ratio) || '';
    }
  });

  // Trigger export
  document.getElementById('btn-export-download').addEventListener('click', () => {
    const format = formatSelect.value;
    const quality = sliderQuality.value;
    const w = inputW.value || mainCanvas.width;
    const h = inputH.value || mainCanvas.height;

    showOverlaySpinner('Compiling download blob...', 40);
    setTimeout(() => {
      exportImage(mainCanvas, { format, quality, width: w, height: h });
      hideOverlaySpinner();
    }, 150);
  });
}

/**
 * Live canvas mouse listeners (Cropping handles, Perspective nodes, footer hover HEX colors)
 */
function setupCanvasMouseListeners() {
  mainCanvas.addEventListener('mousedown', (e) => {
    if (!state.originalImage) return;

    const coords = getCanvasMouseCoords(e);
    
    // 1. Check Perspective dragging first
    if (perspectiveActive) {
      const ptIdx = getPerspectivePointAt(coords.x, coords.y);
      if (ptIdx !== -1) {
        activePerspectivePointIdx = ptIdx;
        e.preventDefault();
        return;
      }
    }

    // 2. Check Crop dragging second
    if (cropBox.active) {
      const handle = getHandleAtPosition(coords.x, coords.y);
      if (handle) {
        activeCropHandle = handle;
        prevMouseX = coords.x;
        prevMouseY = coords.y;
        e.preventDefault();
        return;
      }
    }
  });

  mainCanvas.addEventListener('mousemove', (e) => {
    if (!state.originalImage) return;

    const coords = getCanvasMouseCoords(e);

    // Color hover inspector values inside footer
    try {
      const ctx = mainCanvas.getContext('2d');
      // Clamp coordinates to bounds
      const cx = Math.max(0, Math.min(mainCanvas.width - 1, coords.x | 0));
      const cy = Math.max(0, Math.min(mainCanvas.height - 1, coords.y | 0));
      
      const pixel = ctx.getImageData(cx, cy, 1, 1).data;
      const r = pixel[0], g = pixel[1], b = pixel[2];
      
      const toHex = (c) => {
        const hex = c.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      };
      
      const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
      statusHoverColor.textContent = `HEX: ${hex} | RGB: (${r}, ${g}, ${b})`;
    } catch (err) {}

    // 1. Handle Perspective Point drag
    if (perspectiveActive && activePerspectivePointIdx !== -1) {
      perspectivePoints[activePerspectivePointIdx].x = Math.max(0, Math.min(mainCanvas.width, coords.x));
      perspectivePoints[activePerspectivePointIdx].y = Math.max(0, Math.min(mainCanvas.height, coords.y));
      render();
      drawPerspectiveOverlay(mainCanvas.getContext('2d'));
      return;
    }

    // 2. Handle Crop Box boundary drag
    if (cropBox.active && activeCropHandle) {
      const dx = coords.x - prevMouseX;
      const dy = coords.y - prevMouseY;
      
      updateCropBox(activeCropHandle, dx, dy, activeRatioPreset, mainCanvas.width, mainCanvas.height);
      
      prevMouseX = coords.x;
      prevMouseY = coords.y;
      
      render();
      drawCropOverlay(mainCanvas.getContext('2d'), mainCanvas.width, mainCanvas.height);
    }
  });

  const endDrag = () => {
    activeCropHandle = null;
    activePerspectivePointIdx = -1;
  };

  mainCanvas.addEventListener('mouseup', endDrag);
  mainCanvas.addEventListener('mouseleave', endDrag);
}

/**
 * Standard keyboard shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+S, Spacebar hold)
 */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (!state.originalImage) return;

    // Before After comparison on holding Spacebar (ignoring text inputs)
    if (e.key === ' ' || e.code === 'Space') {
      const tag = document.activeElement.tagName.toLowerCase();
      if (tag !== 'input' && tag !== 'select') {
        e.preventDefault();
        state.beforeAfterMode = true;
        render();
      }
    }

    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        btnUndo.click();
      }
      if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        btnRedo.click();
      }
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        document.getElementById('btn-export-download').click();
      }
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.code === 'Space') {
      state.beforeAfterMode = false;
      render();
    }
  });
}

/**
 * Resets all slider UI parameters back to 0 (called after committing operations)
 */
function resetFilterSlidersToNeutral() {
  state.resetSliders();
  sliders.forEach(slider => {
    const name = slider.id.replace('slider-', '');
    slider.value = 0;
    
    // Special exceptions
    if (name === 'export-quality') slider.value = 90;
    
    const valueSpan = document.getElementById(`val-${name}`);
    if (valueSpan) {
      let suffix = '';
      if (name === 'rotation' || name === 'hueRotate') suffix = '°';
      if (name === 'grayscale' || name === 'sepia' || name === 'invert') suffix = '%';
      if (name === 'blur') suffix = 'px';
      valueSpan.textContent = `0${suffix}`;
    }
  });
}

/**
 * Commits a structural edit (Crop, Sobel, background removal, filter commit) to history, 
 * resets all filters to baseline 0, and updates the dynamic history tab.
 */
function commitStructuralChange(label) {
  // Capture new visual baseline
  committedFilterBaseline = state.getCurrentState();
  
  // Reset sliders back to 0 to prevent double filtering on top of committed pixels
  resetFilterSlidersToNeutral();
  
  // Update UI and headers
  statusDimensions.textContent = `${mainCanvas.width} x ${mainCanvas.height} px`;
  updateHistoryUI();
}

/**
 * Populates and renders the list items in the left-sidebar "Edit History" panel.
 * Clicking items shifts the state stack pointer, enabling full interactive history jumping!
 */
function updateHistoryUI() {
  historyContainer.innerHTML = '';
  
  if (state.historyStack.length === 0) {
    historyContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 11px; text-align: center; padding: 12px;">No history yet</div>';
    btnUndo.disabled = true;
    btnRedo.disabled = true;
    return;
  }

  btnUndo.disabled = !state.canUndo();
  btnRedo.disabled = !state.canRedo();

  // Draw history list backward (newest at top)
  for (let i = state.historyStack.length - 1; i >= 0; i--) {
    const item = document.createElement('div');
    item.className = `history-item ${i === state.historyIndex ? 'active' : ''}`;
    
    // Label matching
    let label = 'Filter Edits';
    if (i === 0) label = actionLabels.upload;
    else if (i === state.historyIndex && label === 'Filter Edits') {
      // Dynamic label matching logic can be refined, simple step indicators are perfect
      label = `Adjustment #${i}`;
    } else {
      label = `History State #${i}`;
    }

    // Give readable labels based on typical patterns
    if (i === 0) {
      label = actionLabels.upload;
    } else {
      label = `State Adjust #${i}`;
    }

    item.innerHTML = `<i class="fa-solid fa-history" style="font-size: 10px;"></i> ${label}`;
    
    // Interactive jumping through history steps!
    item.addEventListener('click', () => {
      deactivateCropMode();
      deactivatePerspectiveMode();
      resetFilterSlidersToNeutral();
      
      state.historyIndex = i;
      const stepData = state.getCurrentState();
      committedFilterBaseline = stepData;
      applyImageData(stepData, false);
      
      updateHistoryUI();
    });
    
    historyContainer.appendChild(item);
  }
}

/**
 * Show/Hide full screen computational spinners
 */
function showOverlaySpinner(message, progressVal) {
  loadingStatus.textContent = message;
  loadingPercentage.textContent = `${progressVal}%`;
  loadingOverlay.classList.add('active');
}

function hideOverlaySpinner() {
  loadingOverlay.classList.remove('active');
}
