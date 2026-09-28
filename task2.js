// Task 2: edge processing, motion detection and refinement.
// The additional pairs fill the four directions absent from the supplied images.
const TASK2_PAIR_PATHS = [
  {
    label: "Pair 1",
    expectedDirection: "RIGHT",
    frameAPath: "assets/task2/provided/pair1_1.png",
    frameBPath: "assets/task2/provided/pair1_2.png"
  },
  {
    label: "Pair 2",
    expectedDirection: "LEFT",
    frameAPath: "assets/task2/provided/pair2_1.png",
    frameBPath: "assets/task2/provided/pair2_2.png"
  },
  {
    label: "Pair 3",
    expectedDirection: "DOWN-RIGHT",
    frameAPath: "assets/task2/provided/pair3_1.png",
    frameBPath: "assets/task2/provided/pair3_2.png"
  },
  {
    label: "Pair 4",
    expectedDirection: "UP-LEFT",
    frameAPath: "assets/task2/provided/pair4_1.png",
    frameBPath: "assets/task2/provided/pair4_2.png"
  },
  {
    label: "Pair 5",
    expectedDirection: "UP",
    frameAPath: "assets/task2/generated/pair5_1.png",
    frameBPath: "assets/task2/generated/pair5_2.png"
  },
  {
    label: "Pair 6",
    expectedDirection: "DOWN",
    frameAPath: "assets/task2/generated/pair6_1.png",
    frameBPath: "assets/task2/generated/pair6_2.png"
  },
  {
    label: "Pair 7",
    expectedDirection: "UP-RIGHT",
    frameAPath: "assets/task2/generated/pair7_1.png",
    frameBPath: "assets/task2/generated/pair7_2.png"
  },
  {
    label: "Pair 8",
    expectedDirection: "DOWN-LEFT",
    frameAPath: "assets/task2/generated/pair8_1.png",
    frameBPath: "assets/task2/generated/pair8_2.png"
  }
];

// Ignore very weak responses when choosing an edge cutoff.
const TASK2_EDGE_CANDIDATE_MINIMUM = 8;
const TASK2_EDGE_PERCENTILE = 0.75;
const TASK2_ADAPTIVE_THRESHOLD_MINIMUM = 35;
const TASK2_ADAPTIVE_THRESHOLD_MAXIMUM = 150;
const TASK2_HISTOGRAM_BUCKET_COUNT = 32;
const TASK2_THRESHOLD_SLIDER_MINIMUM = TASK2_ADAPTIVE_THRESHOLD_MINIMUM;
const TASK2_THRESHOLD_SLIDER_MAXIMUM = TASK2_ADAPTIVE_THRESHOLD_MAXIMUM;
const TASK2_DEFAULT_MANUAL_THRESHOLD = Math.round(
  (TASK2_THRESHOLD_SLIDER_MINIMUM + TASK2_THRESHOLD_SLIDER_MAXIMUM) / 2
);

// Ignore small centroid shifts and keep a fixed size for the compact overlay.
const TASK2_DIRECTION_DEAD_ZONE = 10;
const TASK2_ALIGNMENT_PREVIEW_WIDTH = 126;
const TASK2_ALIGNMENT_PREVIEW_HEIGHT = 54;

// Keep the workflow, motion preview and histogram beside each other.
const TASK2_WORKFLOW_Y = 152;
const TASK2_WORKFLOW_WIDTH = 370;
const TASK2_WORKFLOW_HEIGHT = 444;
const TASK2_NOTICE_Y = 612;
const TASK2_NOTICE_HEIGHT = 52;
const TASK2_WORKSPACE_X = 470;
const TASK2_WORKSPACE_Y = 152;
const TASK2_WORKSPACE_WIDTH = 620;
const TASK2_WORKSPACE_HEIGHT = 444;
const TASK2_HISTOGRAM_X = TASK2_WORKSPACE_X + TASK2_WORKSPACE_WIDTH + 28;
const TASK2_HISTOGRAM_WIDTH = 280;
const TASK2_CANVAS_WIDTH = TASK2_HISTOGRAM_X + TASK2_HISTOGRAM_WIDTH + TASK_PANEL_X;
const TASK2_NOTICE_WIDTH = TASK2_CANVAS_WIDTH - TASK_PANEL_X * 2;

// Drawing and hit testing use the same pair selector dimensions.
const TASK2_PAIR_SELECTOR_WIDTH = 222;
const TASK2_PAIR_SELECTOR_HEIGHT = 26;
const TASK2_PAIR_SELECTOR_GAP = 6;
const TASK2_PAIR_SELECTOR_RIGHT_OFFSET = 256;
const TASK2_PAIR_SELECTOR_TOP_OFFSET = 30;

// Keep loaded images separate from results that depend on the selected pair.
class Task2State {
  constructor() {
    this.screenLoaded = false;
    this.pairsLoaded = false;
    this.pairLoadStarted = false;
    this.loadedImageCount = 0;
    this.failedImagePaths = [];
    this.currentPairIndex = 0;
    this.pairs = [];
    this.stepPulseFrames = {};
    this.notice = "Press p to load the panorama motion screen.";
    this.clearDerivedProcessing();
  }

  // Start a fresh load, including any retry after a missing image.
  beginPairLoad() {
    this.pairLoadStarted = true;
    this.pairsLoaded = false;
    this.loadedImageCount = 0;
    this.failedImagePaths = [];
    this.currentPairIndex = 0;
    this.pairs = [];
    this.clearDerivedProcessing();
    this.notice = "Loading the eight image pairs...";
  }

  // A new pair invalidates every processing stage, but leaves the originals loaded.
  clearDerivedProcessing() {
    this.grayscaleReady = false;
    this.grayscaleFrames = null;
    this.clearAfterGrayscale();
  }

  // Rebuilding grayscale also invalidates its edges, thresholds and motion results.
  clearAfterGrayscale() {
    this.edgesReady = false;
    this.edgeFrames = null;
    this.edgeHistograms = null;
    this.clearThresholdAndMotionResults();
  }

  // A new edge image needs fresh cutoffs, so reset the previous slider choice.
  clearThresholdAndMotionResults() {
    this.thresholdReady = false;
    this.thresholdFrames = null;
    this.adaptiveThresholds = null;
    this.resetThresholdControl();
    this.clearMotionResults();
  }

  resetThresholdControl() {
    this.manualThresholdValue = TASK2_DEFAULT_MANUAL_THRESHOLD;
    this.manualThresholdActive = false;
    this.thresholdSliderActive = false;
  }

  // Threshold changes preserve the edge images but invalidate their measurements.
  clearMotionResults() {
    this.centroidsReady = false;
    this.directionReady = false;
    this.centroids = null;
    this.motionVector = null;
    this.directionLabel = "";
  }
}

// Enforce the processing order and pass completed results to the views.
class Task2Controller {
  constructor(ui) {
    this.state = new Task2State();
    this.processor = new Task2ImageProcessor();
    this.refinement = new MotionRefinementView();
    this.histogram = new EdgeHistogramPanel(this);
    this.view = new Task2View(this, ui);
  }

  // Handle the detail view's return keys before the processing shortcuts.
  handleKeys(pressedKey) {
    if (pressedKey === "r") {
      if (this.refinement.result) {
        this.toggleDetails();
      } else {
        this.state.notice = "Press d after computing centroids, then r to inspect motion refinement.";
      }
      return false;
    }
    if (this.refinement.detailsOpen) {
      if (pressedKey === "escape") {
        this.toggleDetails();
      }
      return false;
    }
    if (pressedKey === "p") {
      if (!this.state.screenLoaded) {
        markStepPulse(this.state.stepPulseFrames, "p");
      }

      this.state.screenLoaded = true;
      this.state.notice = "Panorama screen is ready. Press i to load the image pairs.";
    } else if (pressedKey === "i") {
      if (!this.state.screenLoaded) {
        this.state.notice = "Press p to prepare the panorama screen, then i to load its images.";
        return;
      }

      this.loadPairs();
    } else if (pressedKey === "arrowleft") {
      this.selectPair(-1);
      return false;
    } else if (pressedKey === "arrowright") {
      this.selectPair(1);
      return false;
    } else if (pressedKey === "g") {
      this.createGrayscaleFrames();
    } else if (pressedKey === "e") {
      this.createEdgeFrames();
    } else if (pressedKey === "t") {
      this.createThresholdFrames();
    } else if (pressedKey === "n") {
      this.computeCentroids();
    } else if (pressedKey === "d") {
      this.computeDirection();
    }
  }

  // Cancel an unfinished slider drag when switching the analysis view.
  toggleDetails() {
    if (this.refinement.result) {
      this.state.thresholdSliderActive = false;
      this.refinement.detailsOpen = !this.refinement.detailsOpen;
    }
  }

  // Load both frames of every pair and keep the originals for later processing.
  loadPairs() {
    if (this.state.pairLoadStarted) {
      this.state.notice = "Task 2 image pairs have already been requested.";
      return;
    }

    this.state.beginPairLoad();
    this.state.pairs = TASK2_PAIR_PATHS.map(function (pairInfo) {
      return {
        label: pairInfo.label,
        frameA: null,
        frameB: null
      };
    });
    this.refinement.reset();

    for (let i = 0; i < TASK2_PAIR_PATHS.length; i++) {
      this.loadImage(i, "frameA", TASK2_PAIR_PATHS[i].frameAPath);
      this.loadImage(i, "frameB", TASK2_PAIR_PATHS[i].frameBPath);
    }
  }

  // Each callback records its own pair and frame, regardless of load order.
  loadImage(pairIndex, frameKey, imagePath) {
    loadImage(
      imagePath,
      (loadedImage) => {
        this.state.pairs[pairIndex][frameKey] = loadedImage;
        this.state.loadedImageCount++;
        this.updatePairLoadState();
      },
      () => {
        this.state.failedImagePaths.push(imagePath);
        this.updatePairLoadState();
      }
    );
  }

  // Wait for every request to settle before allowing a failed batch to be retried.
  updatePairLoadState() {
    const requiredImageCount = TASK2_PAIR_PATHS.length * 2;
    const finishedAttempts = this.state.loadedImageCount + this.state.failedImagePaths.length;
    const wasPairsLoaded = this.state.pairsLoaded;

    this.state.pairsLoaded = this.state.loadedImageCount === requiredImageCount;

    if (this.state.pairsLoaded) {
      if (!wasPairsLoaded) {
        markStepPulse(this.state.stepPulseFrames, "i");
      }

      this.state.notice = "Loaded all eight image pairs. Press g to process Pair 1.";
    } else if (finishedAttempts === requiredImageCount) {
      this.state.pairLoadStarted = false;
      this.state.notice = "Some Task 2 images could not load. Check the files, then press i to retry.";
    } else {
      this.state.notice = "Loading Task 2 image pairs...";
    }
  }

  // Clear the processing state and the cached extension preview together.
  resetProcessing() {
    this.state.clearDerivedProcessing();
    this.refinement.reset();
  }

  getCurrentPair() {
    return this.state.pairs[this.state.currentPairIndex] || null;
  }

  // Wrap at either end so keyboard browsing includes all eight pairs.
  selectPair(step) {
    if (!this.state.pairsLoaded) {
      this.state.notice = "Load the image pairs before selecting a pair.";
      return;
    }

    const pairCount = this.state.pairs.length;
    const nextPairIndex = (this.state.currentPairIndex + step + pairCount) % pairCount;
    this.selectPairByIndex(nextPairIndex);
  }

  // Pair buttons and arrow keys share the same selection and reset path.
  selectPairByIndex(pairIndex) {
    if (!this.state.pairsLoaded) {
      this.state.notice = "Load the image pairs before selecting a pair.";
      return;
    }

    if (pairIndex === this.state.currentPairIndex) {
      this.state.notice = this.getCurrentPair().label + " is already selected.";
      return;
    }

    this.state.currentPairIndex = constrain(pairIndex, 0, this.state.pairs.length - 1);
    this.resetProcessing();

    const selectedPair = this.getCurrentPair();
    this.state.notice = selectedPair.label + " selected. Press g to process this pair from the first step.";
  }

  // A slightly larger hit area makes the knob easier to grab; dragging stays active off the track.
  handleThresholdSliderMouse() {
    if (this.refinement.detailsOpen) {
      return;
    }

    const sliderBounds = this.view.getThresholdSliderBounds();
    const hitBoxX = sliderBounds.x - sliderBounds.handleRadius;
    const hitBoxY = sliderBounds.y - 18;
    const hitBoxWidth = sliderBounds.width + sliderBounds.handleRadius * 2;
    const hitBoxHeight = 36;
    const sliderWasHit = isMouseInside(hitBoxX, hitBoxY, hitBoxWidth, hitBoxHeight);

    if (!this.state.thresholdReady) {
      if (sliderWasHit) {
        this.state.notice = "Press t first, then drag the threshold slider if needed.";
      }

      return;
    }

    if (!this.state.thresholdSliderActive && !sliderWasHit) {
      return;
    }

    this.state.thresholdSliderActive = true;
    this.setManualThresholdFromMouse(sliderBounds);
  }

  // Convert the horizontal drag to one integer cutoff applied to both frames.
  setManualThresholdFromMouse(sliderBounds) {
    const constrainedMouseX = constrain(mouseX, sliderBounds.x, sliderBounds.x + sliderBounds.width);
    const nextThreshold = round(
      map(
        constrainedMouseX,
        sliderBounds.x,
        sliderBounds.x + sliderBounds.width,
        TASK2_THRESHOLD_SLIDER_MINIMUM,
        TASK2_THRESHOLD_SLIDER_MAXIMUM
      )
    );

    this.state.manualThresholdValue = nextThreshold;
    this.state.manualThresholdActive = true;
    this.updateThresholdFrames();
    this.state.notice = "Manual threshold " + nextThreshold + " applied. Press n to recompute centroids.";
  }

  // Process both originals together so each stage always compares the same pair.
  createGrayscaleFrames() {
    if (!this.state.pairsLoaded) {
      this.state.notice = "Load the image pair before converting to grayscale.";
      return;
    }

    const currentPair = this.getCurrentPair();
    this.state.grayscaleFrames = {
      frameA: this.processor.toGrayscale(currentPair.frameA),
      frameB: this.processor.toGrayscale(currentPair.frameB)
    };
    this.state.grayscaleReady = true;
    this.state.clearAfterGrayscale();
    this.refinement.reset();
    markStepPulse(this.state.stepPulseFrames, "g");
    this.state.notice = "Both frames are grayscale. Press e for the edge filter.";
  }

  // Keep the Sobel histograms for both automatic thresholding and the dashboard.
  createEdgeFrames() {
    if (!this.state.grayscaleReady) {
      this.state.notice = "Convert the pair to grayscale before applying the edge filter.";
      return;
    }

    const resultA = this.processor.sobelEdges(this.state.grayscaleFrames.frameA);
    const resultB = this.processor.sobelEdges(this.state.grayscaleFrames.frameB);
    this.state.edgeFrames = { frameA: resultA.image, frameB: resultB.image };
    this.state.edgeHistograms = { frameA: resultA.histogram, frameB: resultB.histogram };
    this.state.edgesReady = true;
    this.state.clearThresholdAndMotionResults();
    this.refinement.reset();
    markStepPulse(this.state.stepPulseFrames, "e");
    this.state.notice = "Simple edge filter applied. Press t to threshold the result.";
  }

  // Choose a cutoff per frame. The slider starts at their average until dragged.
  createThresholdFrames() {
    if (!this.state.edgesReady) {
      this.state.notice = "Apply the edge filter before thresholding.";
      return;
    }

    const thresholdA = this.processor.adaptiveThreshold(this.state.edgeHistograms.frameA);
    const thresholdB = this.processor.adaptiveThreshold(this.state.edgeHistograms.frameB);
    this.state.adaptiveThresholds = {
      frameA: thresholdA,
      frameB: thresholdB
    };
    this.state.manualThresholdActive = false;
    this.state.thresholdSliderActive = false;

    this.updateThresholdFrames();
    markStepPulse(this.state.stepPulseFrames, "t");
    this.state.notice = "Adaptive thresholds selected. Drag the slider only if fine tuning is needed.";
  }

  // Both automatic and manual cutoffs rebuild the masks and clear stale motion results.
  updateThresholdFrames() {
    if (!this.state.edgeFrames || !this.state.adaptiveThresholds) {
      return;
    }

    const thresholdA = this.getFrameThreshold("frameA");
    const thresholdB = this.getFrameThreshold("frameB");

    this.state.thresholdFrames = {
      frameA: this.processor.threshold(this.state.edgeFrames.frameA, thresholdA),
      frameB: this.processor.threshold(this.state.edgeFrames.frameB, thresholdB)
    };
    this.state.thresholdReady = true;
    this.state.clearMotionResults();
    this.refinement.reset();
  }

  // Manual mode shares one cutoff; automatic mode keeps each frame's own value.
  getFrameThreshold(frameKey) {
    if (this.state.manualThresholdActive) {
      return this.state.manualThresholdValue;
    }

    return this.state.adaptiveThresholds[frameKey];
  }

  // Measure the current binary images before enabling the direction calculation.
  computeCentroids() {
    if (!this.state.thresholdReady) {
      this.state.notice = "Threshold the edge images before computing centroids.";
      return;
    }

    this.state.centroids = {
      frameA: this.processor.centroid(this.state.thresholdFrames.frameA),
      frameB: this.processor.centroid(this.state.thresholdFrames.frameB)
    };
    this.state.centroidsReady = true;
    this.state.directionReady = false;
    this.refinement.reset();
    markStepPulse(this.state.stepPulseFrames, "n");
    this.state.notice = "Centroids computed. Press d to display the direction arrow.";
  }

  // Use centroid displacement for direction and keep refinement as a separate estimate.
  computeDirection() {
    if (!this.state.centroidsReady) {
      this.state.notice = "Compute centroids before displaying the direction arrow.";
      return;
    }

    const firstCentroid = this.state.centroids.frameA;
    const secondCentroid = this.state.centroids.frameB;

    if (!firstCentroid.valid || !secondCentroid.valid) {
      this.state.directionLabel = "NO CLEAR MOTION";
      this.state.motionVector = { dx: 0, dy: 0 };
    } else {
      const dx = secondCentroid.x - firstCentroid.x;
      const dy = secondCentroid.y - firstCentroid.y;
      this.state.motionVector = { dx: dx, dy: dy };
      this.state.directionLabel = this.processor.directionLabel(dx, dy);
    }

    this.state.directionReady = true;
    this.refinement.update(
      this.state.thresholdFrames.frameA,
      this.state.thresholdFrames.frameB,
      this.state.motionVector
    );
    markStepPulse(this.state.stepPulseFrames, "d");
    this.state.notice = this.state.directionLabel === "NO CLEAR MOTION"
      ? "No clear movement was found in this pair."
      : "Direction: " + this.state.directionLabel + ". " + this.refinement.interpretation() + ".";
  }

  // Test the analysis shortcuts and pair buttons before passing a click to the slider.
  mousePressed() {
    if (this.refinement.detailsOpen) {
      return;
    }
    if (this.view.isAnalysisButtonHovered() || this.refinement.contains(mouseX, mouseY)) {
      this.toggleDetails();
      return;
    }
    const clickedPairIndex = this.view.getPairChipIndexAtMouse();
    if (clickedPairIndex !== -1) {
      this.selectPairByIndex(clickedPairIndex);
      return;
    }
    this.handleThresholdSliderMouse();
  }
}

// Image operations return new images, leaving the loaded source pixels intact.
class Task2ImageProcessor {
  constructor() {
    this.minimumThreshold = TASK2_ADAPTIVE_THRESHOLD_MINIMUM;
    this.maximumThreshold = TASK2_ADAPTIVE_THRESHOLD_MAXIMUM;
    this.minimumEdge = TASK2_EDGE_CANDIDATE_MINIMUM;
    this.edgePercentile = TASK2_EDGE_PERCENTILE;
    this.directionDeadZone = TASK2_DIRECTION_DEAD_ZONE;
  }

  // Use luminance weights so colour differences become comparable brightness values.
  toGrayscale(sourceImage) {
    const grayscaleImage = createImage(sourceImage.width, sourceImage.height);

    sourceImage.loadPixels();
    grayscaleImage.loadPixels();

    for (let y = 0; y < sourceImage.height; y++) {
      for (let x = 0; x < sourceImage.width; x++) {
        const pixelIndex = getPixelIndex(x, y, sourceImage.width);
        const redValue = sourceImage.pixels[pixelIndex];
        const greenValue = sourceImage.pixels[pixelIndex + 1];
        const blueValue = sourceImage.pixels[pixelIndex + 2];

        const grayValue = 0.299 * redValue + 0.587 * greenValue + 0.114 * blueValue;

        grayscaleImage.pixels[pixelIndex] = grayValue;
        grayscaleImage.pixels[pixelIndex + 1] = grayValue;
        grayscaleImage.pixels[pixelIndex + 2] = grayValue;
        grayscaleImage.pixels[pixelIndex + 3] = 255;
      }
    }

    grayscaleImage.updatePixels();
    return grayscaleImage;
  }

  // Build the edge image and its histogram in the same pass through the pixels.
  sobelEdges(grayscaleImage) {
    const edgeImage = createImage(grayscaleImage.width, grayscaleImage.height);
    const histogram = {
      counts: new Uint32Array(256),
      buckets: new Uint32Array(TASK2_HISTOGRAM_BUCKET_COUNT),
      total: 0,
      peak: 0
    };

    grayscaleImage.loadPixels();
    edgeImage.loadPixels();

    for (let y = 0; y < grayscaleImage.height; y++) {
      for (let x = 0; x < grayscaleImage.width; x++) {
        const pixelIndex = getPixelIndex(x, y, grayscaleImage.width);

        // The outer border has no full 3x3 neighbourhood, so leave it black.
        if (x === 0 || y === 0 || x === grayscaleImage.width - 1 || y === grayscaleImage.height - 1) {
          edgeImage.pixels[pixelIndex] = 0;
          edgeImage.pixels[pixelIndex + 1] = 0;
          edgeImage.pixels[pixelIndex + 2] = 0;
          edgeImage.pixels[pixelIndex + 3] = 255;
        } else {
          // Horizontal and vertical 3x3 Sobel kernels.
          const gx =
            -this.grayValue(grayscaleImage, x - 1, y - 1) +
            this.grayValue(grayscaleImage, x + 1, y - 1) -
            2 * this.grayValue(grayscaleImage, x - 1, y) +
            2 * this.grayValue(grayscaleImage, x + 1, y) -
            this.grayValue(grayscaleImage, x - 1, y + 1) +
            this.grayValue(grayscaleImage, x + 1, y + 1);
          const gy =
            -this.grayValue(grayscaleImage, x - 1, y - 1) -
            2 * this.grayValue(grayscaleImage, x, y - 1) -
            this.grayValue(grayscaleImage, x + 1, y - 1) +
            this.grayValue(grayscaleImage, x - 1, y + 1) +
            2 * this.grayValue(grayscaleImage, x, y + 1) +
            this.grayValue(grayscaleImage, x + 1, y + 1);
          const edgeStrength = constrain(sqrt(gx * gx + gy * gy), 0, 255);

          edgeImage.pixels[pixelIndex] = edgeStrength;
          edgeImage.pixels[pixelIndex + 1] = edgeStrength;
          edgeImage.pixels[pixelIndex + 2] = edgeStrength;
          edgeImage.pixels[pixelIndex + 3] = 255;

          // Count the stored value so the chart and threshold use identical rounding.
          const edgeValue = edgeImage.pixels[pixelIndex];
          if (edgeValue >= this.minimumEdge) {
            const bucket = Math.floor(edgeValue * TASK2_HISTOGRAM_BUCKET_COUNT / 256);
            histogram.counts[edgeValue]++;
            histogram.buckets[bucket]++;
            histogram.total++;
            histogram.peak = Math.max(histogram.peak, histogram.buckets[bucket]);
          }
        }
      }
    }

    edgeImage.updatePixels();
    return { image: edgeImage, histogram };
  }

  // Select the upper quartile of edge candidates rather than the mostly black background.
  adaptiveThreshold(histogram) {
    if (histogram.total === 0) {
      return this.maximumThreshold;
    }

    // Clamp the percentile value to the range available on the manual slider.
    const targetRank = max(1, floor(histogram.total * this.edgePercentile));
    let runningCount = 0;

    for (let edgeValue = 0; edgeValue < histogram.counts.length; edgeValue++) {
      runningCount += histogram.counts[edgeValue];

      if (runningCount >= targetRank) {
        return constrain(edgeValue, this.minimumThreshold, this.maximumThreshold);
      }
    }

    return this.maximumThreshold;
  }

  // The inclusive cutoff produces a binary mask for centroid and edge matching calculations.
  threshold(edgeImage, thresholdValue) {
    const thresholdImage = createImage(edgeImage.width, edgeImage.height);

    edgeImage.loadPixels();
    thresholdImage.loadPixels();

    for (let y = 0; y < edgeImage.height; y++) {
      for (let x = 0; x < edgeImage.width; x++) {
        const pixelIndex = getPixelIndex(x, y, edgeImage.width);
        const edgeValue = edgeImage.pixels[pixelIndex];
        const thresholdedValue = edgeValue >= thresholdValue ? 255 : 0;

        thresholdImage.pixels[pixelIndex] = thresholdedValue;
        thresholdImage.pixels[pixelIndex + 1] = thresholdedValue;
        thresholdImage.pixels[pixelIndex + 2] = thresholdedValue;
        thresholdImage.pixels[pixelIndex + 3] = 255;
      }
    }

    thresholdImage.updatePixels();
    return thresholdImage;
  }

  // Give every white pixel equal weight when averaging its image coordinates.
  centroid(thresholdImage) {
    thresholdImage.loadPixels();

    let sumX = 0;
    let sumY = 0;
    let edgePixelCount = 0;

    for (let y = 0; y < thresholdImage.height; y++) {
      for (let x = 0; x < thresholdImage.width; x++) {
        const pixelIndex = getPixelIndex(x, y, thresholdImage.width);

        if (thresholdImage.pixels[pixelIndex] > 0) {
          sumX += x;
          sumY += y;
          edgePixelCount++;
        }
      }
    }

    // Return an invalid centre fallback instead of dividing by zero.
    if (edgePixelCount === 0) {
      return {
        x: thresholdImage.width / 2,
        y: thresholdImage.height / 2,
        count: 0,
        valid: false
      };
    }

    return {
      x: sumX / edgePixelCount,
      y: sumY / edgePixelCount,
      count: edgePixelCount,
      valid: true
    };
  }

  // Grayscale channels are identical, so Sobel only needs the first channel.
  grayValue(grayscaleImage, x, y) {
    return grayscaleImage.pixels[getPixelIndex(x, y, grayscaleImage.width)];
  }

  // Classify each axis separately. Image y increases downwards.
  directionLabel(dx, dy) {
    // A small dead zone prevents tiny centroid shifts from being misread as movement.
    const movesRight = dx > this.directionDeadZone;
    const movesLeft = dx < -this.directionDeadZone;
    const movesDown = dy > this.directionDeadZone;
    const movesUp = dy < -this.directionDeadZone;
    let horizontalText = "";
    let verticalText = "";

    if (movesRight) {
      horizontalText = "RIGHT";
    } else if (movesLeft) {
      horizontalText = "LEFT";
    }

    if (movesDown) {
      verticalText = "DOWN";
    } else if (movesUp) {
      verticalText = "UP";
    }

    if (horizontalText !== "" && verticalText !== "") {
      return verticalText + "-" + horizontalText;
    }

    if (horizontalText !== "") {
      return horizontalText;
    }

    if (verticalText !== "") {
      return verticalText;
    }

    return "NO CLEAR MOTION";
  }
}

// Display cached edge distributions and the cutoffs currently used by the processor.
class EdgeHistogramPanel {
  constructor(controller) {
    this.controller = controller;
    this.state = controller.state;
  }

  // Stack one chart per frame so different automatic cutoffs remain visible.
  draw(x, y, panelWidth, panelHeight) {
    stroke(UI_THEME.border);
    strokeWeight(1);
    fill(UI_THEME.panel);
    rect(x, y, panelWidth, panelHeight, 8);

    noStroke();
    fill(UI_THEME.text);
    textAlign(LEFT, BASELINE);
    textStyle(BOLD);
    textSize(22);
    text("Edge histograms", x + 20, y + 42);
    fill(UI_THEME.muted);
    textStyle(NORMAL);
    textSize(13);
    const mode = this.state.thresholdReady
      ? (this.state.manualThresholdActive ? "Manual cutoff" : "Adaptive cutoffs")
      : "Edge strength distribution";
    text(mode, x + 20, y + 70);

    for (let i = 0; i < 2; i++) {
      const frameKey = i === 0 ? "frameA" : "frameB";
      const histogram = this.state.edgeHistograms ? this.state.edgeHistograms[frameKey] : null;
      const threshold = this.state.thresholdReady ? this.controller.getFrameThreshold(frameKey) : null;
      this.drawFrame(x + 20, y + 92 + i * 158, panelWidth - 40, i === 0 ? "Frame A" : "Frame B", histogram, threshold);
    }

    noStroke();
    fill(108, 205, 197);
    rect(x + 20, y + panelHeight - 41, 8, 8, 2);
    fill(UI_THEME.muted);
    textSize(10);
    text("Below cutoff", x + 33, y + panelHeight - 34);
    fill(248, 198, 80);
    rect(x + 122, y + panelHeight - 41, 8, 8, 2);
    fill(UI_THEME.muted);
    text("Kept", x + 135, y + panelHeight - 34);
    fill(248, 84, 120);
    rect(x + 185, y + panelHeight - 42, 2, 10);
    fill(UI_THEME.muted);
    text("Cutoff", x + 193, y + panelHeight - 34);
    fill(UI_THEME.subtle);
    text("Strength 0–255; values below 8 omitted.", x + 20, y + panelHeight - 16);
  }

  // Scale bars to this frame's largest bucket and draw the cutoff on the 0-255 axis.
  drawFrame(x, y, frameWidth, title, histogram, threshold) {
    noStroke();
    textAlign(LEFT, BASELINE);
    textStyle(BOLD);
    textSize(12);
    fill(UI_THEME.text);
    text(title, x, y + 16);
    textAlign(RIGHT, BASELINE);
    fill(threshold === null ? color(UI_THEME.subtle) : color(248, 84, 120));
    const thresholdLabel = threshold === null ? (histogram ? "press t" : "—") : "t = " + threshold;
    text(thresholdLabel, x + frameWidth, y + 16);
    textAlign(LEFT, BASELINE);

    const chartX = x + 30;
    const chartY = y + 30;
    const chartWidth = frameWidth - 30;
    const chartHeight = 78;
    const peak = histogram ? histogram.peak : 0;
    fill(UI_THEME.inset);
    rect(chartX, chartY, chartWidth, chartHeight, 3);

    textStyle(NORMAL);
    textSize(9);
    for (let i = 0; i <= 2; i++) {
      const lineY = chartY + chartHeight * i / 2;
      stroke(UI_THEME.borderSoft);
      strokeWeight(1);
      line(chartX, lineY, chartX + chartWidth, lineY);
      noStroke();
      fill(UI_THEME.subtle);
      textAlign(RIGHT, CENTER);
      text(this.formatCount(Math.round(peak * (1 - i / 2))), chartX - 5, lineY);
    }

    if (histogram && histogram.total > 0) {
      const barWidth = chartWidth / histogram.buckets.length;
      const cutoffX = threshold === null ? chartX + chartWidth : chartX + threshold / 256 * chartWidth;
      noStroke();
      for (let i = 0; i < histogram.buckets.length; i++) {
        const barHeight = histogram.buckets[i] / peak * chartHeight;
        const barX = chartX + i * barWidth + 1;
        const barY = chartY + chartHeight - barHeight;
        const barRight = barX + barWidth - 2;
        fill(108, 205, 197);
        rect(barX, barY, barWidth - 2, barHeight);
        // A cutoff can cross a bucket, so colour only the part to its right.
        if (threshold !== null && barRight > cutoffX) {
          const keptX = Math.max(barX, cutoffX);
          fill(248, 198, 80);
          rect(keptX, barY, barRight - keptX, barHeight);
        }
      }
    } else {
      noStroke();
      fill(UI_THEME.subtle);
      textAlign(CENTER, CENTER);
      textSize(11);
      text(histogram ? "No edge candidates" : "Press e to build the histogram", chartX + chartWidth / 2, chartY + chartHeight / 2);
    }

    if (threshold !== null) {
      const markerX = chartX + threshold / 256 * chartWidth;
      stroke(248, 84, 120);
      strokeWeight(2);
      line(markerX, chartY - 3, markerX, chartY + chartHeight + 3);
    }

    noStroke();
    fill(UI_THEME.subtle);
    textStyle(NORMAL);
    textSize(10);
    textAlign(LEFT, BASELINE);
    text("0", chartX, chartY + chartHeight + 15);
    textAlign(CENTER, BASELINE);
    text("128", chartX + chartWidth / 2, chartY + chartHeight + 15);
    textAlign(RIGHT, BASELINE);
    text("255", chartX + chartWidth, chartY + chartHeight + 15);
    textAlign(LEFT, BASELINE);

    let caption = histogram ? histogram.total.toLocaleString("en-US") + " edge candidates" : "Available after the edge filter";
    // Use the full 256-value counts for an exact retained count, not the wider display buckets.
    if (histogram && threshold !== null) {
      let kept = 0;
      for (let value = threshold; value < histogram.counts.length; value++) {
        kept += histogram.counts[value];
      }
      caption = kept.toLocaleString("en-US") + " / " + histogram.total.toLocaleString("en-US") + " edge pixels kept";
    }
    fill(UI_THEME.muted);
    text(caption, x, y + 143);
  }

  formatCount(count) {
    return count >= 1000 ? (count / 1000).toFixed(1) + "k" : String(count);
  }
}

// Search for a local translation using binary edges; rotation and scale are not estimated.
class MotionRefiner {
  constructor() {
    this.searchRadius = 24;
    this.coarseStep = 3;
    this.peakSeparation = 6;
    this.minimumEdges = 40;
    this.minimumLead = 0.05;
  }

  // Start from the centroid displacement, then compare nearby integer pixel offsets.
  refine(frameA, frameB, initialVector) {
    const edgesA = this.collectEdges(frameA);
    const edgesB = this.collectEdges(frameB);
    this.frames = { a: edgesA, b: edgesB };
    const centerX = Math.round(initialVector.dx);
    const centerY = Math.round(initialVector.dy);
    // Coarse and fine searches overlap, so score each offset only once.
    const cache = new Map();
    const evaluate = (dx, dy) => {
      const key = dx + "," + dy;
      if (!cache.has(key)) {
        cache.set(key, { dx, dy, ...this.score(edgesA, edgesB, dx, dy) });
      }
      return cache.get(key);
    };
    // Retain both baselines for the comparison shown in the extension view.
    const before = evaluate(0, 0);
    const centroid = evaluate(centerX, centerY);
    const range = {
      minX: centerX - this.searchRadius,
      maxX: centerX + this.searchRadius,
      minY: centerY - this.searchRadius,
      maxY: centerY + this.searchRadius,
      step: this.coarseStep
    };
    const grid = [];
    // Keeping the centroid candidate ensures refinement cannot lower its overlap score.
    let best = centroid;
    let runnerUp = null;

    if (edgesA.x.length >= this.minimumEdges && edgesB.x.length >= this.minimumEdges) {
      for (let dy = range.minY; dy <= range.maxY; dy += this.coarseStep) {
        for (let dx = range.minX; dx <= range.maxX; dx += this.coarseStep) {
          grid.push(evaluate(dx, dy));
        }
      }

      // Refine several peaks so a coarse sample does not hide a narrow match.
      const ranked = grid.slice().sort((a, b) => this.compare(a, b, centroid));
      const seeds = [];
      for (const candidate of ranked) {
        if (seeds.every(seed => this.separated(candidate, seed))) {
          seeds.push(candidate);
        }
        if (seeds.length === 4) {
          break;
        }
      }
      seeds.push(centroid);
      for (const seed of seeds) {
        for (let dy = Math.max(range.minY, seed.dy - this.coarseStep);
          dy <= Math.min(range.maxY, seed.dy + this.coarseStep); dy++) {
          for (let dx = Math.max(range.minX, seed.dx - this.coarseStep);
            dx <= Math.min(range.maxX, seed.dx + this.coarseStep); dx++) {
            evaluate(dx, dy);
          }
        }
      }

      // The unaligned baseline may lie outside the search and must not become its winner.
      const candidates = [...cache.values()].filter(candidate =>
        candidate.dx >= range.minX && candidate.dx <= range.maxX &&
        candidate.dy >= range.minY && candidate.dy <= range.maxY
      );
      candidates.sort((a, b) => this.compare(a, b, centroid));
      best = candidates[0];
      runnerUp = candidates.find(candidate => this.separated(candidate, best)) || null;
    }

    // The lead is over distinct tested offsets, not an exhaustive search of every translation.
    const margin = runnerUp ? best.score - runnerUp.score : 0;
    const atBoundary = best.dx <= range.minX + 1 || best.dx >= range.maxX - 1 ||
      best.dy <= range.minY + 1 || best.dy >= range.maxY - 1;
    const reliability = this.assess(edgesA.x.length, edgesB.x.length, best.score, margin, atBoundary);
    return {
      ready: edgesA.x.length >= this.minimumEdges && edgesB.x.length >= this.minimumEdges,
      status: reliability.label,
      reason: reliability.reason,
      initial: { dx: initialVector.dx, dy: initialVector.dy },
      refined: { dx: best.dx, dy: best.dy },
      before, centroid, best, margin,
      search: { ...range, radius: this.searchRadius, center: { dx: centerX, dy: centerY }, grid },
      evaluatedCount: cache.size
    };
  }

  // Sparse coordinates speed up matching; masks provide constant-time pixel lookups.
  collectEdges(frame) {
    frame.loadPixels();
    const width = frame.width;
    const height = frame.height;
    const mask = new Uint8Array(width * height);
    const nearMask = new Uint8Array(width * height);
    const xCoordinates = [];
    const yCoordinates = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (frame.pixels[(y * width + x) * 4] > 0) {
          mask[y * width + x] = 1;
          xCoordinates.push(x);
          yCoordinates.push(y);
          // Expand each edge by one pixel in every direction to tolerate small contour differences.
          for (let nearY = Math.max(0, y - 1); nearY <= Math.min(height - 1, y + 1); nearY++) {
            for (let nearX = Math.max(0, x - 1); nearX <= Math.min(width - 1, x + 1); nearX++) {
              nearMask[nearY * width + nearX] = 1;
            }
          }
        }
      }
    }
    return { width, height, mask, nearMask, x: xCoordinates, y: yCoordinates };
  }

  // Match in both directions so unmatched edges in either frame reduce the combined score.
  score(edgesA, edgesB, dx, dy) {
    let matchedA = 0;
    let matchedB = 0;
    let exactMatches = 0;

    // dx and dy describe A to B; shifted edges outside either frame remain unmatched.
    for (let i = 0; i < edgesA.x.length; i++) {
      const x = edgesA.x[i] + dx;
      const y = edgesA.y[i] + dy;
      if (x >= 0 && x < edgesB.width && y >= 0 && y < edgesB.height) {
        const index = y * edgesB.width + x;
        matchedA += edgesB.nearMask[index];
        exactMatches += edgesB.mask[index];
      }
    }
    for (let i = 0; i < edgesB.x.length; i++) {
      const x = edgesB.x[i] - dx;
      const y = edgesB.y[i] - dy;
      if (x >= 0 && x < edgesA.width && y >= 0 && y < edgesA.height) {
        matchedB += edgesA.nearMask[y * edgesA.width + x];
      }
    }

    // The harmonic mean stays low when only one frame has a strong match rate.
    const coverageA = edgesA.x.length ? matchedA / edgesA.x.length : 0;
    const coverageB = edgesB.x.length ? matchedB / edgesB.x.length : 0;
    const coverageSum = coverageA + coverageB;
    const countSum = edgesA.x.length + edgesB.x.length;
    return {
      score: coverageSum ? 2 * coverageA * coverageB / coverageSum : 0,
      aMatched: matchedA, bMatched: matchedB,
      aTotal: edgesA.x.length, bTotal: edgesB.x.length,
      exact: countSum ? 2 * exactMatches / countSum : 0
    };
  }

  // Rank by overlap, exact matches, then proximity to the centroid for a stable tie break.
  compare(a, b, center) {
    if (Math.abs(a.score - b.score) > 1e-12) {
      return b.score - a.score;
    }
    // Exact matches resolve the one-pixel plateau introduced by the tolerance.
    if (Math.abs(a.exact - b.exact) > 1e-12) {
      return b.exact - a.exact;
    }
    const distanceA = (a.dx - center.dx) ** 2 + (a.dy - center.dy) ** 2;
    const distanceB = (b.dx - center.dx) ** 2 + (b.dy - center.dy) ** 2;
    return distanceA - distanceB || a.dy - b.dy || a.dx - b.dx;
  }

  // Treat nearby samples of the same peak as one alternative when judging ambiguity.
  separated(a, b) {
    return Math.hypot(a.dx - b.dx, a.dy - b.dy) >= this.peakSeparation;
  }

  // These checks describe the available evidence.
  assess(countA, countB, score, margin, atBoundary) {
    if (Math.min(countA, countB) < this.minimumEdges) {
      return { label: "Insufficient edges", reason: "At least 40 selected pixels are needed in each frame." };
    }
    if (atBoundary) {
      return { label: "Ambiguous match", reason: "The best offset reaches the search limit; a wider search may differ." };
    }
    if (score < 0.45) {
      return { label: "Ambiguous match", reason: "Most edges do not agree at the best offset." };
    }
    if (margin <= this.minimumLead + 1e-12) {
      return { label: "Ambiguous match", reason: "A distinct tested offset has a similar score." };
    }
    return { label: "Clear match", reason: "This offset leads the tested alternatives by more than 5 percentage points." };
  }
}

// Share one refinement result and overlay between the compact panel and the detail screen.
class MotionRefinementView {
  constructor() {
    this.refiner = new MotionRefiner();
    this.reset();
  }

  // Release the offscreen canvas and edge cache whenever their input becomes stale.
  reset() {
    if (this.previewGraphic) {
      this.previewGraphic.remove();
    }
    this.refiner.frames = null;
    this.result = null;
    this.previewGraphic = null;
    this.detailsOpen = false;
    this.bounds = null;
  }

  // Run the search and build its overlay once after D, rather than on every draw frame.
  update(frameA, frameB, motionVector) {
    this.reset();
    this.result = this.refiner.refine(frameA, frameB, motionVector);
    if (this.result.ready) {
      this.previewGraphic = this.buildOverlay();
    }
  }

  interpretation() {
    return this.result ? this.result.status : "Press d to refine motion";
  }

  // The whole compact panel opens details, but only after a result exists.
  contains(x, y) {
    return this.result && this.bounds && x >= this.bounds.x &&
      x <= this.bounds.x + this.bounds.width && y >= this.bounds.y &&
      y <= this.bounds.y + this.bounds.height;
  }

  // Draw A in place and shift B backwards by the estimated A-to-B displacement.
  buildOverlay() {
    const { a, b } = this.refiner.frames;
    const { dx, dy } = this.result.refined;
    const graphic = createGraphics(384, 256);
    graphic.pixelDensity(1);
    graphic.background(5, 8, 14);
    // Centre A's full bounds in the preview and preserve the source aspect ratio.
    const scale = Math.min((graphic.width - 16) / a.width, (graphic.height - 16) / a.height);
    const left = (graphic.width - a.width * scale) / 2;
    const top = (graphic.height - a.height * scale) / 2;
    graphic.noFill();
    graphic.stroke(48, 61, 83);
    graphic.rect(left, top, a.width * scale, a.height * scale);
    graphic.strokeWeight(1);
    graphic.stroke(108, 205, 197, 180);
    for (let i = 0; i < a.x.length; i++) {
      graphic.point(left + a.x[i] * scale, top + a.y[i] * scale);
    }
    for (let i = 0; i < b.x.length; i++) {
      const x = b.x[i] - dx;
      const y = b.y[i] - dy;
      // Clip the drawing to A's bounds; scoring still counts the clipped edges as unmatched.
      if (x >= 0 && x < a.width && y >= 0 && y < a.height) {
        const matched = a.nearMask[y * a.width + x] > 0;
        graphic.stroke(matched ? color(248, 198, 80, 220) : color(248, 84, 120, 190));
        graphic.point(left + x * scale, top + y * scale);
      }
    }
    return graphic;
  }

  // Keep the compact summary within the existing motion panel dimensions.
  draw(x, y, panelWidth, panelHeight) {
    this.bounds = { x, y, width: panelWidth, height: panelHeight };
    noStroke();
    fill(UI_THEME.panel);
    rect(x, y, panelWidth, panelHeight, 5);
    textAlign(LEFT, BASELINE);
    textStyle(BOLD);
    textSize(12);
    fill(UI_THEME.text);
    text("Motion refinement", x + 12, y + 19);
    if (this.result) {
      textAlign(RIGHT, BASELINE);
      textSize(10);
      fill(108, 205, 197);
      text("Inspect  R", x + panelWidth - 12, y + 19);
      textAlign(LEFT, BASELINE);
    }
    const previewX = x + 12;
    const previewY = y + 30;
    const previewWidth = TASK2_ALIGNMENT_PREVIEW_WIDTH;
    const previewHeight = TASK2_ALIGNMENT_PREVIEW_HEIGHT;
    stroke(UI_THEME.borderSoft);
    strokeWeight(1);
    fill(5, 8, 14);
    rect(previewX, previewY, previewWidth, previewHeight, 2);
    if (this.previewGraphic) {
      drawImageInsideBox(this.previewGraphic, previewX + 1, previewY + 1, previewWidth - 2, previewHeight - 2);
    } else {
      noStroke();
      textAlign(CENTER, CENTER);
      textStyle(NORMAL);
      textSize(11);
      fill(UI_THEME.subtle);
      text(this.result ? "Too few edges" : "Press d to refine", previewX + previewWidth / 2, previewY + previewHeight / 2);
      textAlign(LEFT, BASELINE);
    }
    noStroke();
    textStyle(NORMAL);
    const scoreX = previewX + previewWidth + 12;
    const scoreWidth = panelWidth - (scoreX - x) - 10;
    if (this.result) {
      const rows = [["Raw", this.result.before], ["Centroid", this.result.centroid], ["Refined", this.result.best]];
      for (let i = 0; i < rows.length; i++) {
        fill(i === 2 ? color(248, 198, 80) : color(UI_THEME.muted));
        drawFittedText(rows[i][0] + ": " + this.percent(rows[i][1].score), scoreX, y + 43 + i * 18, scoreWidth, 11, 10);
      }
    }
    fill(this.statusColour());
    drawFittedText(this.interpretation(), x + 12, y + 103, panelWidth - 24, 11, 10);
    fill(UI_THEME.muted);
    const note = this.result && this.result.ready
      ? "Refined dx " + this.result.refined.dx + ", dy " + this.result.refined.dy + " px  |  R: details"
      : "Balanced edge matching in both directions";
    drawFittedText(note, x + 12, y + 119, panelWidth - 24, 10, 9);
  }

  // Use the same wide canvas for measurements, the overlay and the search evidence.
  drawDetails(ui) {
    ui.drawBackdrop(color(UI_THEME.motion));
    ui.drawHeader("Motion analysis", "Motion refinement and reliability");
    this.drawMeasurements(72, 152, 410, 490);
    this.drawOverlayPanel(504, 152, 446, 490);
    this.drawSearchPanel(972, 152, 426, 490);
    ui.drawFooter("R / Esc: return to motion preview   Scores measure edge overlap, not the probability of a correct result.");
  }

  // All three detail panels share the same frame and heading spacing.
  panel(x, y, panelWidth, panelHeight, title) {
    stroke(UI_THEME.border);
    strokeWeight(1);
    fill(UI_THEME.panel);
    rect(x, y, panelWidth, panelHeight, 8);
    noStroke();
    fill(UI_THEME.text);
    textAlign(LEFT, BASELINE);
    textStyle(BOLD);
    textSize(20);
    text(title, x + 24, y + 36);
    textStyle(NORMAL);
  }

  // Keep the original centroid estimate visible beside the best tested offset and its gain.
  drawMeasurements(x, y, panelWidth, panelHeight) {
    this.panel(x, y, panelWidth, panelHeight, "Measured and refined motion");
    fill(UI_THEME.muted);
    textSize(12);
    text("Displacement from Frame A to Frame B", x + 24, y + 61);
    const result = this.result;
    const rows = [
      ["Required centroid estimate", result.initial, color(108, 205, 197)],
      ["Best tested offset", result.ready ? result.refined : null, color(248, 198, 80)]
    ];
    for (let i = 0; i < rows.length; i++) {
      const top = y + 82 + i * 84;
      fill(UI_THEME.inset);
      rect(x + 24, top, panelWidth - 48, 70, 5);
      fill(UI_THEME.muted);
      textSize(12);
      text(rows[i][0], x + 38, top + 23);
      fill(rows[i][2]);
      textStyle(BOLD);
      textSize(20);
      const vector = rows[i][1];
      text(vector ? "dx " + vector.dx.toFixed(1) + "   dy " + vector.dy.toFixed(1) + " px" : "Insufficient evidence", x + 38, top + 51);
      textStyle(NORMAL);
    }
    const scores = [["Before alignment", result.before.score], ["Centroid alignment", result.centroid.score], ["Refined alignment", result.best.score]];
    for (let i = 0; i < scores.length; i++) {
      const rowY = y + 278 + i * 42;
      fill(UI_THEME.muted);
      textSize(12);
      text(scores[i][0], x + 24, rowY);
      textAlign(RIGHT, BASELINE);
      fill(i === 2 ? color(248, 198, 80) : color(UI_THEME.text));
      text(this.percent(scores[i][1]), x + panelWidth - 24, rowY);
      textAlign(LEFT, BASELINE);
      fill(UI_THEME.borderSoft);
      rect(x + 24, rowY + 10, panelWidth - 48, 5, 2);
      fill(i === 2 ? color(248, 198, 80) : color(108, 205, 197));
      rect(x + 24, rowY + 10, (panelWidth - 48) * scores[i][1], 5, 2);
    }
    fill(UI_THEME.success);
    textStyle(BOLD);
    textSize(14);
    const gain = Math.max(0, result.best.score - result.centroid.score) * 100;
    text("Refinement gain: +" + gain.toFixed(1) + " percentage points", x + 24, y + 409);
    textStyle(NORMAL);
    fill(UI_THEME.muted);
    textSize(11);
    text("Scores use integer pixel offsets and a 1 px tolerance.", x + 24, y + 438);
    text("The required centroid calculation stays unchanged.", x + 24, y + 458);
  }

  // The legend and separate match counts explain the colours in the cached overlay.
  drawOverlayPanel(x, y, panelWidth, panelHeight) {
    this.panel(x, y, panelWidth, panelHeight, "Refined edge alignment");
    fill(UI_THEME.muted);
    textSize(12);
    text("Frame B shifted back by the best tested offset", x + 24, y + 61);
    fill(5, 8, 14);
    rect(x + 24, y + 82, panelWidth - 48, 266, 5);
    if (this.previewGraphic) {
      drawImageInsideBox(this.previewGraphic, x + 25, y + 83, panelWidth - 50, 264);
    }
    const legend = [["A edges", color(108, 205, 197)], ["B edges", color(248, 84, 120)], ["Matched", color(248, 198, 80)]];
    for (let i = 0; i < legend.length; i++) {
      fill(legend[i][1]);
      rect(x + 24 + i * 126, y + 368, 9, 9, 2);
      fill(UI_THEME.muted);
      textSize(12);
      text(legend[i][0], x + 40 + i * 126, y + 376);
    }
    const score = this.result.best;
    fill(UI_THEME.muted);
    textSize(12);
    text("A edges matched: " + score.aMatched + " / " + score.aTotal, x + 24, y + 410);
    text("B edges matched: " + score.bMatched + " / " + score.bTotal, x + 24, y + 433);
    fill(UI_THEME.subtle);
    textSize(11);
    text("Balanced F1 combines both match rates.", x + 24, y + 457);
    text("Overlay shows A's bounds; off-frame edges still count.", x + 24, y + 475);
  }

  // Plot the coarse samples; the refined marker can lie between their cell centres.
  drawSearchPanel(x, y, panelWidth, panelHeight) {
    this.panel(x, y, panelWidth, panelHeight, "Search evidence");
    const result = this.result;
    const search = result.search;
    fill(UI_THEME.muted);
    textSize(12);
    text("±" + search.radius + " px around centroid · " + search.step + " px coarse / 1 px fine", x + 24, y + 61);
    const chartX = x + 62;
    const chartY = y + 92;
    const chartSize = 242;
    const cells = Math.round(search.radius * 2 / search.step) + 1;
    const cellSize = chartSize / cells;
    fill(5, 8, 14);
    rect(chartX, chartY, chartSize, chartSize, 3);
    for (const point of search.grid) {
      const column = (point.dx - search.minX) / search.step;
      const row = (point.dy - search.minY) / search.step;
      fill(lerpColor(color(14, 36, 55), color(248, 198, 80), point.score));
      rect(chartX + column * cellSize, chartY + row * cellSize, cellSize - 1, cellSize - 1);
    }
    // Half a cell aligns displacement coordinates with the centres of the scored cells.
    const pointX = value => chartX + ((value - search.minX) / search.step + 0.5) * cellSize;
    const pointY = value => chartY + ((value - search.minY) / search.step + 0.5) * cellSize;
    if (result.ready) {
      noFill();
      stroke(243, 246, 251);
      strokeWeight(2);
      circle(pointX(search.center.dx), pointY(search.center.dy), 13);
      stroke(248, 84, 120);
      const bestX = pointX(result.refined.dx);
      const bestY = pointY(result.refined.dy);
      line(bestX - 5, bestY, bestX + 5, bestY);
      line(bestX, bestY - 5, bestX, bestY + 5);
    }
    noStroke();
    fill(UI_THEME.muted);
    textSize(10);
    textAlign(CENTER, BASELINE);
    text(search.minX, chartX + cellSize / 2, chartY + chartSize + 17);
    text(search.center.dx, chartX + chartSize / 2, chartY + chartSize + 17);
    text(search.maxX, chartX + chartSize - cellSize / 2, chartY + chartSize + 17);
    text("dx (px)", chartX + chartSize / 2, chartY + chartSize + 34);
    textAlign(RIGHT, CENTER);
    text(search.minY, chartX - 9, chartY + cellSize / 2);
    text(search.center.dy, chartX - 9, chartY + chartSize / 2);
    text(search.maxY, chartX - 9, chartY + chartSize - cellSize / 2);
    textAlign(LEFT, BASELINE);
    text("dy", x + 24, chartY - 10);
    for (let i = 0; i < 80; i++) {
      fill(lerpColor(color(14, 36, 55), color(248, 198, 80), 1 - i / 79));
      rect(chartX + chartSize + 22, chartY + i * 2, 10, 2);
    }
    fill(UI_THEME.muted);
    text("100%", chartX + chartSize + 36, chartY + 8);
    text("0%", chartX + chartSize + 36, chartY + 160);
    text("○ centroid   + refined", chartX, chartY + chartSize + 53);
    fill(this.statusColour());
    textStyle(BOLD);
    textSize(17);
    text(result.status, x + 24, y + 408);
    textStyle(NORMAL);
    textSize(11);
    textLeading(16);
    fill(UI_THEME.muted);
    text(result.reason, x + 24, y + 421, panelWidth - 48, 35);
    const lead = result.ready ? " · tested lead " + (result.margin * 100).toFixed(1) + " pp" : "";
    fill(UI_THEME.subtle);
    const countLabel = result.evaluatedCount === 1 ? " offset evaluated" : " offsets evaluated";
    text(result.evaluatedCount + countLabel + lead, x + 24, y + 475);
  }

  statusColour() {
    return this.result && this.result.status === "Clear match" ? color(UI_THEME.success) : color(UI_THEME.warning);
  }

  percent(value) {
    return (value * 100).toFixed(1) + "%";
  }
}

// Draw the current processing stage and expose the same geometry for mouse interaction.
class Task2View {
  constructor(controller, ui) {
    this.controller = controller;
    this.state = controller.state;
    this.ui = ui;
  }

  // Details replace the workspace so hidden controls cannot overlap the analysis screen.
  draw() {
    if (this.controller.refinement.detailsOpen) {
      this.controller.refinement.drawDetails(this.ui);
      return;
    }
    this.ui.drawBackdrop(color(UI_THEME.motion));
    this.ui.drawHeader("Task 2", "Panorama Motion Guide");

    const pairCountText = this.state.loadedImageCount + "/" + TASK2_PAIR_PATHS.length * 2;

    this.ui.drawWorkflowPanel(
      TASK_PANEL_X,
      TASK2_WORKFLOW_Y,
      TASK2_WORKFLOW_WIDTH,
      TASK2_WORKFLOW_HEIGHT,
      "Required sequence",
      color(UI_THEME.motion)
    );
    this.ui.drawStatusRow(
      210,
      "p",
      "Load panorama screen",
      this.state.screenLoaded,
      getStepPulseAmount(this.state.stepPulseFrames, "p")
    );
    this.ui.drawStatusRow(
      266,
      "i",
      "Load image pairs (" + pairCountText + ")",
      this.state.pairsLoaded,
      getStepPulseAmount(this.state.stepPulseFrames, "i")
    );
    this.ui.drawStatusRow(
      322,
      "g",
      "Convert both frames to grayscale",
      this.state.grayscaleReady,
      getStepPulseAmount(this.state.stepPulseFrames, "g")
    );
    this.ui.drawStatusRow(
      378,
      "e",
      "Apply simple edge filter",
      this.state.edgesReady,
      getStepPulseAmount(this.state.stepPulseFrames, "e")
    );
    this.ui.drawStatusRow(
      434,
      "t",
      "Threshold edge output",
      this.state.thresholdReady,
      getStepPulseAmount(this.state.stepPulseFrames, "t")
    );
    this.ui.drawStatusRow(
      490,
      "n",
      "Compute centroids",
      this.state.centroidsReady,
      getStepPulseAmount(this.state.stepPulseFrames, "n")
    );
    this.ui.drawStatusRow(
      546,
      "d",
      "Display direction arrow",
      this.state.directionReady,
      getStepPulseAmount(this.state.stepPulseFrames, "d")
    );

    this.drawNotice();
    this.drawWorkspace(TASK2_WORKSPACE_X, TASK2_WORKSPACE_Y, TASK2_WORKSPACE_WIDTH, TASK2_WORKSPACE_HEIGHT);
    this.controller.histogram.draw(TASK2_HISTOGRAM_X, TASK2_WORKSPACE_Y, TASK2_HISTOGRAM_WIDTH, TASK2_WORKSPACE_HEIGHT);

    this.ui.drawFooter(windowWidth < width
      ? "Scroll right to view the histogram. Press 1 for Task 1."
      : "Left / Right: image pair   Drag the slider: threshold   1: Task 1");
  }

  // Show the next processing step, or offer the analysis once D has finished.
  drawNotice() {
    const hasFailedImages = this.state.failedImagePaths.length > 0;
    const nextStepLabel = this.getNextStepLabel();

    noStroke();
    fill(UI_THEME.panel);
    rect(TASK_PANEL_X, TASK2_NOTICE_Y, TASK2_NOTICE_WIDTH, TASK2_NOTICE_HEIGHT, 8);

    fill(UI_THEME.muted);
    textAlign(LEFT, BASELINE);
    textSize(12);
    textStyle(NORMAL);
    drawFittedText(
      this.state.notice,
      TASK_PANEL_X + 24,
      TASK2_NOTICE_Y + 33,
      650,
      12,
      10
    );

    if (hasFailedImages) {
      fill(UI_THEME.warning);
      drawFittedText(
        "Expected files: provided pairs 1-4 and generated pairs 5-8.",
        TASK_PANEL_X + 690,
        TASK2_NOTICE_Y + 33,
        280,
        11,
        9
      );
    } else {
      this.drawNextStepChip(nextStepLabel);
    }
  }

  // Check dependencies in processing order, including any stage cleared by a later edit.
  getNextStepLabel() {
    if (!this.state.screenLoaded) {
      return "NEXT: P";
    }

    if (!this.state.pairsLoaded) {
      return "NEXT: I";
    }

    if (!this.state.grayscaleReady) {
      return "NEXT: G";
    }

    if (!this.state.edgesReady) {
      return "NEXT: E";
    }

    if (!this.state.thresholdReady) {
      return "NEXT: T";
    }

    if (!this.state.centroidsReady) {
      return "NEXT: N";
    }

    if (!this.state.directionReady) {
      return "NEXT: D";
    }

    return "R: VIEW ANALYSIS";
  }

  // Drawing and clicking share the wider bounds used by the analysis action.
  getNextStepChipBounds() {
    const hasAnalysis = Boolean(this.controller.refinement.result);
    const chipWidth = hasAnalysis ? 160 : 94;
    const chipHeight = hasAnalysis ? 30 : 22;
    return {
      x: TASK_PANEL_X + TASK2_NOTICE_WIDTH - 48 - chipWidth,
      y: TASK2_NOTICE_Y + (TASK2_NOTICE_HEIGHT - chipHeight) / 2,
      width: chipWidth,
      height: chipHeight
    };
  }

  isAnalysisButtonHovered() {
    if (!this.controller.refinement.result || this.controller.refinement.detailsOpen ||
        this.state.failedImagePaths.length > 0) {
      return false;
    }
    const bounds = this.getNextStepChipBounds();
    return isMouseInside(bounds.x, bounds.y, bounds.width, bounds.height);
  }

  drawNextStepChip(labelText) {
    const bounds = this.getNextStepChipBounds();
    const hasAnalysis = Boolean(this.controller.refinement.result);
    const isHovered = this.isAnalysisButtonHovered();
    const chipColour = hasAnalysis ? color(UI_THEME.success) : color(UI_THEME.motion);

    stroke(red(chipColour), green(chipColour), blue(chipColour), isHovered ? 235 : 150);
    strokeWeight(1);
    fill(isHovered ? color(UI_THEME.raised) : color(UI_THEME.inset));
    rect(bounds.x, bounds.y, bounds.width, bounds.height, 6);

    noStroke();
    fill(chipColour);
    textAlign(CENTER, CENTER);
    textStyle(BOLD);
    textSize(hasAnalysis ? 11 : 10);
    text(labelText, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    textAlign(LEFT, BASELINE);
  }

  // Preserve the frame sizes while placing pair selection above and measurements below.
  drawWorkspace(x, y, workspaceWidth, workspaceHeight) {
    stroke(UI_THEME.border);
    strokeWeight(1);
    fill(UI_THEME.panel);
    rect(x, y, workspaceWidth, workspaceHeight, 8);

    noStroke();
    fill(UI_THEME.text);
    textAlign(LEFT, BASELINE);
    textStyle(BOLD);
    textSize(22);
    text("Motion preview", x + 26, y + 42);

    fill(UI_THEME.muted);
    textStyle(NORMAL);
    textSize(13);
    drawFittedText(this.getStageLabel(), x + 26, y + 70, 322, 13, 10);

    const pairSelectorBounds = this.getPairSelectorBounds();
    this.drawPairSelector(
      pairSelectorBounds.x,
      pairSelectorBounds.y,
      pairSelectorBounds.width,
      this.state.currentPairIndex
    );
    this.drawPairNavigationHint(pairSelectorBounds.x, pairSelectorBounds.y + 38, pairSelectorBounds.width);

    const frames = this.getDisplayFrames();
    const panelY = y + 88;
    const panelWidth = 268;
    const panelHeight = 154;
    const firstPanelX = x + 28;
    const secondPanelX = x + workspaceWidth - panelWidth - 28;

    this.drawFramePanel(
      firstPanelX,
      panelY,
      panelWidth,
      panelHeight,
      "Frame A",
      frames ? frames.frameA : null,
      this.state.centroidsReady ? this.state.centroids.frameA : null
    );
    this.drawFramePanel(
      secondPanelX,
      panelY,
      panelWidth,
      panelHeight,
      "Frame B",
      frames ? frames.frameB : null,
      this.state.centroidsReady ? this.state.centroids.frameB : null
    );

    this.drawThresholdSlider(this.getThresholdSliderBounds());
    this.drawDirectionArea(x + 28, y + 300, workspaceWidth - 56, 128);
  }

  // Divide the available width evenly, keeping the same gaps used by hit testing.
  drawPairSelector(x, y, selectorWidth, activeIndex) {
    const hoveredIndex = this.getPairChipIndexAtMouse();
    const chipWidth = (selectorWidth - TASK2_PAIR_SELECTOR_GAP * (TASK2_PAIR_PATHS.length - 1)) / TASK2_PAIR_PATHS.length;

    for (let i = 0; i < TASK2_PAIR_PATHS.length; i++) {
      const chipX = x + i * (chipWidth + TASK2_PAIR_SELECTOR_GAP);
      const isActive = i === activeIndex;
      const isHovered = i === hoveredIndex;

      stroke(isActive ? color(UI_THEME.motion) : isHovered ? color(UI_THEME.motion) : color(UI_THEME.border));
      strokeWeight(isActive ? 2 : 1);
      fill(isActive ? color(UI_THEME.raised) : isHovered ? color(UI_THEME.raised) : color(UI_THEME.inset));
      rect(chipX, y, chipWidth, TASK2_PAIR_SELECTOR_HEIGHT, 4);

      noStroke();
      fill(isActive ? color(UI_THEME.motion) : isHovered ? color(UI_THEME.motion) : color(UI_THEME.muted));
      textAlign(CENTER, CENTER);
      textStyle(BOLD);
      textSize(10);
      text(i + 1, chipX + chipWidth / 2, y + TASK2_PAIR_SELECTOR_HEIGHT / 2);
    }

    textAlign(LEFT, BASELINE);
  }

  drawPairNavigationHint(x, y, hintWidth) {
    noStroke();
    fill(UI_THEME.subtle);
    textAlign(CENTER, BASELINE);
    textStyle(NORMAL);
    textSize(9);
    text("Click chips or use LEFT / RIGHT", x + hintWidth / 2, y);
    textAlign(LEFT, BASELINE);
  }

  // Fit the selected processing output inside the panel without stretching it.
  drawFramePanel(x, y, panelWidth, panelHeight, labelText, frameImage, centroid) {
    stroke(UI_THEME.borderSoft);
    strokeWeight(1);
    fill(UI_THEME.inset);
    rect(x, y, panelWidth, panelHeight, 6);

    noStroke();
    fill(UI_THEME.text);
    textAlign(LEFT, BASELINE);
    textStyle(BOLD);
    textSize(11);
    text(labelText, x + 10, y + 18);

    const imageBox = {
      x: x + 10,
      y: y + 28,
      width: panelWidth - 20,
      height: panelHeight - 40
    };

    stroke(UI_THEME.borderSoft);
    strokeWeight(1);
    fill(0);
    rect(imageBox.x, imageBox.y, imageBox.width, imageBox.height, 2);

    if (frameImage) {
      const fittedBox = drawImageInsideBox(frameImage, imageBox.x, imageBox.y, imageBox.width, imageBox.height);

      // Convert image coordinates using the fitted image bounds, including its letterboxing.
      if (centroid && centroid.valid) {
        this.drawCentroidMarker(
          fittedBox.x + centroid.x * fittedBox.width / frameImage.width,
          fittedBox.y + centroid.y * fittedBox.height / frameImage.height
        );
      }
    } else {
      noStroke();
      fill(UI_THEME.subtle);
      textAlign(CENTER, CENTER);
      textSize(12);
      textStyle(NORMAL);
      text("Waiting", imageBox.x + imageBox.width / 2, imageBox.y + imageBox.height / 2);
      textAlign(LEFT, BASELINE);
    }
  }

  drawCentroidMarker(x, y) {
    stroke(248, 84, 120);
    strokeWeight(2);
    noFill();
    circle(x, y, 12);
    line(x - 8, y, x + 8, y);
    line(x, y - 8, x, y + 8);
  }

  // Show a shared manual value or the average of the two automatic cutoffs at the knob.
  drawThresholdSlider(sliderBounds) {
    const sliderEnabled = this.state.thresholdReady && this.state.adaptiveThresholds !== null;
    const thresholdValue = this.getDisplayedThresholdValue();
    const knobX = map(
      thresholdValue,
      TASK2_THRESHOLD_SLIDER_MINIMUM,
      TASK2_THRESHOLD_SLIDER_MAXIMUM,
      sliderBounds.x,
      sliderBounds.x + sliderBounds.width
    );
    const labelText = sliderEnabled && this.state.manualThresholdActive ? "Manual threshold" : "Edge threshold";
    const modeText = this.getThresholdModeText();

    noStroke();
    textAlign(LEFT, CENTER);
    textStyle(BOLD);
    textSize(11);
    fill(sliderEnabled ? color(UI_THEME.text) : color(UI_THEME.subtle));
    text(labelText, TASK2_WORKSPACE_X + 28, sliderBounds.y);

    stroke(sliderEnabled ? color(UI_THEME.border) : color(UI_THEME.borderSoft));
    strokeWeight(5);
    line(sliderBounds.x, sliderBounds.y, sliderBounds.x + sliderBounds.width, sliderBounds.y);

    if (sliderEnabled) {
      stroke(UI_THEME.motion);
      line(sliderBounds.x, sliderBounds.y, knobX, sliderBounds.y);
      this.drawSliderValueTag(knobX, sliderBounds.y - 19, "t=" + thresholdValue, sliderBounds);
    }

    noStroke();
    fill(sliderEnabled ? color(UI_THEME.motion) : color(UI_THEME.border));
    circle(knobX, sliderBounds.y, sliderBounds.handleRadius * 2);

    fill(sliderEnabled ? color(UI_THEME.muted) : color(UI_THEME.subtle));
    textAlign(LEFT, CENTER);
    textStyle(NORMAL);
    textSize(11);
    text(modeText, sliderBounds.x + sliderBounds.width + 18, sliderBounds.y);
    textAlign(LEFT, BASELINE);
  }

  // Keep the value tag inside the track even when the knob reaches either endpoint.
  drawSliderValueTag(centerX, centerY, labelText, sliderBounds) {
    textAlign(CENTER, CENTER);
    textStyle(BOLD);
    textSize(9);

    const tagWidth = max(36, textWidth(labelText) + 12);
    const tagHeight = 16;
    const leftLimit = sliderBounds.x + tagWidth / 2;
    const rightLimit = sliderBounds.x + sliderBounds.width - tagWidth / 2;
    const tagCenterX = constrain(centerX, leftLimit, rightLimit);

    noStroke();
    fill(UI_THEME.inset);
    rect(tagCenterX - tagWidth / 2, centerY - tagHeight / 2, tagWidth, tagHeight, 4);

    fill(UI_THEME.motion);
    text(labelText, tagCenterX, centerY);

    stroke(UI_THEME.motion);
    strokeWeight(1);
    line(centerX, centerY + tagHeight / 2, centerX, sliderBounds.y - 6);
  }

  // The automatic average positions the knob; it does not replace either frame's cutoff.
  getDisplayedThresholdValue() {
    if (this.state.manualThresholdActive) {
      return this.state.manualThresholdValue;
    }

    if (this.state.adaptiveThresholds) {
      return round((this.state.adaptiveThresholds.frameA + this.state.adaptiveThresholds.frameB) / 2);
    }

    return TASK2_DEFAULT_MANUAL_THRESHOLD;
  }

  getThresholdModeText() {
    if (!this.state.thresholdReady || !this.state.adaptiveThresholds) {
      return "press t";
    }

    if (this.state.manualThresholdActive) {
      return "manual " + this.state.manualThresholdValue;
    }

    return "auto " + this.state.adaptiveThresholds.frameA + "/" + this.state.adaptiveThresholds.frameB;
  }

  // Give the centroid result and refinement separate panels so their estimates stay distinct.
  drawDirectionArea(x, y, areaWidth, areaHeight) {
    const resultWidth = 270;
    const panelGap = 14;
    this.drawDetectedDirection(x, y, resultWidth, areaHeight);
    this.controller.refinement.draw(x + resultWidth + panelGap, y, areaWidth - resultWidth - panelGap, areaHeight);
  }

  // Show the measured vector beside the expected label, which is only a comparison reference.
  drawDetectedDirection(x, y, panelWidth, panelHeight) {
    const pair = TASK2_PAIR_PATHS[this.state.currentPairIndex];
    const ready = this.state.directionReady;
    const hasMotion = ready && this.state.directionLabel !== "NO CLEAR MOTION";
    const centerX = x + 48;
    const centerY = y + 52;

    noStroke();
    fill(UI_THEME.panel);
    rect(x, y, panelWidth, panelHeight, 5);
    fill(UI_THEME.text);
    textAlign(LEFT, BASELINE);
    textStyle(BOLD);
    textSize(12);
    text("Detected direction", x + 94, y + 22);

    stroke(UI_THEME.borderSoft);
    strokeWeight(1);
    fill(UI_THEME.inset);
    circle(centerX, centerY, 76);

    if (hasMotion) {
      const { dx, dy } = this.state.motionVector;
      // A fixed display length keeps large displacements inside the direction dial.
      const magnitude = Math.hypot(dx, dy);
      const unitX = dx / magnitude;
      const unitY = dy / magnitude;
      drawTask2ArrowLine(
        centerX - unitX * 29, centerY - unitY * 29,
        centerX + unitX * 29, centerY + unitY * 29,
        color(248, 84, 120), 6, 17
      );
    } else {
      noStroke();
      fill(UI_THEME.subtle);
      textAlign(CENTER, CENTER);
      textSize(12);
      text(ready ? "no vector" : "press d", centerX, centerY);
      textAlign(LEFT, BASELINE);
    }

    noStroke();
    fill(hasMotion ? color(248, 198, 80) : color(UI_THEME.muted));
    textStyle(BOLD);
    drawFittedText(ready ? this.state.directionLabel : "Awaiting result", x + 94, y + 48, panelWidth - 106, 19, 12);
    fill(UI_THEME.muted);
    textStyle(NORMAL);
    textSize(11);
    text("Expected: " + pair.expectedDirection, x + 94, y + 69);

    const centroids = this.state.centroids;
    const formatPoint = (point) => point && point.valid ? point.x.toFixed(1) + ", " + point.y.toFixed(1) : "no edges";
    const coordinateText = this.state.centroidsReady
      ? "A (" + formatPoint(centroids.frameA) + ")   B (" + formatPoint(centroids.frameB) + ")"
      : "Press n to show centroid coordinates";
    fill(UI_THEME.muted);
    drawFittedText(coordinateText, x + 12, y + 103, panelWidth - 24, 11, 10);

    const vector = this.state.motionVector;
    const vectorText = ready && centroids.frameA.valid && centroids.frameB.valid
      ? "dx = " + vector.dx.toFixed(1) + " px     dy = " + vector.dy.toFixed(1) + " px"
      : "dx = CxB - CxA     dy = CyB - CyA";
    fill(UI_THEME.success);
    drawFittedText(vectorText, x + 12, y + 119, panelWidth - 24, 11, 10);
  }

  // Prefer the latest completed image stage, falling back to originals before processing.
  getDisplayFrames() {
    const currentPair = this.controller.getCurrentPair();

    if (this.state.thresholdReady) {
      return this.state.thresholdFrames;
    }

    if (this.state.edgesReady) {
      return this.state.edgeFrames;
    }

    if (this.state.grayscaleReady) {
      return this.state.grayscaleFrames;
    }

    if (this.state.pairsLoaded && currentPair) {
      return {
        frameA: currentPair.frameA,
        frameB: currentPair.frameB
      };
    }

    return null;
  }

  // Use the same stage priority as the frame preview when describing the visible images.
  getStageLabel() {
    const pairInfo = TASK2_PAIR_PATHS[this.state.currentPairIndex];
    const pairLabel = pairInfo.label + " of " + TASK2_PAIR_PATHS.length;

    if (this.state.thresholdReady) {
      if (this.state.manualThresholdActive) {
        return pairLabel + " - manual threshold";
      }

      return pairLabel + " - adaptive threshold";
    }

    if (this.state.edgesReady) {
      return pairLabel + " - Sobel edges";
    }

    if (this.state.grayscaleReady) {
      return pairLabel + " - grayscale frames";
    }

    if (this.state.pairsLoaded) {
      return pairLabel + " - original frames";
    }

    if (this.state.screenLoaded) {
      return "Waiting for image pair loading";
    }

    return "Waiting for panorama screen";
  }

  getPairSelectorBounds() {
    return {
      x: TASK2_WORKSPACE_X + TASK2_WORKSPACE_WIDTH - TASK2_PAIR_SELECTOR_RIGHT_OFFSET,
      y: TASK2_WORKSPACE_Y + TASK2_PAIR_SELECTOR_TOP_OFFSET,
      width: TASK2_PAIR_SELECTOR_WIDTH,
      height: TASK2_PAIR_SELECTOR_HEIGHT
    };
  }

  // Test individual chips so the spaces between them do not select a pair.
  getPairChipIndexAtMouse() {
    const selectorBounds = this.getPairSelectorBounds();
    const pairCount = TASK2_PAIR_PATHS.length;
    const chipWidth = (selectorBounds.width - TASK2_PAIR_SELECTOR_GAP * (pairCount - 1)) / pairCount;

    for (let i = 0; i < pairCount; i++) {
      const chipX = selectorBounds.x + i * (chipWidth + TASK2_PAIR_SELECTOR_GAP);

      if (isMouseInside(chipX, selectorBounds.y, chipWidth, selectorBounds.height)) {
        return i;
      }
    }

    return -1;
  }

  getThresholdSliderBounds() {
    return {
      x: TASK2_WORKSPACE_X + 160,
      y: TASK2_WORKSPACE_Y + 266,
      width: 280,
      handleRadius: 8
    };
  }

  // Use the drag handler's hit area, but do not offer a hand cursor before thresholding.
  isThresholdSliderHovered() {
    if (!this.state.thresholdReady) {
      return false;
    }

    const sliderBounds = this.getThresholdSliderBounds();
    const hitBoxX = sliderBounds.x - sliderBounds.handleRadius;
    const hitBoxY = sliderBounds.y - 18;
    const hitBoxWidth = sliderBounds.width + sliderBounds.handleRadius * 2;
    const hitBoxHeight = 36;

    return isMouseInside(hitBoxX, hitBoxY, hitBoxWidth, hitBoxHeight);
  }
}

// Build the arrowhead from the vector's unit direction and its perpendicular.
function drawTask2ArrowLine(startX, startY, endX, endY, arrowColour, lineWeight, headSize) {
  const dx = endX - startX;
  const dy = endY - startY;
  const magnitude = sqrt(dx * dx + dy * dy);

  if (magnitude < 0.1) {
    return;
  }

  const unitX = dx / magnitude;
  const unitY = dy / magnitude;
  const headBackX = endX - unitX * headSize;
  const headBackY = endY - unitY * headSize;
  const sideX = -unitY * headSize * 0.5;
  const sideY = unitX * headSize * 0.5;

  stroke(arrowColour);
  strokeWeight(lineWeight);
  line(startX, startY, endX, endY);

  noStroke();
  fill(arrowColour);
  triangle(endX, endY, headBackX + sideX, headBackY + sideY, headBackX - sideX, headBackY - sideY);
}
