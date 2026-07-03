const scope = ""; // 👈 HERE: Scope of the project: environment where I'm in.
// 🔑 hong-kong, jakarta, london?  

createStreets(scope);

/**
 * Take a photograph every few steps within a specific location.
 * Render each photograph as a texture inside a sphere.
 * Display navigation arrows that move between photographs.
 * Combine the sequence with a specific story and cast of characters.
 */
async function createStreets(location) {
  const project = describeProject(location);
  const photographs = await takePhotographEveryFewSteps(project);
  const streetView = renderEachPhotographAsTextureInsideSphere(photographs);

  displayNavigationArrows(streetView);
  combineSequenceWithStoryAndCast(streetView, project);
}

async function takePhotographEveryFewSteps(project) {
  try {
    const response = await fetch(
      `/__ppt_studio_files?folder=${encodeURIComponent(project.folder)}&videos=true`
    );

    if (response.ok) return response.json();
  } catch {
    // Keep the empty state visible when opened outside PPT Studio's server.
  }

  return [];
}

function renderEachPhotographAsTextureInsideSphere(photographs) {
  const sphere = StreetSphere.create("canvas");
  const filename = document.querySelector("#filename");
  const counter = document.querySelector("#counter");
  const emptyState = document.querySelector("#empty-state");
  let currentIndex = 0;

  async function renderCurrentPhotograph() {
    const source = photographs[currentIndex];

    if (!source) {
      if (filename) filename.textContent = "No photographs found";
      if (counter) counter.textContent = "0 / 0";
      if (emptyState) emptyState.hidden = false;
      return;
    }

    if (emptyState) emptyState.hidden = true;
    await sphere.setTexture(source);
    if (filename) filename.textContent = getFilename(source);
    if (counter) counter.textContent = `${currentIndex + 1} / ${photographs.length}`;
  }

  return {
    photographs,
    currentIndex,
    async render() {
      await renderCurrentPhotograph();
    },
    async next() {
      if (photographs.length === 0) return;
      currentIndex = Math.min(currentIndex + 1, photographs.length - 1);
      this.currentIndex = currentIndex;
      await renderCurrentPhotograph();
    },
    async previous() {
      if (photographs.length === 0) return;
      currentIndex = Math.max(currentIndex - 1, 0);
      this.currentIndex = currentIndex;
      await renderCurrentPhotograph();
    }
  };
}

function displayNavigationArrows(streetView) {
  const previousButton = document.querySelector("#previous");
  const nextButton = document.querySelector("#next");

  function updateArrows() {
    const lastIndex = streetView.photographs.length - 1;
    if (!previousButton || !nextButton) return;
    previousButton.disabled = streetView.currentIndex <= 0;
    nextButton.disabled = streetView.currentIndex >= lastIndex;
  }

  if (!previousButton || !nextButton) {
    streetView.render();
    return;
  }

  previousButton.addEventListener("click", async () => {
    await streetView.previous();
    updateArrows();
  });

  nextButton.addEventListener("click", async () => {
    await streetView.next();
    updateArrows();
  });

  updateArrows();
  streetView.render().then(updateArrows);
}

function combineSequenceWithStoryAndCast(streetView, project) {
  const scopeText = document.querySelector("#scope-label");
  const storyText = document.querySelector("#story");
  const castText = document.querySelector("#cast");

  if (scopeText) scopeText.textContent = project.label;
  if (storyText) storyText.textContent = project.story;
  if (castText) castText.textContent = project.characters.join(" / ");

  streetView.location = project.label;
  streetView.story = project.story;
  streetView.characters = project.characters;
}

function describeProject(location) {
  const projects = {
    "hong-kong": {
      label: "Hong Kong: Jordan Street",
      folder: "../../assets/05-streets/hkg",
      story: "Two girls meet after chatting through a second-hand buying platform.",
      characters: ["the buyer", "the seller", "Jordan Street"]
    },
    jakarta: {
      label: "Jakarta: Pasar Baru",
      folder: "../../assets/05-streets/jkt",
      story: "A branching walk through Pasar Baru where one decision changes what happens next.",
      characters: ["the main character", "a stranger", "Pasar Baru"]
    },
    singapore: {
      label: "Singapore: Vertical Navigation",
      folder: "../../assets/05-streets/sg",
      story: "A vertical route that responds to the architecture of the location.",
      characters: ["the visitor", "the elevator", "the building"]
    },
    "new-york": {
      label: "New York City: Recalculating Route",
      folder: "../../assets/05-streets/nyc",
      story: "A route keeps recalculating as the viewer moves through the city.",
      characters: ["the walker", "the route", "All Streets Gallery"]
    },
    kampong: {
      label: "Kampong",
      folder: "../../assets/05-streets/kh",
      story: "A compact route through a neighborhood sequence.",
      characters: ["the walker", "the neighborhood", "the street"]
    }
  };

  return projects[location] || {
    label: location,
    folder: `../../assets/05-streets/${location}`,
    story: "A sequence of photographs taken every few steps through this location.",
    characters: ["the viewer", "the location", "the route"]
  };
}

function getFilename(source) {
  return source.split("/").pop();
}
