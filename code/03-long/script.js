const selectedFolder = ""; // 👈 HERE: Scope of the project: environment where I'm in.
// 🔑 hong-kong, jakarta, london?

const photographs = load(`../../assets/03-long/${selectedFolder}`);

const longImage = photographs
  .sort(byNarrativeOrder)
  .join(horizontally);

display(longImage);
