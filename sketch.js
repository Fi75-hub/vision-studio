/*

My project combines two image
processing tasks using p5.js. Keys
1 and 2 switch between them.

In Task 1, C opens the carousel, L
processes eight supplied portraits
and S starts the animation. Both
RGB and HSB are tested for each
portrait, with the selected
settings stored in a 2D array.
People and the background move
left to right, while titles move
right to left. Fade transitions
alternate between zooming in and
out, using coordinates and
dimensions without translate().
Additional inspection feature:
RGB/HSB comparison. V displays the
original portrait and both
processed trials, including
tolerances and the selected mode.
Arrow keys browse portraits, while
B switches dark, light and
checkerboard backgrounds to reveal
fringes and missing detail.

Task 2 follows P, I, G, E, T, N
and D: open the screen, load
pairs, convert to grayscale, apply
Sobel filtering, threshold,
calculate centroids and display
direction. Centroids average all
remaining white pixels and
displacement is calculated as
Frame B minus Frame A. Four
supplied pairs and four additional
repositioned pairs demonstrate all
eight directions. Pair selectors,
arrow keys and the threshold
slider support testing.

Extension 1: Adaptive Threshold
Optimizer and histogram dashboard.
The optimizer selects separate
thresholds for both frames using
the 75th percentile of edge
candidates, constrained to 35–150.
This adapts the cutoff to each
frame’s edge distribution while
retaining manual adjustment. The
supporting histogram dashboard
displays both distributions,
threshold markers, retained-pixel
counts and automatic/manual
status. It makes threshold
selection visible and reuses data
collected during Sobel filtering.

Extension 2: Motion alignment,
refinement and reliability
analysis. The alignment preview
compares unaligned,
centroid-aligned and refined edge
overlap. Refinement searches
within ±24 pixels of the centroid
estimate, using three pixel steps
followed by one pixel searches
near promising candidates. A
balanced score measures matches in
both directions with one pixel
tolerance. The required centroid
result remains unchanged. On Pair
3, overlap improves from 71.5% to
97.7%, with a refined offset of
(75, 79).

Pressing R opens this extension’s
detailed evidence. A coloured
overlay distinguishes each frame’s
edges and their matches. The
search heatmap marks the centroid
estimate and refined offset.
Reliability analysis considers
edge counts, overlap, competing
offsets and search boundaries,
reporting clear, ambiguous or
insufficient evidence. These
additions check the estimated
motion and explain its
limitations; overlap percentages
are not probabilities of
correctness.

Overall, the project was
interesting. In my opinion, the
background removal was the main
difficulty: early masks damaged
pale clothing and retained
fragments. Corrected masking and
boundary inspection improved the
results. I separated the code into
sketch.js for shared setup and
navigation, task1.js for the
carousel, and task2.js for motion
processing. Classes separate
state, controllers, processing and
views. The main functionality is
complete and all eight directions
passed testing. Next time, I would
establish this structure earlier.
Complex backgrounds, rotation and
scaling remain limitations.
*/

// Shared app setup, navigation and drawing helpers.

const TASK_HOME = "home";
const TASK_CAROUSEL = "carousel";
const TASK_PANORAMA = "panorama";

const CANVAS_WIDTH = 1160;
const CANVAS_HEIGHT = 720;

// Shared interface colours. Image and chart colours stay independent of the theme.
const UI_THEME = {
  page: "#101416",
  shell: "#141a1d",
  panel: "#1c2428",
  raised: "#263238",
  inset: "#11191d",
  border: "#3b4a50",
  borderSoft: "#2e3a40",
  text: "#eef2ef",
  muted: "#b1bebb",
  subtle: "#8a9b98",
  carousel: "#e3bd78",
  motion: "#76c8ba",
  success: "#99c9ae",
  warning: "#e3bd78"
};

// Home screen card layout.
const HOME_CARD_WIDTH = 468;
const HOME_CARD_HEIGHT = 276;
const HOME_CARD_GAP = 44;
const HOME_CARD_Y = 292;
const HOME_FIRST_CARD_X = (CANVAS_WIDTH - HOME_CARD_WIDTH * 2 - HOME_CARD_GAP) / 2;
const HOME_SECOND_CARD_X = HOME_FIRST_CARD_X + HOME_CARD_WIDTH + HOME_CARD_GAP;

// Duration of the highlight when a checklist step finishes.
const STATUS_PULSE_FRAMES = 34;

// Task screens share a Back button.
const NAV_BUTTON_WIDTH = 104;
const NAV_BUTTON_HEIGHT = 34;
const NAV_BUTTON_RIGHT_MARGIN = 84;
const NAV_BUTTON_DEFAULT_Y = 64;
const NAV_BUTTON_ANIMATION_Y = 22;

// Task page layout.
const TASK_PANEL_X = 72;
const TASK_HEADER_X = 82;
const TASK_HEADER_TITLE_Y = 90;
const TASK_HEADER_SUBTITLE_Y = 124;

// Routes input to the active task while keeping both tasks' state available.
class AppController {
  constructor() {
    this.currentTask = TASK_HOME;
    this.canvas = null;
    this.ui = new InterfaceRenderer(this);
    this.task1 = new Task1Controller(this.ui);
    this.task2 = new Task2Controller(this.ui);
    this.home = new HomeView(this);
  }

  setup() {
    this.canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    // Cap density to keep larger displays responsive.
    pixelDensity(min(2, displayDensity()));
    textFont("Segoe UI");
    this.task1.animation.createBackground();
  }

  // Draw only the active view; switching tasks keeps the loaded images.
  draw() {
    if (this.currentTask === TASK_CAROUSEL) {
      this.task1.view.draw();
    } else if (this.currentTask === TASK_PANORAMA) {
      this.task2.view.draw();
    } else {
      this.home.draw();
    }
    cursor(this.isControlHovered() ? HAND : ARROW);
  }

  // Reserve 1 and 2 for task selection, then pass other keys to the active task.
  handleKey(pressedKey) {
    if (pressedKey === "1") {
      this.showTask(TASK_CAROUSEL);
    } else if (pressedKey === "2") {
      this.showTask(TASK_PANORAMA);
    } else if (this.currentTask === TASK_CAROUSEL) {
      return this.task1.handleKeys(pressedKey);
    } else if (this.currentTask === TASK_PANORAMA) {
      return this.task2.handleKeys(pressedKey);
    }
  }

  // Resize the canvas to fit the task and cancel any unfinished slider drag.
  showTask(task) {
    if (this.currentTask === task) {
      return;
    }
    this.currentTask = task;
    this.task2.state.thresholdSliderActive = false;
    const isPanorama = task === TASK_PANORAMA;
    this.canvas.elt.classList.toggle("panorama", isPanorama);
    resizeCanvas(isPanorama ? TASK2_CANVAS_WIDTH : CANVAS_WIDTH, CANVAS_HEIGHT, true);
    window.scrollTo(0, 0);
  }

  // Navigation takes priority over controls inside the task view.
  mousePressed() {
    if (this.ui.isNavigationHovered()) {
      this.ui.handleNavigationClick();
    } else if (this.currentTask === TASK_HOME) {
      this.home.mousePressed();
    } else if (this.currentTask === TASK_PANORAMA) {
      this.task2.mousePressed();
    }
  }

  mouseDragged() {
    if (this.currentTask === TASK_PANORAMA && this.task2.state.thresholdSliderActive) {
      this.task2.handleThresholdSliderMouse();
    }
  }

  mouseReleased() {
    this.task2.state.thresholdSliderActive = false;
  }

  // Hidden motion controls must not show a pointer behind the detail view.
  isControlHovered() {
    if (this.ui.isNavigationHovered()) {
      return true;
    }
    if (this.currentTask === TASK_HOME) {
      return this.home.isCardHovered();
    }
    if (this.currentTask === TASK_PANORAMA) {
      return !this.task2.refinement.detailsOpen &&
        (this.task2.view.getPairChipIndexAtMouse() !== -1 ||
         this.task2.view.isThresholdSliderHovered() || this.task2.view.isAnalysisButtonHovered() ||
         this.task2.refinement.contains(mouseX, mouseY));
    }
    return false;
  }
}

// Draws the task selector using small previews that need no loaded images.
class HomeView {
  constructor(app) {
    this.app = app;
  }

  draw() {
    this.app.ui.drawBackdrop(color(UI_THEME.motion));
    this.drawHero();

    this.drawTaskCard(
      HOME_FIRST_CARD_X,
      HOME_CARD_Y,
      HOME_CARD_WIDTH,
      HOME_CARD_HEIGHT,
      "1",
      "Cutout Carousel",
      "Foreground extraction and streaming motion",
      color(UI_THEME.carousel),
      "carousel"
    );
    this.drawTaskCard(
      HOME_SECOND_CARD_X,
      HOME_CARD_Y,
      HOME_CARD_WIDTH,
      HOME_CARD_HEIGHT,
      "2",
      "Motion Guide",
      "Edge tracking with adaptive thresholds",
      color(UI_THEME.motion),
      "motion"
    );

    this.drawFooter();
  }

  drawHero() {
    textAlign(LEFT, BASELINE);
    noStroke();

    fill(UI_THEME.motion);
    textSize(11);
    textStyle(BOLD);
    text("IMAGE PROCESSING", HOME_FIRST_CARD_X, 104);

    fill(UI_THEME.text);
    textSize(48);
    text("Vision Studio", HOME_FIRST_CARD_X, 164);

    fill(UI_THEME.muted);
    textSize(17);
    textStyle(NORMAL);
    text("Explore colour, edges and movement.", HOME_FIRST_CARD_X, 197);

    textAlign(RIGHT, BASELINE);
    fill(UI_THEME.text);
    textStyle(BOLD);
    textSize(14);
    text("Two tasks. One workspace.", width - HOME_FIRST_CARD_X, 160);
    fill(UI_THEME.subtle);
    textStyle(NORMAL);
    textSize(12);
    text("8 portraits / 8 motion pairs", width - HOME_FIRST_CARD_X, 185);

    stroke(UI_THEME.borderSoft);
    strokeWeight(1);
    line(HOME_FIRST_CARD_X, 235, width - HOME_FIRST_CARD_X, 235);
    noStroke();
    fill(UI_THEME.subtle);
    textAlign(LEFT, BASELINE);
    textSize(11);
    text("CHOOSE A TASK", HOME_FIRST_CARD_X, 269);
    this.drawSignalBar(width - HOME_FIRST_CARD_X - 108, 259, 108);
  }

  drawSignalBar(x, y, barWidth) {
    const segments = 12;
    const gap = 4;
    const segmentWidth = (barWidth - gap * (segments - 1)) / segments;
    const pulseIndex = floor(frameCount / 10) % segments;

    for (let i = 0; i < segments; i++) {
      fill(i === pulseIndex ? UI_THEME.motion : UI_THEME.borderSoft);
      rect(x + i * (segmentWidth + gap), y, segmentWidth, 7, 2);
    }
  }

  // Both cards use the same layout and highlight their full clickable area.
  drawTaskCard(
    x,
    y,
    cardWidth,
    cardHeight,
    keyLabel,
    titleText,
    descriptionText,
    accentColour,
    previewKind
  ) {
    const isHovered = isMouseInside(x, y, cardWidth, cardHeight);
    const accentRed = red(accentColour);
    const accentGreen = green(accentColour);
    const accentBlue = blue(accentColour);

    this.app.ui.drawSurface(x, y, cardWidth, cardHeight);
    if (isHovered) {
      stroke(accentColour);
      noFill();
      rect(x, y, cardWidth, cardHeight, 10);
    }

    noStroke();
    fill(accentRed, accentGreen, accentBlue, isHovered ? 42 : 24);
    rect(x + 24, y + 24, 54, 50, 6);

    fill(accentColour);
    textAlign(CENTER, CENTER);
    textStyle(BOLD);
    textSize(26);
    text(keyLabel, x + 51, y + 49);

    textAlign(LEFT, BASELINE);
    fill(UI_THEME.text);
    textSize(27);
    text(titleText, x + 104, y + 48);

    fill(UI_THEME.muted);
    textSize(14);
    textStyle(NORMAL);
    text(descriptionText, x + 104, y + 74);

    fill(UI_THEME.borderSoft);
    rect(x + 24, y + 98, cardWidth - 48, 1);

    if (previewKind === "carousel") {
      this.drawCarouselPreview(x + 30, y + 122, cardWidth - 60, 108, accentColour);
    } else {
      this.drawMotionPreview(x + 30, y + 122, cardWidth - 60, 108, accentColour);
    }

    fill(isHovered ? accentColour : color(UI_THEME.subtle));
    textAlign(RIGHT, BASELINE);
    textSize(12);
    textStyle(BOLD);
    text(isHovered ? "OPEN" : "PRESS " + keyLabel, x + cardWidth - 24, y + cardHeight - 20);
    textAlign(LEFT, BASELINE);
  }

  drawCarouselPreview(x, y, previewWidth, previewHeight, accentColour) {
    noStroke();
    fill(UI_THEME.inset);
    rect(x, y, previewWidth, previewHeight, 6);

    for (let i = 0; i < 5; i++) {
      const tileX = x + 18 + i * 62 + (frameCount * 0.25) % 26;
      fill(UI_THEME.raised);
      rect(tileX, y + 18, 42, 60, 5);
      this.drawMiniPerson(tileX + 21, y + 48, i === 2 ? accentColour : color(UI_THEME.muted));
    }

    fill(red(accentColour), green(accentColour), blue(accentColour), 110);
    rect(x + 118, y + 84, 90, 5, 3);
  }

  drawMiniPerson(centerX, centerY, bodyColour) {
    noStroke();
    fill(236, 220, 201);
    ellipse(centerX, centerY - 18, 18, 20);
    fill(bodyColour);
    rect(centerX - 14, centerY - 6, 28, 34, 8);
    fill(8, 10, 17, 90);
    rect(centerX - 14, centerY + 15, 28, 8, 4);
  }

  drawMotionPreview(x, y, previewWidth, previewHeight, accentColour) {
    noStroke();
    fill(UI_THEME.inset);
    rect(x, y, previewWidth, previewHeight, 6);

    this.drawMotionFrame(x + 18, y + 18, 128, 62, false);
    this.drawMotionFrame(x + previewWidth - 146, y + 18, 128, 62, true);

    stroke(red(accentColour), green(accentColour), blue(accentColour), 220);
    strokeWeight(3);
    const arrowY = y + 82;
    line(x + 140, arrowY, x + previewWidth - 140, arrowY);
    noStroke();
    fill(red(accentColour), green(accentColour), blue(accentColour), 220);
    triangle(x + previewWidth - 132, arrowY, x + previewWidth - 146, arrowY - 7, x + previewWidth - 146, arrowY + 7);
  }

  // The offset rectangle illustrates the relationship between the two frames.
  drawMotionFrame(x, y, frameWidth, frameHeight, shifted) {
    noStroke();
    fill(240, 243, 248);
    rect(x, y, frameWidth, frameHeight, 4);

    const objectX = shifted ? x + 72 : x + 42;
    const objectY = shifted ? y + 14 : y + 24;
    fill(32, 38, 52);
    rect(objectX, objectY, 30, 32, 8);
    fill(248, 84, 120);
    rect(objectX + 12, objectY + 10, 6, 6, 2);
  }

  drawFooter() {
    fill(UI_THEME.subtle);
    noStroke();
    textAlign(CENTER, BASELINE);
    textStyle(NORMAL);
    textSize(13);
    text("Press 1 or 2, or click a card to begin", width / 2, height - 74);
    textAlign(LEFT, BASELINE);
  }

  isCardHovered() {
    return (
      isMouseInside(HOME_FIRST_CARD_X, HOME_CARD_Y, HOME_CARD_WIDTH, HOME_CARD_HEIGHT) ||
      isMouseInside(HOME_SECOND_CARD_X, HOME_CARD_Y, HOME_CARD_WIDTH, HOME_CARD_HEIGHT)
    );
  }

  mousePressed() {
    if (isMouseInside(HOME_FIRST_CARD_X, HOME_CARD_Y, HOME_CARD_WIDTH, HOME_CARD_HEIGHT)) {
      this.app.showTask(TASK_CAROUSEL);
    } else if (isMouseInside(HOME_SECOND_CARD_X, HOME_CARD_Y, HOME_CARD_WIDTH, HOME_CARD_HEIGHT)) {
      this.app.showTask(TASK_PANORAMA);
    }
  }
}

// Keeps headers, workflow rows and navigation consistent across both tasks.
class InterfaceRenderer {
  constructor(app) {
    this.app = app;
  }

  // The full-screen carousel places Back higher than the setup screens.
  getNavigationBounds() {
    const animationVisible = this.app.currentTask === TASK_CAROUSEL &&
      !this.app.task1.comparison.isOpen && this.app.task1.state.animationStarted && this.app.task1.state.imagesLoaded;
    const buttonY = animationVisible ? NAV_BUTTON_ANIMATION_Y : NAV_BUTTON_DEFAULT_Y;

    return {
      x: width - NAV_BUTTON_RIGHT_MARGIN - NAV_BUTTON_WIDTH,
      y: buttonY,
      width: NAV_BUTTON_WIDTH,
      height: NAV_BUTTON_HEIGHT
    };
  }

  isNavigationHovered() {
    if (this.app.currentTask === TASK_HOME) {
      return false;
    }
    const bounds = this.getNavigationBounds();
    return isMouseInside(bounds.x, bounds.y, bounds.width, bounds.height);
  }

  // Close an inspection view first; a second Back click leaves its task.
  handleNavigationClick() {
    if (this.app.currentTask === TASK_CAROUSEL) {
      if (this.app.task1.comparison.isOpen) {
        this.app.task1.comparison.close();
        return;
      }
      this.app.showTask(TASK_HOME);
    } else if (this.app.currentTask === TASK_PANORAMA) {
      if (this.app.task2.refinement.detailsOpen) {
        this.app.task2.toggleDetails();
        return;
      }
      this.app.showTask(TASK_CAROUSEL);
    }
  }

  accentColour() {
    return color(this.app.currentTask === TASK_PANORAMA ? UI_THEME.motion : UI_THEME.carousel);
  }

  // Drawing and hit testing share the same bounds, including after a resize.
  drawNavigation() {
    const bounds = this.getNavigationBounds();
    const accentColour = this.accentColour();
    const accentRed = red(accentColour);
    const accentGreen = green(accentColour);
    const accentBlue = blue(accentColour);
    const isHovered = this.isNavigationHovered();

    stroke(isHovered ? accentColour : color(UI_THEME.border));
    strokeWeight(1);
    fill(isHovered ? UI_THEME.raised : UI_THEME.panel);
    rect(bounds.x, bounds.y, bounds.width, bounds.height, 8);

    noStroke();
    fill(accentRed, accentGreen, accentBlue, isHovered ? 18 : 0);
    rect(bounds.x + 1, bounds.y + 1, bounds.width - 2, bounds.height - 2, 7);

    this.drawNavigationIcon(bounds, accentColour);

    noStroke();
    fill(UI_THEME.text);
    textAlign(LEFT, CENTER);
    textStyle(BOLD);
    textSize(13);
    text("Back", bounds.x + 42, bounds.y + bounds.height / 2);
    textAlign(LEFT, BASELINE);
  }

  drawNavigationIcon(bounds, accentColour) {
    const iconX = bounds.x + 20;
    const iconY = bounds.y + bounds.height / 2;

    stroke(accentColour);
    strokeWeight(2);
    noFill();

    line(iconX + 7, iconY - 7, iconX - 1, iconY);
    line(iconX - 1, iconY, iconX + 7, iconY + 7);
    line(iconX, iconY, iconX + 17, iconY);
  }

  drawBackdrop(accentColour) {
    background(UI_THEME.page);
    noStroke();
    fill(UI_THEME.shell);
    rect(54, 42, width - 108, height - 84, 12);
    stroke(UI_THEME.borderSoft);
    strokeWeight(1);
    noFill();
    rect(54, 42, width - 108, height - 84, 12);

    noStroke();
    fill(accentColour);
    rect(82, 42, 64, 3, 2);

    if (this.app.currentTask !== TASK_HOME) {
      stroke(UI_THEME.borderSoft);
      line(72, 137, width - 72, 137);
    }
  }

  // Reuse the panel treatment without changing a view's content or hit area.
  drawSurface(x, y, panelWidth, panelHeight, inset = false) {
    stroke(inset ? UI_THEME.borderSoft : UI_THEME.border);
    strokeWeight(1);
    fill(inset ? UI_THEME.inset : UI_THEME.panel);
    rect(x, y, panelWidth, panelHeight, 10);
  }

  // Each task supplies its panel size while the border and heading stay shared.
  drawWorkflowPanel(x, y, panelWidth, panelHeight, titleText, accentColour) {
    this.drawSurface(x, y, panelWidth, panelHeight);

    noStroke();
    fill(accentColour);
    rect(x + 16, y + 16, 3, 10, 1);

    fill(UI_THEME.muted);
    textAlign(LEFT, BASELINE);
    textStyle(BOLD);
    textSize(11);
    text(titleText.toUpperCase(), x + 27, y + 25);
  }

  drawHeader(titleText, subtitleText) {
    noStroke();
    textAlign(LEFT, BASELINE);
    fill(UI_THEME.text);
    textSize(32);
    textStyle(BOLD);
    text(titleText, TASK_HEADER_X, TASK_HEADER_TITLE_Y);

    fill(UI_THEME.muted);
    textSize(17);
    textStyle(NORMAL);
    text(subtitleText, TASK_HEADER_X, TASK_HEADER_SUBTITLE_Y);
    this.drawNavigation();
  }

  // Completed steps share a short pulse, key badge and completion mark.
  drawStatusRow(y, keyLabel, labelText, isComplete, pulseAmount) {
    const rowX = TASK_PANEL_X + 22;
    const rowWidth = this.app.currentTask === TASK_PANORAMA
      ? TASK2_WORKFLOW_WIDTH - 44
      : TASK1_WORKFLOW_WIDTH - 44;
    const rowHeight = 42;
    const rowTop = y - 25;
    const badgeWidth = 30;
    const badgeHeight = 24;
    const badgeX = rowX + 19;
    const labelX = rowX + 58;
    const checkX = rowX + rowWidth - 22;
    const checkY = rowTop + rowHeight / 2;
    const maxLabelWidth = rowWidth - 94;
    const accentColour = this.accentColour();
    const accentRed = red(accentColour);
    const accentGreen = green(accentColour);
    const accentBlue = blue(accentColour);
    const pulse = isComplete ? pulseAmount || 0 : 0;

    if (pulse > 0) {
      noStroke();
      fill(accentRed, accentGreen, accentBlue, 34 * pulse);
      rect(rowX - 2, rowTop - 2, rowWidth + 4, rowHeight + 4, 9);
    }

    stroke(isComplete ? lerpColor(color(UI_THEME.border), accentColour, 0.35) : color(UI_THEME.borderSoft));
    strokeWeight(1);
    fill(isComplete ? lerpColor(color(UI_THEME.inset), accentColour, 0.08) : color(UI_THEME.inset));
    rect(rowX, rowTop, rowWidth, rowHeight, 8);

    stroke(isComplete ? accentColour : color(UI_THEME.border));
    strokeWeight(1);
    fill(UI_THEME.raised);
    rect(badgeX - badgeWidth / 2, checkY - badgeHeight / 2, badgeWidth, badgeHeight, 6);

    noStroke();
    fill(isComplete ? accentColour : color(UI_THEME.text));
    textAlign(CENTER, CENTER);
    textSize(12);
    textStyle(BOLD);
    text(keyLabel.toUpperCase(), badgeX, checkY);

    textAlign(LEFT, BASELINE);
    textSize(15);
    textStyle(NORMAL);

    fill(UI_THEME.text);
    drawFittedText(labelText, labelX, rowTop + 27, maxLabelWidth, 15, 12);

    if (isComplete) {
      stroke(UI_THEME.success);
      strokeWeight(2);
      noFill();
      line(checkX - 6, checkY, checkX - 2, checkY + 5);
      line(checkX - 2, checkY + 5, checkX + 7, checkY - 6);
    } else {
      stroke(UI_THEME.border);
      strokeWeight(1);
      noFill();
      circle(checkX, checkY, 10);
    }
  }

  drawFooter(noteText) {
    noStroke();
    fill(UI_THEME.subtle);
    textAlign(LEFT, BASELINE);
    textSize(14);
    textStyle(NORMAL);
    text(noteText, 72, height - 22);
  }
}

// Store the completion frame so the highlight can fade over time.
function markStepPulse(stepPulseFrames, stepKey) {
  stepPulseFrames[stepKey] = frameCount;
}

// A squared falloff settles the highlight without an abrupt final change.
function getStepPulseAmount(stepPulseFrames, stepKey) {
  if (stepPulseFrames[stepKey] === undefined) {
    return 0;
  }

  const pulseAge = frameCount - stepPulseFrames[stepKey];

  if (pulseAge < 0 || pulseAge > STATUS_PULSE_FRAMES) {
    return 0;
  }

  const pulseProgress = 1 - pulseAge / STATUS_PULSE_FRAMES;
  return pulseProgress * pulseProgress;
}

// p5 mouse coordinates and these bounds are both in canvas space.
function isMouseInside(x, y, boxWidth, boxHeight) {
  return mouseX >= x && mouseX <= x + boxWidth && mouseY >= y && mouseY <= y + boxHeight;
}

// Each image pixel occupies four consecutive entries: red, green, blue, alpha.
function getPixelIndex(x, y, imageWidth) {
  return 4 * (y * imageWidth + x);
}

// Preserve aspect ratio and return the drawn bounds for correctly placed overlays.
function drawImageInsideBox(sourceImage, x, y, boxWidth, boxHeight) {
  const imageRatio = sourceImage.width / sourceImage.height;
  const boxRatio = boxWidth / boxHeight;
  let drawWidth = boxWidth;
  let drawHeight = boxHeight;

  if (imageRatio > boxRatio) {
    drawHeight = boxWidth / imageRatio;
  } else {
    drawWidth = boxHeight * imageRatio;
  }

  const drawX = x + (boxWidth - drawWidth) / 2;
  const drawY = y + (boxHeight - drawHeight) / 2;
  image(sourceImage, drawX, drawY, drawWidth, drawHeight);

  return {
    x: drawX,
    y: drawY,
    width: drawWidth,
    height: drawHeight
  };
}

// Shrink long labels to fit, stopping at the minimum font size.
function drawFittedText(textValue, x, y, maxWidth, preferredSize, minimumSize) {
  let fittedSize = preferredSize;

  textSize(fittedSize);
  while (textWidth(textValue) > maxWidth && fittedSize > minimumSize) {
    fittedSize--;
    textSize(fittedSize);
  }

  text(textValue, x, y);
}

// p5 callbacks delegate to one app instance. The task files load before setup().
let app;

function setup() {
  app = new AppController();
  app.setup();
}

function draw() {
  app.draw();
}

function keyPressed() {
  return app.handleKey(key.toLowerCase());
}

function mousePressed() {
  app.mousePressed();
}

function mouseDragged() {
  app.mouseDragged();
}

function mouseReleased() {
  app.mouseReleased();
}
