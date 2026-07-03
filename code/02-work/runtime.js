const imageStrip = document.querySelector("#image-strip");
const emptyState = document.querySelector("#empty-state");

/**
 * Discovers every image in a source folder and lays them side-by-side in
 * ascending natural filename order. The browser page scrolls horizontally
 * whenever the combined image strip exceeds the viewport width.
 */
let renderedSources = "";
let refreshInFlight = false;
let activeFolder = "assets";
let activeLayout = {};

async function renderLongImage(srcFolder, layout = activeLayout) {
  if (refreshInFlight) return;
  refreshInFlight = true;
  let images = [];

  try {
    const response = await fetch(`/__ppt_studio_files?folder=${encodeURIComponent(srcFolder)}`);
    if (response.ok) images = await response.json();
  } catch {
    // Keep the empty state visible when opened outside PPT Studio's server.
  } finally {
    refreshInFlight = false;
  }

  // Folder contents can change without triggering a document-save reload (for
  // example, when files are pasted in Finder). Avoid rebuilding the strip when
  // the listing is unchanged.
  const nextRenderState = JSON.stringify({ images, layout });
  if (nextRenderState === renderedSources) return;
  renderedSources = nextRenderState;

  imageStrip.replaceChildren();
  let renderedCount = 0;

  // Render the images in ascending order.
  for (const source of images) {
    const image = createImageFromMarkup(renderPhotograph(source));
    if (!image) continue;

    if (!image.alt) image.alt = source.split("/").pop();
    image.loading = "eager";
    imageStrip.append(image);
    renderedCount += 1;
  }

  emptyState.hidden = renderedCount > 0;
  applyLayout(layout);
  window.scrollTo({ left: 0, behavior: "instant" });
}

function createImageFromMarkup(markup) {
  const template = document.createElement("template");
  template.innerHTML = String(markup || "").trim();
  return template.content.querySelector("img");
}

// A small executable vocabulary lets script.js read like pseudocode while this
// file keeps the browser-specific implementation out of the presentation.
class PhotographSequence {
  constructor(srcFolder) {
    this.srcFolder = srcFolder;
    this.layout = {};
  }

  sort() {
    return this;
  }

  join(layout) {
    this.layout = layout;
    return this;
  }
}

const byNarrativeOrder = Symbol("byNarrativeOrder");

function load(srcFolder) {
  const slideRoot = "code/02-work/";
  const previewFolder = srcFolder.startsWith(slideRoot)
    ? srcFolder.slice(slideRoot.length)
    : srcFolder;

  return new PhotographSequence(previewFolder);
}

function display(sequence) {
  activeFolder = sequence.srcFolder;
  activeLayout = sequence.layout;
  renderLongImage(activeFolder, activeLayout);
}

function applyLayout(layout) {
  const isVertical = layout.flexDirection === "column";

  Object.assign(imageStrip.style, {
    minHeight: isVertical ? "auto" : "100vh",
    width: isVertical ? "100vw" : "max-content",
    overflowX: isVertical ? "hidden" : "auto",
    overflowY: isVertical ? "auto" : "hidden",
    ...layout
  });

  document.body.style.overflowX = "hidden";
  document.body.style.overflowY = "hidden";

  for (const image of imageStrip.querySelectorAll("img")) {
    image.style.width = isVertical ? "min(100vw, 900px)" : "auto";
    image.style.height = isVertical ? "auto" : "100vh";
  }
}

// Pick up images pasted after the preview has already opened.
setInterval(() => renderLongImage(activeFolder, activeLayout), 1000);
window.addEventListener("focus", () => renderLongImage(activeFolder, activeLayout));
