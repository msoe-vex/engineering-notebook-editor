"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CloudShell } from "@/components/cloud/CloudShell";
import {
  cloudApi,
  type InviteSummary,
  type MemberSummary,
  type OrgSummary,
} from "@/lib/cloud/api";

export default function OrgNotebooksPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = String(params.orgId);
  const [org, setOrg] = useState<OrgSummary | null>(null);
  const [notebooks, setNotebooks] = useState<Array<{ id: string; name: string }>>([]);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [invites, setInvites] = useState<InviteSummary[]>([]);
  const [name, setName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [addUid, setAddUid] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      void (async () => {
        try {
          const [o, n, m] = await Promise.all([
            cloudApi.getOrg(orgId),
            cloudApi.listNotebooks(orgId),
            cloudApi.listMembers(orgId),
          ]);
          let inv: InviteSummary[] = [];
          try {
            inv = await cloudApi.listInvites(orgId);
          } catch {
            inv = [];
          }
          if (cancelled) return;
          setOrg(o);
          setNotebooks(n);
          setMembers(m);
          setInvites(inv);
          setError(null);
        } catch (err) {
          if (!cancelled) setError((err as Error).message);
        }
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [orgId, reloadToken]);

  function refresh() {
    setReloadToken((n) => n + 1);
  }

  return (
    <CloudShell title={org?.name || "Notebooks"}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-neutral-500 underline">
            Organizations
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{org?.name || "Notebooks"}</h1>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
            onClick={() => {
              const next = window.prompt("Rename organization", org?.name || "");
              if (!next?.trim()) return;
              void cloudApi
                .patchOrg(orgId, { name: next.trim() })
                .then(refresh)
                .catch((err) => setError((err as Error).message));
            }}
          >
            Rename org
          </button>
          <button
            className="rounded border border-red-300 px-3 py-2 text-sm text-red-700"
            onClick={() => {
              if (!window.confirm("Delete this organization and all notebooks?")) return;
              void cloudApi
                .deleteOrg(orgId)
                .then(() => router.push("/"))
                .catch((err) => setError((err as Error).message));
            }}
          >
            Delete org
          </button>
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        <input
          className="flex-1 rounded border border-neutral-300 px-3 py-2"
          placeholder="Notebook name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="rounded bg-neutral-900 px-4 py-2 text-sm text-white"
          onClick={() => {
            void cloudApi
              .createNotebook(orgId, name.trim() || "Competition Notebook")
              .then(() => {
                setName("");
                refresh();
              })
              .catch((err) => setError((err as Error).message));
          }}
        >
          Create notebook
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <ul className="mt-8 divide-y divide-neutral-200 rounded border border-neutral-200 bg-white">
        {notebooks.map((nb) => (
          <li key={nb.id} className="flex items-center gap-2 px-4 py-3 hover:bg-neutral-50">
            <Link
              href={`/orgs/${orgId}/notebooks/${nb.id}`}
              className="flex-1 font-medium"
            >
              {nb.name}
            </Link>
            <button
              className="text-xs text-neutral-500 underline"
              onClick={() => {
                const next = window.prompt("Rename notebook", nb.name);
                if (!next?.trim()) return;
                void cloudApi
                  .patchNotebook(orgId, nb.id, { name: next.trim() })
                  .then(refresh)
                  .catch((err) => setError((err as Error).message));
              }}
            >
              Rename
            </button>
            <button
              className="text-xs text-red-600 underline"
              onClick={() => {
                if (!window.confirm(`Delete notebook “${nb.name}”?`)) return;
                void cloudApi
                  .deleteNotebook(orgId, nb.id)
                  .then(refresh)
                  .catch((err) => setError((err as Error).message));
              }}
            >
              Delete
            </button>
          </li>
        ))}
        {!notebooks.length && (
          <li className="px-4 py-6 text-sm text-neutral-500">No notebooks yet.</li>
        )}
      </ul>

      <h2 className="mt-10 text-lg font-medium">Members</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          className="min-w-[12rem] flex-1 rounded border border-neutral-300 px-3 py-2 text-sm"
          placeholder="Add member by uid"
          value={addUid}
          onChange={(e) => setAddUid(e.target.value)}
        />
        <button
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
          onClick={() => {
            const uid = addUid.trim();
            if (!uid) return;
            void cloudApi
              .addMember(orgId, { uid, role: "member" })
              .then(() => {
                setAddUid("");
                refresh();
              })
              .catch((err) => setError((err as Error).message));
          }}
        >
          Add member
        </button>
      </div>
      <ul className="mt-3 divide-y divide-neutral-200 rounded border border-neutral-200 bg-white text-sm">
        {members.map((m) => (
          <li key={m.uid} className="flex flex-wrap items-center gap-2 px-4 py-2">
            <span className="flex-1">
              {m.email || m.uid} — <span className="text-neutral-500">{m.role}</span>
            </span>
            {m.role !== "owner" && (
              <>
                <select
                  className="rounded border border-neutral-300 px-2 py-1 text-xs"
                  value={m.role}
                  onChange={(e) => {
                    void cloudApi
                      .patchMember(orgId, m.uid, { role: e.target.value })
                      .then(refresh)
                      .catch((err) => setError((err as Error).message));
                  }}
                >
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                </select>
                <button
                  className="text-xs text-red-600 underline"
                  onClick={() => {
                    if (!window.confirm(`Remove ${m.email || m.uid}?`)) return;
                    void cloudApi
                      .removeMember(orgId, m.uid)
                      .then(refresh)
                      .catch((err) => setError((err as Error).message));
                  }}
                >
                  Remove
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      <h2 className="mt-10 text-lg font-medium">Invites</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          className="min-w-[12rem] flex-1 rounded border border-neutral-300 px-3 py-2 text-sm"
          placeholder="Invite email"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
        />
        <select
          className="rounded border border-neutral-300 px-2 py-2 text-sm"
          value={inviteRole}
          onChange={(e) => setInviteRole(e.target.value as "member" | "admin")}
        >
          <option value="member">member</option>
          <option value="admin">admin</option>
        </select>
        <button
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
          onClick={() => {
            const email = inviteEmail.trim();
            if (!email) return;
            void cloudApi
              .createInvite(orgId, { email, role: inviteRole })
              .then((inv) => {
                setInviteEmail("");
                window.alert(`Invite created. Id: ${inv.id}\nShare accept path: ${inv.acceptPath}`);
                refresh();
              })
              .catch((err) => setError((err as Error).message));
          }}
        >
          Create invite
        </button>
      </div>
      <ul className="mt-3 divide-y divide-neutral-200 rounded border border-neutral-200 bg-white text-sm">
        {invites.map((inv) => (
          <li key={inv.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
            <span className="flex-1">
              {inv.email} — {inv.role}
              {inv.acceptedAt ? " (accepted)" : ""}
              <span className="ml-2 font-mono text-xs text-neutral-400">{inv.id}</span>
            </span>
            {!inv.acceptedAt && (
              <button
                className="text-xs text-red-600 underline"
                onClick={() => {
                  void cloudApi
                    .deleteInvite(orgId, inv.id)
                    .then(refresh)
                    .catch((err) => setError((err as Error).message));
                }}
              >
                Revoke
              </button>
            )}
          </li>
        ))}
        {!invites.length && (
          <li className="px-4 py-4 text-neutral-500">No pending invites.</li>
        )}
      </ul>
    </CloudShell>
  );
}
