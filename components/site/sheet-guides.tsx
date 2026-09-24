/**
 * Three faint full-height hairlines, like the frame of a drawing sheet: the
 * two page edges (halfway into the page margin) and the edge of the margin
 * rail (halfway into the gutter after column 2). On mobile the rail folds,
 * so only the page edges remain. Painted behind everything on the page.
 */
export function SheetGuides() {
  return (
    <div
      aria-hidden="true"
      data-slot="sheet-guides"
      className="pointer-events-none fixed inset-0 -z-10">
      <div className="page-frame h-full">
        <div className="page-grid relative h-full">
          <div className="absolute inset-y-0 left-[calc(var(--page-margin)/-2)] border-l" />
          <div className="absolute inset-y-0 right-[calc(var(--page-margin)/-2)] border-r" />
          <div className="col-start-3 hidden -translate-x-[calc(var(--gutter)/2+0.5px)] border-l md:block" />
        </div>
      </div>
    </div>
  );
}
