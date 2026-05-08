import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Delegate — Task Delegation System",
  description: "Office task delegation and follow-up management",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const topBarUser = user
    ? { name: user.name, email: user.email, role: user.role }
    : null;

  return (
    <html lang="en">
      <body className="min-h-screen bg-bg-base">
        <div className="flex min-h-screen">
          <Sidebar user={topBarUser} />
          <div className="flex-1 min-w-0 lg:pl-60 flex flex-col">
            <TopBar site="Kolkata" online user={topBarUser} />
            <main className="flex-1">
              <div className="px-4 py-6 lg:px-8 lg:py-7">{children}</div>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
