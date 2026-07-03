import { randomUUID } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { BadRequest } from "@/lib/api/response";
import { adminDb } from "@/lib/firestore/db";
import { adminStorageBucket } from "@/lib/firebase/admin";
import type { AppUser } from "@/types";

const AUDIO_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/x-mpeg"]);
const IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);

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

  const contentType = (file.type || "").toLowerCase();
  validateContentType(mediaType, contentType);

  const originalFilename = cleanPath(file.name || "upload");
  const extension = extensionFor(originalFilename, contentType);
  const folder = mediaType === "AUDIO" ? "audio" : "images";
  const id = randomUUID();
  const storedFileName = `${id}${extension}`;
  const storagePath = `${folder}/${storedFileName}`;
  const downloadToken = randomUUID();

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

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
  const snap = await adminDb.collection("mediaAssets").get();
  return snap.docs
    .map((doc) => {
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
    })
    .sort((a, b) => b.createdAtMillis - a.createdAtMillis)
    .slice(0, limit);
}

function validateContentType(mediaType: MediaType, contentType: string): void {
  if (mediaType === "AUDIO" && !AUDIO_TYPES.has(contentType)) {
    throw BadRequest("Chi ho tro audio mp3.");
  }
  if (mediaType === "IMAGE" && !IMAGE_TYPES.has(contentType)) {
    throw BadRequest("Chi ho tro anh jpg hoac png.");
  }
}

function extensionFor(originalName: string, contentType: string): string {
  const index = originalName.lastIndexOf(".");
  if (index >= 0 && index < originalName.length - 1) {
    const extension = originalName.slice(index).toLowerCase();
    if (/^\.[a-z0-9]{1,8}$/.test(extension)) {
      return extension;
    }
  }
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
