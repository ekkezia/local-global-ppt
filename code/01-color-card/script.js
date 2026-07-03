const colors = ["#dce8ff", "#ffe1d6", "#d9f7e8", "#f1e1ff", "#fff3b0"];
const button = document.querySelector("button");

button.addEventListener("click", () => {
  const currentColor = getComputedStyle(document.body).backgroundColor;
  const choices = colors.filter((color) => color !== currentColor);
  const nextColor = choices[Math.floor(Math.random() * choices.length)];
  document.body.style.backgroundColor = nextColor;
});
