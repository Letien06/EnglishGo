"""Import authorized Kurzgesagt YouTube videos as published dictation lessons.

The command never downloads video media. It obtains the channel catalogue and English
caption timings, then stores only the YouTube embed metadata and exercise segments.
Run with --write only after the owner permission recorded in the application remains valid.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from firebase_admin import credentials, firestore, get_app, initialize_app
from youtube_transcript_api import YouTubeTranscriptApi


ROOT = Path(__file__).resolve().parents[1]
CHANNEL_URL = "https://www.youtube.com/@kurzgesagt/videos"
SOURCE_NAME = "Kurzgesagt – In a Nutshell"
ATTRIBUTION = "Video by Kurzgesagt – In a Nutshell. Used with permission."
RIGHTS_NOTE = (
    "Owner authorization recorded by Tiến Lê on 2026-07-11: the full Kurzgesagt "
    "catalogue may be embedded, have its transcript displayed, and be used for "
    "dictation exercises in ENGLISHGO."
)
IMPORTER_UID = "system:authorized-kurzgesagt-import"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="Create and publish lessons. Without this flag the command is read-only.")
    parser.add_argument("--limit", type=int, default=0, help="Process at most this many channel videos (0 means all).")
    parser.add_argument("--sleep", type=float, default=0.45, help="Delay between caption requests in seconds.")
    parser.add_argument("--export", type=Path, help="Write import-ready lesson JSON to this path instead of (or before) writing Firestore.")
    return parser.parse_args()


def list_channel_videos() -> list[dict[str, Any]]:
    result = subprocess.run(
        [sys.executable, "-m", "yt_dlp", "--flat-playlist", "--dump-single-json", "--ignore-errors", CHANNEL_URL],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    payload = json.loads(result.stdout)
    return [entry for entry in payload.get("entries", []) if entry and entry.get("id") and entry.get("title")]


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", value)).strip()


def merge_cues(raw_cues: Any, max_seconds: float = 18.0) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    for cue in raw_cues:
        text = clean_text(cue.text)
        start = float(cue.start)
        end = start + float(cue.duration)
        if not text or end <= start:
            continue
        previous = merged[-1] if merged else None
        if previous and start - previous["endSeconds"] <= 0.8 and end - previous["startSeconds"] <= max_seconds:
            previous["endSeconds"] = end
            previous["expectedText"] = f"{previous['expectedText']} {text}".strip()
        else:
            merged.append({"startSeconds": start, "endSeconds": end, "expectedText": text})
    return merged


def word_count(text: str) -> int:
    return len(re.findall(r"[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)?", text))


def classify_topic(title: str) -> str:
    value = title.lower()
    if any(term in value for term in ("space", "planet", "moon", "sun", "star", "alien", "universe", "mars", "black hole", "solar")):
        return "SPACE"
    if any(term in value for term in ("brain", "body", "cancer", "virus", "disease", "health", "immune", "bacteria", "drug", "aging", "meat")):
        return "HEALTH_MEDICINE"
    if any(term in value for term in ("war", "history", "human", "society", "internet", "econom", "politic", "climate", "world")):
        return "SOCIETY_CULTURE"
    return "SCIENCE_TECHNOLOGY"


def classify_level(segments: list[dict[str, Any]], duration_seconds: int) -> str:
    words = sum(word_count(segment["expectedText"]) for segment in segments)
    wpm = words / max(duration_seconds / 60, 1)
    if wpm >= 165:
        return "C1"
    if wpm <= 125:
        return "B1"
    return "B2"


def existing_video_ids(db: firestore.Client) -> set[str]:
    return {
        str(snapshot.to_dict().get("youtubeVideoId"))
        for snapshot in db.collection("dictationLessons").stream()
        if snapshot.to_dict().get("sourceName") == SOURCE_NAME and snapshot.to_dict().get("youtubeVideoId")
    }


def write_lesson(db: firestore.Client, video: dict[str, Any], segments: list[dict[str, Any]], position: int) -> None:
    now = int(time.time() * 1000)
    video_id = str(video["id"])
    title = clean_text(str(video["title"]))
    duration = max(1, int(float(video.get("duration") or segments[-1]["endSeconds"])))
    lesson_ref = db.collection("dictationLessons").document()
    topic = classify_topic(title)
    level = classify_level(segments, duration)
    words = sum(word_count(segment["expectedText"]) for segment in segments)
    lesson = {
        "id": lesson_ref.id,
        "status": "PUBLISHED",
        "orderIndex": now + position,
        "title": title,
        "slug": f"kurzgesagt-{re.sub(r'[^a-z0-9-]+', '-', video_id.lower()).strip('-')}",
        "descriptionVi": f"Luyện nghe – chép theo video Kurzgesagt: {title}",
        "sourceName": SOURCE_NAME,
        "sourceType": "PARTNER_PERMISSION",
        "sourceUrl": f"https://www.youtube.com/watch?v={video_id}",
        "youtubeVideoId": video_id,
        "embedUrl": f"https://www.youtube-nocookie.com/embed/{video_id}",
        "thumbnailUrl": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
        "durationSeconds": duration,
        "language": "en",
        "accent": None,
        "level": level,
        "topics": [topic],
        "segmentCount": len(segments),
        "wordCount": words,
        "estimatedWpm": round(words / max(duration / 60, 1)),
        "transcriptOrigin": "RIGHTS_HOLDER_YOUTUBE_CAPTIONS",
        "licenseStatus": "VERIFIED",
        "publicAttribution": ATTRIBUTION,
        "rightsId": lesson_ref.id,
        "publishedAtMillis": now,
        "createdAtMillis": now,
        "updatedAtMillis": now,
        "createdByUid": IMPORTER_UID,
        "updatedByUid": IMPORTER_UID,
        "createdAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }
    rights = {
        "lessonId": lesson_ref.id,
        "licenseType": "PARTNER_PERMISSION",
        "permissionScope": ["YOUTUBE_EMBED", "TRANSCRIPT_DISPLAY", "DICTATION_EXERCISES"],
        "evidenceUrl": None,
        "evidenceNote": RIGHTS_NOTE,
        "attributionRequired": True,
        "attributionText": ATTRIBUTION,
        "verifiedByUid": IMPORTER_UID,
        "verifiedAtMillis": now,
        "expiresAtMillis": None,
        "reviewStatus": "VERIFIED",
        "updatedAtMillis": now,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }
    batch = db.batch()
    batch.set(lesson_ref, lesson)
    batch.set(db.collection("dictationRights").document(lesson_ref.id), rights)
    for index, segment in enumerate(segments, start=1):
        segment_id = f"s{index:03d}"
        batch.set(lesson_ref.collection("segments").document(segment_id), {
            "lessonId": lesson_ref.id,
            "index": index,
            "startSeconds": segment["startSeconds"],
            "endSeconds": segment["endSeconds"],
            "leadInSeconds": 0,
            "tailSeconds": 0,
            "speaker": None,
            "expectedText": segment["expectedText"],
            "acceptedNormalizedAnswers": [],
            "translationVi": None,
            "wordCount": word_count(segment["expectedText"]),
            "status": "PUBLISHED",
            "createdAtMillis": now,
            "updatedAtMillis": now,
        })
    batch.commit()


def import_payload(video: dict[str, Any], segments: list[dict[str, Any]]) -> dict[str, Any]:
    video_id = str(video["id"])
    title = clean_text(str(video["title"]))
    duration = max(1, int(float(video.get("duration") or segments[-1]["endSeconds"])))
    return {
        "title": title,
        "slug": f"kurzgesagt-{video_id.lower()}",
        "sourceName": SOURCE_NAME,
        "sourceType": "PARTNER_PERMISSION",
        "sourceUrl": f"https://www.youtube.com/watch?v={video_id}",
        "youtubeVideoId": video_id,
        "thumbnailUrl": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
        "durationSeconds": duration,
        "level": classify_level(segments, duration),
        "topics": [classify_topic(title)],
        "publicAttribution": ATTRIBUTION,
        "transcriptOrigin": "RIGHTS_HOLDER_YOUTUBE_CAPTIONS",
        "descriptionVi": f"Luyện nghe – chép theo video Kurzgesagt: {title}",
        "licenseStatus": "VERIFIED",
        "rightsEvidenceNote": RIGHTS_NOTE,
        "segments": [{"startSeconds": cue["startSeconds"], "endSeconds": cue["endSeconds"], "expectedText": cue["expectedText"]} for cue in segments],
    }


def main() -> int:
    args = parse_args()
    db: firestore.Client | None = None
    if args.write:
        load_dotenv(ROOT / ".env.local")
        service_account = json.loads(os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "{}"))
        if not service_account.get("project_id"):
            raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_JSON is missing or invalid")
        try:
            app = get_app()
        except ValueError:
            app = initialize_app(credentials.Certificate(service_account))
        db = firestore.client(app)
    videos = list_channel_videos()
    if args.limit > 0:
        videos = videos[:args.limit]
    existing = existing_video_ids(db) if db else set()
    transcript_api = YouTubeTranscriptApi()
    created = skipped_existing = skipped_transcript = 0
    failures: list[str] = []
    exported: list[dict[str, Any]] = []
    print(f"Found {len(videos)} channel videos; {len(existing)} Kurzgesagt lessons already exist.", flush=True)

    for position, video in enumerate(videos, start=1):
        video_id = str(video["id"])
        if video_id in existing:
            skipped_existing += 1
            continue
        try:
            segments = merge_cues(transcript_api.fetch(video_id, languages=["en"]))
            if not segments:
                raise ValueError("English transcript contains no usable captions")
        except Exception as error:  # The report is intentionally concise so titles/transcripts are not logged.
            skipped_transcript += 1
            failures.append(f"{video_id}: {type(error).__name__}")
            print(f"[{position}/{len(videos)}] skipped {video_id}: no usable English transcript", flush=True)
            time.sleep(args.sleep)
            continue

        payload = import_payload(video, segments)
        if args.export:
            exported.append(payload)
        if args.write and db:
            write_lesson(db, video, segments, position)
            created += 1
            print(f"[{position}/{len(videos)}] published {video_id}: {len(segments)} segments", flush=True)
        else:
            print(f"[{position}/{len(videos)}] ready {video_id}: {len(segments)} segments", flush=True)
        time.sleep(args.sleep)

    if args.export:
        args.export.parent.mkdir(parents=True, exist_ok=True)
        args.export.write_text(json.dumps(exported, ensure_ascii=False), encoding="utf-8")
    summary = {
        "mode": "write" if args.write else "dry-run",
        "channelVideos": len(videos),
        "created": created,
        "skippedExisting": skipped_existing,
        "skippedNoEnglishTranscript": skipped_transcript,
        "exported": len(exported),
        "failedVideoIds": failures,
    }
    print(json.dumps(summary, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
