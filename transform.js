// transform.js - Geometric Transforms (Perspective & Lens Distortion)

import { state } from './state.js';
import { applyImageData, render } from './canvas.js';

export let perspectivePoints = []; // 4 points: TL, TR, BR, BL
export let perspectiveActive = false;

export function setPerspectiveActive(val) {
  perspectiveActive = val;
}

const POINT_RADIUS = 10;

/**
 * Initializes the perspective crop points at the 4 outer corners of the image.
 */
export function initPerspectivePoints(width, height) {
  perspectivePoints = [
    { x: 40, y: 40 },                  // Top-Left
    { x: width - 40, y: 40 },          // Top-Right
    { x: width - 40, y: height - 40 }, // Bottom-Right
    { x: 40, y: height - 40 }          // Bottom-Left
  ];
  perspectiveActive = true;
}

/**
 * Renders the perspective warp control points and guidelines on top of the main canvas.
 */
export function drawPerspectiveOverlay(ctx) {
  if (!perspectiveActive || perspectivePoints.length < 4) return;

  ctx.save();

  // Draw connecting boundary lines
  ctx.strokeStyle = '#3b82f6'; // Premium blue
  ctx.lineWidth = 2.5;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(perspectivePoints[0].x, perspectivePoints[0].y);
  ctx.lineTo(perspectivePoints[1].x, perspectivePoints[1].y);
  ctx.lineTo(perspectivePoints[2].x, perspectivePoints[2].y);
  ctx.lineTo(perspectivePoints[3].x, perspectivePoints[3].y);
  ctx.closePath();
  ctx.stroke();

  // Draw semi-transparent fill inside
  ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
  ctx.fill();

  // Draw control handles
  ctx.setLineDash([]);
  for (let i = 0; i < 4; i++) {
    const pt = perspectivePoints[i];
    
    // Core glow circle
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, POINT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // Tiny inner accent dot
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#2563eb';
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Finds the index of the corner point closest to the mouse cursor (within grab radius).
 */
export function getPerspectivePointAt(mx, my) {
  if (!perspectiveActive) return -1;
  
  const grabRadius = POINT_RADIUS * 2;
  for (let i = 0; i < 4; i++) {
    const pt = perspectivePoints[i];
    const dx = mx - pt.x;
    const dy = my - pt.y;
    if (dx * dx + dy * dy <= grabRadius * grabRadius) {
      return i;
    }
  }
  return -1;
}

/**
 * Warps the quad-shaped canvas area into a standard rectangle.
 * Solves a 3x3 homography matrix using Gaussian elimination and interpolates pixels.
 */
export function applyPerspectiveWarp(canvas) {
  if (!perspectiveActive || perspectivePoints.length < 4) return;

  const ctx = canvas.getContext('2d');
  const srcWidth = canvas.width;
  const srcHeight = canvas.height;
  const srcData = ctx.getImageData(0, 0, srcWidth, srcHeight);

  // Determine output rectangular dimensions based on average edge lengths
  const topW = Math.hypot(perspectivePoints[1].x - perspectivePoints[0].x, perspectivePoints[1].y - perspectivePoints[0].y);
  const botW = Math.hypot(perspectivePoints[2].x - perspectivePoints[3].x, perspectivePoints[2].y - perspectivePoints[3].y);
  const leftH = Math.hypot(perspectivePoints[3].x - perspectivePoints[0].x, perspectivePoints[3].y - perspectivePoints[0].y);
  const rightH = Math.hypot(perspectivePoints[2].x - perspectivePoints[1].x, perspectivePoints[2].y - perspectivePoints[1].y);
  
  const dstWidth = Math.round((topW + botW) / 2);
  const dstHeight = Math.round((leftH + rightH) / 2);

  const output = new ImageData(dstWidth, dstHeight);
  
  // Coordinates mapping:
  // Source Corners (quad): perspectivePoints[0], [1], [2], [3]
  // Destination Corners (rect): (0,0), (W,0), (W,H), (0,H)
  const srcCorners = perspectivePoints;
  const dstCorners = [
    { x: 0, y: 0 },
    { x: dstWidth, y: 0 },
    { x: dstWidth, y: dstHeight },
    { x: 0, y: dstHeight }
  ];

  // Solve for Homography Matrix H mapping destination -> source (inverse warping)
  const h = solveHomography(dstCorners, srcCorners);
  if (!h) {
    console.error("Warp math error: Singularity in perspective system solver.");
    perspectiveActive = false;
    render();
    return;
  }

  const sPixels = srcData.data;
  const dPixels = output.data;

  // Bilinear Pixel Interpolation Loop
  for (let dy = 0; dy < dstHeight; dy++) {
    const rowOffset = dy * dstWidth * 4;
    for (let dx = 0; dx < dstWidth; dx++) {
      const idx = rowOffset + dx * 4;

      // Project destination coordinate back to source space
      // Homography: u = (h0*x + h1*y + h2) / (h6*x + h7*y + h8)
      const wVal = h[6] * dx + h[7] * dy + h[8];
      const sx = (h[0] * dx + h[1] * dy + h[2]) / wVal;
      const sy = (h[3] * dx + h[4] * dy + h[5]) / wVal;

      // Skip if mapped coordinate falls outside original image bounds
      if (sx < 0 || sx >= srcWidth - 1 || sy < 0 || sy >= srcHeight - 1) {
        dPixels[idx] = 0;
        dPixels[idx+1] = 0;
        dPixels[idx+2] = 0;
        dPixels[idx+3] = 0;
        continue;
      }

      // Bilinear interpolation
      const x0 = sx | 0;
      const x1 = x0 + 1;
      const y0 = sy | 0;
      const y1 = y0 + 1;

      const tx = sx - x0;
      const ty = sy - y0;

      const idx00 = (y0 * srcWidth + x0) * 4;
      const idx10 = (y0 * srcWidth + x1) * 4;
      const idx01 = (y1 * srcWidth + x0) * 4;
      const idx11 = (y1 * srcWidth + x1) * 4;

      for (let c = 0; c < 4; c++) {
        // Red, Green, Blue, Alpha channels
        const val00 = sPixels[idx00 + c];
        const val10 = sPixels[idx10 + c];
        const val01 = sPixels[idx01 + c];
        const val11 = sPixels[idx11 + c];

        // Linear interpolation along x
        const valTop = val00 + tx * (val10 - val00);
        const valBot = val01 + tx * (val11 - val01);
        
        // Final interpolation along y
        dPixels[idx + c] = valTop + ty * (valBot - valTop);
      }
    }
  }

  // Adjust canvas size to warped bounds
  canvas.width = dstWidth;
  canvas.height = dstHeight;
  ctx.putImageData(output, 0, 0);

  applyImageData(output, true);
  perspectiveActive = false;
}

/**
 * Analytical Homography solver. Finds parameters of perspective project matrix:
 * [x']   [h0 h1 h2] [x]
 * [y'] = [h3 h4 h5] [y]
 * [1 ]   [h6 h7  1] [1]
 * Maps src points to dst points.
 */
function solveHomography(src, dst) {
  // Solve linear system A * h = B, where A is an 8x8 matrix
  const A = [];
  const B = [];

  for (let i = 0; i < 4; i++) {
    const sx = src[i].x;
    const sy = src[i].y;
    const dx = dst[i].x;
    const dy = dst[i].y;

    A.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx]);
    B.push(dx);

    A.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy]);
    B.push(dy);
  }

  const hCoeffs = solveGaussian(A, B);
  if (!hCoeffs) return null;

  // Add the 9th homogenous parameter (h8 = 1.0)
  hCoeffs.push(1.0);
  return hCoeffs;
}

/**
 * Standard Gaussian Elimination system solver for NxN matrices.
 */
function solveGaussian(A, B) {
  const n = B.length;
  for (let i = 0; i < n; i++) {
    // Search for maximum pivot in column i
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
        maxRow = k;
      }
    }

    // Swap row
    const tempA = A[i]; A[i] = A[maxRow]; A[maxRow] = tempA;
    const tempB = B[i]; B[i] = B[maxRow]; B[maxRow] = tempB;

    if (Math.abs(A[i][i]) < 1e-12) {
      return null; // Matrix is singular
    }

    // Pivot row division
    for (let k = i + 1; k < n; k++) {
      const factor = A[k][i] / A[i][i];
      for (let j = i; j < n; j++) {
        A[k][j] -= factor * A[i][j];
      }
      B[k] -= factor * B[i];
    }
  }

  // Back substitution
  const X = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < n; j++) {
      sum += A[i][j] * X[j];
    }
    X[i] = (B[i] - sum) / A[i][i];
  }
  return X;
}

/**
 * Radial Lens Distortion warper using Brown-Conrady model.
 * Real-time updates utilize current working image in place, commits on pointer release.
 */
export function applyLensDistortion(canvas, amount, pushToHistory = false) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  
  const currentData = state.getCurrentState();
  if (!currentData) return;

  const src = currentData.data;
  const output = new ImageData(w, h);
  const dst = output.data;

  // Center coordinate reference
  const cx = w / 2;
  const cy = h / 2;
  
  // Radial scaling parameter (normalize coordinates to limit warping inside the bounds)
  const maxRadius = Math.hypot(cx, cy);
  const k1 = (amount / 100) * 0.25; // Scale range: -0.25 to 0.25

  for (let y = 0; y < h; y++) {
    const rowOffset = y * w * 4;
    const dy = y - cy;
    
    for (let x = 0; x < w; x++) {
      const idx = rowOffset + x * 4;
      const dx = x - cx;

      const r = Math.hypot(dx, dy);
      const rn = r / maxRadius; // Normalized radius
      const factor = 1 + k1 * rn * rn; // Brown-Conrady simple radial formula

      // Mapped source coordinate
      const sx = cx + dx * factor;
      const sy = cy + dy * factor;

      // Copy pixels using Bilinear Interpolation
      if (sx < 0 || sx >= w - 1 || sy < 0 || sy >= h - 1) {
        // Void pixel: fill transparent
        dst[idx] = 0;
        dst[idx+1] = 0;
        dst[idx+2] = 0;
        dst[idx+3] = 0;
        continue;
      }

      const x0 = sx | 0;
      const x1 = x0 + 1;
      const y0 = sy | 0;
      const y1 = y0 + 1;

      const tx = sx - x0;
      const ty = sy - y0;

      const idx00 = (y0 * w + x0) * 4;
      const idx10 = (y0 * w + x1) * 4;
      const idx01 = (y1 * w + x0) * 4;
      const idx11 = (y1 * w + x1) * 4;

      for (let c = 0; c < 4; c++) {
        const val00 = src[idx00 + c];
        const val10 = src[idx10 + c];
        const val01 = src[idx01 + c];
        const val11 = src[idx11 + c];

        const valTop = val00 + tx * (val10 - val00);
        const valBot = val01 + tx * (val11 - val01);
        dst[idx + c] = valTop + ty * (valBot - valTop);
      }
    }
  }

  ctx.putImageData(output, 0, 0);

  if (pushToHistory) {
    applyImageData(output, true);
    state.sliders.barrelDistortion = 0; // Reset slider after committing changes
  } else {
    render();
  }
}
