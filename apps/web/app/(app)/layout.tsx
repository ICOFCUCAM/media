import type { ReactNode } from "react";
import { CineforgeShell } from "../../components/cf/Shell";
import { RoleProvider } from "../../components/RoleContext";
import { AuthProvider } from "../../components/AuthProvider";

/**
 * Studio shell: production rail + family navigator + breadcrumb topbar around
 * the active workspace. Wraps every creator route (/create/*, /projects,
 * /publish, /marketplace, /analytics, …).
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <RoleProvider>
        <CineforgeShell>{children}</CineforgeShell>
      </RoleProvider>
    </AuthProvider>
  );
}
