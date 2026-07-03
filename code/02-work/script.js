const photographs = load("../../assets/02-work");

// Alignments
const horizontally = {
  display: "flex",
  flexDirection: "row",
  overflowX: "scroll",
  overflowY: "hidden",
  width: "100vw"
}; // 👈 HERE: What CSS config can we can put to procedurally arrange our images?

const vertically = {
  display: "flex",
  flexDirection: "column",
  overflowX: "hidden",
  overflowY: "scroll",
  width: "100vw",
  alignItems: "center",
  justifyContent: "flex-start"
};

function renderPhotograph(source) {
  return `<img src="${source}" alt="">`; // 👈 HERE: What HTML tag can turn this source into an image?
}

const longImage = photographs
  .sort(byNarrativeOrder)
  .join(horizontally); // Change to vertical to stack the photographs.

display(longImage);

// 🔑 ANSWER
  // return `<img src="${source}" alt="">`;

  // display: "flex",
  // flexDirection: "row",
  // overflowX: "scroll",
  // width: "100vw"
