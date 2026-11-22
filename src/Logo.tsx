import { useId } from "react";

/**
 * The MonoChrome mark: a circle split into black and white, crossed by three rising bars
 * that change colour as they cross. Same drawing as public/favicon.svg, without the
 * rounded-square tile. `framed` adds the tile back.
 */
export function MonoLogo({ className, framed = false }: { className?: string; framed?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={className} viewBox={framed ? "0 0 64 64" : "5 5 54 54"} aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={`${id}l`}>
          <rect x="0" y="0" width="32" height="64" />
        </clipPath>
        <clipPath id={`${id}r`}>
          <rect x="32" y="0" width="32" height="64" />
        </clipPath>
        <g id={`${id}bars`} transform="rotate(-17 32 32)">
          <rect x="18.5" y="28" width="6" height="18" rx="1.2" />
          <rect x="29" y="14" width="6" height="32" rx="1.2" />
          <rect x="39.5" y="21" width="6" height="25" rx="1.2" />
        </g>
      </defs>
      {framed && <rect width="64" height="64" rx="14" fill="#050506" />}
      <circle cx="32" cy="32" r="25" fill="none" stroke="#f2f2f2" strokeWidth="2" />
      <circle cx="32" cy="32" r="25" fill="#f2f2f2" clipPath={`url(#${id}r)`} />
      <use href={`#${id}bars`} fill="#f2f2f2" clipPath={`url(#${id}l)`} />
      <use href={`#${id}bars`} fill="#050506" clipPath={`url(#${id}r)`} />
    </svg>
  );
}
