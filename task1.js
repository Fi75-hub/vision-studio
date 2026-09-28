// Task 1: portrait processing, comparison and carousel animation.
const COLOUR_SPACE_RGB = 0;
const COLOUR_SPACE_HSB = 1;

// Threshold rows store colour space, three tolerances and an optional edge radius.
const TASK1_COLOUR_SPACE_INDEX = 0;
const TASK1_C1_INDEX = 1;
const TASK1_C2_INDEX = 2;
const TASK1_C3_INDEX = 3;
const TASK1_EDGE_RADIUS_INDEX = 4;

const TASK1_REQUIRED_IMAGE_COUNT = 8;

const TASK1_PERSON_IMAGE_PATHS = [
  "assets/task1/people/person1.png",
  "assets/task1/people/person2.png",
  "assets/task1/people/person3.png",
  "assets/task1/people/person4.png",
  "assets/task1/people/person5.png",
  "assets/task1/people/person6.png",
  "assets/task1/people/person7.png",
  "assets/task1/people/person8.png"
];

// Carousel timing and thumbnail dimensions.
const TASK1_ANIMATION_CYCLE_FRAMES = 180;
const TASK1_CAROUSEL_CARD_WIDTH = 108;
const TASK1_CAROUSEL_CARD_HEIGHT = 138;

// Setup panels share a left workflow column and a larger preview on the right.
const TASK1_WORKFLOW_Y = 152;
const TASK1_WORKFLOW_WIDTH = 400;
const TASK1_WORKFLOW_HEIGHT = 214;

const TASK1_NOTICE_Y = 392;
const TASK1_NOTICE_WIDTH = 400;
const TASK1_NOTICE_HEIGHT = 88;

const TASK1_THRESHOLD_Y = 506;
const TASK1_THRESHOLD_WIDTH = 400;
const TASK1_THRESHOLD_HEIGHT = 86;

const TASK1_PREVIEW_X = 512;
const TASK1_PREVIEW_Y = 152;
const TASK1_PREVIEW_WIDTH = 576;
const TASK1_PREVIEW_HEIGHT = 440;

// Each portrait has RGB and HSB trials. RGB uses channel values; HSB uses degrees and percentages.
const task1RgbTrials = [
  [COLOUR_SPACE_RGB, 16, 16, 16],
  [COLOUR_SPACE_RGB, 2, 2, 2],
  [COLOUR_SPACE_RGB, 32, 32, 32],
  [COLOUR_SPACE_RGB, 16, 16, 16, 3],
  [COLOUR_SPACE_RGB, 14, 14, 14],
  [COLOUR_SPACE_RGB, 18, 18, 18],
  [COLOUR_SPACE_RGB, 4, 4, 4],
  [COLOUR_SPACE_RGB, 14, 14, 14]
];

const task1HsbTrials = [
  [COLOUR_SPACE_HSB, 18, 14, 14],
  [COLOUR_SPACE_HSB, 15, 1, 0.7],
  [COLOUR_SPACE_HSB, 18, 8, 10],
  [COLOUR_SPACE_HSB, 15, 10, 10, 3],
  [COLOUR_SPACE_HSB, 15, 4, 6],
  [COLOUR_SPACE_HSB, 15, 14, 14],
  [COLOUR_SPACE_HSB, 15, 2, 2],
  [COLOUR_SPACE_HSB, 15, 9, 10]
];

// The carousel uses this 2D table. V shows both trials for each portrait.
const task1Thresholds = [
  task1HsbTrials[0], // Mauve backdrop with uneven lighting.
  task1RgbTrials[1], // Tight RGB tolerances preserve the pale striped blouse.
  task1RgbTrials[2], // Grey backdrop behind fine hair.
  task1HsbTrials[3], // Dark suit against white.
  task1RgbTrials[4], // Light hair needs a narrower channel match.
  task1HsbTrials[5], // Saturation separates the blue checked shirt.
  task1RgbTrials[6], // The white background is brighter than the pale plaid.
  task1HsbTrials[7]  // Warm backdrop behind hair and a beige jacket.
];

const task1CarouselTitles = [
  "Pointing Pete",
  "Dr. Brightside",
  "Profile Paul",
  "Agent Shades",
  "Blond Bolt",
  "Blue Steel",
  "Cap Captain",
  "Blazer Bella"
];

// Holds the loading status, cached cutouts and animation start time.
class Task1State {
  constructor() {
    this.carouselLoaded = false;
    this.imageLoadStarted = false;
    this.imagesLoaded = false;
    this.animationStarted = false;
    this.animationStartFrame = 0;
    this.stepPulseFrames = {};
    this.notice = "Press c to prepare the carousel screen.";
    this.resetImageSlots();
  }

  // Keep each original, trial pair and selected cutout at the same index.
  resetImageSlots() {
    this.personImages = new Array(TASK1_REQUIRED_IMAGE_COUNT).fill(null);
    this.processedPersonImages = new Array(TASK1_REQUIRED_IMAGE_COUNT).fill(null);
    this.comparisonImages = new Array(TASK1_REQUIRED_IMAGE_COUNT).fill(null);
    this.loadedPersonCount = 0;
    this.failedPersonPaths = [];
  }

  // A retry starts with empty slots so failed attempts cannot leave stale images.
  beginImageLoad() {
    this.imageLoadStarted = true;
    this.imagesLoaded = false;
    this.animationStarted = false;
    this.resetImageSlots();
    this.notice = "Loading the eight provided person images...";
  }

  // Process both trials once and reuse the selected result in the carousel.
  addPortrait(index, original) {
    const processor = new PortraitProcessor(original);
    const rgb = processor.process(task1RgbTrials[index]);
    const hsb = processor.process(task1HsbTrials[index]);
    this.personImages[index] = original;
    this.comparisonImages[index] = { rgb, hsb };
    this.processedPersonImages[index] = task1Thresholds[index][TASK1_COLOUR_SPACE_INDEX] === COLOUR_SPACE_RGB ? rgb : hsb;
    this.loadedPersonCount++;
  }

  startAnimation(startFrame) {
    this.animationStarted = true;
    this.animationStartFrame = startFrame;
    this.notice = "Task 1 animation is running.";
  }
}

// Handles the C, L and S workflow and receives the image-loading callbacks.
class Task1Controller {
  constructor(ui) {
    this.state = new Task1State();
    this.animation = new CarouselAnimation(ui);
    this.comparison = new PortraitComparisonView(this.state, ui);
    this.view = new Task1View(this, ui);
  }

  // Let the comparison view consume its shortcuts before handling setup keys.
  handleKeys(pressedKey) {
    if (this.comparison.handleKey(pressedKey)) {
      return false;
    }

    if (pressedKey === "c") {
      if (!this.state.carouselLoaded) {
        markStepPulse(this.state.stepPulseFrames, "c");
      }

      this.state.carouselLoaded = true;
      this.state.notice = "Carousel screen is ready. Press l to load the provided images.";
    } else if (pressedKey === "l") {
      if (!this.state.carouselLoaded) {
        this.state.notice = "Press c to prepare the carousel, then l to load its images.";
        return;
      }

      this.loadAssets();
    } else if (pressedKey === "s") {
      if (!this.state.imagesLoaded) {
        this.state.notice = "Load all eight person images before starting the animation.";
        return;
      }

      this.comparison.close();
      this.state.startAnimation(frameCount);
      markStepPulse(this.state.stepPulseFrames, "s");
    }
  }

  // Load one batch, keeping each portrait at its original list position.
  loadAssets() {
    if (this.state.imageLoadStarted) {
      this.state.notice = "Task 1 image loading has already been requested.";
      return;
    }

    this.state.beginImageLoad();

    for (let i = 0; i < TASK1_PERSON_IMAGE_PATHS.length; i++) {
      const imagePath = TASK1_PERSON_IMAGE_PATHS[i];

      loadImage(
        imagePath,
        (loadedImage) => {
          this.state.addPortrait(i, loadedImage);
          this.updateImageLoadState();
        },
        () => {
          this.state.failedPersonPaths.push(imagePath);
          this.updateImageLoadState();
        }
      );
    }
  }

  // Wait for every attempt before allowing a retry, including failed requests.
  updateImageLoadState() {
    const finishedAttempts = this.state.loadedPersonCount + this.state.failedPersonPaths.length;
    const wasImagesLoaded = this.state.imagesLoaded;
    this.state.imagesLoaded = this.state.loadedPersonCount === TASK1_REQUIRED_IMAGE_COUNT;

    if (this.state.imagesLoaded) {
      if (!wasImagesLoaded) {
        markStepPulse(this.state.stepPulseFrames, "l");
      }

      this.state.notice = "Loaded and processed all eight images.";
    } else if (finishedAttempts === TASK1_REQUIRED_IMAGE_COUNT) {
      this.state.imageLoadStarted = false;
      this.state.notice = "Some portraits could not load. Check the files, then press l to retry.";
    } else {
      this.state.notice = "Loading Task 1 images...";
    }
  }
}

// Draws the setup screen and selects the comparison or animation view.
class Task1View {
  constructor(controller, ui) {
    this.controller = controller;
    this.state = controller.state;
    this.ui = ui;
  }

  // The comparison takes priority so it can also be opened during playback.
  draw() {
    if (this.controller.comparison.isOpen) {
      this.controller.comparison.draw();
      return;
    }

    if (this.state.animationStarted && this.state.imagesLoaded) {
      this.drawAnimation();
      return;
    }

    this.ui.drawBackdrop(color(UI_THEME.carousel));
    this.ui.drawHeader("Task 1", "Streaming Carousel with Background Removal");

    const imageCountText = this.state.loadedPersonCount + "/" + TASK1_REQUIRED_IMAGE_COUNT;

    this.ui.drawWorkflowPanel(
      TASK_PANEL_X,
      TASK1_WORKFLOW_Y,
      TASK1_WORKFLOW_WIDTH,
      TASK1_WORKFLOW_HEIGHT,
      "Required sequence",
      color(UI_THEME.carousel)
    );
    this.ui.drawStatusRow(
      208,
      "c",
      "Load carousel",
      this.state.carouselLoaded,
      getStepPulseAmount(this.state.stepPulseFrames, "c")
    );
    this.ui.drawStatusRow(
      270,
      "l",
      "Load and threshold images (" + imageCountText + ")",
      this.state.imagesLoaded,
      getStepPulseAmount(this.state.stepPulseFrames, "l")
    );
    this.ui.drawStatusRow(
      332,
      "s",
      "Start Task 1 animation",
      this.state.animationStarted,
      getStepPulseAmount(this.state.stepPulseFrames, "s")
    );

    this.drawNotice();
    this.drawThresholdTable(
      TASK_PANEL_X,
      TASK1_THRESHOLD_Y,
      TASK1_THRESHOLD_WIDTH,
      TASK1_THRESHOLD_HEIGHT
    );
    this.drawPreview(
      TASK1_PREVIEW_X,
      TASK1_PREVIEW_Y,
      TASK1_PREVIEW_WIDTH,
      TASK1_PREVIEW_HEIGHT
    );

    this.ui.drawFooter("V: compare each portrait in RGB and HSB after loading.   2: Task 2");
  }

  drawAnimation() {
    this.controller.animation.draw(
      frameCount - this.state.animationStartFrame,
      this.state.processedPersonImages
    );
  }

  drawNotice() {
    this.ui.drawSurface(TASK_PANEL_X, TASK1_NOTICE_Y, TASK1_NOTICE_WIDTH, TASK1_NOTICE_HEIGHT);
    noStroke();

    fill(UI_THEME.muted);
    textAlign(LEFT, BASELINE);
    textSize(13);
    textStyle(NORMAL);
    drawFittedText(this.state.notice, TASK_PANEL_X + 24, TASK1_NOTICE_Y + 35, 342, 13, 11);

    if (this.state.failedPersonPaths.length > 0) {
      fill(UI_THEME.warning);
      drawFittedText(
        "Expected files: assets/task1/people/person1.png to person8.png",
        TASK_PANEL_X + 24,
        TASK1_NOTICE_Y + 62,
        342,
        12,
        10
      );
    } else if (this.state.imagesLoaded) {
      fill(UI_THEME.success);
      drawFittedText(
        "RGB/HSB threshold table active for all 8 images.",
        TASK_PANEL_X + 24,
        TASK1_NOTICE_Y + 62,
        342,
        12,
        10
      );
    }
  }

  // Show the selected settings in portrait order, using two rows of four chips.
  drawThresholdTable(x, y, tableWidth, tableHeight) {
    this.ui.drawSurface(x, y, tableWidth, tableHeight);

    noStroke();
    fill(UI_THEME.text);
    textAlign(LEFT, BASELINE);
    textStyle(BOLD);
    textSize(10);
    text("THRESHOLD TABLE", x + 18, y + 18);

    fill(UI_THEME.muted);
    textStyle(NORMAL);
    textSize(9);
    text("mode + c1/c2/c3", x + 138, y + 18);

    const gap = 7;
    const chipWidth = (tableWidth - 36 - gap * 3) / 4;
    const chipHeight = 20;

    for (let i = 0; i < task1Thresholds.length; i++) {
      const thresholdSettings = task1Thresholds[i];
      const row = floor(i / 4);
      const column = i % 4;
      const chipX = x + 18 + column * (chipWidth + gap);
      const chipY = y + 30 + row * 24;
      const usesHsb = thresholdSettings[TASK1_COLOUR_SPACE_INDEX] === COLOUR_SPACE_HSB;
      const modeText = usesHsb ? "HSB" : "RGB";
      const chipColour = usesHsb ? color(UI_THEME.carousel) : color(UI_THEME.motion);
      const valueText =
        thresholdSettings[TASK1_C1_INDEX] + "/" +
        thresholdSettings[TASK1_C2_INDEX] + "/" +
        thresholdSettings[TASK1_C3_INDEX];

      stroke(red(chipColour), green(chipColour), blue(chipColour), 105);
      strokeWeight(1);
      fill(UI_THEME.inset);
      rect(chipX, chipY, chipWidth, chipHeight, 4);

      noStroke();
      fill(chipColour);
      textAlign(LEFT, CENTER);
      textStyle(BOLD);
      textSize(8);
      text((i + 1) + " " + modeText, chipX + 6, chipY + chipHeight / 2);

      fill(UI_THEME.muted);
      textStyle(NORMAL);
      text(valueText, chipX + 42, chipY + chipHeight / 2);
    }

    textAlign(LEFT, BASELINE);
  }

  // Align the original and cutout strips so each column represents one portrait.
  drawPreview(x, y, panelWidth, panelHeight) {
    this.ui.drawSurface(x, y, panelWidth, panelHeight);

    noStroke();
    fill(UI_THEME.text);
    textSize(20);
    textStyle(BOLD);
    text("Carousel preview", x + 24, y + 38);

    fill(UI_THEME.muted);
    textSize(13);
    textStyle(NORMAL);
    text("Press V after loading to compare RGB and HSB at a larger size.", x + 24, y + 64);

    this.drawBackgroundPreview(x + 24, y + 90, panelWidth - 48, 124);

    fill(UI_THEME.muted);
    textStyle(BOLD);
    textSize(10);
    text("LOADED ORIGINALS", x + 24, y + 246);
    text("PROCESSED CUTOUTS", x + 24, y + 342);

    this.drawPersonSlots(x + 24, y + 258, panelWidth - 48, 58, false);
    this.drawPersonSlots(x + 24, y + 354, panelWidth - 48, 58, true);
  }

  drawBackgroundPreview(x, y, previewWidth, previewHeight) {
    stroke(UI_THEME.borderSoft);
    strokeWeight(1);
    fill(UI_THEME.inset);
    rect(x, y, previewWidth, previewHeight, 6);

    image(this.controller.animation.backgroundImage, x, y, previewWidth, previewHeight);
  }

  // Checkerboards reveal transparency; empty slots show their portrait numbers.
  drawPersonSlots(x, y, previewWidth, slotHeight, useProcessedImages) {
    const gap = 7;
    const slotWidth = (previewWidth - gap * (TASK1_REQUIRED_IMAGE_COUNT - 1)) / TASK1_REQUIRED_IMAGE_COUNT;

    for (let i = 0; i < TASK1_REQUIRED_IMAGE_COUNT; i++) {
      const slotX = x + i * (slotWidth + gap);
      const loadedImage = useProcessedImages ? this.state.processedPersonImages[i] : this.state.personImages[i];

      stroke(UI_THEME.borderSoft);
      strokeWeight(1);
      fill(UI_THEME.inset);
      rect(slotX, y, slotWidth, slotHeight, 5);

      if (loadedImage) {
        if (useProcessedImages) {
          drawCheckerboard(slotX + 3, y + 3, slotWidth - 6, slotHeight - 6);
        }
        drawImageInsideBox(loadedImage, slotX + 3, y + 3, slotWidth - 6, slotHeight - 6);
      } else {
        noStroke();
        fill(UI_THEME.subtle);
        textAlign(CENTER, CENTER);
        textSize(11);
        textStyle(BOLD);
        text(i + 1, slotX + slotWidth / 2, y + slotHeight / 2);
        textAlign(LEFT, BASELINE);
      }
    }
  }
}

// Inspects both trials without changing the chosen carousel cutout.
class PortraitComparisonView {
  constructor(state, ui) {
    this.state = state;
    this.ui = ui;
    this.isOpen = false;
    this.imageIndex = 0;
    this.backdropIndex = 0;
    this.backdropNames = ["Dark", "Light", "Checkerboard"];
    this.openedAtFrame = 0;
  }

  // Wrap portrait and backdrop selection while keeping the cached trials intact.
  handleKey(pressedKey) {
    if (pressedKey === "v") {
      if (this.isOpen) {
        this.close();
      } else if (this.isReady()) {
        this.isOpen = true;
        this.openedAtFrame = frameCount;
      } else {
        this.state.notice = "Load the eight images with l before comparing RGB and HSB.";
      }
      return true;
    }

    if (!this.isOpen) {
      return false;
    }

    if (pressedKey === "escape") {
      this.close();
    } else if (pressedKey === "arrowleft" || pressedKey === "arrowright") {
      const direction = pressedKey === "arrowleft" ? -1 : 1;
      this.imageIndex = (this.imageIndex + direction + TASK1_REQUIRED_IMAGE_COUNT) % TASK1_REQUIRED_IMAGE_COUNT;
    } else if (pressedKey === "b") {
      this.backdropIndex = (this.backdropIndex + 1) % this.backdropNames.length;
    } else {
      return false;
    }

    return true;
  }

  isReady() {
    return this.state.imagesLoaded &&
      this.state.comparisonImages.every(pair => pair && pair.rgb && pair.hsb);
  }

  // Remove time spent inspecting from the animation clock so playback resumes.
  close() {
    if (this.isOpen && this.state.animationStarted) {
      this.state.animationStartFrame += frameCount - this.openedAtFrame;
    }
    this.isOpen = false;
  }

  draw() {
    this.ui.drawBackdrop(color(UI_THEME.carousel));
    this.ui.drawHeader("Task 1", "RGB and HSB comparison");

    const index = this.imageIndex;
    const chosenSpace = task1Thresholds[index][TASK1_COLOUR_SPACE_INDEX];
    const chosenMode = chosenSpace === COLOUR_SPACE_RGB ? "RGB" : "HSB";
    noStroke();
    fill(UI_THEME.text);
    textAlign(LEFT, BASELINE);
    textStyle(BOLD);
    textSize(20);
    text("Portrait " + (index + 1) + " / 8  -  " + task1CarouselTitles[index], 82, 179);
    fill(UI_THEME.muted);
    textStyle(NORMAL);
    textSize(13);
    text("Compare hair, clothing and gaps against each backdrop. Use Left / Right to change portrait.", 82, 204);
    fill(UI_THEME.carousel);
    textAlign(RIGHT, BASELINE);
    text("Selected for carousel: " + chosenMode, 1078, 179);
    textAlign(LEFT, BASELINE);

    const trials = this.state.comparisonImages[index];
    this.drawPanel(72, "Original", "Provided image", this.state.personImages[index], false);
    this.drawPanel(417, "RGB trial", this.thresholdLabel(task1RgbTrials[index]), trials.rgb, chosenSpace === COLOUR_SPACE_RGB);
    this.drawPanel(762, "HSB trial", this.thresholdLabel(task1HsbTrials[index]), trials.hsb, chosenSpace === COLOUR_SPACE_HSB);

    this.ui.drawFooter(
      "Left / Right: portrait   B: backdrop (" + this.backdropNames[this.backdropIndex] + ")   V / Esc: back   S: animate"
    );
  }

  thresholdLabel(settings) {
    if (settings[TASK1_COLOUR_SPACE_INDEX] === COLOUR_SPACE_HSB) {
      return "H / S / B: " + settings[TASK1_C1_INDEX] + "° / " +
        settings[TASK1_C2_INDEX] + "% / " + settings[TASK1_C3_INDEX] + "%";
    }
    return "R / G / B: " + settings[TASK1_C1_INDEX] + " / " +
      settings[TASK1_C2_INDEX] + " / " + settings[TASK1_C3_INDEX];
  }

  // Use the same image box for all three versions to make edges easy to compare.
  drawPanel(x, title, subtitle, portrait, selected) {
    const panelY = 230;
    const panelWidth = 326;
    stroke(selected ? color(UI_THEME.carousel) : color(UI_THEME.border));
    strokeWeight(selected ? 2 : 1);
    fill(UI_THEME.panel);
    rect(x, panelY, panelWidth, 414, 8);
    noStroke();
    fill(selected ? color(UI_THEME.carousel) : color(UI_THEME.text));
    textStyle(BOLD);
    textSize(18);
    text(title, x + 16, panelY + 28);
    fill(UI_THEME.muted);
    textStyle(NORMAL);
    textSize(12);
    text(subtitle, x + 16, panelY + 50);

    const imageX = x + 14;
    const imageY = panelY + 64;
    this.drawBackdrop(imageX, imageY, panelWidth - 28, 334);
    noTint();
    drawImageInsideBox(portrait, imageX, imageY, panelWidth - 28, 334);
  }

  drawBackdrop(x, y, boxWidth, boxHeight) {
    noStroke();
    if (this.backdropIndex < 2) {
      fill(this.backdropIndex === 0 ? color(10, 13, 20) : color(246, 246, 242));
      rect(x, y, boxWidth, boxHeight);
      return;
    }

    drawCheckerboard(x, y, boxWidth, boxHeight, 16, 202, 236);
  }
}

// Keeps the stage, portrait and title animation on the same timeline.
class CarouselAnimation {
  constructor(ui) {
    this.ui = ui;
    this.cycleFrames = TASK1_ANIMATION_CYCLE_FRAMES;
    this.backgroundSpeed = 0.32;
    this.thumbnailSpeed = 0.72;
    this.backgroundImage = null;
  }

  // Each cycle advances one portrait and reverses the zoom direction.
  getCycle(elapsedFrames, imageCount) {
    const cycleIndex = floor(elapsedFrames / this.cycleFrames);
    const progress = (elapsedFrames % this.cycleFrames) / this.cycleFrames;
    const easedProgress = smootherStep(progress);

    return {
      imageIndex: cycleIndex % imageCount,
      progress: easedProgress,
      fade: this.getFade(progress),
      zoom: cycleIndex % 2 === 0
        ? lerp(0.84, 1.08, easedProgress)
        : lerp(1.08, 0.84, easedProgress)
    };
  }

  draw(elapsedFrames, portraits) {
    const cycle = this.getCycle(elapsedFrames, portraits.length);
    this.drawBackground(elapsedFrames);
    this.drawStageOverlay();
    this.drawTitle(cycle);

    if (portraits[cycle.imageIndex]) {
      this.drawPerson(portraits[cycle.imageIndex], cycle);
    }

    this.drawThumbnails(elapsedFrames, portraits, cycle.imageIndex);
  }

  // Build the stage once on an offscreen canvas, then reuse it during playback.
  createBackground() {
    const graphic = createGraphics(1680, CANVAS_HEIGHT);
    graphic.background(6, 9, 16);
    graphic.noStroke();

    for (let y = 0; y < graphic.height; y += 4) {
      graphic.fill(
        map(y, 0, graphic.height, 6, 18),
        map(y, 0, graphic.height, 9, 16),
        map(y, 0, graphic.height, 18, 30)
      );
      graphic.rect(0, y, graphic.width, 4);
    }

    graphic.fill(12, 17, 29, 245);
    graphic.rect(0, 72, graphic.width, 332);

    for (let i = 0; i < 12; i++) {
      const panelX = 12 + i * 140;
      const panelWidth = i % 3 === 1 ? 110 : 120;
      graphic.fill(31, 39, 57, i % 2 === 0 ? 88 : 58);
      graphic.rect(panelX, 116, panelWidth, 250, 4);
      graphic.fill(255, 255, 255, 12);
      graphic.rect(panelX + 8, 128, panelWidth - 16, 3, 2);
      graphic.fill(248, 198, 80, 18);
      graphic.rect(panelX + 16, 334, panelWidth - 32, 4, 2);
    }

    // Keep the beams inside the tile so its left and right edges match.
    graphic.fill(108, 205, 197, 34);
    graphic.quad(36, 92, 270, 92, 420, 404, 36, 404);
    graphic.fill(248, 84, 120, 26);
    graphic.quad(1230, 92, 1644, 92, 1644, 404, 1080, 404);
    graphic.fill(248, 198, 80, 22);
    graphic.rect(0, 386, graphic.width, 10);

    graphic.fill(8, 11, 20, 238);
    graphic.rect(0, 398, graphic.width, graphic.height - 398);
    graphic.fill(28, 35, 52, 175);
    graphic.quad(190, 398, 1420, 398, 1560, graphic.height, 50, graphic.height);
    graphic.fill(43, 35, 58, 72);
    graphic.quad(470, 398, 1160, 398, 1260, graphic.height, 380, graphic.height);
    graphic.fill(0, 0, 0, 64);
    graphic.rect(0, 0, graphic.width, graphic.height);

    this.backgroundImage = graphic;
  }

  // A positive offset moves the repeating stage from left to right.
  drawBackground(elapsedFrames) {
    const tileWidth = this.backgroundImage.width;
    const offset = (elapsedFrames * this.backgroundSpeed) % tileWidth;

    // Adjacent copies cover the stage throughout the wrap.
    for (let x = offset - tileWidth; x < width; x += tileWidth) {
      image(this.backgroundImage, x, 0, tileWidth, height);
    }
  }

  drawStageOverlay() {
    noStroke();
    fill(0, 0, 0, 32);
    rect(0, 0, width, height);
    fill(UI_THEME.shell);
    rect(0, 0, width, 86);
    rect(0, height - 118, width, 118);

    fill(UI_THEME.text);
    textAlign(LEFT, BASELINE);
    textStyle(BOLD);
    textSize(25);
    text("STREAMING CAROUSEL", 42, 46);
    this.ui.drawNavigation();
  }

  // Change position and dimensions directly, keeping the portrait's feet anchored.
  drawPerson(personImage, cycle) {
    const drawHeight = 430 * cycle.zoom;
    const drawWidth = drawHeight * personImage.width / personImage.height;
    const personX = lerp(160, 860, cycle.progress) - drawWidth / 2;
    const personY = height - drawHeight - 98;

    noStroke();
    fill(0, 0, 0, cycle.fade * 0.32);
    ellipse(personX + drawWidth / 2, personY + drawHeight - 4, drawWidth * 0.72, 34);
    tint(255, cycle.fade);
    image(personImage, personX, personY, drawWidth, drawHeight);
    noTint();
  }

  // Move the title against the portrait while sharing its fade and zoom.
  drawTitle(cycle) {
    const titleText = task1CarouselTitles[cycle.imageIndex];
    textAlign(LEFT, BASELINE);
    noStroke();
    textStyle(BOLD);
    textSize(50 * cycle.zoom);
    const textX = lerp(width - textWidth(titleText) - 82, 92, cycle.progress);

    fill(0, 0, 0, cycle.fade * 0.34);
    text(titleText, textX + 3, 181);
    fill(255, 255, 255, cycle.fade);
    text(titleText, textX, 178);
  }

  // Wrap a full strip of cards so the thumbnail row scrolls continuously.
  drawThumbnails(elapsedFrames, portraits, activeImageIndex) {
    const spacing = TASK1_CAROUSEL_CARD_WIDTH + 22;
    const carouselSpan = spacing * portraits.length;
    const baseY = height - TASK1_CAROUSEL_CARD_HEIGHT - 26;
    const offset = (elapsedFrames * this.thumbnailSpeed) % carouselSpan;

    for (let i = 0; i < portraits.length; i++) {
      const firstX = (40 + i * spacing + offset + TASK1_CAROUSEL_CARD_WIDTH) % carouselSpan
        - TASK1_CAROUSEL_CARD_WIDTH;

      for (let cardX = firstX; cardX < width; cardX += carouselSpan) {
        this.drawCard(cardX, baseY, portraits[i], i, i === activeImageIndex);
      }
    }
  }

  drawCard(x, y, portrait, imageIndex, isActive) {
    stroke(isActive ? color(UI_THEME.carousel) : color(UI_THEME.border));
    strokeWeight(isActive ? 2 : 1);
    fill(UI_THEME.inset);
    rect(x, y, TASK1_CAROUSEL_CARD_WIDTH, TASK1_CAROUSEL_CARD_HEIGHT, 7);

    if (portrait) {
      drawImageInsideBox(portrait, x + 8, y + 8, TASK1_CAROUSEL_CARD_WIDTH - 16, TASK1_CAROUSEL_CARD_HEIGHT - 34);
    }

    noStroke();
    fill(isActive ? color(UI_THEME.carousel) : color(UI_THEME.muted));
    textAlign(CENTER, BASELINE);
    textStyle(BOLD);
    textSize(11);
    text(imageIndex + 1, x + TASK1_CAROUSEL_CARD_WIDTH / 2, y + TASK1_CAROUSEL_CARD_HEIGHT - 12);
    textAlign(LEFT, BASELINE);
  }

  // Reserve the first and last 22% of each cycle for smooth fades.
  getFade(progress) {
    if (progress < 0.22) {
      return 255 * smootherStep(progress / 0.22);
    }

    if (progress > 0.78) {
      return 255 * (1 - smootherStep((progress - 0.78) / 0.22));
    }

    return 255;
  }
}

// Reuses one portrait's colour samples and gradients for both trials.
// Mask values of 1 mark background. The source pixels are only read.
class PortraitProcessor {
  constructor(sourceImage) {
    sourceImage.loadPixels();
    this.width = sourceImage.width;
    this.height = sourceImage.height;
    this.pixels = sourceImage.pixels;
    this.pixelCount = this.width * this.height;
    this.hue = new Float32Array(this.pixelCount);
    this.saturation = new Float32Array(this.pixelCount);
    this.brightness = new Float32Array(this.pixelCount);
    this.gradient = this.buildFeatures();
    this.samples = this.sampleBackground();
    this.background = this.findBackgroundColour();
  }

  // Grow the outer background first, then clean fringes, hair gaps and specks.
  process(settings) {
    const matches = this.classify(settings);
    const mask = this.floodBackground(matches.exterior);
    this.cleanBoundary(mask, matches.colour, settings);
    this.clearHairGaps(mask, matches.colour);
    this.removeSpecks(mask);
    return this.createCutout(mask, settings[TASK1_EDGE_RADIUS_INDEX] || 0);
  }

  // Cache HSB channels for thresholding and luminance gradients for edge checks.
  buildFeatures() {
    const luminance = new Float32Array(this.pixelCount);
    for (let i = 0; i < this.pixelCount; i++) {
      const p = i * 4;
      const r = this.pixels[p];
      const g = this.pixels[p + 1];
      const b = this.pixels[p + 2];
      const hsb = rgbToHsb(r, g, b);
      this.hue[i] = hsb.h;
      this.saturation[i] = hsb.s;
      this.brightness[i] = hsb.b;
      luminance[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }

    // Central differences mark sharp boundaries in the portrait.
    const gradient = new Float32Array(this.pixelCount);
    for (let y = 0; y < this.height; y++) {
      const row = y * this.width;
      const above = Math.max(0, y - 1) * this.width;
      const below = Math.min(this.height - 1, y + 1) * this.width;
      for (let x = 0; x < this.width; x++) {
        const left = Math.max(0, x - 1);
        const right = Math.min(this.width - 1, x + 1);
        const dx = luminance[row + right] - luminance[row + left];
        const dy = luminance[below + x] - luminance[above + x];
        gradient[row + x] = Math.hypot(dx, dy);
      }
    }
    return gradient;
  }

  // Sample the upper corners and side borders, where the studio backdrop is exposed.
  sampleBackground() {
    const buckets = new Map();
    const sample = (x, y) => {
      const index = y * this.width + x;
      // Dark and colourful border pixels can belong to hair or clothing.
      if (this.gradient[index] > 15 || this.saturation[index] > 16 || this.brightness[index] < 62) {
        return;
      }
      const p = index * 4;
      const r = this.pixels[p];
      const g = this.pixels[p + 1];
      const b = this.pixels[p + 2];
      const key = Math.floor(r / 3) + "," + Math.floor(g / 3) + "," + Math.floor(b / 3);
      const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0 };
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.count++;
      buckets.set(key, bucket);
    };

    for (let y = 0; y < this.height * 0.2; y += 4) {
      for (let x = 0; x < this.width * 0.18; x += 4) {
        sample(x, y);
        sample(this.width - 1 - x, y);
      }
    }
    for (let y = Math.floor(this.height * 0.2); y < this.height * 0.75; y += 8) {
      sample(2, y);
      sample(this.width - 3, y);
    }

    // Group almost identical samples so each pixel has a bounded comparison cost.
    const samples = [...buckets.values()].sort((a, b) => b.count - a.count).slice(0, 96);
    // Fall back to the top-left pixel if no border samples pass the filters.
    if (samples.length === 0) {
      samples.push({ r: this.pixels[0], g: this.pixels[1], b: this.pixels[2], count: 1 });
    }
    return samples.map(sample => {
      const r = sample.r / sample.count;
      const g = sample.g / sample.count;
      const b = sample.b / sample.count;
      return { r, g, b, hsb: rgbToHsb(r, g, b), count: sample.count };
    });
  }

  // Weight the backdrop estimate by sample frequency for later edge correction.
  findBackgroundColour() {
    const sum = { r: 0, g: 0, b: 0 };
    let count = 0;
    for (const sample of this.samples) {
      sum.r += sample.r * sample.count;
      sum.g += sample.g * sample.count;
      sum.b += sample.b * sample.count;
      count += sample.count;
    }
    return { r: sum.r / count, g: sum.g / count, b: sum.b / count };
  }

  // Preserve dark or saturated pixels because the studio backdrops are pale.
  isProtected(index) {
    const saturation = this.saturation[index];
    const brightness = this.brightness[index];
    return brightness <= 45 || saturation >= 18;
  }

  // Accept a match to any sampled backdrop shade within all channel tolerances.
  matchesColour(index, settings, multiplier) {
    const [mode, c1, c2, c3] = settings;
    const p = index * 4;
    for (const sample of this.samples) {
      if (mode === COLOUR_SPACE_RGB) {
        if (Math.abs(this.pixels[p] - sample.r) <= c1 * multiplier &&
            Math.abs(this.pixels[p + 1] - sample.g) <= c2 * multiplier &&
            Math.abs(this.pixels[p + 2] - sample.b) <= c3 * multiplier) {
          return true;
        }
      } else {
        // Hue is unstable near grey, so neutral samples use saturation and brightness.
        const neutral = this.saturation[index] < 12 && sample.hsb.s < 12;
        if ((neutral || getHueDistance(this.hue[index], sample.hsb.h) <= c1 * multiplier) &&
            Math.abs(this.saturation[index] - sample.hsb.s) <= c2 * multiplier &&
            Math.abs(this.brightness[index] - sample.hsb.b) <= c3 * multiplier) {
          return true;
        }
      }
    }
    return false;
  }

  // Keep a broad colour match for cleanup and a stricter mask for the flood fill.
  classify(settings) {
    const colour = new Uint8Array(this.pixelCount);
    const exterior = new Uint8Array(this.pixelCount);
    for (let i = 0; i < this.pixelCount; i++) {
      if (this.pixels[i * 4 + 3] === 0) {
        colour[i] = exterior[i] = 1;
        continue;
      }
      if (this.isProtected(i)) {
        continue;
      }
      colour[i] = this.matchesColour(i, settings, 1.1) ? 1 : 0;
      if (!colour[i] || this.gradient[i] > 28) {
        continue;
      }
      // Tighten the match near stronger edges to reduce leaks into the foreground.
      const tolerance = this.gradient[i] < 6 ? 1.1 : this.gradient[i] > 15 ? 0.7 : 1;
      exterior[i] = tolerance === 1.1 || this.matchesColour(i, settings, tolerance) ? 1 : 0;
    }
    return { colour, exterior };
  }

  // Visit four connected neighbours without crossing from one image row to another.
  neighbours(index, visit) {
    const x = index % this.width;
    if (x > 0) {
      visit(index - 1);
    }
    if (x < this.width - 1) {
      visit(index + 1);
    }
    if (index >= this.width) {
      visit(index - this.width);
    }
    if (index + this.width < this.pixelCount) {
      visit(index + this.width);
    }
  }

  // Only border-connected candidates enter the first background mask.
  floodBackground(candidates) {
    const mask = new Uint8Array(this.pixelCount);
    const queue = new Int32Array(this.pixelCount);
    let head = 0;
    let tail = 0;
    const add = index => {
      if (candidates[index] && !mask[index]) {
        mask[index] = 1;
        queue[tail++] = index;
      }
    };
    for (let x = 0; x < this.width; x++) {
      add(x);
      add((this.height - 1) * this.width + x);
    }
    for (let y = 1; y < this.height - 1; y++) {
      add(y * this.width);
      add(y * this.width + this.width - 1);
    }
    while (head < tail) {
      this.neighbours(queue[head++], add);
    }
    return mask;
  }

  // Remove matching colours close to the flooded background before finer cleanup.
  cleanBoundary(mask, colourMatches, settings) {
    this.backgroundDistance = this.distanceFromBackground(mask);
    for (let i = 0; i < this.pixelCount; i++) {
      if (this.backgroundDistance[i] <= 6 && colourMatches[i]) {
        mask[i] = 1;
      }
    }
    this.clearLightFringe(mask, settings);
  }

  // Two passes measure Manhattan distance, capped at 33 for the local cleanup tests.
  distanceFromBackground(mask) {
    const distance = new Uint8Array(this.pixelCount);
    distance.fill(33);
    for (let i = 0; i < this.pixelCount; i++) {
      if (mask[i]) {
        distance[i] = 0;
      } else {
        if (i % this.width > 0) {
          distance[i] = Math.min(distance[i], distance[i - 1] + 1);
        }
        if (i >= this.width) {
          distance[i] = Math.min(distance[i], distance[i - this.width] + 1);
        }
      }
    }
    for (let i = this.pixelCount - 1; i >= 0; i--) {
      if (i % this.width < this.width - 1) {
        distance[i] = Math.min(distance[i], distance[i + 1] + 1);
      }
      if (i + this.width < this.pixelCount) {
        distance[i] = Math.min(distance[i], distance[i + this.width] + 1);
      }
    }
    return distance;
  }

  // A summed-area table makes each local strand-density check constant time.
  buildDarkIntegral() {
    const stride = this.width + 1;
    const darkArea = new Int32Array(stride * (this.height + 1));
    for (let y = 0; y < this.height; y++) {
      let rowCount = 0;
      for (let x = 0; x < this.width; x++) {
        const index = y * this.width + x;
        rowCount += this.brightness[index] < 65 || this.saturation[index] > 35 ? 1 : 0;
        darkArea[(y + 1) * stride + x + 1] = darkArea[y * stride + x + 1] + rowCount;
      }
    }
    return darkArea;
  }

  // Remove bright backdrop remnants near dark strands using a local density test.
  clearLightFringe(mask, settings) {
    const distance = this.backgroundDistance;
    const stride = this.width + 1;
    const darkArea = this.buildDarkIntegral();
    // Start beside dark strands, then follow only the connected light remnant.
    const edgeSettings = settings[0] === COLOUR_SPACE_RGB
      ? [COLOUR_SPACE_RGB, 12, 12, 12]
      : [COLOUR_SPACE_HSB, 18, 8, 6];
    const edgeQueue = new Int32Array(this.pixelCount);
    let head = 0;
    let tail = 0;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const index = y * this.width + x;
        if (mask[index] || distance[index] > 24 || this.brightness[index] < 85 || this.saturation[index] > 12) {
          continue;
        }
        const x0 = Math.max(0, x - 8);
        const y0 = Math.max(0, y - 8);
        const x1 = Math.min(this.width, x + 9);
        const y1 = Math.min(this.height, y + 9);
        const darkCount = darkArea[y1 * stride + x1] - darkArea[y0 * stride + x1]
          - darkArea[y1 * stride + x0] + darkArea[y0 * stride + x0];
        if (darkCount > (x1 - x0) * (y1 - y0) * 0.12 && this.matchesColour(index, edgeSettings, 1)) {
          mask[index] = 1;
          edgeQueue[tail++] = index;
        }
      }
    }
    while (head < tail) {
      this.neighbours(edgeQueue[head++], index => {
        if (!mask[index] && distance[index] <= 24 && this.brightness[index] >= 85 &&
            this.saturation[index] <= 12 && this.matchesColour(index, edgeSettings, 1)) {
          mask[index] = 1;
          edgeQueue[tail++] = index;
        }
      });
    }
  }

  // Inspect isolated colour matches that the border flood could not reach.
  clearHairGaps(mask, colourMatches) {
    const visited = mask.slice();
    const queue = new Int32Array(this.pixelCount);
    for (let start = 0; start < this.pixelCount; start++) {
      if (visited[start] || !colourMatches[start]) {
        continue;
      }
      let head = 0;
      let tail = 1;
      let boundary = 0;
      let darkBoundary = 0;
      let nearestBackground = 33;
      queue[0] = start;
      visited[start] = 1;
      while (head < tail) {
        const current = queue[head++];
        nearestBackground = Math.min(nearestBackground, this.backgroundDistance[current]);
        this.neighbours(current, index => {
          if (colourMatches[index]) {
            if (!visited[index]) {
              visited[index] = 1;
              queue[tail++] = index;
            }
          } else {
            boundary++;
            if (this.brightness[index] < 65 || this.saturation[index] > 25) {
              darkBoundary++;
            }
          }
        });
      }
      // Treat small backdrop-coloured islands near dark strands as possible hair gaps.
      // The size, distance and boundary checks help avoid clearing pale fabric.
      if (tail >= 3 && tail < this.pixelCount * 0.004 && nearestBackground <= 24 && darkBoundary > boundary * 0.35) {
        for (let i = 0; i < tail; i++) {
          mask[queue[i]] = 1;
        }
      }
    }
  }

  // Discard foreground components smaller than 40 pixels after boundary cleanup.
  removeSpecks(mask) {
    const visited = mask.slice();
    const queue = new Int32Array(this.pixelCount);
    for (let start = 0; start < this.pixelCount; start++) {
      if (visited[start]) {
        continue;
      }
      let head = 0;
      let tail = 1;
      queue[0] = start;
      visited[start] = 1;
      while (head < tail) {
        this.neighbours(queue[head++], index => {
          if (!visited[index]) {
            visited[index] = 1;
            queue[tail++] = index;
          }
        });
      }
      if (tail < 40) {
        for (let i = 0; i < tail; i++) {
          mask[queue[i]] = 1;
        }
      }
    }
  }

  // Estimate edge alpha from the closest pixels safely inside the foreground.
  edgeOpacity(x, y, distance, radius) {
    const index = y * this.width + x;
    if (distance[index] > radius) {
      return 1;
    }

    const foreground = [0, 0, 0];
    const searchRadius = radius * 2;
    let nearest = Infinity;
    let count = 0;
    for (let dy = -searchRadius; dy <= searchRadius; dy++) {
      for (let dx = -searchRadius; dx <= searchRadius; dx++) {
        const nextX = x + dx;
        const nextY = y + dy;
        if (nextX < 0 || nextX >= this.width || nextY < 0 || nextY >= this.height) {
          continue;
        }
        const neighbour = nextY * this.width + nextX;
        const separation = dx * dx + dy * dy;
        if (distance[neighbour] <= radius || separation > nearest) {
          continue;
        }
        if (separation < nearest) {
          nearest = separation;
          foreground.fill(0);
          count = 0;
        }
        const pixel = neighbour * 4;
        foreground[0] += this.pixels[pixel];
        foreground[1] += this.pixels[pixel + 1];
        foreground[2] += this.pixels[pixel + 2];
        count++;
      }
    }
    if (count === 0) {
      return 1;
    }

    // Fit C = alpha * foreground + (1 - alpha) * background at the edge.
    const backdrop = [this.background.r, this.background.g, this.background.b];
    let numerator = 0;
    let denominator = 0;
    for (let channel = 0; channel < 3; channel++) {
      const difference = foreground[channel] / count - backdrop[channel];
      numerator += (this.pixels[index * 4 + channel] - backdrop[channel]) * difference;
      denominator += difference * difference;
    }
    // Similar foreground and backdrop colours do not give a stable alpha estimate.
    if (denominator < 100) {
      return 1;
    }
    return Math.max(0, Math.min(1, numerator / denominator));
  }

  // Soften boundary pixels using neighbour coverage and contrast with the backdrop.
  boundaryOpacity(x, y, mask) {
    let backgroundCount = 0;
    let neighbourCount = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || x + dx < 0 || x + dx >= this.width ||
            y + dy < 0 || y + dy >= this.height) {
          continue;
        }
        neighbourCount++;
        backgroundCount += mask[(y + dy) * this.width + x + dx];
      }
    }
    if (backgroundCount === 0) {
      return 1;
    }
    const pixel = (y * this.width + x) * 4;
    const contrast = Math.hypot(
      this.pixels[pixel] - this.background.r,
      this.pixels[pixel + 1] - this.background.g,
      this.pixels[pixel + 2] - this.background.b
    );
    const coverage = 1 - backgroundCount / neighbourCount;
    const colourOpacity = Math.min(1, Math.max(0.25, contrast / 50));
    return Math.max(0.2, 0.6 * coverage + 0.4 * colourOpacity);
  }

  // Write a new RGBA image, leaving masked pixels transparent and originals intact.
  createCutout(mask, edgeRadius) {
    const output = createImage(this.width, this.height);
    output.loadPixels();
    const background = [this.background.r, this.background.g, this.background.b];
    const distance = edgeRadius > 0 ? this.distanceFromBackground(mask) : null;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const index = y * this.width + x;
        if (mask[index]) {
          continue;
        }
        const p = index * 4;
        const alpha = edgeRadius > 0
          ? this.edgeOpacity(x, y, distance, edgeRadius)
          : this.boundaryOpacity(x, y, mask);
        if (alpha < 1 / 255) {
          continue;
        }
        // Undo the light backdrop's contribution at partially transparent edges.
        for (let c = 0; c < 3; c++) {
          output.pixels[p + c] = Math.max(0, Math.min(255, (this.pixels[p + c] - (1 - alpha) * background[c]) / alpha));
        }
        output.pixels[p + 3] = Math.round(alpha * this.pixels[p + 3]);
      }
    }
    output.updatePixels();
    return output;
  }
}

// Ease motion with zero slope at both ends of the interval.
function smootherStep(amount) {
  const constrainedAmount = constrain(amount, 0, 1);
  return constrainedAmount * constrainedAmount * constrainedAmount *
    (constrainedAmount * (constrainedAmount * 6 - 15) + 10);
}

// Convert 0-255 RGB into hue in degrees and saturation/brightness in percent.
function rgbToHsb(redValue, greenValue, blueValue) {
  const r = redValue / 255;
  const g = greenValue / 255;
  const b = blueValue / 255;
  const maxValue = max(r, g, b);
  const minValue = min(r, g, b);
  const delta = maxValue - minValue;
  let hue = 0;

  if (delta !== 0) {
    if (maxValue === r) {
      hue = 60 * (((g - b) / delta) % 6);
    } else if (maxValue === g) {
      hue = 60 * ((b - r) / delta + 2);
    } else {
      hue = 60 * ((r - g) / delta + 4);
    }
  }

  if (hue < 0) {
    hue += 360;
  }

  return {
    h: hue,
    s: maxValue === 0 ? 0 : (delta / maxValue) * 100,
    b: maxValue * 100
  };
}

// Hue wraps at 360 degrees, so use the shorter distance around the colour wheel.
function getHueDistance(firstHue, secondHue) {
  const rawDistance = abs(firstHue - secondHue) % 360;
  return min(rawDistance, 360 - rawDistance);
}

// Clip the last row and column of squares to keep the transparency backdrop in its box.
function drawCheckerboard(x, y, boxWidth, boxHeight, squareSize = 6, darkShade = 192, lightShade = 226) {
  noStroke();
  for (let rowY = y; rowY < y + boxHeight; rowY += squareSize) {
    for (let colX = x; colX < x + boxWidth; colX += squareSize) {
      const columnNumber = floor((colX - x) / squareSize);
      const rowNumber = floor((rowY - y) / squareSize);
      fill((columnNumber + rowNumber) % 2 === 0 ? darkShade : lightShade);
      rect(colX, rowY, min(squareSize, x + boxWidth - colX), min(squareSize, y + boxHeight - rowY));
    }
  }
}
