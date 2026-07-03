"""Turn one source image into a browser-viewable 3D point cloud."""

from __future__ import annotations

import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as functional
from PIL import Image

SOURCE_IMAGE = "input.png" # 👈 HERE: swap this path to choose the image that becomes 3D.

OUTPUT_FOLDER = "output"
MIDAS_MODEL = "DPT_Hybrid"
TARGET_POINT_COUNT = 45_000
PROJECT_FOLDER = Path(__file__).resolve().parent

# MAIN LOGIC
def create_3d_image(source_image: str = SOURCE_IMAGE) -> None:
    source_path = find_image(source_image)

    flat_image = load_2d_image(source_path)
    depth_map = estimate_near_and_far_pixels(flat_image)
    point_cloud = turn_pixels_into_3d_points(flat_image, depth_map, source_path)

    save_for_browser(depth_map, point_cloud)
    print(f"Done. PPT Studio will load {output_path() / 'point-cloud.json'}.")


def find_image(source_image: str) -> Path:
    image_path = Path(source_image)
    if not image_path.is_absolute():
        image_path = PROJECT_FOLDER / image_path

    if not image_path.exists():
        raise FileNotFoundError(
            f"Could not find {image_path}. Change SOURCE_IMAGE at the top of main.py."
        )

    return image_path


def load_2d_image(image_path: Path) -> np.ndarray:
    print(f"1/4  Loading image: {image_path}")
    return np.asarray(Image.open(image_path).convert("RGB"))


def estimate_near_and_far_pixels(image: np.ndarray) -> np.ndarray:
    device = choose_computer_brain()
    print(f"2/4  Asking MiDaS to estimate depth on {device}...")

    model = torch.hub.load("intel-isl/MiDaS", MIDAS_MODEL)
    model.to(device).eval()

    midas_tools = torch.hub.load("intel-isl/MiDaS", "transforms")
    image_for_midas = midas_tools.dpt_transform(image).to(device)

    with torch.no_grad():
        depth_guess = model(image_for_midas)
        depth_guess = functional.interpolate(
            depth_guess.unsqueeze(1),
            size=image.shape[:2],
            mode="bicubic",
            align_corners=False,
        ).squeeze()

    return normalize_depth(depth_guess.cpu().numpy())


def turn_pixels_into_3d_points(
    image: np.ndarray,
    depth_map: np.ndarray,
    image_path: Path,
) -> dict[str, object]:
    print("3/4  Turning pixels into 3D points...")

    height, width = depth_map.shape
    sample_every = max(1, math.ceil(math.sqrt((width * height) / TARGET_POINT_COUNT)))
    pixel_y = np.arange(0, height, sample_every)
    pixel_x = np.arange(0, width, sample_every)
    grid_x, grid_y = np.meshgrid(pixel_x, pixel_y)

    depth = depth_map[grid_y, grid_x]
    aspect_ratio = width / height
    x = ((grid_x / max(width - 1, 1)) - 0.5) * 2 * aspect_ratio
    y = -((grid_y / max(height - 1, 1)) - 0.5) * 2
    z = (depth - 0.5) * 1.7

    positions = np.stack([x, y, z], axis=-1).reshape(-1, 3)
    colors = image[grid_y, grid_x].reshape(-1, 3) / 255

    return {
        "source": image_path.name,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "pointCount": len(positions),
        "positions": np.round(positions, 5).reshape(-1).tolist(),
        "colors": np.round(colors, 4).reshape(-1).tolist(),
    }


def save_for_browser(depth_map: np.ndarray, point_cloud: dict[str, object]) -> None:
    print("4/4  Saving files for viewer.js...")
    destination = output_path()
    destination.mkdir(parents=True, exist_ok=True)

    Image.fromarray(np.uint8(depth_map * 255)).save(destination / "depth.png")
    with (destination / "point-cloud.json").open("w", encoding="utf-8") as output:
        json.dump(point_cloud, output, separators=(",", ":"))


def choose_computer_brain() -> torch.device:
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def normalize_depth(depth: np.ndarray) -> np.ndarray:
    near, far = np.percentile(depth, [2, 98])
    return np.clip((depth - near) / max(far - near, 1e-6), 0, 1)


def output_path() -> Path:
    return PROJECT_FOLDER / OUTPUT_FOLDER


if __name__ == "__main__":
    selected_image = sys.argv[1] if len(sys.argv) > 1 else SOURCE_IMAGE
    create_3d_image(selected_image)
