import type { Metadata } from "next";
import { AuthGate } from "@/components/auth-gate";
import { WorkspaceProvider } from "@/components/workspace-provider";
import { Shell } from "@/components/shell";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "OTR Growth — Marketing workspace",
    template: "%s · OTR Growth",
  },
  description: "The internal marketing command center for OTR Services.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthGate>
          <WorkspaceProvider>
            <Shell>{children}</Shell>
          </WorkspaceProvider>
        </AuthGate>
      </body>
    </html>
  );
}
