(function () {
  function create(targetOrSelector) {
    const target = typeof targetOrSelector === "string"
      ? document.querySelector(targetOrSelector)
      : targetOrSelector;

    if (!target) throw new Error("StreetSphere could not find its canvas.");

    const renderer = createSphereRenderer(target);

    return {
      async setTexture(source) {
        setLoadingState(source);

        try {
          await renderer.setTexture(source);
          setReadyState(source);
        } catch (error) {
          renderer.showPlaceholder();
          setErrorState(source);
          console.error(`Could not load panorama: ${source}`, error);
        }
      }
    };
  }

  function setLoadingState(source) {
    const filename = document.querySelector("#filename");
    const counter = document.querySelector("#counter");
    const emptyState = document.querySelector("#empty-state");
    const previousButton = document.querySelector("#previous");
    const nextButton = document.querySelector("#next");

    if (filename) filename.textContent = `Loading ${getFilename(source)}...`;
    if (counter) counter.textContent = "1 / 1";
    if (emptyState) emptyState.hidden = true;
    if (previousButton) previousButton.disabled = true;
    if (nextButton) nextButton.disabled = true;
  }

  function setReadyState(source) {
    const filename = document.querySelector("#filename");
    if (filename) filename.textContent = getFilename(source);
  }

  function setErrorState(source) {
    const filename = document.querySelector("#filename");
    const emptyState = document.querySelector("#empty-state");
    const emptyStateTitle = emptyState?.querySelector("strong");
    const emptyStateMessage = emptyState?.querySelector("span");

    if (filename) filename.textContent = "Panorama unavailable";
    if (emptyStateTitle) emptyStateTitle.textContent = "Could not load panorama";
    if (emptyStateMessage) {
      emptyStateMessage.textContent = `Check the image or video path: ${source}`;
    }
    if (emptyState) emptyState.hidden = false;
  }

  function getFilename(source) {
    try {
      const url = new URL(source, window.location.href);
      return decodeURIComponent(url.pathname.split("/").pop()) || source;
    } catch {
      return source;
    }
  }

  function createSphereRenderer(target) {
    const gl = target.getContext("webgl");
    if (!gl) throw new Error("This preview requires WebGL.");

    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, `
      attribute vec2 position;
      varying vec2 uv;
      void main() {
        uv = position * 0.5 + 0.5;
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, `
      precision highp float;
      varying vec2 uv;
      uniform sampler2D panorama;
      uniform vec2 look;
      uniform float zoom;
      uniform float aspect;

      void main() {
        vec2 screen = uv * 2.0 - 1.0;
        screen.x *= aspect;
        vec3 ray = normalize(vec3(screen * zoom, 1.0));

        float cy = cos(look.x), sy = sin(look.x);
        float cp = cos(look.y), sp = sin(look.y);
        ray = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy) * ray;
        ray = mat3(1.0, 0.0, 0.0, 0.0, cp, sp, 0.0, -sp, cp) * ray;

        float longitude = atan(ray.x, ray.z);
        float latitude = asin(clamp(ray.y, -1.0, 1.0));
        vec2 sphereUv = vec2(longitude / 6.2831853 + 0.5, latitude / 3.1415926 + 0.5);
        gl_FragColor = texture2D(panorama, sphereUv);
      }
    `);

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const lookLocation = gl.getUniformLocation(program, "look");
    const zoomLocation = gl.getUniformLocation(program, "zoom");
    const aspectLocation = gl.getUniformLocation(program, "aspect");
    const look = { yaw: 0, pitch: 0, zoom: 0.72 };
    let drag;
    let animationFrame;
    let activeVideo;

    function draw() {
      const scale = window.devicePixelRatio || 1;
      const width = Math.floor(target.clientWidth * scale);
      const height = Math.floor(target.clientHeight * scale);
      if (target.width !== width || target.height !== height) {
        target.width = width;
        target.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.uniform2f(lookLocation, look.yaw, look.pitch);
      gl.uniform1f(zoomLocation, look.zoom);
      gl.uniform1f(aspectLocation, width / height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    target.addEventListener("pointerdown", (event) => {
      drag = { x: event.clientX, y: event.clientY, yaw: look.yaw, pitch: look.pitch };
      target.setPointerCapture(event.pointerId);
    });
    target.addEventListener("pointermove", (event) => {
      if (!drag) return;
      look.yaw = drag.yaw - (event.clientX - drag.x) * 0.006;
      look.pitch = Math.max(
        -1.45,
        Math.min(1.45, drag.pitch + (event.clientY - drag.y) * 0.006)
      );
      draw();
    });
    target.addEventListener("pointerup", () => { drag = undefined; });
    target.addEventListener("wheel", (event) => {
      event.preventDefault();
      look.zoom = Math.max(0.35, Math.min(1.35, look.zoom + event.deltaY * 0.001));
      draw();
    }, { passive: false });
    window.addEventListener("resize", draw);

    return {
      async setTexture(source) {
        cancelAnimationFrame(animationFrame);
        if (activeVideo) activeVideo.pause();

        const isVideo = /\.(?:mp4|webm|mov)(?:$|[?#])/i.test(source);
        const media = isVideo ? await loadVideo(source) : await loadImage(source);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, media);

        if (isVideo) {
          activeVideo = media;
          const drawVideo = () => {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(
              gl.TEXTURE_2D,
              0,
              gl.RGBA,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              activeVideo
            );
            draw();
            animationFrame = requestAnimationFrame(drawVideo);
          };
          await activeVideo.play().catch(() => {});
          drawVideo();
        } else {
          activeVideo = undefined;
          draw();
        }
      },
      showPlaceholder() {
        const pixels = new Uint8Array([
          26, 28, 32, 255,
          42, 45, 52, 255,
          42, 45, 52, 255,
          26, 28, 32, 255
        ]);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        draw();
      }
    };
  }

  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = source;
    });
  }

  function loadVideo(source) {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.addEventListener("canplay", () => resolve(video), { once: true });
      video.addEventListener("error", reject, { once: true });
      video.src = source;
      video.load();
    });
  }

  window.StreetSphere = { create };
})();
