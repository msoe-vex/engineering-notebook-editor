import { GitHubConfig } from "@/lib/github";
import { Project } from "@/lib/db";
import { useState, useEffect } from "react";
import { BookOpen, Moon, Sun, GitBranch, Folder, HardDrive, Trash2, Clock, Plus, ArrowRight, History, Edit2, Check, X } from "lucide-react";
import { useTheme } from "next-themes";

export default function Settings({
  projects,
  onSelectProject,
  onDeleteProject,
  onRenameProject,
  onCreateGithub,
  onCreateLocal,
  onCreateTemporary,
  githubToken,
  githubUser,
  onSignOutGithub,
}: {
  projects: Project[];
  onSelectProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onCreateGithub: (config: GitHubConfig) => void;
  onCreateLocal: (handle: any) => void;
  onCreateTemporary: () => void;
  githubToken: string | null;
  githubUser: string | null;
  onSignOutGithub: () => void;
}) {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [showCreate, setShowCreate] = useState(projects.length === 0);
  const [createType, setCreateType] = useState<"github" | "local" | "memory" | null>(null);

  // Form states for GitHub
  const [repoUrl, setRepoUrl] = useState("");
  const [folderPath, setFolderPath] = useState("");

  const parseRepoUrl = (url: string) => {
    try {
      const u = new URL(url);
      if (u.hostname !== "github.com") return null;
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length < 2) return null;
      const owner = parts[0];
      let repo = parts[1];
      if (repo.endsWith(".git")) {
        repo = repo.slice(0, -4);
      }
      return { owner, repo };
    } catch {
      return null;
    }
  };

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const GITHUB_CLIENT_ID = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID;

  const handleGithubLogin = () => {
    if (!GITHUB_CLIENT_ID) {
      alert("GitHub Client ID not configured in .env.local");
      return;
    }
    // Save current state so we can return to it after redirect
    localStorage.setItem("nb-github-repo-url", repoUrl);
    localStorage.setItem("nb-github-folder", folderPath);
    localStorage.setItem("nb-create-type", "github");

    const redirectUri = window.location.origin;
    const scope = "repo";
    const url = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${redirectUri}&scope=${scope}`;
    window.location.href = url;
  };

  useEffect(() => {
    setMounted(true);
    setRepoUrl(localStorage.getItem("nb-github-repo-url") || "");
    setFolderPath(localStorage.getItem("nb-github-folder") || "");

    const savedType = localStorage.getItem("nb-create-type");
    if (savedType) {
      setCreateType(savedType as any);
      localStorage.removeItem("nb-create-type");
    }
  }, []);

  const isDarkMode = resolvedTheme === "dark";

  const handleOpenFolder = async () => {
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      onCreateLocal(handle);
    } catch (e) { console.error(e); }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-nb-bg p-6 flex flex-col items-center justify-center font-sans">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* Left Side: Brand & Actions */}
        <div className="lg:col-span-5 flex flex-col gap-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-nb-primary flex items-center justify-center shadow-2xl shadow-nb-primary/30">
              <BookOpen size={28} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-nb-on-surface">Notebook</h1>
              <p className="text-xs font-bold tracking-widest text-nb-on-surface-variant uppercase opacity-60">Engineering Editor</p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <h2 className="text-[10px] font-black tracking-[0.2em] text-nb-on-surface-variant uppercase">Create Workspace</h2>
            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={handleOpenFolder}
                className="group flex items-center gap-4 p-4 rounded-2xl bg-nb-surface border border-nb-outline-variant/30 hover:border-nb-secondary/50 hover:bg-nb-secondary/5 transition-all text-left shadow-nb-sm"
              >
                <div className="w-10 h-10 rounded-xl bg-nb-secondary/10 text-nb-secondary flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Folder size={20} />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-nb-on-surface">Local Folder</h3>
                  <p className="text-[10px] text-nb-on-surface-variant">Sync with your local filesystem</p>
                </div>
                <Plus size={16} className="text-nb-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>

              <button
                onClick={() => setCreateType(createType === "github" ? null : "github")}
                className={`group flex items-center gap-4 p-4 rounded-2xl border transition-all text-left shadow-nb-sm ${createType === "github" ? "bg-nb-primary/5 border-nb-primary/50" : "bg-nb-surface border-nb-outline-variant/30 hover:border-nb-primary/50 hover:bg-nb-primary/5"}`}
              >
                <div className="w-10 h-10 rounded-xl bg-nb-primary/10 text-nb-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                  <GitBranch size={20} />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-nb-on-surface">GitHub Repository</h3>
                  <p className="text-[10px] text-nb-on-surface-variant">Cloud backup & version control</p>
                </div>
                <Plus size={16} className={`text-nb-on-surface-variant transition-all ${createType === "github" ? "rotate-45" : "opacity-0 group-hover:opacity-100"}`} />
              </button>

              {createType === "github" && (
                <div className="p-5 rounded-2xl bg-nb-surface border border-nb-primary/20 flex flex-col gap-4 animate-in slide-in-from-top-4 duration-300">
                  {!githubToken ? (
                    <div className="text-center py-4 flex flex-col gap-4">
                      <p className="text-xs text-nb-on-surface-variant leading-relaxed">
                        To connect a repository, you first need to sign in with GitHub.
                      </p>
                      <button
                        onClick={handleGithubLogin}
                        className="w-full bg-nb-primary hover:bg-nb-primary-dim text-white py-3 rounded-xl font-bold text-xs transition-all active:scale-95 shadow-lg shadow-nb-primary/20 flex items-center justify-center gap-2"
                      >
                        <GitBranch size={16} />
                        Sign in with GitHub
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black tracking-widest text-nb-on-surface-variant uppercase ml-1">Repository URL</label>
                          <input
                            type="text"
                            autoComplete="off"
                            className="w-full bg-nb-surface-low border border-nb-outline-variant/30 p-2.5 rounded-xl text-xs outline-none focus:ring-2 focus:ring-nb-primary/30 transition-all"
                            value={repoUrl}
                            onChange={(e) => setRepoUrl(e.target.value)}
                            placeholder="https://github.com/owner/repo"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black tracking-widest text-nb-on-surface-variant uppercase ml-1">Project Folder (Optional)</label>
                          <input
                            type="text"
                            autoComplete="off"
                            className="w-full bg-nb-surface-low border border-nb-outline-variant/30 p-2.5 rounded-xl text-xs outline-none focus:ring-2 focus:ring-nb-primary/30 transition-all"
                            value={folderPath}
                            onChange={(e) => setFolderPath(e.target.value)}
                            placeholder="e.g. notebook (leave empty for root)"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2 text-[10px] text-nb-primary font-bold">
                          <Check size={12} />
                          Signed in as {githubUser || "GitHub User"}
                        </div>
                        <button
                          onClick={onSignOutGithub}
                          className="text-[9px] font-bold text-nb-on-surface-variant hover:text-red-500 transition-colors uppercase tracking-widest"
                        >
                          Sign Out
                        </button>
                      </div>
                      <button
                        onClick={async () => {
                          const parsed = parseRepoUrl(repoUrl);
                          if (!parsed) {
                            alert("Invalid Repository URL. Please use the format: https://github.com/owner/repo");
                            return;
                          }
                          
                          try {
                            // Fetch repo info to get the default branch
                            const res = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, {
                              headers: { "Authorization": `token ${githubToken}` }
                            });
                            if (!res.ok) throw new Error("Repository not found");
                            const repoInfo = await res.json();
                            const branch = repoInfo.default_branch || "main";

                            localStorage.setItem("nb-github-repo-url", repoUrl);
                            localStorage.setItem("nb-github-folder", folderPath);
                            
                            const base = folderPath.trim();
                            const prefix = base ? (base.endsWith('/') ? base : base + '/') : "";

                            onCreateGithub({ 
                              token: githubToken!, 
                              owner: parsed.owner, 
                              repo: parsed.repo, 
                              branch,
                              baseDir: base,
                              entriesDir: `${prefix}data/entries`, 
                              resourcesDir: `${prefix}data/assets` 
                            });
                          } catch (e) {
                            console.error(e);
                            alert("Failed to connect: Make sure the repository exists and you have access.");
                          }
                        }}
                        className="w-full bg-nb-primary hover:bg-nb-primary-dim text-white py-3 rounded-xl font-bold text-xs transition-all active:scale-95 shadow-lg shadow-nb-primary/20"
                      >
                        Connect Repository
                      </button>
                    </>
                  )}
                </div>
              )}

              <button
                onClick={onCreateTemporary}
                className="group flex items-center gap-4 p-4 rounded-2xl bg-nb-surface border border-nb-outline-variant/30 hover:border-nb-tertiary/50 hover:bg-nb-tertiary/5 transition-all text-left shadow-nb-sm"
              >
                <div className="w-10 h-10 rounded-xl bg-nb-tertiary/10 text-nb-tertiary flex items-center justify-center group-hover:scale-110 transition-transform">
                  <HardDrive size={20} />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-nb-on-surface">Temporary Workspace</h3>
                  <p className="text-[10px] text-nb-on-surface-variant">In browser only. Lost on reload.</p>
                </div>
                <Plus size={16} className="text-nb-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>
          </div>

          <button
            onClick={() => setTheme(isDarkMode ? "light" : "dark")}
            className="flex items-center gap-3 text-[10px] font-bold tracking-widest text-nb-on-surface-variant hover:text-nb-primary transition-colors uppercase mt-4"
          >
            {isDarkMode ? <Sun size={14} /> : <Moon size={14} />}
            <span>Switch to {isDarkMode ? "Light" : "Dark"} Mode</span>
          </button>
        </div>

        {/* Right Side: Recent Projects */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-black tracking-[0.2em] text-nb-on-surface-variant uppercase">Recent Projects</h2>
            <div className="h-px flex-1 bg-nb-outline-variant/30 mx-4" />
            <span className="text-[10px] font-bold text-nb-on-surface-variant/40">{projects.length} Found</span>
          </div>

          <div className="grid grid-cols-1 gap-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
            {projects.sort((a, b) => new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime()).map(project => (
              <div
                key={project.id}
                className="group relative flex items-center gap-4 p-4 rounded-2xl bg-nb-surface border border-nb-outline-variant/30 hover:border-nb-primary/30 hover:shadow-nb-lg transition-all"
              >
                <div
                  className="flex-1 cursor-pointer flex items-center gap-4"
                  onClick={() => onSelectProject(project.id)}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 ${project.type === "github" ? "bg-nb-primary/10 text-nb-primary" :
                      project.type === "local" ? "bg-nb-secondary/10 text-nb-secondary" :
                        "bg-nb-tertiary/10 text-nb-tertiary"
                    }`}>
                    {project.type === "github" ? <GitBranch size={22} /> :
                      project.type === "local" ? <Folder size={22} /> :
                        <HardDrive size={22} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    {renamingId === project.id ? (
                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <input
                          autoFocus
                          type="text"
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { onRenameProject(project.id, renameValue); setRenamingId(null); }
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          className="flex-1 bg-nb-surface-low border border-nb-primary/30 px-3 py-1 rounded-lg text-sm font-bold text-nb-on-surface outline-none focus:ring-2 focus:ring-nb-primary/30"
                        />
                        <button onClick={() => { onRenameProject(project.id, renameValue); setRenamingId(null); }} className="p-1.5 rounded-lg bg-nb-primary text-white hover:bg-nb-primary-dim transition-colors"><Check size={14} /></button>
                        <button onClick={() => setRenamingId(null)} className="p-1.5 rounded-lg bg-nb-surface-low text-nb-on-surface-variant hover:bg-nb-surface-high transition-colors"><X size={14} /></button>
                      </div>
                    ) : (
                      <>
                        <h3 className="text-sm font-bold text-nb-on-surface truncate">{project.name}</h3>
                        <div className="flex items-center gap-3 mt-1">
                          <div className="flex items-center gap-1.5 text-[9px] font-medium text-nb-on-surface-variant uppercase tracking-wider">
                            <Clock size={10} />
                            {new Date(project.lastOpened).toLocaleDateString()}
                          </div>
                          <div className="w-1 h-1 rounded-full bg-nb-outline-variant/50" />
                          <span className="text-[9px] font-black text-nb-on-surface-variant/40 uppercase tracking-widest italic">{project.type}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!renamingId && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setRenamingId(project.id); setRenameValue(project.name); }}
                      className="p-2.5 rounded-xl text-nb-on-surface-variant hover:text-nb-primary hover:bg-nb-primary/5 transition-all"
                      title="Rename Project"
                    >
                      <Edit2 size={16} />
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteProject(project.id); }}
                    className="p-2.5 rounded-xl text-nb-on-surface-variant hover:text-red-500 hover:bg-red-50 transition-all"
                    title="Remove Project"
                  >
                    <Trash2 size={16} />
                  </button>
                  <button
                    onClick={() => onSelectProject(project.id)}
                    className="p-2.5 rounded-xl bg-nb-surface-low text-nb-primary border border-nb-outline-variant/30 hover:bg-nb-primary hover:text-white transition-all shadow-sm"
                  >
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            ))}

            {projects.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-nb-outline-variant/30 rounded-3xl opacity-40">
                <History size={48} className="mb-4" />
                <p className="text-sm font-bold text-nb-on-surface">No projects yet</p>
                <p className="text-xs">Create one to get started</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
