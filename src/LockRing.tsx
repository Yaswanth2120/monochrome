import { useEffect, useState } from "react";
import { DEFAULT_ROUTINE } from "./routine";
import World, { type VowState, type WorldTask } from "./World";

/*
 * The lock screen's wallpaper: the ring world playing a demo day on its own. It uses the neutral
 * sample routine, never the signed-in user's, so nothing private shows on a locked screen.
 * Islands light up one by one as the figure walks the ring; when the day is done the core lights
 * up, the vows seal, and after a pause it all starts again. Unlocking lights everything at once.
 */

const STEP_MS = 2600;
const REST_MS = 7000;
const TASKS = DEFAULT_ROUTINE.tasks;

export default function LockRing({ success }: { success: boolean }) {
  // How many tasks are done in the demo day; past the end it rests before starting over.
  const [step, setStep] = useState(0);
  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;
    const atEnd = step >= TASKS.length;
    const id = window.setTimeout(() => setStep(atEnd ? 0 : step + 1), atEnd ? REST_MS : STEP_MS);
    return () => window.clearTimeout(id);
  }, [step]);

  const done = success ? TASKS.length : step;
  const complete = done >= TASKS.length;
  const tasks: WorldTask[] = TASKS.map((task, i) => ({ done: i < done, optional: !!task.optional, icon: task.icon }));
  const vows: VowState[] = DEFAULT_ROUTINE.vows.map(() => (complete ? "kept" : "holding"));
  const current = Math.min(done, TASKS.length - 1);
  const counter = TASKS.findIndex((task) => task.kind === "count");

  return (
    <World
      current={current}
      tasks={tasks}
      unlocked={current}
      vows={vows}
      launches={counter >= 0 && done > counter ? (TASKS[counter].target ?? 1) : 0}
      launchFrom={counter}
      complete={complete}
      immersive={false}
      dockHidden
      onSelect={() => {}}
      onNavigate={() => {}}
    />
  );
}
