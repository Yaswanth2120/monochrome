import type { TaskIcon } from "./routine";

/** Flat line icons for the 2D UI, one per island token in the world. */
const PATHS: Record<TaskIcon, string> = {
  brush: "M4 20 15 9M14 4h6v5h-6zM15.5 4v-2M18.5 4v-2",
  pan: "M3 11h11a0 0 0 0 1 0 0 5.5 5.5 0 0 1-11 0zM14 12h7",
  book: "M12 6c-2-1.5-5-2-8-1.5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5v-13c-3-.5-6 0-8 1.5zM12 6v13",
  drop: "M12 3c3.5 4.5 6 8 6 11a6 6 0 0 1-12 0c0-3 2.5-6.5 6-11z",
  egg: "M12 3c3.5 0 6 6 6 10a6 6 0 0 1-12 0c0-4 2.5-10 6-10z",
  case: "M3 8h18v11H3zM8.5 8V5h7v3M3 13h18",
  plane: "M21 3 3 10.5l7 2.5 2.5 7zM10 13l11-10",
  cube: "M12 3 20 7.5v9L12 21l-8-4.5v-9zM4 7.5 12 12l8-4.5M12 12v9",
  plate: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zM12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 1 0 0-9z",
  bowl: "M3 11h18a9 7 0 0 1-18 0zM9 7c0-1.5 1-1.5 1-3M14 7c0-1.5 1-1.5 1-3",
  chip: "M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
};

export default function TaskGlyph({ icon, size = 18 }: { icon: TaskIcon; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="task-glyph"
    >
      <path d={PATHS[icon]} />
    </svg>
  );
}
