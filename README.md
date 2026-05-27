# Modular Image Processing Toolkit

A browser-based, client-side image processing application styled after professional photo editors like Figma and Adobe Lightroom. This toolkit operates entirely in the browser, using HTML5 Canvas, mathematical pixel matrices, and WebAssembly. No images ever leave the user's device, ensuring complete privacy and offline capability.

---

## Technical Highlights

### 1. Linear Homography Perspective Warping
The perspective warping tool utilizes four draggable corner pins to define a source quadrilateral. It dynamically solves a system of 8 linear equations matching these points to a standard rectangle using Gaussian Elimination with row pivoting. 
Inverse mapping is applied to project the target pixels back onto the original source coordinates. Bilinear interpolation calculates weighted color values for coordinates that fall between grid lines, resulting in sharp, alias-free warped shapes.

### 2. Linear-Time Box Blur Convolution
Unlike naive box-blur algorithms that run in O(Width * Height * Radius^2) time, this toolkit utilizes a sliding-window accumulation pass horizontally and then vertically. This reduces the complexity to O(Width * Height) linear time, allowing real-time 60fps renders even for massive images and large blur radii.

### 3. Screen-Composited Live RGB Histogram
To maintain performance during slider drag actions, the histogram downsamples pixels to approximately 40,000 steps. It calculates R, G, B, and Luminance channels sequentially. Overlapping regions automatically merge into visual secondary colors (cyan, magenta, yellow, white) using screen-composite blending, matching the behavior of Adobe Lightroom.

### 4. Local Neural Network Background Removal
Integrates WebAssembly (WASM) neural networks to run advanced image segmentation locally. The neural model runs inside a background worker, updating the main UI thread with progress ticks.

### 5. Multi-Step Undo and Redo History
Maintains a 30-step queue of full ImageData buffer states. This allows non-destructive state jumping; clicking any step in the left-sidebar stack restores that specific state. Structural changes (like a crop, warp, or background removal) automatically reset the color sliders to neutral and establish a new baseline, preventing double-filtering.

---

## File Architecture

* **index.html**: The application shell, structural layout, accordion panels, workspace viewport, and control panels.
* **style.css**: Figma-like dark aesthetic theme, layout grids, slider styling, and loading overlays.
* **ui.js**: Central event coordinator that binds sliders, keyboard keys, coordinate conversions, and history tabs.
* **state.js**: Centralized registry managing parameter sliders, viewport scale, and history buffers.
* **canvas.js**: Controls file loading, downscaling large dimensions (max 2048px) to protect system memory, viewport zoom level fittings, and rendering loops.
* **basic.js**: Handles crop boundary coordinates, 90-degree rotations, mirror flips, and custom canvas resizes.
* **filters.js**: Computes exposure, brightness, contrast, saturation, highlights, shadows, vignette, grayscale, sepia, hue rotation, sliding-window box blurs, and sharpening convolutions.
* **transform.js**: Computes 4-point perspective corner pins, solves homography projection matrices, and applies pincushion/barrel lens distortion.
* **histogram.js**: Calculates real-time RGB values and draws screen-blended graphical paths.
* **advanced.js**: Manages local WebAssembly background removal, Sobel edge maps, median noise reduction, and histogram equalization.
* **export.js**: Scales assets dynamically using offscreen buffers and packs them as downloadable PNG, JPEG, or WebP files.

---

## Getting Started

Because this application utilizes ES6 modules, the browser requires files to be served over HTTP/HTTPS rather than opened directly via the local file system (the file:// protocol) to prevent CORS security blocks.

### Option 1: Serve via Node.js (npx)
Ensure you have Node.js installed, then run the following command in the project directory:
```bash
npx http-server -p 8080
```
Then, open your web browser and navigate to:
```text
http://localhost:8080
```

### Option 2: Serve via Python
If Python is installed on your system, run the following command in the project directory:
```bash
python -m http.server 8080
```
Then, open your web browser and navigate to:
```text
http://localhost:8080
```

---

## Keyboard Shortcuts

* **Ctrl + Z**: Undo previous committed action
* **Ctrl + Y**: Redo next committed action
* **Ctrl + S**: Immediately download and export the image
* **Spacebar (Hold)**: Temporarily render the pristine original image to compare edits
