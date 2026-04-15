"""
SEO Creator 앱 아이콘 생성 스크립트

첨부된 로고 이미지 기반으로 macOS/Windows 아이콘을 생성한다.
- build/icon.png (1024x1024 원본)
- build/icon.ico (Windows, 다중 해상도)
- build/icon.icns 대신 build/icon.png를 사용 (electron-builder가 자동 변환)
"""

from PIL import Image, ImageDraw
import struct
import io
import os

BUILD_DIR = os.path.join(os.path.dirname(__file__), "..", "build")
os.makedirs(BUILD_DIR, exist_ok=True)

def create_logo(size=1024):
    """SEO Creator 로고를 프로그래밍 방식으로 생성.
    첨부 이미지의 디자인을 재현: 전구 + 보라색 말풍선 + 다크 배경"""

    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 배경: 둥근 사각형 (다크 퍼플)
    margin = int(size * 0.02)
    radius = int(size * 0.18)
    bg_color = (15, 10, 30, 255)  # 매우 어두운 보라

    # 둥근 사각형 배경
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=radius,
        fill=bg_color
    )

    # 중앙 광원 효과 (전구 빛)
    center_x, center_y = size // 2, int(size * 0.42)
    for r in range(int(size * 0.35), 0, -2):
        alpha = max(0, min(255, int(40 * (1 - r / (size * 0.35)))))
        glow_color = (255, 200, 50, alpha)
        draw.ellipse(
            [center_x - r, center_y - r, center_x + r, center_y + r],
            fill=glow_color
        )

    # 전구 몸체
    bulb_r = int(size * 0.18)
    draw.ellipse(
        [center_x - bulb_r, center_y - bulb_r, center_x + bulb_r, center_y + bulb_r],
        fill=(255, 220, 60, 255)
    )

    # 전구 소켓 (보라색)
    socket_w = int(size * 0.10)
    socket_h = int(size * 0.06)
    socket_y = center_y + bulb_r - int(size * 0.02)
    draw.rounded_rectangle(
        [center_x - socket_w, socket_y, center_x + socket_w, socket_y + socket_h],
        radius=int(size * 0.01),
        fill=(124, 58, 237, 255)
    )
    draw.rounded_rectangle(
        [center_x - int(socket_w * 0.85), socket_y + socket_h, center_x + int(socket_w * 0.85), socket_y + socket_h * 2],
        radius=int(size * 0.01),
        fill=(109, 40, 217, 255)
    )

    # 보라색 말풍선 (오른쪽 위)
    bubble_x = center_x + int(size * 0.15)
    bubble_y = center_y - int(size * 0.22)
    bubble_r = int(size * 0.08)
    draw.rounded_rectangle(
        [bubble_x - bubble_r, bubble_y - bubble_r, bubble_x + bubble_r, bubble_y + bubble_r],
        radius=int(size * 0.03),
        fill=(139, 92, 246, 255)
    )
    # 느낌표
    exc_x = bubble_x
    exc_y = bubble_y
    exc_r = int(size * 0.015)
    draw.rounded_rectangle(
        [exc_x - exc_r, exc_y - int(size * 0.04), exc_x + exc_r, exc_y + int(size * 0.01)],
        radius=exc_r,
        fill=(255, 255, 255, 255)
    )
    draw.ellipse(
        [exc_x - exc_r, exc_y + int(size * 0.02), exc_x + exc_r, exc_y + int(size * 0.04)],
        fill=(255, 255, 255, 255)
    )

    # 반짝이 별 효과
    star_positions = [
        (0.25, 0.25), (0.75, 0.20), (0.20, 0.50),
        (0.80, 0.45), (0.35, 0.15), (0.65, 0.60),
        (0.15, 0.35), (0.85, 0.30),
    ]
    for sx, sy in star_positions:
        x = int(size * sx)
        y = int(size * sy)
        sr = int(size * 0.008)
        draw.ellipse([x-sr, y-sr, x+sr, y+sr], fill=(255, 255, 200, 200))

    # 텍스트 "SEO" (상단)
    # 폰트 없이 간단하게 표현
    text_y = int(size * 0.72)
    # "SEO" in white
    seo_w = int(size * 0.20)
    draw.rounded_rectangle(
        [center_x - int(size * 0.28), text_y, center_x - int(size * 0.08), text_y + int(size * 0.07)],
        radius=int(size * 0.01),
        fill=(255, 255, 255, 40)
    )
    # "Creator" in purple
    draw.rounded_rectangle(
        [center_x - int(size * 0.06), text_y, center_x + int(size * 0.28), text_y + int(size * 0.07)],
        radius=int(size * 0.01),
        fill=(139, 92, 246, 40)
    )

    return img


def create_ico(img, output_path):
    """다중 해상도 .ico 파일 생성."""
    sizes = [16, 32, 48, 64, 128, 256]
    icons = []
    for s in sizes:
        resized = img.resize((s, s), Image.LANCZOS)
        icons.append(resized)

    icons[0].save(output_path, format="ICO", sizes=[(s, s) for s in sizes], append_images=icons[1:])


def main():
    print("Generating SEO Creator app icon...")

    # 1024x1024 원본
    logo = create_logo(1024)

    # PNG 저장 (다양한 크기)
    png_path = os.path.join(BUILD_DIR, "icon.png")
    logo.save(png_path, "PNG")
    print(f"  icon.png: {png_path}")

    # 256x256 for electron-builder
    logo_256 = logo.resize((256, 256), Image.LANCZOS)
    logo_256.save(os.path.join(BUILD_DIR, "icon_256.png"), "PNG")

    # 512x512
    logo_512 = logo.resize((512, 512), Image.LANCZOS)
    logo_512.save(os.path.join(BUILD_DIR, "icon_512.png"), "PNG")

    # .ico 생성 (Windows)
    ico_path = os.path.join(BUILD_DIR, "icon.ico")
    create_ico(logo, ico_path)
    print(f"  icon.ico: {ico_path}")

    # macOS: electron-builder는 icon.png에서 자동으로 .icns를 생성함
    # 별도 icns 생성 불필요

    print("Done!")
    for f in os.listdir(BUILD_DIR):
        fp = os.path.join(BUILD_DIR, f)
        print(f"  {f}: {os.path.getsize(fp)} bytes")


if __name__ == "__main__":
    main()
