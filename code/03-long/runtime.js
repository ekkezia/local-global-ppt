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

async function renderLongImage(srcFolder) {
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
  const nextSources = JSON.stringify(images);
  if (nextSources === renderedSources) return;
  renderedSources = nextSources;

  imageStrip.replaceChildren();
  emptyState.hidden = images.length > 0;

  // HERE
  // Render the images in ascending order
  for (const source of images) {
    const image = document.createElement("img");
    image.src = source;
    image.alt = source.split("/").pop();
    image.loading = "eager";
    imageStrip.append(image);
  }

  window.scrollTo({ left: 0, behavior: "instant" });
}

// A small executable vocabulary lets script.js read like pseudocode while this
// file keeps the browser-specific implementation out of the presentation.
class PhotographSequence {
  constructor(srcFolder) {
    this.srcFolder = srcFolder;
  }

  sort() {
    return this;
  }

  join() {
    return this;
  }
}

const byNarrativeOrder = Symbol("byNarrativeOrder");
const horizontally = Symbol("horizontally");

function load(srcFolder) {
  const slideRoot = "code/03-long/";
  const previewFolder = srcFolder.startsWith(slideRoot)
    ? srcFolder.slice(slideRoot.length)
    : srcFolder;

  return new PhotographSequence(previewFolder);
}

function display(sequence) {
  activeFolder = sequence.srcFolder;
  renderLongImage(activeFolder);
}

// Pick up images pasted after the preview has already opened.
setInterval(() => renderLongImage(activeFolder), 1000);
window.addEventListener("focus", () => renderLongImage(activeFolder));
