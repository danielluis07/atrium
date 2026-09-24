import type { Metadata } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";
import { geistMono, geistSans, newsreader } from "@/fonts";
import { SheetGuides } from "@/components/site/sheet-guides";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { studio } from "@/content/site";

export const metadata: Metadata = {
  title: { default: studio.name, template: `%s — ${studio.name}` },
  description: `${studio.name} is an architecture studio in ${studio.location}, designing houses for Arctic sites.`,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full antialiased font-sans",
        geistSans.variable,
        geistMono.variable,
        newsreader.variable,
      )}>
      <body className="flex min-h-full flex-col">
        <SheetGuides />
        <SiteHeader />
        <div className="flex flex-1 flex-col pt-(--header-height)">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
