const canvas = document.querySelector("canvas");
const emptyState = document.querySelector("#empty-state");
const sourceName = document.querySelector("#source-name");
const pointCount = document.querySelector("#point-count");
const gl = canvas.getContext("webgl");

let latestGeneration;
let pointTotal = 0;
let rotationX = -0.12;
let rotationY = 0;
let zoom = 1.65;
let drag;

const program = createProgram();
const positionBuffer = gl.createBuffer();
const colorBuffer = gl.createBuffer();

async function pollPointCloud() {
  try {
    const response = await fetch(`output/point-cloud.json?t=${Date.now()}`);
    if (response.ok) {
      const cloud = await response.json();
      if (cloud.generatedAt !== latestGeneration) {
        latestGeneration = cloud.generatedAt;
        loadPointCloud(cloud);
      }
    }
  } catch {
    // The Python output does not exist yet.
  }
  window.setTimeout(pollPointCloud, 2000);
}

function loadPointCloud(cloud) {
  pointTotal = cloud.pointCount;
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cloud.positions), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cloud.colors), gl.STATIC_DRAW);

  emptyState.hidden = true;
  sourceName.textContent = cloud.source;
  pointCount.textContent = `${cloud.pointCount.toLocaleString()} points`;
  draw();
}

function createProgram() {
  const vertex = compile(gl.VERTEX_SHADER, `
    attribute vec3 position;
    attribute vec3 color;
    uniform mat4 transform;
    varying vec3 pointColor;
    void main() {
      gl_Position = transform * vec4(position, 1.0);
      gl_PointSize = 2.0;
      pointColor = color;
    }
  `);
  const fragment = compile(gl.FRAGMENT_SHADER, `
    precision mediump float;
    varying vec3 pointColor;
    void main() {
      vec2 p = gl_PointCoord * 2.0 - 1.0;
      if (dot(p, p) > 1.0) discard;
      gl_FragColor = vec4(pointColor, 1.0);
    }
  `);
  const result = gl.createProgram();
  gl.attachShader(result, vertex);
  gl.attachShader(result, fragment);
  gl.linkProgram(result);
  return result;
}

function compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

function draw() {
  const scale = window.devicePixelRatio || 1;
  const width = Math.floor(canvas.clientWidth * scale);
  const height = Math.floor(canvas.clientHeight * scale);
  canvas.width = width;
  canvas.height = height;
  gl.viewport(0, 0, width, height);
  gl.clearColor(0.047, 0.055, 0.071, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.useProgram(program);

  bindAttribute("position", positionBuffer);
  bindAttribute("color", colorBuffer);
  gl.uniformMatrix4fv(
    gl.getUniformLocation(program, "transform"),
    false,
    makeTransform(width / height)
  );
  gl.drawArrays(gl.POINTS, 0, pointTotal);
}

function bindAttribute(name, buffer) {
  const location = gl.getAttribLocation(program, name);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0);
}

function makeTransform(aspect) {
  const cx = Math.cos(rotationX), sx = Math.sin(rotationX);
  const cy = Math.cos(rotationY), sy = Math.sin(rotationY);
  const scale = zoom / Math.max(aspect, 1);
  return new Float32Array([
    cy * scale, sx * sy * scale, -cx * sy * scale, 0,
    0, cx * scale, sx * scale, 0,
    sy * scale, -sx * cy * scale, cx * cy * scale, 0,
    0, 0, 0, 1
  ]);
}

canvas.addEventListener("pointerdown", (event) => {
  drag = { x: event.clientX, y: event.clientY, rotationX, rotationY };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (!drag) return;
  rotationY = drag.rotationY + (event.clientX - drag.x) * 0.008;
  rotationX = drag.rotationX + (event.clientY - drag.y) * 0.008;
  draw();
});
canvas.addEventListener("pointerup", () => { drag = undefined; });
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  zoom = Math.max(0.5, Math.min(3, zoom - event.deltaY * 0.001));
  draw();
}, { passive: false });
window.addEventListener("resize", draw);

draw();
pollPointCloud();
