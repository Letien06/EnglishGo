import { randomUUID } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { BadRequest } from "@/lib/api/response";
import { adminDb } from "@/lib/firestore/db";
import { adminStorageBucket } from "@/lib/firebase/admin";
import type { AppUser } from "@/types";

const AUDIO_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/x-mpeg"]);
const IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);
const MAX_AUDIO_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

export type MediaType = "AUDIO" | "IMAGE";

export interface MediaUploadResponse {
  id: string;
  mediaType: MediaType;
  originalFilename: string;
  publicUrl: string;
  contentType: string;
  sizeBytes: number;
}

export interface MediaAsset extends MediaUploadResponse {
  storagePath: string;
  uploadedByUid: string;
  uploadedByEmail: string;
  createdAtMillis: number;
}

export async function storeMedia(
  file: File,
  mediaType: MediaType,
  user: AppUser,
): Promise<MediaUploadResponse> {
  if (!file || file.size === 0) {
    throw BadRequest("File upload khong duoc de trong.");
  }

  const maxSize = mediaType === "AUDIO" ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > maxSize) {
    throw BadRequest(`File vuot qua gioi han ${Math.round(maxSize / (1024 * 1024))} MB.`);
  }

  const contentType = (file.type || "").toLowerCase();
  validateContentType(mediaType, contentType);

  const originalFilename = cleanPath(file.name || "upload");
  const extension = extensionForMime(contentType);
  const folder = mediaType === "AUDIO" ? "audio" : "images";
  const id = randomUUID();
  const storedFileName = `${id}${extension}`;
  const storagePath = `${folder}/${storedFileName}`;
  const downloadToken = randomUUID();

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  validateMagicBytes(mediaType, contentType, buffer);

  const bucketFile = adminStorageBucket.file(storagePath);
  await bucketFile.save(buffer, {
    resumable: false,
    metadata: {
      contentType,
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
      },
    },
  });

  const publicUrl = firebaseDownloadUrl(
    adminStorageBucket.name,
    storagePath,
    downloadToken,
  );

  const asset: MediaAsset = {
    id,
    mediaType,
    originalFilename,
    publicUrl,
    contentType,
    sizeBytes: file.size,
    storagePath,
    uploadedByUid: user.uid,
    uploadedByEmail: user.email,
    createdAtMillis: Date.now(),
  };

  await adminDb.collection("mediaAssets").doc(id).set({
    ...asset,
    storedFileName,
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    id,
    mediaType,
    originalFilename,
    publicUrl,
    contentType,
    sizeBytes: file.size,
  };
}

export async function recentMedia(limit = 20): Promise<MediaAsset[]> {
  const safeLimit = Math.max(0, Math.min(100, Math.trunc(limit)));
  if (safeLimit === 0) return [];
  const snap = await adminDb
    .collection("mediaAssets")
    .orderBy("createdAtMillis", "desc")
    .limit(safeLimit)
    .get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      mediaType: normalizeMediaType(data.mediaType),
      originalFilename: stringValue(data.originalFilename) ?? "upload",
      publicUrl: stringValue(data.publicUrl) ?? "",
      contentType: stringValue(data.contentType) ?? "",
      sizeBytes: numberValue(data.sizeBytes) ?? 0,
      storagePath: stringValue(data.storagePath) ?? "",
      uploadedByUid: stringValue(data.uploadedByUid) ?? "",
      uploadedByEmail: stringValue(data.uploadedByEmail) ?? "",
      createdAtMillis: numberValue(data.createdAtMillis) ?? 0,
    };
  });
}

function validateContentType(mediaType: MediaType, contentType: string): void {
  if (mediaType === "AUDIO" && !AUDIO_TYPES.has(contentType)) {
    throw BadRequest("Chi ho tro audio mp3.");
  }
  if (mediaType === "IMAGE" && !IMAGE_TYPES.has(contentType)) {
    throw BadRequest("Chi ho tro anh jpg hoac png.");
  }
}

function validateMagicBytes(mediaType: MediaType, contentType: string, buffer: Buffer): void {
  if (buffer.length < 3) return;
  if (mediaType === "IMAGE") {
    if (contentType === "image/png") {
      const isPng = buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
      if (!isPng) throw BadRequest("Noi dung tep khong phai anh PNG hop le.");
    } else if (contentType === "image/jpeg") {
      const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
      if (!isJpeg) throw BadRequest("Noi dung tep khong phai anh JPEG hop le.");
    }
    return;
  }
  // MP3 starts with ID3 tag ("ID3") or MPEG frame sync (0xFF 0xE0..0xFF)
  const isId3 = buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33;
  const isMpegFrame = buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
  if (!isId3 && !isMpegFrame) {
    throw BadRequest("Noi dung tep khong phai audio MP3 hop le.");
  }
}

function extensionForMime(contentType: string): string {
  if (contentType === "image/png") return ".png";
  if (contentType === "image/jpeg") return ".jpg";
  return ".mp3";
}

function cleanPath(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "_").trim() || "upload";
}

function firebaseDownloadUrl(bucket: string, path: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(path)}?alt=media&token=${encodeURIComponent(token)}`;
}

function normalizeMediaType(value: unknown): MediaType {
  return value === "AUDIO" ? "AUDIO" : "IMAGE";
}

function stringValue(value: unknown): string | null {
  return value == null ? null : String(value);
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
