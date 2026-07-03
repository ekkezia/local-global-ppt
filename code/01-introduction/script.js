const image = document.querySelector("#rendered-image");
const currentPath = document.querySelector("#current-path");

/**
 * Renders an HTML image using the imagePath argument.
 *
 * Conceptually, this produces:
 * <img src={imagePath}>
 */
function renderImage({ imagePath, alt = "Rendered image" }) {
  currentPath.textContent = `<img src="${imagePath}" alt="${alt}">`; // 👈 HERE: <img> as our basic procedure
  renderWhenAnswerIsCorrect({ imagePath, alt });
}

// Change this imagePath, save the file, and watch the HTML viewer update.
renderImage({
  imagePath: "../../assets/01-introduction/0.jpg",
  alt: "An example image waiting to be replaced"
});

function renderWhenAnswerIsCorrect({ imagePath, alt }) {
  const answer = readImageTag(currentPath.textContent);

  if (answer?.src === imagePath) {
    image.src = imagePath;
    image.alt = answer.alt || alt;
    image.hidden = false;
    return;
  }

  image.removeAttribute("src");
  image.alt = "";
  image.hidden = true;
}

function readImageTag(html) {
  const template = document.createElement("template");
  template.innerHTML = html.trim();

  const img = template.content.firstElementChild;
  if (img?.tagName !== "IMG" || template.content.children.length !== 1) {
    return undefined;
  }

  return {
    src: img.getAttribute("src"),
    alt: img.getAttribute("alt") || ""
  };
}

// 🔑 currentPath.textContent = `<img src="${imagePath}" alt="${alt}">`;
