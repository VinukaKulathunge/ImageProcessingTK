// state.js - Central State Manager

export const state = {
  originalImage: null, // HTMLImageElement
  originalWidth: 0,
  originalHeight: 0,
  historyStack: [],    // Array of ImageData objects
  historyIndex: -1,
  maxHistory: 30,
  activeTool: 'filters', // 'basic', 'filters', 'transform', 'advanced', 'export'
  zoom: 'fit',          // 'fit', 0.5, 1.0, 2.0, etc.
  zoomLevel: 1,         // numeric scale factor
  beforeAfterMode: false, // true when user is viewing original

  // Slider values
  sliders: {
    // Basic / Adjust
    rotation: 0,        // free angle -180 to 180
    
    // Filters (Color & Light)
    brightness: 0,     // -100 to 100
    contrast: 0,       // -100 to 100
    saturation: 0,     // -100 to 100
    hueRotate: 0,      // -180 to 180
    exposure: 0,       // -100 to 100
    highlights: 0,     // -100 to 100
    shadows: 0,        // -100 to 100
    
    // Effects & Detail
    blur: 0,           // 0 to 50
    sharpen: 0,        // 0 to 100
    vignette: 0,       // 0 to 100
    grayscale: 0,      // 0 to 100
    sepia: 0,          // 0 to 100
    invert: 0,         // 0 to 100

    // Lens Distortion
    barrelDistortion: 0 // -100 to 100
  },

  resetSliders() {
    this.sliders = {
      rotation: 0,
      brightness: 0,
      contrast: 0,
      saturation: 0,
      hueRotate: 0,
      exposure: 0,
      highlights: 0,
      shadows: 0,
      blur: 0,
      sharpen: 0,
      vignette: 0,
      grayscale: 0,
      sepia: 0,
      invert: 0,
      barrelDistortion: 0
    };
  },

  pushHistory(imageData) {
    // If we've done undo-redos and then made a new edit, truncate forward history
    if (this.historyIndex < this.historyStack.length - 1) {
      this.historyStack = this.historyStack.slice(0, this.historyIndex + 1);
    }

    // Deep clone the ImageData buffer to prevent side effects
    const clone = new ImageData(
      new Uint8ClampedArray(imageData.data),
      imageData.width,
      imageData.height
    );

    this.historyStack.push(clone);
    if (this.historyStack.length > this.maxHistory) {
      this.historyStack.shift();
    }
    this.historyIndex = this.historyStack.length - 1;
  },

  undo() {
    if (this.canUndo()) {
      this.historyIndex--;
      return this.historyStack[this.historyIndex];
    }
    return null;
  },

  redo() {
    if (this.canRedo()) {
      this.historyIndex++;
      return this.historyStack[this.historyIndex];
    }
    return null;
  },

  canUndo() {
    return this.historyIndex > 0;
  },

  canRedo() {
    return this.historyIndex < this.historyStack.length - 1;
  },

  getCurrentState() {
    if (this.historyIndex >= 0 && this.historyIndex < this.historyStack.length) {
      return this.historyStack[this.historyIndex];
    }
    return null;
  },

  clearHistory() {
    this.historyStack = [];
    this.historyIndex = -1;
  }
};
