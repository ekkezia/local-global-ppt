# PPT Studio

PPT Studio is a small local VS Code extension for presenting code through visual examples.

It gives you:

- Rendered lesson notes in the full-height left editor column.
- A live webpage preview at the top-right.
- Only the lesson's editable source file, `script.js` or `main.py`, at the bottom-right.
- Automatic preview refresh for web slides and generated-result polling for Python slides.
- An optional full-size preview in your normal browser.

## Run It

1. Open this folder in VS Code.
2. Press `F5`.
3. VS Code opens a second window called the Extension Development Host.
4. In that second window, open this same folder if it is not already open.
5. Open the Command Palette with `Cmd+Shift+P` on macOS or `Ctrl+Shift+P` elsewhere.
6. Run `PPT Studio: Start PPT`.
7. Pick **Color Card**.
8. Edit and save the opened `script.js`.
9. To also open the preview in your normal browser, click the preview icon or run `PPT Studio: Open Preview in Browser`.

The preview inside VS Code and any open browser preview should refresh after each save.

The default editor layout is:

```text
┌──────────────────────┬──────────────────────┐
│                      │ Live webpage preview │
│ Rendered notes       ├──────────────────────┤
│                      │ Editable source file │
└──────────────────────┴──────────────────────┘
```

## Lesson Folder Convention

Every Markdown file in `/notes` becomes a slide. A slide becomes interactive when it has a code folder with the same name:

```text
notes/
  01-color-card.md

code/
  01-color-card/
    index.html
    style.css
    script.js
```

To add another lesson, create a note and a code folder containing `script.js`:

```text
notes/02-my-lesson.md
code/02-my-lesson/script.js
```

Supporting HTML, CSS, and viewer files can live in the same code folder and power the browser preview, but PPT Studio closes their editor tabs and leaves only `main.py` or `script.js` open in the right editor.

To create a notes-only slide, add only the Markdown file:

```text
notes/02-about-the-project.md
```

Because there is no matching `code/02-about-the-project/` folder, PPT Studio renders that slide full-width without a preview or code editor on the right.

Then run `PPT Studio: Start PPT` again.

## How It Works

### Extension activation

VS Code reads `package.json` to discover the extension's commands and starts `extension.js` when one of them runs.

### Notes

`discoverLessons()` finds every Markdown file in `/notes` and checks whether each one has a matching folder in `/code`.

`showNotes()` creates a webview in editor column one. A webview is a small, isolated webpage rendered inside VS Code. It is a good fit for formatted lesson content.

When a note has no matching code folder, PPT Studio switches to a single-column layout and renders only this notes webview.

### Code

`openLesson()` uses VS Code's two-column layout command, opens only the lesson's `main.py` or `script.js` on the right, and splits that right editor group upward for the preview. The source remains a real VS Code editor, so autocomplete, formatting, extensions, and keyboard shortcuts still work.

### Live preview

`startPreviewServer()` starts a Node HTTP server on a free localhost port. It serves only files inside the active lesson's code folder.

`showEmbeddedPreview()` places that localhost webpage inside a VS Code webview at the top-right.

`injectLiveReload()` adds a tiny browser script to HTML responses. When VS Code saves a file, `handleSavedDocument()` sends a reload message to the browser.

`vscode.env.openExternal()` optionally asks the operating system to open the same preview URL in your default browser.

## Useful Files

- `package.json`: extension metadata, commands, and editor buttons.
- `extension.js`: all extension behavior.
- `.vscode/launch.json`: tells VS Code how to launch the extension for development.
- `notes/`: lesson instructions.
- `code/`: editable lesson projects.

## Current Limitations

- The notes renderer supports common Markdown, but it is intentionally small and not a complete Markdown parser.
- The preview server is intended for static HTML, CSS, JavaScript, and assets.
- The exact editor grid arrangement relies on VS Code's built-in layout commands.
- Only the first open workspace folder is used.

## Python Slides

When a lesson contains `main.py`, PPT Studio exposes it instead of `script.js`.
Use the play button or run `PPT Studio: Run Python Slide`. PPT Studio prefers a
lesson or workspace `.venv/bin/python`, then falls back to the configured
`pptStudio.pythonPath`.

## Videos In Markdown

VS Code's built-in Markdown preview and PPT Studio's notes pane both support
playable local videos using native HTML:

```html
<video controls src="../assets/example.mp4"></video>
```

PPT Studio additionally supports `![video](../assets/example.mp4)`. H.264 MP4
or MOV files are the most reliable formats.
