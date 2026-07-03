const image = document.querySelector("#rendered-image");
const currentPath = document.querySelector("#current-path");

/**
 * Renders an HTML image using the imagePath argument.
 *
 * Conceptually, this produces:
 * <img src={imagePath}>
 */
function renderImage({ imagePath, alt = "Rendered image" }) {
  image.src = imagePath;
  image.alt = alt;
  currentPath.textContent = ``; // 👈 HERE: <img> as our basic procedure
}

// Change this imagePath, save the file, and watch the HTML viewer update.
renderImage({
  imagePath: "../../assets/01-introduction/0.jpg",
  alt: "An example image waiting to be replaced"
});

// 🔑 currentPath.textContent = `<img src={imagePath} />`;