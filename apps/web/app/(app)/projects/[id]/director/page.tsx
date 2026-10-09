"use client";

import Link from "next/link";
import { useAuth } from "../../../../../components/AuthProvider";
import { AuthCard } from "../../../../../components/AuthCard";
import { DirectorWorkspace } from "../../../../../components/DirectorWorkspace";

/** The Director workspace for one production (DirectorOS W9). */
export default function DirectorWorkspacePage({ params }: { params: { id: string } }) {
  const { user, loading } = useAuth();
  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-[4vw] sm:py-10">
      <Link href={`/projects/${params.id}`} className="cf-link text-cf-muted hover:text-cf-fg">
        ← Production file
      </Link>
      <h1 className="cf-display mb-8 mt-6 text-[clamp(32px,4vw,64px)] leading-[0.95]">Director workspace</h1>
      {loading ? <p className="cf-label">Opening…</p> : !user ? <AuthCard title="Sign in to direct this production" /> : <DirectorWorkspace projectId={params.id} />}
    </div>
  );
}
