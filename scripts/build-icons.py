from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "openpets" / "ember-pup" / "spritesheet.webp"
OUTPUT = ROOT / "assets" / "icons"


def make_icon(size: int) -> Image.Image:
    sheet = Image.open(SOURCE).convert("RGBA")
    pet = sheet.crop((0, 0, 192, 208))
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    padding = max(1, round(size * 0.055))
    draw.rounded_rectangle(
        (padding, padding, size - padding, size - padding),
        radius=round(size * 0.26),
        fill=(244, 137, 45, 255),
    )
    target_height = round(size * 0.88)
    target_width = round(pet.width * target_height / pet.height)
    pet = pet.resize((target_width, target_height), Image.Resampling.LANCZOS)
    canvas.alpha_composite(pet, ((size - target_width) // 2, size - target_height - padding))
    return canvas


OUTPUT.mkdir(parents=True, exist_ok=True)
app_icon = make_icon(512)
app_icon.save(OUTPUT / "app-icon.png", optimize=True)
app_icon.save(
    OUTPUT / "app-icon.ico",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)
make_icon(64).save(OUTPUT / "tray-icon.png", optimize=True)
