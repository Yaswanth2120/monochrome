# MonoChrome

**Black-and-white world where discipline is the only colour.**

MonoChrome is a 3D habit tracker built to keep a daily routine honest. You don't tick boxes in a list: you commit to each task by holding a key, the day only moves forward in order, and a black-and-white world records every promise you keep or break.

![The lock screen: Rocky's house and his daily checklist](docs/screenshots/lock-home.png)

## The lock screen: a living neighbourhood

The site opens on a lock screen that is also a small 3D city. **Rocky**, the disciplined one, lives in the middle of it and works through the whole routine every day while his checklist fills up to 13/13. His five neighbours live the same day badly:

| House sign             | Resident | How they spend the day                                        |
| ---------------------- | -------- | ------------------------------------------------------------- |
| DISCIPLINED · LVL 10   | Rocky    | Does every task in order, catches the bus, lights out on time |
| PROCRASTINATOR · LVL 3 | Ferris   | Walks up to a task, turns back to the sofa, panics at night   |
| DISTRACTED · LVL 2     | Gollum   | Starts something, then the phone buzzes                       |
| LAZY · LVL 1           | Lebowski | Snooze, fridge, couch, bed                                    |
| SCATTERED · LVL 4      | Flash    | Starts everything at triple speed and finishes nothing        |
| PERFECTIONIST · LVL 5  | Nina     | Ticks a box, decides it wasn't perfect, unticks it            |

Around them is a full city. It has a school, a library, an office tower, a café, a hospital, police and fire stations, a grocery, a gym and a park. Downtown has City Hall, a Bank, a Mall, a Cinema, a Hotel and the Skyline Tower, and the west side has the Maple Row suburb and a stadium. About 50 vehicles drive the roads, including buses, police cars and ambulances with blinking lights, and pedestrians walk the pavements.

![The whole city](docs/screenshots/city.png)
![Downtown](docs/screenshots/downtown.png)

- **Click** a house or building to fly to it. Use **← Back to Rocky** or **R** to come home.
- **Drag** to orbit, **scroll** or pinch to zoom, **right-drag** to pan, **Q / E** to rotate, **F** to follow.
- **WASD** walks Rocky and **Space** jumps. He goes back to his routine after a few seconds.
- On computers the passcode panel is Mac-style. Tablets and phones get an iPad- or iPhone-style keypad.

<p align="center"><img src="docs/screenshots/phone-lock.png" width="300" alt="The phone lock screen"></p>

## The routine world

After unlocking, the day is a ring of 15 islands, one per task, in a monochrome solar-system world.

![The routine ring](docs/screenshots/world.png)

- **Hold to commit.** Hold **E** (or the button) to complete a task. Tasks unlock strictly in order, so you can't skip ahead.
- **Counters and bonuses.** "Apply to 5–10 jobs" is a counter. Study/revise and build something are optional bonus tasks.
- **Lights-out window.** Sleep can only be committed between 8:30 and 11 PM.
- **Vows.** No porn and no alcohol are held all day and sealed after 8 PM. An honest **I slipped** button records a broken vow.
- The day rolls over at 4 AM.
- Sound effects are generated with Web Audio. **M** mutes them, **H** hides the task dock, **L** locks the screen, and the zoom controls work anywhere in the world.

## Streak calendar

Press **C** to see the record: a year-of-days heatmap, a month grid with the details of each day, and a dashboard with streaks and 30-day consistency.

![The streak calendar](docs/screenshots/calendar.png)

## Tech

- React 19, TypeScript and Vite
- three.js for both 3D worlds. Everything is built in code from boxes, lines and canvas-drawn signs, with no 3D model files.
- Tailwind CSS v4 plus hand-written CSS
- Data is stored in the browser's `localStorage` only. Nothing is sent anywhere.

```bash
pnpm install
pnpm dev      # http://localhost:8443
pnpm build    # static site in dist/
```

## Project layout

```
src/
  App.tsx           routine dock, hold-to-commit, keyboard controls
  World.tsx         the routine ring world
  Calendar.tsx      streak calendar and dashboard
  LockScreen.tsx    passcode gate (desktop panel / touch keypad)
  LockScene.tsx     the 3D city scene and camera
  routine.ts        tasks, vows, timing rules, history
  sound.ts          synthesized sound effects
  figure.ts         the pictogram character rig and poses
  town/             city kit, houses, residents, roads, traffic, pedestrians
```

## Roadmap

- Sign in with Google, with each user's data kept in their own Google Drive app folder. No central database.
- A routine editor, so anyone can build their own list of tasks and vows.
- Per-user passcodes.
