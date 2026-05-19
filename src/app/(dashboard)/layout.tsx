import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-4">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/repositories" className="text-sm font-medium text-white">
            GitHub Connector
          </Link>
          <div className="text-xs text-gray-7">
            {user ? user.email : null}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
