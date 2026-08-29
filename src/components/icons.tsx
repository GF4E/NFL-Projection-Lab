import type { SVGProps } from "react";

export function FieldMark(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 36 36" aria-hidden="true" {...props}><path d="M18 2 31 9v18l-13 7L5 27V9l13-7Z" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M12 11v14M24 11v14M8 18h20M18 7v22" stroke="currentColor" strokeWidth="1.5"/><circle cx="18" cy="18" r="3" fill="currentColor"/></svg>;
}

export function Arrow(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 16 16" aria-hidden="true" {...props}><path d="m3 8 9-5v10L3 8Z" fill="currentColor"/></svg>;
}

export function Check(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 20 20" aria-hidden="true" {...props}><path d="m4 10 4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
