import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes"; // <--- AJOUT

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TripPlanner",
  description: "Organise tes séjours",
  manifest: "/manifest.json"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning est obligatoire avec next-themes
    <html lang="fr" suppressHydrationWarning>
      <body className={inter.className}>
        {/* Le ThemeProvider injectera la classe .dark automatiquement */}
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}