import { GitHubConfig, initiateGitHubLogin } from "@/lib/github";
import { Project, getProjectDBName, getAllPending } from "@/lib/db";
import { GITHUB_ISSUES_URL } from "@/lib/constants";
import React, { useState, useEffect } from "react";
import {
    BookOpen, Moon, Sun, GitBranch, Folder, HardDrive, Trash2, Clock, Plus,
    ArrowRight, History, Edit2, Check, X, AlertCircle, FolderGit, HelpCircle, MoreVertical
} from "lucide-react";
import { useTheme } from "next-themes";
import GitHubConnectionDialog from "./GitHubConnectionDialog";


interface HomeProps {
    projects: Project[];
    onSelectProject: (id: string) => void;
    onDeleteProject: (id: string) => void;
    onRenameProject: (id: string, name: string) => void;
    onCreateGithub: (config: GitHubConfig) => void;
    onCreateLocal: (handle: FileSystemDirectoryHandle) => void;
    onCreateTemporary: () => void;
    githubToken: string | null;
    githubUser: string | null;
    onSignOutGithub: () => void;
    isExchangingGithubCode?: boolean;
    autoOpenGithubModal?: boolean;
    onCloseGithubModal?: () => void;
    onOpenHelp: () => void;
    pendingCounts?: Record<string, number>;
}




export default function Home({
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
    isExchangingGithubCode = false,
    autoOpenGithubModal = false,
    onCloseGithubModal,
    onOpenHelp,
}: HomeProps) {
    const { setTheme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});

    // Form states for GitHub
    const [isGithubModalOpen, setIsGithubModalOpen] = useState(autoOpenGithubModal);



    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

    const GITHUB_CLIENT_ID = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID;

    const handleGithubLogin = () => {
        // Save current state so we can return to it after redirect
        localStorage.setItem("nb-create-type", "github");
        initiateGitHubLogin(GITHUB_CLIENT_ID, window.location.origin, window.location.search);
    };

    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            setMounted(true);
            const savedType = localStorage.getItem("nb-create-type");
            if (savedType === "github") {
                setIsGithubModalOpen(true);
                localStorage.removeItem("nb-create-type");
            }
        });
        return () => cancelAnimationFrame(frame);
    }, []);

    useEffect(() => {
        if (autoOpenGithubModal) {
            requestAnimationFrame(() => setIsGithubModalOpen(true));
        }
    }, [autoOpenGithubModal]);

    useEffect(() => {
        let cancelled = false;

        const loadPendingCounts = async () => {
            const counts = await Promise.all(
                projects.map(async (project) => {
                    try {
                        const pending = await getAllPending(getProjectDBName(project));
                        return [project.id, pending.length] as const;
                    } catch {
                        return [project.id, 0] as const;
                    }
                })
            );

            if (!cancelled) {
                setPendingCounts(Object.fromEntries(counts));
            }
        };

        void loadPendingCounts();

        return () => {
            cancelled = true;
        };
    }, [projects]);

    const isDarkMode = resolvedTheme === "dark";

    const handleOpenFolder = async () => {
        try {
            const handle = await window.showDirectoryPicker({ mode: "readwrite" });
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
                                className="group flex items-center gap-4 p-4 rounded-2xl bg-nb-surface border border-nb-outline-variant/30 hover:border-nb-primary/50 hover:bg-nb-primary/5 transition-all text-left shadow-nb-sm cursor-pointer"
                            >
                                <div className="w-10 h-10 rounded-xl bg-nb-primary/10 text-nb-primary flex items-center justify-center group-hover:scale-110 transition-transform">
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
                                className="group flex items-center gap-4 p-4 rounded-2xl border transition-all text-left shadow-nb-sm bg-nb-surface border-nb-outline-variant/30 hover:border-nb-tertiary/50 hover:bg-nb-tertiary/5 cursor-pointer"
                            >
                                <div className="w-10 h-10 rounded-xl bg-nb-tertiary/10 text-nb-tertiary flex items-center justify-center group-hover:scale-110 transition-transform">
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
                                className="group flex items-center gap-4 p-4 rounded-2xl bg-nb-surface border border-nb-outline-variant/30 hover:border-nb-on-surface-variant/30 hover:bg-nb-on-surface-variant/5 transition-all text-left shadow-nb-sm cursor-pointer"
                            >
                                <div className="w-10 h-10 rounded-xl bg-nb-on-surface-variant/10 text-nb-on-surface-variant flex items-center justify-center group-hover:scale-110 transition-transform">
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

                    <div className="grid grid-cols-1 gap-3 pr-2">
                        {[...projects].sort((a, b) => new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime()).map(project => (
                            <div
                                key={project.id}
                                className="group relative flex items-center gap-4 p-4 rounded-2xl bg-nb-surface border border-nb-outline-variant/30 hover:border-nb-primary/30 hover:shadow-nb-lg transition-all"
                            >
                                <div
                                    className="flex-1 min-w-0 cursor-pointer flex items-center gap-4"
                                    onClick={() => onSelectProject(project.id)}
                                >
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 ${project.type === "local" ? "bg-nb-primary/10 text-nb-primary" :
                                        project.type === "github" ? "bg-nb-tertiary/10 text-nb-tertiary" :
                                            "bg-nb-on-surface-variant/10 text-nb-on-surface-variant"
                                        }`}>
                                        {project.type === "github" ? <GitBranch size={22} /> :
                                            project.type === "local" ? <Folder size={22} /> :
                                                <HardDrive size={22} />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        {renamingId === project.id ? (
                                            <div className="flex items-center gap-2 w-full" onClick={e => e.stopPropagation()}>
                                                <input
                                                    autoFocus
                                                    type="text"
                                                    value={renameValue}
                                                    onChange={e => setRenameValue(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') { onRenameProject(project.id, renameValue); setRenamingId(null); }
                                                        if (e.key === 'Escape') setRenamingId(null);
                                                    }}
                                                    className="flex-1 min-w-0 bg-nb-surface-low border border-nb-primary/30 px-3 py-1 rounded-lg text-sm font-bold text-nb-on-surface outline-none focus:ring-2 focus:ring-nb-primary/30"
                                                />
                                                <button onClick={() => { onRenameProject(project.id, renameValue); setRenamingId(null); }} className="shrink-0 p-1.5 rounded-lg bg-nb-primary text-white hover:bg-nb-primary-dim transition-colors cursor-pointer"><Check size={14} /></button>
                                                <button onClick={() => setRenamingId(null)} className="shrink-0 p-1.5 rounded-lg bg-nb-surface-low text-nb-on-surface-variant hover:bg-nb-surface-high transition-colors cursor-pointer"><X size={14} /></button>
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
                                                    {pendingCounts[project.id] > 0 && (
                                                        <>
                                                            <div className="w-1 h-1 rounded-full bg-nb-outline-variant/50" />
                                                            <div className="flex items-center gap-1.5">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-nb-tertiary animate-pulse" />
                                                                <span className="text-[9px] font-black text-nb-tertiary tracking-widest uppercase">{pendingCounts[project.id]} Pending</span>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div className="relative">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === project.id ? null : project.id); }}
                                        className={`p-2.5 rounded-xl transition-all cursor-pointer ${menuOpenId === project.id ? "bg-nb-primary/10 text-nb-primary" : "text-nb-on-surface-variant hover:text-nb-on-surface hover:bg-nb-surface-mid"}`}
                                    >
                                        <MoreVertical size={18} />
                                    </button>

                                    {menuOpenId === project.id && (
                                        <>
                                            <div className="fixed inset-0 z-[100]" onClick={() => setMenuOpenId(null)} />
                                            <div className="absolute right-0 top-full mt-2 w-48 bg-nb-surface border border-nb-outline-variant/30 rounded-2xl shadow-nb-xl z-[101] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                                <div className="p-1.5 flex flex-col gap-1">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onSelectProject(project.id); setMenuOpenId(null); }}
                                                        className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-nb-on-surface hover:bg-nb-primary hover:text-white transition-all cursor-pointer"
                                                    >
                                                        <ArrowRight size={14} />
                                                        Open Project
                                                    </button>

                                                    {!renamingId && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setRenamingId(project.id); setRenameValue(project.name); setMenuOpenId(null); }}
                                                            className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-nb-on-surface hover:bg-nb-surface-mid transition-all cursor-pointer"
                                                        >
                                                            <Edit2 size={14} />
                                                            Rename
                                                        </button>
                                                    )}

                                                    {project.type === "github" && project.githubConfig && (
                                                        <a
                                                            href={`https://github.com/${project.githubConfig.owner}/${project.githubConfig.repo}/tree/${project.githubConfig.branch}${project.githubConfig.folderPath ? '/' + project.githubConfig.folderPath : ''}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-nb-on-surface hover:bg-nb-surface-mid transition-all cursor-pointer"
                                                        >
                                                            <FolderGit size={14} />
                                                            View on GitHub
                                                        </a>
                                                    )}

                                                    <div className="h-px bg-nb-outline-variant/20 my-1" />

                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onDeleteProject(project.id); setMenuOpenId(null); }}
                                                        className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-red-500 hover:bg-red-50 transition-all cursor-pointer"
                                                    >
                                                        <Trash2 size={14} />
                                                        Remove Project
                                                    </button>
                                                </div>
                                            </div>
                                        </>
                                    )}
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

            <GitHubConnectionDialog
                isOpen={isGithubModalOpen}
                onClose={() => { setIsGithubModalOpen(false); onCloseGithubModal?.(); }}
                mode="setup"
                githubToken={githubToken}
                githubUser={githubUser}
                onLogin={handleGithubLogin}
                onSignOut={onSignOutGithub}
                onConnect={onCreateGithub}
                isExchangingCode={isExchangingGithubCode}
                projects={projects}
            />
            {/* Footer */}
            <div className="w-full max-w-4xl mt-12 flex items-center justify-center gap-4 border-t border-nb-outline-variant/20 pt-8">
                <button
                    onClick={onOpenHelp}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-nb-surface border border-nb-outline-variant/30 text-[10px] font-black uppercase tracking-widest text-nb-on-surface-variant hover:text-nb-primary hover:border-nb-primary/50 transition-all shadow-nb-sm cursor-pointer"
                >
                    <HelpCircle size={14} />
                    Help & Guide
                </button>
                <a
                    href={GITHUB_ISSUES_URL}
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
