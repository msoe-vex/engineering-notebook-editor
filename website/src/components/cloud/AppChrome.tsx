"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTheme } from "next-themes";
import {
  Bug,
  ChevronDown,
  CircleHelp,
  Info,
  LogOut,
  Moon,
  MoreVertical,
  Settings2,
  Sun,
  UserRound,
} from "lucide-react";
import { GITHUB_ISSUES_URL } from "@/lib/constants";
import {
  getFirebaseAuth,
  getDevToken,
  setDevToken,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
  signOut,
  type User,
} from "@/lib/cloud/firebase";
import { EmailVerificationScreen } from "./EmailVerificationScreen";
import { Toaster } from "react-hot-toast";
import { bindNotificationEvents } from "@/components/overlays/Notification";
import { cloudApi, type OrgSummary } from "@/lib/cloud/api";
import {
  getEditorChrome,
  getEditorChromeServerSnapshot,
  subscribeEditorChrome,
} from "@/lib/cloud/editorChromeStore";
import {
  getWorkspaceHeader,
  subscribeWorkspaceHeader,
} from "@/lib/cloud/workspaceHeaderStore";
import { useNarrowViewport } from "@/hooks/useDevice";
import Logo from "@/components/icons/Logo";
import {
  Alert,
  Breadcrumbs,
  Button,
  DropdownMenu,
  LoadingBlock,
  TextField,
  type Crumb,
} from "@/components/ui";

/** Global app chrome (auth + top bar). Formerly CloudShell. */
export function AppChrome({ children, title }: { children: ReactNode; title?: string }) {
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const notebookWorkspace = /\/orgs\/[^/]+\/notebooks\/[^/]+/.test(pathname || "");
  const narrow = useNarrowViewport();
  const onAdmin = pathname?.startsWith("/admin");
  const onAccount = pathname?.startsWith("/account");
  const onHelp = pathname?.startsWith("/help");
  const onAbout = pathname?.startsWith("/about");
  const isPublicPage = Boolean(onHelp || onAbout);
  /** Match notebook: header + main span the viewport (no max-w-6xl “page in a page”). */
  const fullBleedChrome = true;
  /** Help, Account, and notebooks fill remaining height and manage internal pane scrolling. */
  const fillMain = notebookWorkspace || onHelp || onAccount;
  /** About owns full-page scrolling without max-w constraint. */
  const bareMain = onAbout;
  const orgId = typeof params.orgId === "string" ? params.orgId : null;
  const workspaceHeader = useSyncExternalStore(
    subscribeWorkspaceHeader,
    getWorkspaceHeader,
    () => null
  );
  const editorChrome = useSyncExternalStore(
    subscribeEditorChrome,
    getEditorChrome,
    getEditorChromeServerSnapshot
  );

  const [user, setUser] = useState<User | null>(null);
  const [devUid, setDevUid] = useState("");
  const [name, setName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<{
    platformRole?: string;
    email?: string;
    displayName?: string;
  } | null>(null);
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [mountedTheme, setMountedTheme] = useState(false);
  const [devBypassed, setDevBypassed] = useState(false);
  const [authTick, setAuthTick] = useState(0);

  useEffect(() => {
    queueMicrotask(() => setMountedTheme(true));
  }, []);

  useEffect(() => bindNotificationEvents(), []);

  useEffect(() => {
    const onProfileUpdate = (e: Event) => {
      const custom = e as CustomEvent<{ displayName?: string }>;
      if (custom.detail) {
        setProfile((prev) => (prev ? { ...prev, displayName: custom.detail.displayName } : prev));
      }
    };
    window.addEventListener("ene:profile-updated", onProfileUpdate);
    return () => window.removeEventListener("ene:profile-updated", onProfileUpdate);
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
      if (create) {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (name.trim()) {
          try {
            await updateProfile(cred.user, { displayName: name.trim() });
          } catch (e) {
            console.warn("Failed to set Firebase displayName:", e);
          }
        }
        try {
          await sendEmailVerification(cred.user);
        } catch (e) {
          console.warn("Failed to send initial verification email:", e);
        }
        setDevToken(null);
        const p = (await cloudApi.bootstrap({ displayName: name.trim() || undefined })) as {
          platformRole?: string;
          email?: string;
          displayName?: string;
        };
        setProfile(p);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        setDevToken(null);
        const p = (await cloudApi.bootstrap()) as {
          platformRole?: string;
          email?: string;
          displayName?: string;
        };
        setProfile(p);
      }
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
      <div className="flex min-h-screen items-center justify-center bg-nb-surface">
        <LoadingBlock />
      </div>
    );
  }

  if (!signedIn && !isPublicPage) {
    return (
      <div className="cloud-shell min-h-screen bg-nb-surface text-nb-on-surface">
        <div className="mx-auto max-w-md px-6 py-16">
          <div className="mb-8 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-nb-primary shadow-lg shadow-nb-primary/25">
              <Logo className="text-white" size={28} strokeWidth={18} />
            </div>
            <div>
              <p className="text-nb-label font-semibold text-nb-on-surface-variant">ENGen</p>
              <h1 className="text-nb-display font-bold tracking-tight">
                {isSignUp ? "Create account" : "Sign in"}
              </h1>
            </div>
          </div>
          <p className="text-sm text-nb-on-surface-variant">
            {isSignUp
              ? "Create your account to collaborate on engineering notebooks."
              : "Organizations → Notebooks → workspace. Use Firebase Auth, or a local dev token."}
          </p>
          <div className="mt-8 space-y-3">
            {isSignUp && (
              <TextField
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
            <TextField
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <TextField
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="flex flex-col gap-3 pt-1">
              <Button
                variant="primary"
                className="w-full justify-center"
                onClick={() => void handleEmailSignIn(isSignUp)}
              >
                {isSignUp ? "Create account" : "Sign in"}
              </Button>
              <div className="text-center text-nb-caption text-nb-on-surface-variant">
                {isSignUp ? (
                  <>
                    Already have an account?{" "}
                    <button
                      type="button"
                      className="font-semibold text-nb-primary hover:underline"
                      onClick={() => setIsSignUp(false)}
                    >
                      Sign in
                    </button>
                  </>
                ) : (
                  <>
                    Don&apos;t have an account?{" "}
                    <button
                      type="button"
                      className="font-semibold text-nb-primary hover:underline"
                      onClick={() => setIsSignUp(true)}
                    >
                      Create account
                    </button>
                  </>
                )}
              </div>
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

          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-nb-outline-variant/20 pt-8 text-[11px] font-semibold text-nb-on-surface-variant">
            <Link href="/about" className="hover:text-nb-primary transition-colors">
              About
            </Link>
            <Link href="/help" className="hover:text-nb-primary transition-colors">
              Help &amp; Docs
            </Link>
            <a
              href={GITHUB_ISSUES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-nb-primary transition-colors"
            >
              Report Issue
            </a>
            {mountedTheme && (
              <button
                type="button"
                onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                className="inline-flex items-center gap-1 hover:text-nb-primary transition-colors cursor-pointer"
                title="Toggle Theme"
              >
                {resolvedTheme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
                <span>{resolvedTheme === "dark" ? "Light" : "Dark"}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (user && !user.emailVerified && !getDevToken() && !devBypassed && !isPublicPage) {
    return (
      <EmailVerificationScreen
        user={user}
        onSignOut={() => void handleSignOut()}
        onVerified={() => {
          const current = getFirebaseAuth().currentUser;
          setUser(current);
          setAuthTick((t) => t + 1);
        }}
        onBypass={() => setDevBypassed(true)}
      />
    );
  }

  const ws = notebookWorkspace ? workspaceHeader : null;

  const crumbs: Crumb[] = (() => {
    if (ws) {
      const items: Crumb[] = [{ label: "Home", href: "/" }];
      if (ws.orgName) {
        items.push({ label: ws.orgName, href: `/orgs/${ws.orgId}` });
      }
      if (ws.notebookName) {
        items.push({ label: ws.notebookName });
      }
      return items;
    }
    if (!pathname || pathname === "/") return [{ label: "Home" }];
    const items: Crumb[] = [{ label: "Home", href: "/" }];
    if (orgId && orgName) {
      const onOrgRoot =
        pathname === `/orgs/${orgId}` || pathname === `/orgs/${orgId}/`;
      items.push({
        label: orgName,
        href: onOrgRoot ? undefined : `/orgs/${orgId}`,
      });
    }
    if (onAdmin) items.push({ label: "Admin" });
    if (onAccount) {
      if (pathname.startsWith("/account/preferences")) {
        items.push({ label: "Account", href: "/account" }, { label: "Preferences" });
      } else {
        items.push({ label: "Account" });
      }
    }
    if (onHelp) items.push({ label: "Help" });
    if (onAbout) items.push({ label: "About" });
    return items;
  })();

  const iconBtn =
    "inline-flex h-8 items-center gap-1.5 rounded-nb-lg px-2 text-nb-label font-semibold text-nb-on-surface-variant hover:bg-nb-surface-low hover:text-nb-on-surface transition-colors";

  return (
    <div className="cloud-shell flex h-screen w-full flex-col overflow-hidden bg-nb-surface text-nb-on-surface">
      <header className="sticky top-0 z-30 h-[3.25rem] shrink-0 border-b border-nb-outline-variant/30 bg-nb-surface/95 backdrop-blur-md">
        <div
          className={`flex h-full w-full items-center justify-between gap-3 px-4 sm:px-6 ${
            fullBleedChrome ? "" : "mx-auto max-w-6xl"
          }`}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
            <Link href="/" className="flex shrink-0 items-center gap-2.5 font-black tracking-tight">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-nb-primary text-white">
                <Logo size={18} strokeWidth={18} />
              </span>
              <span className="hidden sm:inline">ENGen</span>
            </Link>
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
              <Breadcrumbs
                className="flex-nowrap"
                items={
                  narrow && ws && crumbs.length > 2
                    ? [crumbs[0]!, crumbs[crumbs.length - 1]!]
                    : crumbs
                }
              />
              {ws?.isArchived && (
                <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                  Archived
                </span>
              )}
            </div>
            {title && !ws && (
              <span className="hidden truncate text-sm text-nb-on-surface-variant lg:inline">
                {title}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1 text-sm">
            {(editorChrome.connection || editorChrome.saveState) && (
              <div className="mr-0.5 flex items-center gap-1.5">
                {editorChrome.connection && (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-nb px-1.5 py-0.5 text-[11px] font-semibold ${
                      editorChrome.connection === "connected"
                        ? "bg-nb-success/10 text-nb-success"
                        : "bg-nb-warning/10 text-nb-warning"
                    }`}
                    title={
                      editorChrome.connection === "connected"
                        ? "Connected"
                        : editorChrome.connection === "connecting"
                          ? "Connecting…"
                          : "Offline"
                    }
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        editorChrome.connection === "connected"
                          ? "bg-nb-success"
                          : "bg-nb-warning animate-pulse"
                      }`}
                    />
                    <span className="hidden lg:inline">
                      {editorChrome.connection === "connected"
                        ? "Connected"
                        : editorChrome.connection === "connecting"
                          ? "Connecting…"
                          : "Offline"}
                    </span>
                  </span>
                )}
                {editorChrome.saveState && editorChrome.saveState !== "idle" && (
                  <span
                    className={`text-[11px] font-semibold tabular-nums ${
                      editorChrome.saveState === "saving"
                        ? "text-nb-on-surface-variant"
                        : editorChrome.saveState === "saved"
                          ? "text-nb-success"
                          : "text-nb-danger"
                    }`}
                    aria-live="polite"
                  >
                    {editorChrome.saveState === "saving"
                      ? "Saving…"
                      : editorChrome.saveState === "saved"
                        ? "Saved"
                        : "Save failed"}
                  </span>
                )}
                {editorChrome.peers.length > 0 && (
                  <div className="hidden items-center -space-x-1.5 lg:flex" aria-label="Editors present">
                    {editorChrome.peers.slice(0, 3).map((peer) => {
                      const initials =
                        peer.name
                          .trim()
                          .split(/\s+/)
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((part) => part.charAt(0))
                          .join("")
                          .toUpperCase() || "?";
                      return (
                        <span
                          key={peer.clientId}
                          title={peer.name}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-nb-surface text-[9px] font-bold text-white shadow-sm"
                          style={{ backgroundColor: peer.color }}
                        >
                          {initials}
                        </span>
                      );
                    })}
                  </div>
                )}
                {editorChrome.connection &&
                  editorChrome.connection !== "connected" &&
                  editorChrome.onReconnect && (
                    <button
                      type="button"
                      className="hidden text-[11px] font-semibold text-nb-primary hover:underline sm:inline"
                      onClick={() => editorChrome.onReconnect?.()}
                    >
                      Reconnect
                    </button>
                  )}
              </div>
            )}
            {ws && (
              <DropdownMenu
                ariaLabel="Notebook actions"
                items={ws.menuItems}
                trigger={
                  <span className={iconBtn} title="Notebook actions">
                    <span className="sr-only">Notebook actions</span>
                    <MoreVertical size={16} />
                  </span>
                }
              />
            )}
            {mountedTheme && (
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-nb-on-surface-variant hover:bg-nb-surface-low hover:text-nb-on-surface transition-colors"
                aria-label="Toggle theme"
                onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              >
                {resolvedTheme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            )}
            {signedIn ? (
              <DropdownMenu
                ariaLabel="Account menu"
                items={[
                  {
                    id: "profile",
                    label: "Profile",
                    icon: <UserRound size={14} />,
                    onSelect: () => router.push("/account"),
                  },
                  {
                    id: "preferences",
                    label: "Preferences",
                    icon: <Settings2 size={14} />,
                    onSelect: () => router.push("/account/preferences"),
                  },
                  {
                    id: "help",
                    label: "Help",
                    icon: <CircleHelp size={14} />,
                    onSelect: () => router.push("/help"),
                  },
                  {
                    id: "about",
                    label: "About",
                    icon: <Info size={14} />,
                    onSelect: () => router.push("/about"),
                  },
                  {
                    id: "report-issue",
                    label: "Report Issue",
                    icon: <Bug size={14} />,
                    onSelect: () =>
                      window.open(GITHUB_ISSUES_URL, "_blank", "noopener,noreferrer"),
                  },
                  ...(isServiceAdmin
                    ? [
                        {
                          id: "admin",
                          label: "Admin",
                          onSelect: () => router.push("/admin"),
                        },
                      ]
                    : []),
                  {
                    id: "signout",
                    label: "Sign out",
                    icon: <LogOut size={14} />,
                    danger: true,
                    onSelect: () => void handleSignOut(),
                  },
                ]}
                trigger={
                  <span
                    className={iconBtn}
                    title={
                      profile?.displayName || user?.displayName
                        ? `${profile?.displayName || user?.displayName} (${displayEmail})`
                        : displayEmail || "Account"
                    }
                  >
                    <UserRound size={16} />
                    <span className="hidden lg:inline max-w-[8rem] truncate">
                      {profile?.displayName ||
                        user?.displayName ||
                        displayEmail?.split("@")[0] ||
                        "Account"}
                    </span>
                    <ChevronDown size={12} className="opacity-60" />
                  </span>
                }
              />
            ) : (
              <div className="flex items-center gap-1 sm:gap-2">
                {!onHelp && (
                  <Link href="/help" className={iconBtn} title="Help & Docs">
                    <CircleHelp size={16} />
                    <span className="hidden md:inline">Help</span>
                  </Link>
                )}
                {!onAbout && (
                  <Link href="/about" className={iconBtn} title="About">
                    <Info size={16} />
                    <span className="hidden md:inline">About</span>
                  </Link>
                )}
                <a
                  href={GITHUB_ISSUES_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={iconBtn}
                  title="Report Issue"
                >
                  <Bug size={16} />
                  <span className="hidden sm:inline">Report Issue</span>
                </a>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => router.push("/")}
                >
                  Sign in
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main
        className={
          fillMain
            ? "min-h-0 w-full flex-1 overflow-hidden"
            : bareMain
              ? "min-h-0 w-full flex-1 overflow-y-auto"
              : "min-h-0 w-full flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:py-8"
        }
      >
        {bareMain || fillMain ? (
          children
        ) : (
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        )}
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
