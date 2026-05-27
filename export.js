// export.js - Export Operations

import { state } from './state.js';

/**
 * Renders an offscreen canvas at the target resolution, applies quality compressions, 
 * and triggers a client-side download of the final image.
 * 
 * @param {HTMLCanvasElement} sourceCanvas - The active visual canvas.
 * @param {Object} options - Export configurations: format, quality, width, height.
 */
export function exportImage(sourceCanvas, options) {
  const { format, quality, width, height } = options;

  const currentWidth = sourceCanvas.width;
  const currentHeight = sourceCanvas.height;

  // Default to current canvas dimensions if overrides are empty/null
  const targetWidth = parseInt(width, 10) || currentWidth;
  const targetHeight = parseInt(height, 10) || currentHeight;

  // 1. Create an offscreen canvas for scaling and compressing the final output
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = targetWidth;
  exportCanvas.height = targetHeight;
  const ctx = exportCanvas.getContext('2d');

  // Configure high-quality smoothing for the scaling step
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 2. Draw current canvas buffer scaled to target bounds
  ctx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);

  // 3. Match format types with standard MIME types
  let mimeType = 'image/png';
  let fileExtension = 'png';

  if (format === 'jpg' || format === 'jpeg') {
    mimeType = 'image/jpeg';
    fileExtension = 'jpg';
  } else if (format === 'webp') {
    mimeType = 'image/webp';
    fileExtension = 'webp';
  }

  // 4. Quality value conversion from slider percentages to 0.0-1.0 float bounds
  const qualityFactor = parseFloat(quality) / 100 || 0.92;

  // 5. Generate and download blob file
  exportCanvas.toBlob((blob) => {
    if (!blob) {
      console.error("Failed to generate final image blob for download.");
      return;
    }

    // Generate neat timestamped filename
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `toolkit_export_${timestamp}.${fileExtension}`;

    // Create temporary download anchor element
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;

    // Trigger download
    document.body.appendChild(link);
    link.click();
    
    // Cleanup reference
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    
  }, mimeType, format === 'png' ? undefined : qualityFactor);
}
