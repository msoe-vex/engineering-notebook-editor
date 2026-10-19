"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  updateProfile,
  type Auth,
  type User,
} from "firebase/auth";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let emulatorConnected = false;

/** Host `next dev` should hit the Auth emulator unless explicitly disabled. */
function useFirebaseEmulator(): boolean {
  const flag = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR;
  if (flag === "false") return false;
  if (flag === "true") return true;
  return process.env.NODE_ENV === "development";
}

export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  const config = {
    // Any non-empty key works with the Auth emulator; avoid bare "demo-api-key"
    // so misconfigured clients fail clearly against production.
    apiKey:
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
      "AIzaSyDocOrLocalEmulatorKey00000000000",
    authDomain:
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
      "demo-engineering-notebook.firebaseapp.com",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-engineering-notebook",
  };
  app = getApps()[0] ?? initializeApp(config);
  return app;
}

export function getFirebaseAuth(): Auth {
  if (auth) return auth;
  auth = getAuth(getFirebaseApp());
  if (typeof window !== "undefined" && useFirebaseEmulator() && !emulatorConnected) {
    const host = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST || "localhost:9099";
    connectAuthEmulator(auth, `http://${host}`, { disableWarnings: true });
    emulatorConnected = true;
  }
  return auth;
}

/** Local/dev bearer when Firebase Auth is not configured: uid or uid|email. */
export function getDevToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("ene_dev_token");
}

export function setDevToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem("ene_dev_token", token);
  else window.localStorage.removeItem("ene_dev_token");
}

export async function getIdToken(): Promise<string | null> {
  const current = getFirebaseAuth().currentUser;
  if (current) return current.getIdToken();
  return getDevToken();
}

export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  updateProfile,
};
export type { User };
