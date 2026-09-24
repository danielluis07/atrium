"use client";

import Link from "next/link";
import { useState } from "react";

import { focusClass, labelClass } from "@/components/site/label";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { depths } from "@/content/site";
import { depthHref } from "@/lib/depth";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="-mr-2.5 font-mono text-xs tracking-[0.12em] uppercase transition-none"
          />
        }>
        Menu
      </SheetTrigger>
      <SheetContent side="right" className="w-full bg-card">
        <SheetHeader className="h-(--header-height) justify-center px-(--page-margin) py-0">
          <SheetTitle className={labelClass}>Index</SheetTitle>
        </SheetHeader>
        <nav aria-label="Site" className="border-t px-(--page-margin)">
          <ul>
            {depths.map((d) => (
              <li key={d.id} className="border-b">
                <Link
                  href={depthHref(d.id)}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-baseline justify-between py-4 font-mono text-sm tracking-[0.12em] uppercase",
                    focusClass,
                  )}>
                  {d.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
