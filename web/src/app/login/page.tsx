"use client";

import dynamic from "next/dynamic";

/**
 * Login page — client wrapper.
 *
 * Uses `next/dynamic` with `ssr: false` so the Firebase Web SDK
 * (`firebase/auth`) is never evaluated during build-time SSR/prerendering.
 */
const LoginForm = dynamic(() => import("./LoginForm"), { ssr: false });

export default function LoginPage() {
  return (
    <LoginForm />
  );
}
