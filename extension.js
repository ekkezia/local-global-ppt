const vscode = require("vscode");
const http = require("http");
const path = require("path");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".ogv": "video/ogg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webm": "video/webm",
  ".webp": "image/webp"
};

let notesPanel;
let embeddedPreviewPanel;
let lessons = [];
let currentLessonIndex = -1;
let previewServer;
let previewLessonRoot;
let previewWorkspaceRoot;
let previewPort;
let extensionRoot;
const reloadClients = new Set();

function activate(context) {
  extensionRoot = context.extensionUri;
  context.subscriptions.push(
    vscode.commands.registerCommand("pptStudio.start", startLesson),
    vscode.commands.registerCommand("pptStudio.next", () => moveLesson(1)),
    vscode.commands.registerCommand("pptStudio.previous", () => moveLesson(-1)),
    vscode.commands.registerCommand("pptStudio.openPreview", openPreview),
    vscode.commands.registerCommand("pptStudio.runPython", runPythonSlide),
    vscode.commands.registerCommand("pptStudio.stopPreview", stopPreview),
    vscode.workspace.onDidSaveTextDocument(handleSavedDocument),
    { dispose: stopPreview }
  );
}

async function startLesson() {
  const workspaceRoot = await getWorkspaceRoot();
  if (!workspaceRoot) {
    return;
  }

  lessons = await discoverLessons(workspaceRoot);
  if (lessons.length === 0) {
    vscode.window.showErrorMessage("PPT Studio could not find any Markdown files in /notes.");
    return;
  }

  const picked = await vscode.window.showQuickPick(
    lessons.map((lesson, index) => ({
      label: lesson.title,
      description: lesson.codeRoot ? "Interactive slide" : "Notes only",
      detail: path.basename(lesson.note.fsPath),
      index
    })),
    { placeHolder: "Choose a lesson" }
  );

  if (picked) {
    await openLesson(picked.index);
  }
}

async function discoverLessons(workspaceRoot) {
  const notesRoot = vscode.Uri.joinPath(workspaceRoot, "notes");
  const codeRoot = vscode.Uri.joinPath(workspaceRoot, "code");
  let noteEntries;

  try {
    noteEntries = await vscode.workspace.fs.readDirectory(notesRoot);
  } catch {
    return [];
  }

  const found = [];
  for (const [name, type] of noteEntries) {
    if (type !== vscode.FileType.File || path.extname(name).toLowerCase() !== ".md") {
      continue;
    }

    const slug = path.basename(name, ".md");
    const lessonCodeRoot = vscode.Uri.joinPath(codeRoot, slug);
    let matchingCodeRoot;
    try {
      const stat = await vscode.workspace.fs.stat(lessonCodeRoot);
      if (stat.type === vscode.FileType.Directory) {
        matchingCodeRoot = lessonCodeRoot;
      }
    } catch {
      // Notes-only slides intentionally have no matching code folder.
    }

    found.push({
      slug,
      title: titleFromSlug(slug),
      note: vscode.Uri.joinPath(notesRoot, name),
      codeRoot: matchingCodeRoot
    });
  }

  return found.sort((a, b) => a.slug.localeCompare(b.slug, undefined, { numeric: true }));
}

async function openLesson(index) {
  const lesson = lessons[index];
  if (!lesson) {
    return;
  }

  currentLessonIndex = index;
  await vscode.commands.executeCommand("setContext", "pptStudio.pptOpen", true);

  if (!lesson.codeRoot) {
    stopPreview();
    await vscode.commands.executeCommand("workbench.action.editorLayoutSingle");
    await showNotes(lesson);
    return;
  }

  await ensurePreviewServer(lesson);
  await vscode.commands.executeCommand("workbench.action.editorLayoutTwoColumns");
  await showNotes(lesson);

  const sourceFile = await findLessonSource(lesson.codeRoot);
  if (sourceFile) {
    await closeSupportingLessonTabs(lesson.codeRoot, sourceFile);
    const document = await vscode.workspace.openTextDocument(sourceFile);
    await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.Two,
      preview: false
    });
    await vscode.commands.executeCommand("workbench.action.splitEditorUp");
    await showEmbeddedPreview(lesson);
    await closeSourceTabsBesidePreview(sourceFile);
  } else {
    vscode.window.showWarningMessage(
      `PPT Studio could not find main.py or script.js for ${lesson.title}.`
    );
  }
}

async function closeSupportingLessonTabs(codeRoot, sourceFile) {
  const supportingTabs = vscode.window.tabGroups.all.flatMap((group) => {
    return group.tabs.filter((tab) => {
      if (!(tab.input instanceof vscode.TabInputText)) {
        return false;
      }

      const file = tab.input.uri;
      const relative = path.relative(codeRoot.fsPath, file.fsPath);
      const belongsToLesson = !relative.startsWith("..") && !path.isAbsolute(relative);
      return belongsToLesson && file.fsPath !== sourceFile.fsPath;
    });
  });

  if (supportingTabs.length > 0) {
    await vscode.window.tabGroups.close(supportingTabs, true);
  }
}

async function showNotes(lesson) {
  const bytes = await vscode.workspace.fs.readFile(lesson.note);
  const markdown = Buffer.from(bytes).toString("utf8");
  const workspaceRoots = vscode.workspace.workspaceFolders?.map((folder) => folder.uri) || [];
  const lessonRoot = vscode.Uri.file(path.dirname(path.dirname(lesson.note.fsPath)));

  if (!notesPanel) {
    notesPanel = vscode.window.createWebviewPanel(
      "lessonStudio.notes",
      "Lesson Notes",
      { viewColumn: vscode.ViewColumn.One, preserveFocus: true },
      {
        enableScripts: false,
        localResourceRoots: [...workspaceRoots, lessonRoot]
      }
    );
    notesPanel.onDidDispose(() => {
      notesPanel = undefined;
    });
  } else {
    notesPanel.reveal(vscode.ViewColumn.One, true);
  }

  notesPanel.title = lesson.title;
  notesPanel.webview.html = renderNotesPage(markdown, lesson.title, notesPanel.webview, lesson.note);
}

async function showEmbeddedPreview(lesson) {
  if (!embeddedPreviewPanel) {
    embeddedPreviewPanel = vscode.window.createWebviewPanel(
      "pptStudio.preview",
      "Live Preview",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );
    embeddedPreviewPanel.onDidDispose(() => {
      embeddedPreviewPanel = undefined;
    });
  } else {
    embeddedPreviewPanel.reveal(vscode.ViewColumn.Active, false);
  }

  embeddedPreviewPanel.title = `${lesson.title} Preview`;
  embeddedPreviewPanel.webview.html = renderEmbeddedPreviewPage(previewPort, lesson.title);
}

async function closeSourceTabsBesidePreview(sourceFile) {
  const previewGroup = vscode.window.tabGroups.all.find((group) => {
    return group.tabs.some((tab) => {
      return tab.input instanceof vscode.TabInputWebview && tab.input.viewType === "pptStudio.preview";
    });
  });
  if (!previewGroup) {
    return;
  }

  const duplicateSourceTabs = previewGroup.tabs.filter((tab) => {
    return tab.input instanceof vscode.TabInputText && tab.input.uri.fsPath === sourceFile.fsPath;
  });
  if (duplicateSourceTabs.length > 0) {
    await vscode.window.tabGroups.close(duplicateSourceTabs, true);
  }
}

async function findLessonSource(codeRoot) {
  for (const name of ["main.py", "script.js"]) {
    const source = vscode.Uri.joinPath(codeRoot, name);
    try {
      const stat = await vscode.workspace.fs.stat(source);
      if (stat.type === vscode.FileType.File) {
        return source;
      }
    } catch {
      // Try the next supported source filename.
    }
  }
  return undefined;
}

async function moveLesson(offset) {
  if (lessons.length === 0 || currentLessonIndex < 0) {
    await startLesson();
    return;
  }

  const nextIndex = (currentLessonIndex + offset + lessons.length) % lessons.length;
  await openLesson(nextIndex);
}

async function openPreview() {
  let lesson = lessons[currentLessonIndex];
  if (!lesson) {
    await startLesson();
    lesson = lessons[currentLessonIndex];
  }
  if (!lesson) {
    return;
  }
  if (!lesson.codeRoot) {
    vscode.window.showInformationMessage(`${lesson.title} is a notes-only slide with no preview.`);
    return;
  }

  await ensurePreviewServer(lesson);

  const url = vscode.Uri.parse(`http://127.0.0.1:${previewPort}`);
  await vscode.env.openExternal(url);
  vscode.window.setStatusBarMessage(`Lesson preview: ${url.toString()}`, 4000);
}

async function runPythonSlide() {
  const lesson = lessons[currentLessonIndex];
  if (!lesson?.codeRoot) {
    vscode.window.showInformationMessage("Open an interactive Python slide first.");
    return;
  }

  const pythonFile = vscode.Uri.joinPath(lesson.codeRoot, "main.py");
  try {
    const stat = await vscode.workspace.fs.stat(pythonFile);
    if (stat.type !== vscode.FileType.File) {
      throw new Error("Not a file");
    }
  } catch {
    vscode.window.showInformationMessage(`${lesson.title} does not have a main.py file.`);
    return;
  }

  if (!vscode.workspace.isTrusted) {
    vscode.window.showWarningMessage("Trust this workspace before running its Python code.");
    return;
  }

  await vscode.workspace.saveAll(false);
  const pythonPath = await findPythonExecutable(lesson.codeRoot);
  const task = new vscode.Task(
    { type: "pptStudio", lesson: lesson.slug },
    vscode.TaskScope.Workspace,
    `Run ${lesson.title}`,
    "PPT Studio",
    new vscode.ProcessExecution(pythonPath, [pythonFile.fsPath], {
      cwd: lesson.codeRoot.fsPath
    }),
    []
  );
  task.presentationOptions = {
    reveal: vscode.TaskRevealKind.Always,
    panel: vscode.TaskPanelKind.Dedicated,
    clear: true
  };
  await vscode.tasks.executeTask(task);
}

async function findPythonExecutable(codeRoot) {
  const workspaceRoot = await getWorkspaceRoot();
  const candidates = [
    vscode.Uri.joinPath(codeRoot, ".venv", "bin", "python"),
    workspaceRoot && vscode.Uri.joinPath(workspaceRoot, ".venv", "bin", "python")
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const stat = await vscode.workspace.fs.stat(candidate);
      if (stat.type === vscode.FileType.File) {
        return candidate.fsPath;
      }
    } catch {
      // Try the next virtual environment location.
    }
  }

  return vscode.workspace.getConfiguration("pptStudio").get("pythonPath", "python3");
}

async function ensurePreviewServer(lesson) {
  if (!previewServer || previewLessonRoot !== lesson.codeRoot.fsPath) {
    await restartPreviewForLesson(lesson);
  }
}

async function restartPreviewForLesson(lesson) {
  stopPreview();
  const workspaceRoot = await getWorkspaceRoot();
  if (!workspaceRoot) {
    return;
  }

  previewLessonRoot = lesson.codeRoot.fsPath;
  previewWorkspaceRoot = workspaceRoot.fsPath;
  previewPort = await startPreviewServer(previewLessonRoot, previewWorkspaceRoot);
}

function startPreviewServer(root, workspaceRoot) {
  return new Promise((resolve, reject) => {
    previewServer = http.createServer((request, response) => {
      servePreviewRequest(root, workspaceRoot, request, response).catch((error) => {
        response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        response.end(`Preview server error:\n${error.message}`);
      });
    });

    previewServer.once("error", reject);
    previewServer.listen(0, "127.0.0.1", () => {
      const address = previewServer.address();
      resolve(address.port);
    });
  });
}

async function servePreviewRequest(root, workspaceRoot, request, response) {
  const requestUrl = new URL(request.url, "http://127.0.0.1");
  if (requestUrl.pathname === "/__lesson_studio_events") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    response.write("data: connected\n\n");
    reloadClients.add(response);
    request.on("close", () => reloadClients.delete(response));
    return;
  }

  if (requestUrl.pathname === "/__ppt_studio_files") {
    await serveFolderListing(root, workspaceRoot, requestUrl, response);
    return;
  }

  const requestedPath = decodeURIComponent(requestUrl.pathname);
  const relativePath = requestedPath === "/" ? "index.html" : requestedPath.replace(/^\/+/, "");
  const filePath = resolvePreviewFilePath(root, workspaceRoot, relativePath);

  if (!filePath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  let bytes;
  try {
    bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
  } catch {
    if (relativePath === "output/point-cloud.json") {
      response.writeHead(204, { "Cache-Control": "no-store" });
      response.end();
      return;
    }
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`Not found: ${relativePath}`);
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  let body = Buffer.from(bytes);
  if (extension === ".html") {
    body = Buffer.from(injectLiveReload(body.toString("utf8")));
  }

  response.writeHead(200, {
    "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  response.end(body);
}

async function serveFolderListing(root, workspaceRoot, requestUrl, response) {
  const requestedFolder = requestUrl.searchParams.get("folder") || "";
  const recursive = requestUrl.searchParams.get("recursive") === "true";
  const includeVideos = requestUrl.searchParams.get("videos") === "true";
  const folderPath = resolvePreviewFolderPath(root, workspaceRoot, requestedFolder);

  if (!folderPath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const imageExtensions = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"]);
  const videoExtensions = new Set([".mov", ".mp4", ".ogv", ".webm"]);
  const files = [];

  async function collectImages(currentPath) {
    let entries;
    try {
      entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(currentPath));
    } catch {
      return;
    }

    for (const [name, type] of entries) {
      const sourcePath = path.join(currentPath, name);
      const extension = path.extname(name).toLowerCase();
      const isSupportedFile = imageExtensions.has(extension) || (includeVideos && videoExtensions.has(extension));
      if (type === vscode.FileType.File && isSupportedFile) {
        files.push(toWorkspacePreviewPath(workspaceRoot, sourcePath));
      } else if (recursive && type === vscode.FileType.Directory) {
        await collectImages(sourcePath);
      }
    }
  }

  await collectImages(folderPath);
  files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  response.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(files));
}

function resolvePreviewFilePath(root, workspaceRoot, relativePath) {
  const baseRoot = isWorkspacePublicPath(relativePath) ? workspaceRoot : root;
  const filePath = path.resolve(baseRoot, relativePath);
  return isInsideRoot(baseRoot, filePath) ? filePath : undefined;
}

function resolvePreviewFolderPath(root, workspaceRoot, requestedFolder) {
  const baseRoot = isWorkspacePublicPath(requestedFolder) ? workspaceRoot : root;
  const folderPath = path.resolve(baseRoot, requestedFolder);
  return isInsideRoot(workspaceRoot, folderPath) ? folderPath : undefined;
}

function isWorkspacePublicPath(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/").replace(/^\/+/, "");
  return normalized === "assets"
    || normalized === "code"
    || normalized.startsWith("assets/")
    || normalized.startsWith("code/");
}

function isInsideRoot(root, targetPath) {
  const relative = path.relative(root, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function toWorkspacePreviewPath(workspaceRoot, filePath) {
  const relative = path.relative(workspaceRoot, filePath).replaceAll("\\", "/");
  return `/${relative}`;
}

function injectLiveReload(html) {
  const script = `<script>
    const lessonStudioEvents = new EventSource("/__lesson_studio_events");
    lessonStudioEvents.addEventListener("message", (event) => {
      if (event.data === "reload") location.reload();
    });
  </script>`;

  return html.includes("</body>") ? html.replace("</body>", `${script}</body>`) : `${html}${script}`;
}

async function handleSavedDocument(document) {
  if (document.uri.scheme !== "file") {
    return;
  }

  const activeLesson = lessons[currentLessonIndex];
  if (activeLesson?.note.fsPath === document.uri.fsPath) {
    await showNotes(activeLesson);
  }

  if (!previewLessonRoot) {
    return;
  }

  const workspaceRelative = previewWorkspaceRoot
    ? path.relative(previewWorkspaceRoot, document.uri.fsPath)
    : "";
  const isLessonFile = isInsideRoot(previewLessonRoot, document.uri.fsPath);
  const isWorkspaceAsset = previewWorkspaceRoot
    && isInsideRoot(previewWorkspaceRoot, document.uri.fsPath)
    && workspaceRelative.replaceAll("\\", "/").startsWith("assets/");

  if (isLessonFile || isWorkspaceAsset) {
    for (const client of reloadClients) {
      client.write("data: reload\n\n");
    }
  }
}

function stopPreview() {
  for (const client of reloadClients) {
    client.end();
  }
  reloadClients.clear();

  if (previewServer) {
    previewServer.close();
    previewServer = undefined;
  }
  if (embeddedPreviewPanel) {
    embeddedPreviewPanel.dispose();
    embeddedPreviewPanel = undefined;
  }
  previewLessonRoot = undefined;
  previewWorkspaceRoot = undefined;
  previewPort = undefined;
}

async function getWorkspaceRoot() {
  const folders = vscode.workspace.workspaceFolders || [];

  for (const folder of folders) {
    if (await hasChildDirectory(folder.uri, "notes")) {
      return folder.uri;
    }
  }

  if (extensionRoot && await hasChildDirectory(extensionRoot, "notes")) {
    return extensionRoot;
  }

  vscode.window.showErrorMessage("Open a folder containing /notes and /code first.");
  return undefined;
}

async function hasChildDirectory(root, childName) {
  try {
    const stat = await vscode.workspace.fs.stat(vscode.Uri.joinPath(root, childName));
    return stat.type === vscode.FileType.Directory;
  } catch {
    return false;
  }
}

function renderNotesPage(markdown, title, webview, noteUri) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; media-src ${webview.cspSource} https: data:; style-src 'unsafe-inline';">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      font-size: 15px;
      line-height: 1.65;
      margin: 0 auto;
      max-width: 760px;
      padding: 36px 28px 72px;
    }
    h1, h2, h3 { line-height: 1.2; margin-top: 1.8em; }
    h1 { font-size: 2.2em; margin-top: 0; }
    h2 { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 0.3em; }
    code {
      background: var(--vscode-textCodeBlock-background);
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family);
      padding: 0.15em 0.35em;
    }
    pre {
      background: var(--vscode-textCodeBlock-background);
      border-radius: 6px;
      overflow: auto;
      padding: 14px;
    }
    pre code { padding: 0; }
    blockquote {
      border-left: 3px solid var(--vscode-textBlockQuote-border);
      color: var(--vscode-descriptionForeground);
      margin-left: 0;
      padding-left: 16px;
    }
    table {
      border-collapse: collapse;
      margin-top: 32px;
      table-layout: fixed;
      width: 100%;
    }
    th, td {
      border: 1px solid var(--vscode-panel-border);
      padding: 16px;
      text-align: left;
      vertical-align: top;
      width: 33.333%;
    }
    th {
      color: var(--vscode-textLink-foreground);
      font-size: 1.1em;
      font-weight: 650;
    }
    td strong {
      display: block;
      font-size: 1.15em;
    }
    video {
      background: #000;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      display: block;
      margin: 18px 0 28px;
      max-height: 70vh;
      width: 100%;
    }
    img {
      border-radius: 8px;
      display: block;
      height: auto;
      margin: 18px 0 28px;
      max-width: 100%;
    }
    a { color: var(--vscode-textLink-foreground); }
  </style>
</head>
<body>${markdownToHtml(markdown, (mediaPath) => resolveNoteMediaUri(webview, noteUri, mediaPath))}</body>
</html>`;
}

function renderEmbeddedPreviewPage(port, title) {
  const url = `http://127.0.0.1:${port}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${url}; style-src 'unsafe-inline';">
  <title>${escapeHtml(title)} Preview</title>
  <style>
    html, body, iframe {
      border: 0;
      height: 100%;
      margin: 0;
      padding: 0;
      width: 100%;
    }
    body { background: var(--vscode-editor-background); }
  </style>
</head>
<body>
  <iframe
    src="${url}"
    title="${escapeHtml(title)} live preview"
    sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-same-origin allow-scripts"
  ></iframe>
</body>
</html>`;
}

function markdownToHtml(markdown, resolveMediaUri = (mediaPath) => mediaPath) {
  const breaks = [];
  const codeBlocks = [];
  const inlineCode = [];
  const images = [];
  const htmlBlocks = [];
  const tables = [];
  const videos = [];

  // Protect code before looking for HTML media. Otherwise an example such as
  // `<img src="example.jpg">` is mistaken for an image and disappears.
  let source = markdown.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_, language, code) => {
    const token = `%%CODE_BLOCK_${codeBlocks.length}%%`;
    codeBlocks.push(
      `<pre><code data-language="${escapeHtml(language)}">${escapeHtml(code.trimEnd())}</code></pre>`
    );
    return token;
  });

  source = source.replace(/`([^`\n]+)`/g, (_, code) => {
    const token = `%%INLINE_CODE_${inlineCode.length}%%`;
    inlineCode.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  // Preserve the small set of raw HTML that lesson notes intentionally use.
  // Everything else is escaped below so arbitrary HTML cannot enter the webview.
  source = source.replace(/<br\s*\/?>/gi, () => {
    const token = `%%HTML_BREAK_${breaks.length}%%`;
    breaks.push("<br>");
    return token;
  });

  source = source.replace(/<\/?div\b[^>]*>/gi, (tag) => {
    const token = `%%HTML_BLOCK_${htmlBlocks.length}%%`;
    if (/^<\s*\//.test(tag)) {
      htmlBlocks.push("</div>");
    } else {
      htmlBlocks.push(`<div${readSafeStyleAttribute(tag)}>`);
    }
    return token;
  });

  source = source.replace(
    /<img\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*)\/?>\s*(?:<\/img\s*>)?/gi,
    (_, attributesBeforeSource, mediaPath, attributesAfterSource) => {
      const token = `%%IMAGE_${images.length}%%`;
      const sourceUri = escapeHtml(resolveMediaUri(mediaPath.trim()));
      const attributes = `${attributesBeforeSource} ${attributesAfterSource}`;
      const alt = readHtmlAttribute(attributes, "alt");
      const width = readNumericHtmlAttribute(attributes, "width");
      const height = readNumericHtmlAttribute(attributes, "height");
      const style = readSafeStyleAttribute(attributes);
      images.push(
        `<img src="${sourceUri}" alt="${escapeHtml(alt || "")}"${width}${height}${style}>`
      );
      return token;
    }
  );

  source = source.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, destination) => {
    const mediaPath = readMarkdownDestination(destination);
    if (!mediaPath) {
      return _;
    }

    const sourceUri = escapeHtml(resolveMediaUri(mediaPath));
    if (isVideoPath(mediaPath) || alt.trim().toLowerCase() === "video") {
      const token = `%%VIDEO_${videos.length}%%`;
      videos.push(`<video controls playsinline preload="metadata" src="${sourceUri}"></video>`);
      return token;
    }

    const token = `%%IMAGE_${images.length}%%`;
    images.push(`<img src="${sourceUri}" alt="${escapeHtml(alt.trim())}">`);
    return token;
  });

  source = source.replace(
    /<video\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/video>/gi,
    (_, mediaPath) => {
      const token = `%%VIDEO_${videos.length}%%`;
      const sourceUri = escapeHtml(resolveMediaUri(mediaPath.trim()));
      videos.push(`<video controls playsinline preload="metadata" src="${sourceUri}"></video>`);
      return token;
    }
  );

  source = source.replace(/!\[video\]\(([^)]+)\)/gi, (_, mediaPath) => {
    const token = `%%VIDEO_${videos.length}%%`;
    const sourceUri = escapeHtml(resolveMediaUri(mediaPath.trim()));
    videos.push(`<video controls playsinline preload="metadata" src="${sourceUri}"></video>`);
    return token;
  });

  source = escapeHtml(source);

  source = source.replace(
    /(^\|.+\|\n^\|(?:\s*:?-+:?\s*\|)+\n(?:^\|.+\|\n?)+)/gm,
    (tableMarkdown) => {
      const token = `%%TABLE_${tables.length}%%`;
      tables.push(markdownTableToHtml(tableMarkdown));
      return token;
    }
  );

  source = source
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>")
    .replace(/^\s*[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br>");

  source = `<p>${source}</p>`
    .replace(/<p>\s*(<h[1-3]>)/g, "$1")
    .replace(/(<\/h[1-3]>)\s*<\/p>/g, "$1")
    .replace(/<p>\s*(<pre>)/g, "$1")
    .replace(/(<\/pre>)\s*<\/p>/g, "$1");

  source = codeBlocks.reduce((result, block, index) => {
    return result.replace(`%%CODE_BLOCK_${index}%%`, block);
  }, source);

  source = tables.reduce((result, table, index) => {
    const token = `%%TABLE_${index}%%`;
    return result.replace(`<p>${token}</p>`, table).replace(token, table);
  }, source);

  source = videos.reduce((result, video, index) => {
    const token = `%%VIDEO_${index}%%`;
    return result.replace(`<p>${token}</p>`, video).replace(token, video);
  }, source);

  source = inlineCode.reduce((result, code, index) => {
    return result.replaceAll(`%%INLINE_CODE_${index}%%`, code);
  }, source);

  source = htmlBlocks.reduce((result, block, index) => {
    return result.replaceAll(`%%HTML_BLOCK_${index}%%`, block);
  }, source);

  source = breaks.reduce((result, lineBreak, index) => {
    return result.replaceAll(`%%HTML_BREAK_${index}%%`, lineBreak);
  }, source);

  source = images.reduce((result, image, index) => {
    const token = `%%IMAGE_${index}%%`;
    return result.replace(`<p>${token}</p>`, image).replace(token, image);
  }, source);

  return source
    .replace(/<p>\s*(<div\b[^>]*>)/g, "$1")
    .replace(/(<\/div>)\s*<\/p>/g, "$1");
}

function readMarkdownDestination(destination) {
  const value = destination.trim();
  if (value.startsWith("<")) {
    const closingBracket = value.indexOf(">");
    return closingBracket > 0 ? value.slice(1, closingBracket).trim() : "";
  }

  const match = value.match(/^(\S+?)(?:\s+["'].*["'])?$/);
  return match?.[1] || "";
}

function isVideoPath(mediaPath) {
  const pathname = mediaPath.split(/[?#]/, 1)[0];
  return /\.(?:mov|mp4|ogv|webm)$/i.test(pathname);
}

function readHtmlAttribute(attributes, name) {
  const match = attributes.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"));
  return match?.[1];
}

function readNumericHtmlAttribute(attributes, name) {
  const value = readHtmlAttribute(attributes, name);
  return value && /^\d+(?:\.\d+)?$/.test(value)
    ? ` ${name}="${value}"`
    : "";
}

function readSafeStyleAttribute(attributes) {
  const style = readHtmlAttribute(attributes, "style");
  if (!style) {
    return "";
  }

  const allowedProperties = new Set([
    "align-items",
    "display",
    "gap",
    "height",
    "max-height",
    "max-width",
    "object-fit",
    "width"
  ]);

  const declarations = style
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const separator = declaration.indexOf(":");
      if (separator < 0) {
        return "";
      }

      const property = declaration.slice(0, separator).trim().toLowerCase();
      const value = declaration.slice(separator + 1).trim();
      if (!allowedProperties.has(property) || /[<>"'()]|url|expression/i.test(value)) {
        return "";
      }

      return `${property}:${value}`;
    })
    .filter(Boolean);

  return declarations.length > 0 ? ` style="${escapeHtml(declarations.join(";"))}"` : "";
}

function resolveNoteMediaUri(webview, noteUri, mediaPath) {
  if (/^(?:https?:|data:)/i.test(mediaPath)) {
    return mediaPath;
  }

  const absolutePath = path.resolve(path.dirname(noteUri.fsPath), mediaPath);
  return webview.asWebviewUri(vscode.Uri.file(absolutePath)).toString();
}

function markdownTableToHtml(tableMarkdown) {
  const rows = tableMarkdown
    .trim()
    .split("\n")
    .map((row) => row.slice(1, -1).split("|").map((cell) => cell.trim()));
  const [header, , ...body] = rows;

  const headerHtml = header.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join("");
  const bodyHtml = body
    .map((row) => `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join("")}</tr>`)
    .join("");

  return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
}

function renderInlineMarkdown(value) {
  return value
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function titleFromSlug(slug) {
  return slug
    .replace(/^\d+[-_. ]*/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function deactivate() {
  stopPreview();
}

function extendMarkdownIt(markdownIt) {
  const defaultImageRenderer = markdownIt.renderer.rules.image;

  markdownIt.renderer.rules.image = (tokens, index, options, environment, renderer) => {
    const token = tokens[index];
    const alt = token.content.trim().toLowerCase();
    const rawSource = token.attrGet("src") || "";
    if (alt === "video" || isVideoPath(rawSource)) {
      const source = markdownIt.utils.escapeHtml(rawSource);
      return `<video controls playsinline preload="metadata" src="${source}" style="display:block;width:100%;max-height:70vh;margin:1em 0;"></video>`;
    }

    if (defaultImageRenderer) {
      return defaultImageRenderer(tokens, index, options, environment, renderer);
    }
    return renderer.renderToken(tokens, index, options);
  };

  return markdownIt;
}

module.exports = { activate, deactivate, extendMarkdownIt };
