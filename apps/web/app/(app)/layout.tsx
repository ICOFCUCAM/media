import type { ReactNode } from "react";
import { Sidebar } from "../../components/Sidebar";
import { RoleProvider } from "../../components/RoleContext";

/**
 * Studio shell: persistent left navigation + the active workspace. Wraps every
 * creator route (/create/*, /projects, /publish, /marketplace, /analytics, …).
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RoleProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </RoleProvider>
  );
}
