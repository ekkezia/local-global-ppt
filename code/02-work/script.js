const photographs = load("../../assets/02-work");

function renderPhotograph(source) {
  return ""; // 👈 HERE: What HTML tag can turn this source into an image?
}

// Alignments
const horizontally = {
  display: "",
  flexDirection: "",
  overflowX: "",
  overflowY: "",
  width: ""
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
