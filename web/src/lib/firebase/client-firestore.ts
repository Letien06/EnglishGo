import { getFirestore, type Firestore } from "firebase/firestore";
import { getClientApp } from "./client-app";

let _db: Firestore | undefined;

export function getClientDb(): Firestore {
  if (!_db) {
    _db = getFirestore(getClientApp());
  }
  return _db;
}
