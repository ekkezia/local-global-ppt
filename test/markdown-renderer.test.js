const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const workspaceRoot = path.resolve(__dirname, "..");
const extensionSource = `${fs.readFileSync(path.join(workspaceRoot, "extension.js"), "utf8")}
this.__markdownToHtml = markdownToHtml;`;
const sandbox = {
  Buffer,
  URL,
  console,
  exports: {},
  module: { exports: {} },
  require(moduleName) {
    return moduleName === "vscode" ? {} : require(moduleName);
  }
};

vm.createContext(sandbox);
vm.runInContext(extensionSource, sandbox);

const render = (markdown) => sandbox.__markdownToHtml(markdown, (source) => `media:${source}`);

test("renders raw HTML and Markdown images while preserving inline examples", () => {
  const html = render([
    "`<img src=\"example.jpg\">`",
    "<br />",
    "<img width=\"220\" src=\"../assets/raw.jpg\"></img>",
    "![Markdown image](../assets/markdown.png)"
  ].join("\n"));

  assert.match(html, /<code>&lt;img src=&quot;example\.jpg&quot;&gt;<\/code>/);
  assert.match(html, /<br>/);
  assert.match(html, /<img src="media:\.\.\/assets\/raw\.jpg" alt="" width="220">/);
  assert.match(html, /<img src="media:\.\.\/assets\/markdown\.png" alt="Markdown image">/);
  assert.doesNotMatch(html.replace(/<code>[\s\S]*?<\/code>/g, ""), /&lt;(?:img|br)\b/i);
});

test("renders video destinations as video elements", () => {
  const html = render("![Project recording](../assets/demo.mov)");

  assert.match(html, /<video controls playsinline preload="metadata" src="media:\.\.\/assets\/demo\.mov"><\/video>/);
  assert.doesNotMatch(html, /<img\b/);
});

test("all lesson media markup is converted instead of displayed as text", () => {
  const notesRoot = path.join(workspaceRoot, "notes");
  for (const name of fs.readdirSync(notesRoot).filter((entry) => entry.endsWith(".md"))) {
    const markdown = fs.readFileSync(path.join(notesRoot, name), "utf8");
    const html = render(markdown);
    const visibleHtml = html
      .replace(/<pre>[\s\S]*?<\/pre>/g, "")
      .replace(/<code>[\s\S]*?<\/code>/g, "");
    const renderedMarkdown = markdown
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`[^`\n]+`/g, "");

    assert.doesNotMatch(visibleHtml, /&lt;img\b/i, `${name} contains a visible raw image tag`);
    assert.doesNotMatch(visibleHtml, /&lt;br\s*\/?&gt;/i, `${name} contains a visible raw break tag`);

    const expectedMedia = (renderedMarkdown.match(/<img\b/gi) || []).length
      + (renderedMarkdown.match(/<video\b/gi) || []).length
      + (renderedMarkdown.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length;
    const renderedMedia = (html.match(/<(?:img|video)\b/g) || []).length;
    assert.equal(renderedMedia, expectedMedia, `${name} did not render every media item`);
  }
});
