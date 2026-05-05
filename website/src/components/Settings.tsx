import { GitHubConfig, fetchUserRepositories, getOctokit, fetchRepoFolders } from "@/lib/github";
import { Project } from "@/lib/db";
import React, { useState, useEffect, useMemo } from "react";
import { BookOpen, Moon, Sun, GitBranch, Folder, HardDrive, Trash2, Clock, Plus, ArrowRight, History, Edit2, Check, X, Search, ExternalLink, AlertCircle, Loader2 } from "lucide-react";
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
  const [isGithubModalOpen, setIsGithubModalOpen] = useState(false);
  const [userRepos, setUserRepos] = useState<any[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [availableFolders, setAvailableFolders] = useState<any[]>([]);
  const [browsingPath, setBrowsingPath] = useState("");
  const [repoSearch, setRepoSearch] = useState("");
  const [showExplorer, setShowExplorer] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<{ owner: string, repo: string, default_branch: string } | null>(null);

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
      if (savedType === "github") {
        setIsGithubModalOpen(true);
      } else {
        setCreateType(savedType as any);
      }
      localStorage.removeItem("nb-create-type");
    }
  }, []);

  useEffect(() => {
    if (githubToken && isGithubModalOpen) {
      setIsLoadingRepos(true);
      fetchUserRepositories(githubToken).then(repos => {
        setUserRepos(repos);

        // If repoUrl was saved, try to find it in the fetched repos
        const savedUrl = localStorage.getItem("nb-github-repo-url");
        if (savedUrl) {
          const parsed = parseRepoUrl(savedUrl);
          if (parsed) {
            const found = repos.find((r: any) => r.owner.login === parsed.owner && r.name === parsed.repo);
            if (found) {
              setSelectedRepo({ owner: found.owner.login, repo: found.name, default_branch: found.default_branch });
            }
          }
        }
      }).catch(e => console.error("Failed to fetch GitHub data", e))
        .finally(() => setIsLoadingRepos(false));
    }
  }, [githubToken, isGithubModalOpen]);

  useEffect(() => {
    if (githubToken && selectedRepo) {
      setIsLoadingFolders(true);
      fetchRepoFolders(githubToken, selectedRepo.owner, selectedRepo.repo, browsingPath)
        .then(folders => setAvailableFolders(folders))
        .catch(e => console.error("Failed to fetch folders", e))
        .finally(() => setIsLoadingFolders(false));
    } else {
      setAvailableFolders([]);
    }
  }, [githubToken, selectedRepo, browsingPath]);

  const filteredRepos = useMemo(() => {
    if (!repoSearch) return userRepos;
    return userRepos.filter(r => r.full_name.toLowerCase().includes(repoSearch.toLowerCase()));
  }, [userRepos, repoSearch]);

  const isDarkMode = resolvedTheme === "dark";

  const handleOpenFolder = async () => {
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      onCreateLocal(handle);
    } catch (e) { console.error(e); }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-nb-bg p-6 pt-12 pb-24 lg:pt-24 lg:pb-32 flex flex-col items-center font-sans">
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
                className="group flex items-center gap-4 p-4 rounded-2xl bg-nb-surface border border-nb-outline-variant/30 hover:border-nb-secondary/50 hover:bg-nb-secondary/5 transition-all text-left shadow-nb-sm cursor-pointer"
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
                onClick={() => setIsGithubModalOpen(true)}
                className={`group flex items-center gap-4 p-4 rounded-2xl border transition-all text-left shadow-nb-sm bg-nb-surface border-nb-outline-variant/30 hover:border-nb-primary/50 hover:bg-nb-primary/5 cursor-pointer`}
              >
                <div className="w-10 h-10 rounded-xl bg-nb-primary/10 text-nb-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                  <GitBranch size={20} />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-nb-on-surface">GitHub Repository</h3>
                  <p className="text-[10px] text-nb-on-surface-variant">Cloud backup & version control</p>
                </div>
                <Plus size={16} className="text-nb-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>

              {/* Removed inline github form */}

              <button
                onClick={onCreateTemporary}
                className="group flex items-center gap-4 p-4 rounded-2xl bg-nb-surface border border-nb-outline-variant/30 hover:border-nb-tertiary/50 hover:bg-nb-tertiary/5 transition-all text-left shadow-nb-sm cursor-pointer"
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
            className="flex items-center gap-3 text-[10px] font-bold tracking-widest text-nb-on-surface-variant hover:text-nb-primary transition-colors uppercase mt-4 cursor-pointer"
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
                  className="flex-1 min-w-0 cursor-pointer flex items-center gap-4"
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
                          <span className="text-[9px] font-black text-nb-on-surface-variant/40 tracking-widest italic">{project.type === "github" ? "GitHub" : project.type === "local" ? "Local" : "Temporary"}</span>
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

      {/* GitHub Modal */}
      {isGithubModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-nb-bg/80 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setIsGithubModalOpen(false)} />
          <div className="relative w-full max-w-xl bg-nb-surface border border-nb-outline-variant/30 rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-300 flex flex-col max-h-[90vh]">

            <div className="p-8 pb-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-nb-primary/10 text-nb-primary flex items-center justify-center">
                  <GitBranch size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-nb-on-surface">Connect GitHub</h2>
                  <p className="text-xs text-nb-on-surface-variant font-medium">Link a repository to your workspace</p>
                </div>
              </div>
              <button onClick={() => setIsGithubModalOpen(false)} className="p-2 rounded-xl hover:bg-nb-surface-low text-nb-on-surface-variant transition-colors cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <div className="px-8 flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">
              {!githubToken ? (
                <div className="flex flex-col items-center justify-center py-12 text-center gap-6">
                  <div className="w-16 h-16 rounded-3xl bg-nb-surface-low border border-nb-outline-variant/30 flex items-center justify-center text-nb-on-surface-variant/40">
                    <GitBranch size={32} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-bold text-nb-on-surface">Sign in Required</h3>
                    <p className="text-xs text-nb-on-surface-variant max-w-[280px]">
                      Authenticate with GitHub to discover your repositories and enable cloud synchronization.
                    </p>
                  </div>
                  <button
                    onClick={handleGithubLogin}
                    className="bg-nb-primary hover:bg-nb-primary-dim text-white px-8 py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-95 shadow-lg shadow-nb-primary/20 flex items-center gap-2 cursor-pointer"
                  >
                    <GitBranch size={18} />
                    Sign in with GitHub
                  </button>
                </div>
              ) : (
                <>
                  {/* Status Bar */}
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-nb-surface-low border border-nb-outline-variant/20">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-nb-primary text-white flex items-center justify-center font-bold text-[9px]">
                        {githubUser?.[0]?.toUpperCase() || "U"}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[11px] font-black text-nb-on-surface leading-none tracking-tight">{githubUser || "GitHub User"}</span>
                        <span className="text-[8px] text-nb-primary font-black uppercase tracking-wider">Authorized</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <a
                        href="https://github.com/settings/installations"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[9px] font-black text-nb-on-surface-variant hover:text-nb-primary transition-colors uppercase tracking-[0.1em] flex items-center gap-1"
                      >
                        Permissions <ExternalLink size={10} />
                      </a>
                      <button
                        onClick={onSignOutGithub}
                        className="text-[9px] font-black text-nb-on-surface-variant hover:text-red-500 transition-colors uppercase tracking-[0.1em] cursor-pointer"
                      >
                        Sign Out
                      </button>
                    </div>
                  </div>



                  {/* Form */}
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black tracking-[0.15em] text-nb-on-surface-variant uppercase ml-1">Select Repository</label>
                      <div className="space-y-2">
                        <div className="relative">
                          <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-nb-on-surface-variant/40" />
                          <input
                            type="text"
                            placeholder="Search your repositories..."
                            className="w-full bg-nb-surface-low border border-nb-outline-variant/30 pl-10 pr-4 py-3 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-nb-primary/30 transition-all"
                            value={repoSearch}
                            onChange={(e) => setRepoSearch(e.target.value)}
                          />
                        </div>
                        <div className="max-h-[140px] overflow-y-auto custom-scrollbar bg-nb-surface-low border border-nb-outline-variant/20 rounded-2xl p-1">
                          {isLoadingRepos ? (
                            <div className="py-6 flex items-center justify-center">
                              <Loader2 size={18} className="text-nb-primary animate-spin" />
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 gap-0.5">
                              {filteredRepos.length === 0 ? (
                                <div className="py-6 text-center text-[9px] text-nb-on-surface-variant font-black uppercase tracking-widest opacity-40">No repositories</div>
                              ) : (
                                filteredRepos.map(repo => (
                                  <button
                                    key={repo.id}
                                    onClick={() => {
                                      setSelectedRepo({ owner: repo.owner.login, repo: repo.name, default_branch: repo.default_branch });
                                      setBrowsingPath("");
                                      setFolderPath("");
                                    }}
                                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl transition-all text-left cursor-pointer ${selectedRepo?.repo === repo.name && selectedRepo?.owner === repo.owner.login ? "bg-nb-primary text-white shadow-lg shadow-nb-primary/20" : "hover:bg-nb-surface-mid text-nb-on-surface"}`}
                                  >
                                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${selectedRepo?.repo === repo.name && selectedRepo?.owner === repo.owner.login ? "bg-white/20" : "bg-nb-surface-low border border-nb-outline-variant/20"}`}>
                                      <GitBranch size={12} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <span className="text-[11px] font-bold truncate block">{repo.name}</span>
                                      <span className={`text-[8px] block truncate uppercase tracking-wider font-black opacity-60 ${selectedRepo?.repo === repo.name && selectedRepo?.owner === repo.owner.login ? "text-white" : "text-nb-on-surface-variant"}`}>{repo.owner.login}</span>
                                    </div>
                                    {selectedRepo?.repo === repo.name && selectedRepo?.owner === repo.owner.login && <Check size={12} className="shrink-0" />}
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {selectedRepo && (
                      <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black tracking-[0.15em] text-nb-on-surface-variant uppercase ml-1">Project Folder</label>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <Folder size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-nb-on-surface-variant/40" />
                              <input
                                type="text"
                                value={folderPath}
                                onChange={(e) => setFolderPath(e.target.value)}
                                placeholder="e.g. notebook (leave empty for root)"
                                className="w-full bg-nb-surface-low border border-nb-outline-variant/30 pl-10 pr-4 py-3 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-nb-primary/30 transition-all"
                              />
                            </div>
                            <button
                              onClick={() => setShowExplorer(!showExplorer)}
                              className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${showExplorer ? "bg-nb-primary text-white" : "bg-nb-surface-low border border-nb-outline-variant/30 text-nb-on-surface-variant hover:border-nb-primary/50"}`}
                              title="Browse Repository"
                            >
                              <Search size={18} />
                            </button>
                          </div>
                        </div>

                        {showExplorer && (
                          <div className="bg-nb-surface-low border border-nb-outline-variant/30 rounded-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
                            {/* Breadcrumbs */}
                            <div className="px-4 py-2 bg-nb-surface-low border-b border-nb-outline-variant/20 flex items-center gap-2 overflow-x-auto no-scrollbar">
                              <button
                                onClick={() => setBrowsingPath("")}
                                className={`text-[10px] font-black hover:text-nb-primary transition-colors shrink-0 uppercase tracking-widest ${browsingPath === "" ? "text-nb-primary" : "text-nb-on-surface-variant/40"}`}
                              >
                                ROOT
                              </button>
                              {browsingPath.split("/").filter(Boolean).map((part, i, arr) => (
                                <React.Fragment key={i}>
                                  <span className="text-[10px] text-nb-on-surface-variant/20">/</span>
                                  <button
                                    onClick={() => setBrowsingPath(arr.slice(0, i + 1).join("/"))}
                                    className={`text-[10px] font-black hover:text-nb-primary transition-colors shrink-0 uppercase tracking-widest ${i === arr.length - 1 ? "text-nb-primary" : "text-nb-on-surface-variant/40"}`}
                                  >
                                    {part}
                                  </button>
                                </React.Fragment>
                              ))}
                            </div>

                            {/* Folder List */}
                            <div className="max-h-[140px] overflow-y-auto custom-scrollbar p-1">
                              {isLoadingFolders ? (
                                <div className="flex items-center justify-center py-8">
                                  <Loader2 size={18} className="text-nb-primary animate-spin" />
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 gap-0.5">
                                  {availableFolders.length === 0 ? (
                                    <div className="py-8 text-center text-[9px] font-black uppercase tracking-widest text-nb-on-surface-variant/40">Empty</div>
                                  ) : (
                                    availableFolders.map(folder => (
                                      <button
                                        key={folder.path}
                                        onClick={() => setFolderPath(folder.path)}
                                        onDoubleClick={() => {
                                          setBrowsingPath(folder.path);
                                          setFolderPath(folder.path);
                                        }}
                                        className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl transition-all text-left group cursor-pointer ${folderPath === folder.path ? "bg-nb-primary/10 text-nb-primary" : "hover:bg-nb-surface-mid text-nb-on-surface"}`}
                                      >
                                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors ${folderPath === folder.path ? "bg-nb-primary/20" : "bg-nb-surface-low border border-nb-outline-variant/20 group-hover:border-nb-primary/30"}`}>
                                          <Folder size={12} />
                                        </div>
                                        <span className="text-[11px] font-bold truncate flex-1">{folder.name}</span>
                                        <div className="flex items-center gap-2">
                                          {folderPath === folder.path && <Check size={12} className="text-nb-primary" />}
                                          <ArrowRight size={12} className="text-nb-on-surface-variant opacity-0 group-hover:opacity-100 transition-all -translate-x-1 group-hover:translate-x-0" />
                                        </div>
                                      </button>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Summary */}
                        <div className="p-3.5 rounded-2xl bg-nb-surface-low border border-nb-outline-variant/10 flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-xl bg-nb-primary/10 text-nb-primary flex items-center justify-center shrink-0">
                              <HardDrive size={16} />
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="text-[8px] font-black uppercase tracking-[0.2em] text-nb-on-surface-variant/60">Target Workspace</span>
                              <span className="text-[11px] font-mono font-bold text-nb-on-surface truncate">
                                {selectedRepo.owner}/{selectedRepo.repo}<span className="text-nb-primary/40">/</span>{folderPath}
                              </span>
                            </div>
                          </div>
                          <Check size={16} className={folderPath ? "text-nb-primary" : "text-nb-on-surface-variant/20"} />
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    disabled={!selectedRepo}
                    onClick={async () => {
                      if (!selectedRepo) return;

                      const fullUrl = `https://github.com/${selectedRepo.owner}/${selectedRepo.repo}`;

                      try {
                        setIsLoadingRepos(true);

                        localStorage.setItem("nb-github-repo-url", fullUrl);
                        localStorage.setItem("nb-github-folder", folderPath);

                        const base = folderPath.trim();
                        const prefix = base ? (base.endsWith('/') ? base : base + '/') : "";

                        onCreateGithub({
                          token: githubToken!,
                          owner: selectedRepo.owner,
                          repo: selectedRepo.repo,
                          branch: selectedRepo.default_branch,
                          baseDir: base,
                          entriesDir: `${prefix}data/entries`,
                          resourcesDir: `${prefix}data/assets`
                        });
                        setIsGithubModalOpen(false);
                      } catch (e: any) {
                        console.error(e);
                        alert(`Failed to connect: ${e.message}`);
                      } finally {
                        setIsLoadingRepos(false);
                      }
                    }}
                    className="w-full bg-nb-primary hover:bg-nb-primary-dim disabled:opacity-50 disabled:hover:bg-nb-primary text-white py-4 rounded-2xl font-bold text-sm transition-all active:scale-95 shadow-lg shadow-nb-primary/20 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isLoadingRepos ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                    Connect Repository
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Footer */}
      <div className="w-full max-w-4xl mt-12 flex items-center justify-center border-t border-nb-outline-variant/20 pt-8">
        <a
          href="https://github.com/msoe-vex/engineering-notebook-editor/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-nb-surface border border-nb-outline-variant/30 text-[10px] font-black uppercase tracking-widest text-nb-on-surface-variant hover:text-nb-primary hover:border-nb-primary/50 transition-all shadow-nb-sm"
        >
          <AlertCircle size={14} />
          Report Issue
        </a>
      </div>
    </div>
  );
}
