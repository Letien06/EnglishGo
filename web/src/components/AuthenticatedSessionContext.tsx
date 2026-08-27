"use client";

import { createContext, useContext, type ReactNode } from "react";

const AuthenticatedSessionContext = createContext(false);

export function AuthenticatedSessionProvider({
  authenticated,
  children,
}: {
  authenticated: boolean;
  children: ReactNode;
}) {
  return (
    <AuthenticatedSessionContext.Provider value={authenticated}>
      {children}
    </AuthenticatedSessionContext.Provider>
  );
}

export function useAuthenticatedSession() {
  return useContext(AuthenticatedSessionContext);
}
