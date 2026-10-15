"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { ChevronDown, Moon, Sun, UserRound } from "lucide-react";
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
import { cloudApi, type OrgSummary } from "@/lib/cloud/api";
import { platformRoleLabel } from "@/lib/cloud/roles";
import {
  getWorkspaceHeader,
  subscribeWorkspaceHeader,
} from "@/lib/cloud/workspaceHeaderStore";
import Logo from "@/components/icons/Logo";
import {
  Alert,
  Breadcrumbs,
  Button,
  DropdownMenu,
  LoadingBlock,
  TextField,
} from "@/components/ui";

/** Global app chrome (auth + top bar). Formerly CloudShell. */
export function AppChrome({ children, title }: { children: ReactNode; title?: string }) {
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const notebookWorkspace = /\/orgs\/[^/]+\/notebooks\/[^/]+/.test(pathname || "");
  const onAdmin = pathname?.startsWith("/admin");
  const onAccount = pathname?.startsWith("/account");
  const orgId = typeof params.orgId === "string" ? params.orgId : null;
  const workspaceHeader = useSyncExternalStore(
    subscribeWorkspaceHeader,
    getWorkspaceHeader,
    () => null
  );

  const [user, setUser] = useState<User | null>(null);
  const [devUid, setDevUid] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<{
    platformRole?: string;
    email?: string;
  } | null>(null);
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const [mountedTheme, setMountedTheme] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setMountedTheme(true));
  }, []);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      queueMicrotask(() => {
        void (async () => {
          setUser(u);
          if (u || getDevToken()) {
            try {
              const p = (await cloudApi.bootstrap()) as {
                platformRole?: string;
                email?: string;
              };
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

  useEffect(() => {
    if (!ready || !(user || getDevToken())) return;
    let cancelled = false;
    void cloudApi
      .listOrgs()
      .then((list) => {
        if (!cancelled) setOrgs(list);
      })
      .catch(() => {
        if (!cancelled) setOrgs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, user]);

  useEffect(() => {
    if (!orgId) {
      queueMicrotask(() => setOrgName(null));
      return;
    }
    const fromList = orgs.find((o) => o.id === orgId);
    if (fromList) {
      queueMicrotask(() => setOrgName(fromList.name));
      return;
    }
    let cancelled = false;
    void cloudApi
      .getOrg(orgId)
      .then((o) => {
        if (!cancelled) setOrgName(o.name);
      })
      .catch(() => {
        if (!cancelled) setOrgName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, orgs]);

  const signedIn = Boolean(user || getDevToken());
  const displayEmail =
    user?.email ||
    profile?.email ||
    (getDevToken()?.includes("|") ? getDevToken()!.split("|")[1] : null);
  const isServiceAdmin = profile?.platformRole === "service_admin";

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

  async function handleDevSignIn() {
    setError(null);
    const uid = devUid.trim() || "local-user";
    setDevToken(uid.includes("@") ? `${uid.split("@")[0]}|${uid}` : uid);
    setReady(true);
    try {
      const p = (await cloudApi.bootstrap()) as {
        platformRole?: string;
        email?: string;
      };
      setProfile(p);
    } catch (err) {
      setProfile(null);
      setError((err as Error).message);
    }
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
    return (
      <div className="flex min-h-screen items-center justify-center bg-nb-bg">
        <LoadingBlock />
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="cloud-shell min-h-screen bg-nb-bg text-nb-on-surface">
        <div className="mx-auto max-w-md px-6 py-16">
          <div className="mb-8 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-nb-primary shadow-lg shadow-nb-primary/25">
              <Logo className="text-white" size={28} strokeWidth={18} />
            </div>
            <div>
              <p className="text-nb-label font-semibold text-nb-on-surface-variant">ENGen</p>
              <h1 className="text-nb-display font-bold tracking-tight">Sign in</h1>
            </div>
          </div>
          <p className="text-sm text-nb-on-surface-variant">
            Organizations → Notebooks → workspace. Use Firebase Auth, or a local dev token with
            docker-compose.
          </p>
          <div className="mt-8 space-y-3">
            <TextField
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <TextField
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => void handleEmailSignIn(false)}>
                Sign in
              </Button>
              <Button variant="secondary" onClick={() => void handleEmailSignIn(true)}>
                Create account
              </Button>
            </div>
          </div>
          <details className="mt-10 border-t border-nb-outline-variant/30 pt-6">
            <summary className="cursor-pointer text-nb-label font-semibold text-nb-on-surface-variant">
              Developer sign-in
            </summary>
            <TextField
              className="mt-2"
              placeholder="uid or uid|email (try service-admin)"
              value={devUid}
              onChange={(e) => setDevUid(e.target.value)}
            />
            <Button className="mt-2" variant="secondary" onClick={handleDevSignIn}>
              Continue with dev token
            </Button>
          </details>
          {error && (
            <Alert variant="error" className="mt-4">
              {error}
            </Alert>
          )}
        </div>
      </div>
    );
  }

  const ws = notebookWorkspace ? workspaceHeader : null;

  return (
    <div className="cloud-shell flex min-h-screen flex-col bg-nb-bg text-nb-on-surface">
      <header className="shrink-0 border-b border-nb-outline-variant/30 bg-nb-surface">
        <div
          className={`mx-auto flex w-full items-center justify-between gap-3 px-4 sm:px-6 ${
            notebookWorkspace ? "py-2" : "max-w-6xl py-3.5"
          }`}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
            <Link href="/" className="flex shrink-0 items-center gap-2.5 font-black tracking-tight">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-nb-primary text-white">
                <Logo size={18} strokeWidth={18} />
              </span>
              <span className="hidden sm:inline">ENGen</span>
            </Link>

            {ws ? (
              <div className="min-w-0 flex-1">
                <Breadcrumbs
                  items={[
                    { label: "Home", href: "/" },
                    { label: ws.orgName, href: `/orgs/${ws.orgId}` },
                    { label: ws.notebookName },
                  ]}
                />
              </div>
            ) : (
              <nav className="flex min-w-0 items-center gap-2 text-nb-label font-semibold">
                <Link
                  href="/"
                  className={
                    pathname === "/"
                      ? "text-nb-primary"
                      : "text-nb-on-surface-variant hover:text-nb-on-surface"
                  }
                >
                  Home
                </Link>
                {orgId && orgName && (
                  <>
                    <span className="text-nb-on-surface-variant/40">/</span>
                    <div className="relative">
                      <button
                        type="button"
                        className="inline-flex max-w-[10rem] items-center gap-1 truncate text-nb-on-surface hover:text-nb-primary sm:max-w-[14rem]"
                        onClick={() => setOrgMenuOpen((v) => !v)}
                      >
                        <span className="truncate normal-case tracking-normal">{orgName}</span>
                        <ChevronDown size={14} className="shrink-0 opacity-60" />
                      </button>
                      {orgMenuOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-20"
                            onClick={() => setOrgMenuOpen(false)}
                          />
                          <div className="absolute top-full left-0 z-30 mt-1 max-h-64 w-56 overflow-auto rounded-xl border border-nb-outline-variant/30 bg-nb-surface shadow-nb-lg">
                            {orgs.map((o) => (
                              <button
                                key={o.id}
                                type="button"
                                className={`block w-full truncate px-3 py-2 text-left text-xs font-medium hover:bg-nb-surface-low ${
                                  o.id === orgId ? "text-nb-primary" : "text-nb-on-surface"
                                }`}
                                onClick={() => {
                                  setOrgMenuOpen(false);
                                  router.push(`/orgs/${o.id}`);
                                }}
                              >
                                {o.name}
                              </button>
                            ))}
                            <Link
                              href="/"
                              className="block border-t border-nb-outline-variant/20 px-3 py-2 text-xs font-medium text-nb-tertiary hover:bg-nb-surface-low"
                              onClick={() => setOrgMenuOpen(false)}
                            >
                              All organizations
                            </Link>
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )}
                {onAdmin && (
                  <>
                    <span className="text-nb-on-surface-variant/40">/</span>
                    <span className="text-nb-primary">Admin</span>
                  </>
                )}
                {onAccount && (
                  <>
                    <span className="text-nb-on-surface-variant/40">/</span>
                    <span className="text-nb-primary">Account</span>
                  </>
                )}
              </nav>
            )}
            {title && !ws && (
              <span className="hidden truncate text-sm text-nb-on-surface-variant lg:inline">
                {title}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2 text-sm">
            {ws && <DropdownMenu items={ws.menuItems} />}
            {mountedTheme && (
              <button
                type="button"
                className="rounded-xl p-2 text-nb-on-surface-variant hover:bg-nb-surface-low hover:text-nb-on-surface"
                aria-label="Toggle theme"
                onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              >
                {resolvedTheme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            )}
            <Link
              href="/account"
              className={`inline-flex items-center gap-1.5 rounded-nb-lg px-2 py-1.5 text-nb-label font-semibold ${
                onAccount
                  ? "bg-nb-primary/10 text-nb-primary"
                  : "text-nb-on-surface-variant hover:bg-nb-surface-low hover:text-nb-on-surface"
              }`}
              title={displayEmail || "Account"}
            >
              <UserRound size={16} />
              <span className="hidden md:inline">Account</span>
            </Link>
            {isServiceAdmin && (
              <Link
                href="/admin"
                className={`hidden text-nb-label font-semibold sm:inline ${
                  onAdmin ? "text-nb-primary" : "text-nb-on-surface-variant hover:text-nb-primary"
                }`}
                title={platformRoleLabel("service_admin")}
              >
                Admin
              </Link>
            )}
            <button
              type="button"
              className="text-nb-label font-semibold text-nb-on-surface-variant hover:text-nb-on-surface"
              onClick={() => void handleSignOut()}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main
        className={
          notebookWorkspace
            ? "min-h-0 w-full flex-1 overflow-hidden"
            : "mx-auto w-full max-w-6xl flex-1 px-6 py-8 lg:py-12"
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

/** @deprecated Use AppChrome */
export const CloudShell = AppChrome;
