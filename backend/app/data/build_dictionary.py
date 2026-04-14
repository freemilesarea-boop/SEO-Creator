#!/usr/bin/env python3
"""
keyword_dictionary.json 병합 빌드 스크립트

분할된 5개 JSON 파일을 읽어서 하나의 keyword_dictionary.json 으로 합친다.

사용법:
    python build_dictionary.py
"""

import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent

PART_FILES = {
    "genres": DATA_DIR / "keyword_dictionary_genres.json",
    "moods": DATA_DIR / "keyword_dictionary_moods.json",
    "situations": DATA_DIR / "keyword_dictionary_situations.json",
    "visuals": DATA_DIR / "keyword_dictionary_visuals.json",
    "core": DATA_DIR / "keyword_dictionary_core.json",
}

OUTPUT_FILE = DATA_DIR / "keyword_dictionary.json"


def build() -> dict:
    merged: dict = {}

    for key, path in PART_FILES.items():
        print(f"Loading {path.name} ...")
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        merged[key] = data
        print(f"  OK  ({len(data)} top-level entries)")

    # core 의 주요 키들을 최상위로도 올려서 기존 코드 호환성 확보
    core = merged.get("core", {})
    for lift_key in [
        "artist_genre_map",
        "title_templates",
        "seo_modifiers",
        "banned_words",
        "language_variants",
        "scoring_hints",
    ]:
        if lift_key in core:
            merged[lift_key] = core[lift_key]

    # visuals 의 thumbnail_layouts 를 최상위로 올림
    visuals = merged.get("visuals", {})
    if "thumbnail_layouts" in visuals:
        merged["thumbnail_layouts"] = visuals["thumbnail_layouts"]

    return merged


def main():
    merged = build()

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)

    size_kb = OUTPUT_FILE.stat().st_size / 1024
    print(f"\nWrote {OUTPUT_FILE.name}  ({size_kb:.1f} KB)")
    print(f"Top-level keys: {list(merged.keys())}")

    # 검증: 다시 로드
    with open(OUTPUT_FILE, encoding="utf-8") as f:
        verify = json.load(f)
    assert set(merged.keys()) == set(verify.keys()), "Verification failed!"
    print("Verification: PASS")


if __name__ == "__main__":
    main()
