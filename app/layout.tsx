import type { Metadata } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";
import { geistMono, geistSans, newsreader } from "@/fonts";
import { SheetGuides } from "@/components/site/sheet-guides";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { studio } from "@/content/site";
import { thresholdScript } from "@/lib/scene/threshold";

export const metadata: Metadata = {
  title: { default: studio.name, template: `%s — ${studio.name}` },
  description: studio.description,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // the Threshold's script sets `data-threshold` on <html> before hydration
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "h-full antialiased font-sans",
        geistSans.variable,
        geistMono.variable,
        newsreader.variable,
      )}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: thresholdScript() }} />
      </head>
      <body className="flex min-h-full flex-col">
        <SheetGuides />
        <SiteHeader />
        <div className="flex flex-1 flex-col pt-(--header-height)">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
