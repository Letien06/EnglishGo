import { getAuth, type Auth } from "firebase/auth";
import { getClientApp } from "./client-app";

let _auth: Auth | undefined;

export function getClientAuth(): Auth {
  if (!_auth) {
    _auth = getAuth(getClientApp());
  }
  return _auth;
}
