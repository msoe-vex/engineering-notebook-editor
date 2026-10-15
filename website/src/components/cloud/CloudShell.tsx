"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  getFirebaseAuth,
  getDevToken,
  setDevToken,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  type User,
} from "@/lib/cloud/firebase";
import { Toaster } from "react-hot-toast";
import { cloudApi } from "@/lib/cloud/api";

export function CloudShell({ children, title }: { children: ReactNode; title?: string }) {
  const pathname = usePathname();
  const notebookWorkspace = /\/orgs\/[^/]+\/notebooks\/[^/]+/.test(pathname || "");
  const [user, setUser] = useState<User | null>(null);
  const [devUid, setDevUid] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<{ platformRole?: string } | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    // setState only in the auth subscription callback (not synchronously in the effect body)
    const unsub = onAuthStateChanged(auth, (u) => {
      queueMicrotask(() => {
        void (async () => {
          setUser(u);
          if (u || getDevToken()) {
            try {
              const p = (await cloudApi.bootstrap()) as { platformRole?: string };
              setProfile(p);
            } catch {
              setProfile(null);
            }
          } else {
            setProfile(null);
          }
          setReady(true);
        })();
      });
    });
    return () => unsub();
  }, []);

  const signedIn = Boolean(user || getDevToken());

  async function handleEmailSignIn(create: boolean) {
    setError(null);
    try {
      const auth = getFirebaseAuth();
      if (create) await createUserWithEmailAndPassword(auth, email, password);
      else await signInWithEmailAndPassword(auth, email, password);
      setDevToken(null);
      await cloudApi.bootstrap();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function handleDevSignIn() {
    const uid = devUid.trim() || "local-user";
    setDevToken(uid.includes("@") ? `${uid.split("@")[0]}|${uid}` : uid);
    setReady(true);
    void cloudApi.bootstrap().then((p) => setProfile(p as { platformRole?: string }));
  }

  async function handleSignOut() {
    setDevToken(null);
    setProfile(null);
    try {
      await signOut(getFirebaseAuth());
    } catch {
      /* ignore */
    }
    window.location.href = "/";
  }

  if (!ready) {
    return <div className="p-8 text-sm text-neutral-500">Loading…</div>;
  }

  if (!signedIn) {
    return (
      <div className="cloud-shell min-h-screen bg-neutral-50 text-neutral-900">
        <div className="mx-auto max-w-md px-6 py-16">
          <p className="text-sm uppercase tracking-wide text-neutral-500">ENGen</p>
          <h1 className="mt-2 text-3xl font-semibold">Sign in</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Use Firebase Auth (or a local dev token for docker-compose).
          </p>
          <div className="mt-8 space-y-3">
            <input
              className="w-full rounded border border-neutral-300 px-3 py-2"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="w-full rounded border border-neutral-300 px-3 py-2"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                className="rounded bg-neutral-900 px-4 py-2 text-sm text-white"
                onClick={() => void handleEmailSignIn(false)}
              >
                Sign in
              </button>
              <button
                className="rounded border border-neutral-300 px-4 py-2 text-sm"
                onClick={() => void handleEmailSignIn(true)}
              >
                Create account
              </button>
            </div>
          </div>
          <div className="mt-10 border-t border-neutral-200 pt-6">
            <p className="text-xs text-neutral-500">Local docker fallback</p>
            <input
              className="mt-2 w-full rounded border border-neutral-300 px-3 py-2"
              placeholder="uid or uid|email (try service-admin)"
              value={devUid}
              onChange={(e) => setDevUid(e.target.value)}
            />
            <button
              className="mt-2 rounded border border-neutral-300 px-4 py-2 text-sm"
              onClick={handleDevSignIn}
            >
              Continue with dev token
            </button>
          </div>
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="cloud-shell flex min-h-screen flex-col bg-neutral-50 text-neutral-900">
      <header className="shrink-0 border-b border-neutral-200 bg-white">
        <div
          className={`mx-auto flex w-full items-center justify-between px-6 py-3 ${
            notebookWorkspace ? "" : "max-w-6xl py-4"
          }`}
        >
          <div className="flex items-center gap-4">
            <Link href="/" className="font-semibold tracking-tight">
              ENGen
            </Link>
            {title && <span className="text-sm text-neutral-500">{title}</span>}
          </div>
          <div className="flex items-center gap-3 text-sm">
            {profile?.platformRole === "service_admin" && (
              <Link href="/admin" className="underline">
                Admin
              </Link>
            )}
            <button className="underline" onClick={() => void handleSignOut()}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main
        className={
          notebookWorkspace
            ? "min-h-0 w-full flex-1 overflow-hidden"
            : "mx-auto w-full max-w-6xl flex-1 px-6 py-8"
        }
      >
        {children}
      </main>
      <Toaster
        position="bottom-right"
        toastOptions={{ className: "text-sm", duration: 4000 }}
      />
    </div>
  );
}
