"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTheme } from "next-themes";
import {
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
import { bindNotificationEvents } from "@/components/overlays/Notification";
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
  type Crumb,
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
  const onHelp = pathname?.startsWith("/help");
  const onAbout = pathname?.startsWith("/about");
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
  const [mountedTheme, setMountedTheme] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setMountedTheme(true));
  }, []);

  useEffect(() => bindNotificationEvents(), []);

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
      <div className="flex min-h-screen items-center justify-center bg-nb-surface">
        <LoadingBlock />
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="cloud-shell min-h-screen bg-nb-surface text-nb-on-surface">
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
            <div className="min-w-0 flex-1">
              <Breadcrumbs items={crumbs} />
            </div>
            {title && !ws && (
              <span className="hidden truncate text-sm text-nb-on-surface-variant lg:inline">
                {title}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2 text-sm">
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
            <Link href="/help" className={iconBtn} title="Help" aria-current={onHelp ? "page" : undefined}>
              <CircleHelp size={16} />
              <span className="hidden lg:inline">Help</span>
            </Link>
            <Link href="/about" className={iconBtn} title="About" aria-current={onAbout ? "page" : undefined}>
              <Info size={16} />
              <span className="hidden lg:inline">About</span>
            </Link>
            {isServiceAdmin && (
              <Link
                href="/admin"
                className="hidden text-nb-label font-semibold text-nb-on-surface-variant hover:text-nb-on-surface sm:inline"
                title={platformRoleLabel("service_admin")}
                aria-current={onAdmin ? "page" : undefined}
              >
                Admin
              </Link>
            )}
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
                  id: "signout",
                  label: "Sign out",
                  icon: <LogOut size={14} />,
                  danger: true,
                  onSelect: () => void handleSignOut(),
                },
              ]}
              trigger={
                <span className={iconBtn} title={displayEmail || "Account"}>
                  <UserRound size={16} />
                  <span className="hidden md:inline max-w-[8rem] truncate">
                    {displayEmail?.split("@")[0] || "Account"}
                  </span>
                  <ChevronDown size={12} className="opacity-60" />
                </span>
              }
            />
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
