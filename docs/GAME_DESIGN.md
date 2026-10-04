# Sector 42 — Game Design

> What the game is and how it plays: the match flow, map, teams, characters, territory, combat, structures, economy, scoring and controls, plus the open design questions and the reasoning behind past gameplay choices.
>
> **How it's built** (tech stack, protocol, state schema, systems, rendering, testing) is in [`ARCHITECTURE.md`](ARCHITECTURE.md). Each section here links to the part of that doc that implements it.

---

## How to use this doc

- **This doc says what the rules are and why.** It avoids code, except for the name of the constant that holds each number, so you know where to change it.
- **The code is the source of truth for numbers.** The values here are current values, copied from `shared/types.ts` (catalogs: teams, characters, shop, guns) and `server/src/constants.ts` (speeds, health, timers, points). When you change a number in code, update it here in the same change, and add a row to the [Design decisions log](#design-decisions-log) if it's a deliberate design choice rather than a tweak.
- **Status markers:** ✅ built, 🧪 built but first-pass numbers expected to change, 📝 planned or undecided.
- Most values are **first-pass**. They were picked to get something playable and haven't been balanced in real playtests yet.

## Contents

1. [The game at a glance](#the-game-at-a-glance)
2. [Setting and story](#setting-and-story)
3. [Match flow](#match-flow)
4. [The map](#the-map)
5. [Terrain](#terrain)
6. [Players](#players)
7. [Teams](#teams)
8. [Characters](#characters)
9. [Bots (single player)](#bots-single-player)
10. [Territory](#territory)
11. [Combat](#combat)
12. [Structures](#structures)
13. [Economy and fabrication](#economy-and-fabrication)
14. [Scoring and winning](#scoring-and-winning)
15. [Controls](#controls)
16. [Look and feel](#look-and-feel)
17. [Open design questions and plans](#open-design-questions-and-plans)
18. [Design decisions log](#design-decisions-log)

---

## The game at a glance

Sector 42 is a real-time multiplayer **territory-claiming** game for mobile and desktop web browsers, inspired by hexar.io. Up to **10 players** share an isometric hex map for a **5-minute match**. You claim hexes by walking over them, earn materials from the territory you hold, spend them on guns, upgrades and structures, and fight other players and teams for ground.

- **Core loop:** move → claim hexes → gather materials from them → fabricate things that help you claim, defend or attack → repeat until time runs out.
- **Territory is the point.** Fighting is a tool for taking and defending ground, not the goal: defeated players are back after a few seconds, so a match never ends early from combat.
- **Mobile is first-class.** Every action works with touch (a joystick and on-screen buttons) as well as keyboard and mouse.

## Setting and story

The human race is expanding across the solar system. The new frontier is Titan, the moon of Saturn. Settlers, explorers, scientists, and grifters are looking for new opportunities for prosperity and discovery. To encourage exploration and growth across the solar system, the International Exploration Agency (IEA) has created the Interplanetary Homestead Act (IHA), which grants land rights to individuals on designated planetary bodies. Titan is one of these planetary bodies. The moon has been divided into 120 sectors by IEA (each sector is about the size of Texas). **Sector 42** is the latest to be opened for settlement.

On the opening day of Sector 42 all participants begin on the East side of the sector. When everyone is ready the race to claim land begins expanding West across the sector. The IEA has placed supply caches across the sector to aid the new settlers. Participants are given 5 days to claim their land. What happens during those 5 days is not policed or governed. It is in essence the "Wild West".

### Setting

Titan has a harsh environment. There are mountains and lakes and rivers that cannot be crossed. It is brutally cold, averaging a surface temperature of –179°C (–290°F). There is no oxygen in the atmosphere, it is 95% nitrogen and 5% methane. Water needs to be mined as well as purified. The ground is not suitable for growing food as it is a mix of rock-hard ice and toxic sludge. Settlers will need heat suits and enclosed dormitories for the cold, respirators for oxygen, mines and processing facilities for water, oxygen and methane collection, enclosed hydroponic farms, and nuclear or methane combustion power plants.

### Inspiration

This game has a few primary sources of inspiration:

- Hexar.io (mobile game)
- Far and Away (1992 movie about the Homestead Act and Land Rush of 1889)
- Matt Dinniman's _Operation Bounce House_ (futuristic alien planet settlement)

### Notes

- A cast of five roles: Farmer, Engineer, Robot, Scientist and Explorer ([Characters](#characters)).
- Four kinds of structure: farm, fabricator, Guard Tower and power plant ([Structures](#structures)). Dorm? Processing facilities?
- Reference art showing hex terrain with mountains, trees, water and cliffs (mood only, see [Look and feel](#look-and-feel)).

This is the section to grow as the world takes shape.

---

## Match flow

### Getting into a game ✅

- **Start screen:** the title over (placeholder) art and one big **Play** button. Nothing connects to the server until you pick a game.
- **Game list** (after Play, `/play`): **Create game** at the top, a **find** box (code or name), then the open games, refreshed every few seconds: name, code, players (of 10), settings, and whether it's in the lobby or in play. Full games can't be picked. Finished games aren't listed. Typing a full code that isn't listed offers "Join game CODE" anyway.
- **Every game has a code**: 4 characters, without look-alikes (no 0/O, 1/I). **`/game/CODE`** in the address bar goes straight to that game, so a link can be shared. The lobby shows the code with a **Copy link** button.
- **Create game** (`/play/new`) sets the game's name (default "Name's game") and its settings, fixed for that game. Map size and game length are button choices; Teams, Drop pods and Guns are iPhone-style on/off switches, each with a **[?]** button that shows what it does in a tooltip (on hover, or click/tap to pin it):

| Setting | Options | Default |
|---|---|---|
| Map size | Small 64 × 64, Big 80 × 80, Large 96 × 96 | Small |
| Game length | 5, 7 or 10 minutes | 5 |
| Teams | On (players pick a team color and play as allies) / Off (everyone for themselves) | Off |
| Drop pods | On / Off ([Pickups](#pickups)) | On |
| Guns | On (players can fabricate guns and ammo and find them in pods) / Off (only Guard Towers shoot) ([Combat](#combat)) | Off |

- **The color picker** (2026-10-03): in the lobby your color (or team) is a **swatch**, a small square in your color. On touch screens the swatches are bigger (44 px instead of 30 px) so they are easy to tap. Click it and a popup titled **Color** (**Team color** in a game with teams) shows every color as a swatch, in **two rows of five**; click one to take it (Esc or clicking away closes it; arrow keys move between swatches). Bots have the same swatch. With **teams off** you can take any color nobody else has: colors someone else has are crossed out and can't be picked. With **teams on**, every color is open and a small badge shows how many players are on it. Everyone starts on their own color, and nobody is anyone's ally with teams off (two players on the same color are still enemies; with ten colors for at most ten players that only happens if a client misbehaves).
- **Bigger maps** get more drop pods (a 5 × 4 grid on Big, 6 × 5 on Large) and a respawn wave every 2:50 whatever the length (two in a 7-minute game, three in a 10-minute one).

A match moves through four phases. ✅

| Phase | What happens | How long |
|---|---|---|
| **Lobby** | Players join, set a name, pick a character (and a team color, if the game has teams on), and press **Ready**. Anyone can add [bots](#bots-single-player). | Until every connected player is ready |
| **Countdown** | Everyone is ready: "Starting in 3…". Nobody can move yet. If anyone un-readies or a new player joins, it cancels back to the lobby. | 3 s (`COUNTDOWN_DURATION_MS`) |
| **Playing** | The whole match. Claiming, shooting, fabricating and gathering all happen at once. | 5, 7 or 10 min (the game's setting) |
| **Results** | Final standings and the winner. No new players can join. The room closes when the timer ends (or when the last player leaves), but each player's results stay on screen until they choose **Play again** or **Main menu**. | 60 s (`RESULTS_DURATION_MS`) |

- **Nobody is in charge.** There is no host and no Start button: the match starts itself once everyone is ready.
- **Playing alone:** add bots in the lobby and press Ready. Bots are always ready, so the match starts straight away ([Bots](#bots-single-player)).
- **Characters apply at the start.** Your character's starting kit is given to you when the countdown ends, replacing anything you had.
- **Team and character are locked while you're ready.** Un-ready to change them, so what everyone saw when they readied is what starts. Your name can still change while you're ready, but not once the match starts.
- **Players who drop don't hold up the lobby.** A disconnected player is left out of the ready check.
- **Joining mid-match** is allowed during the playing phase. The newcomer plays the default character (Farmer).
- **Play again** takes you back to the game list (**Main menu** to the start screen); the finished game is closed.

Implementation: [Game Phases](ARCHITECTURE.md#game-phases), [Room Lifecycle](ARCHITECTURE.md#room-lifecycle).

## The map

✅ A **grid of flat-top hexes**: 64 × 64 (Small, the default), 80 × 80 (Big) or 96 × 96 (Large), picked when the game is created,, viewed at an isometric tilt, all at one flat height (no elevation). 📝 Each match gets a freshly generated layout of ground, mountains and water; see [Terrain](#terrain).

- **Size in play:** crossing the map takes about **15 s left to right** and **11 s top to bottom** at normal speed. (The vertical trip is shorter because the tilted view squashes the map vertically and speed is measured on screen.)
- **Edges:** you can walk right up to the edge but not off it. The camera always keeps you centered, even at the edge.
- **Corners:** the map's outline is jagged (it's made of hexes), so at a few edge spots you can stand over no hex at all. Those spots can't be claimed.
- **Spawning:** ✅ players start on a **spawn line near the right-hand (east) edge**, as if "going west": one spot per player, in a column 3 hexes in from the edge (`SPAWN_EDGE_INSET`). The first player to join gets the middle spot; each later one goes alternately above and below, 6 rows further out each pair (`SPAWN_ROW_SPACING`), so the more players there are, the further toward the top and bottom they start. You keep your spot for the match (through a reconnect) and **respawn there**. Each spot shows a **spawn platform**, a low round metal pad with a light in the player's team color; a spot is freed when its player leaves for good, and the next to join takes the lowest free one. 🧪 The spacing and inset are first-pass.

Implementation: [Map — hex grid and coordinate spaces](ARCHITECTURE.md#map--hex-grid-and-coordinate-spaces).

## Terrain

🧪 **Built** (2026-09-26): every match gets a random layout; mountains and deep water block movement unless you have the **Jetpack**, nobody can claim terrain, and mountains stop shots. The numbers are first-pass. Every hex is one of three terrain types. There's **no elevation**: mountains are a kind of hex, not a height.

| Terrain | Walk on it? | Claim it? | Shots |
|---|---|---|---|
| **Ground** | Yes | Yes | Pass |
| **Mountain** | Only with the **Jetpack** | Never | **Blocked** |
| **Water, shallow** (1 hex across: narrow river stretches) | Yes | Never | Pass |
| **Water, deep** (lakes, and rivers 2+ hexes wide) | Only with the **Jetpack** | Never | Pass |

- **Most of the map is ground.** About **10%** of the hexes (roughly 410 of 4,096) are mountains or water (`TERRAIN_COVERAGE`). A typical map has about 10 mountain ranges, 8 lakes and 5 rivers. These are first-pass and tunable (`TERRAIN_FEATURE_WEIGHTS` and the size constants in `server/src/constants.ts`). To see what the generator makes, render whole maps with `node tools/map-preview.js` (see [tools/README.md](../tools/README.md)).
- **A new map every match.** The layout is generated randomly when the match is created, so no two matches play the same.

### Features

Terrain comes in features, each a contiguous group of hexes (every hex touches another in the group):

- **Mountain ranges:** **3–35** hexes (`MOUNTAIN_SIZE`), built from two sizes of mountain, which will get different sprites: a **small mountain** is 3 hexes that all touch each other; a **large mountain** is 7, a hex and its 6 neighbors (the size of a structure). A range is one mountain or several touching ones, never overlapping. Each new mountain goes where it touches the range on the most sides, so ranges are compact clumps, not lacy branches. About 40% of the mountains placed are large (`MOUNTAIN_LARGE_CHANCE`), when one still fits.
- **Lakes:** **3–32** water hexes (`LAKE_SIZE`), grown a hex at a time where they touch the lake most, so they're round and solid, with no holes.
- **Rivers:** a course of water **2–20 hexes long** (`RIVER_LENGTH`) and **1–4 hexes wide** (`RIVER_WIDTH`). The width **changes along the river**, a hex at a time. Where a wide river bends, gaps between its banks are filled in, so rivers have no holes.
- **Features stay apart.** At least **3 ground hexes** separate any two features (`FEATURE_GAP`), so every feature keeps its size, features never merge, and there's always room to walk between them.

### Moving through terrain

- **Mountains** are solid: you slide along their edge, the way enemies slide around a structure, even where the edge zigzags from hex to hex.
- **Water** is **shallow** where it's only one hex across — you could step straight over it — and **deep** everywhere else. Precisely: a water hex is shallow if it has at most two water neighbors and those two don't touch each other. In practice that's the 1-wide stretches of rivers (bends included; about 6% of all water). Lakes and 2–4-wide river stretches are deep and solid like a mountain. Shallow water is drawn a lighter blue.
- The **Jetpack** (upgrade, [shop](#economy-and-fabrication)) lets you walk over mountains and deep water, and gives the speed of Booster 1. With it or without, you still can't claim them.

### Claiming and building

- **Nobody can claim mountain or water hexes**, Jetpack or not. They stay neutral all match and never count toward anyone's hexes or income.
- **Structures can't sit on terrain.** A structure needs every hex of its footprint (7, or 3 for a Guard Tower) to be yours, and terrain can't be yours. So a structure never covers a mountain or water hex.

### Combat

- **Mountains block shots.** A shot stops at the first mountain hex it enters, so ranges make cover to hide behind.
- **Water doesn't block shots.** Shots fly over lakes and rivers.

### Fairness

- **The spawn areas are always open ground.** The generator keeps every hex within 3 steps (`SPAWN_CLEAR_RADIUS`) of each spawn spot clear, so anyone can build a structure right where they start.
- **Every ground hex can be reached on foot.** The generator never walls off ground with mountains or deep water (shallow water counts as walkable), so players without the Jetpack can always get anywhere a structure could be built.

Implementation: [Terrain](ARCHITECTURE.md#terrain).

## Players

- **Body:** a circle a little smaller than a hex (`PLAYER_RADIUS`, 20, against a hex radius of 32).
- **Movement:** ✅ continuous, in any direction, with smooth acceleration, turning and stopping rather than snapping. Top speed (`PLAYER_SPEED`) is the same in every direction **as seen on screen**. A joystick pushed part-way moves you more slowly.
- **Health:** 🧪 100 (`BASE_MAX_HEALTH`), +100 per Armor level (200 / 300 / 400; `ARMOR_HEALTH_PER_LEVEL`).
- **Death and respawn:** 🧪 (2026-09-29) at 0 health you're **down for 5 seconds** (`RESPAWN_DELAY_MS`): you vanish from the map and can't move, claim, open pods, build, shoot or be hit, and a "Defeated — respawning in N…" message counts down. Then you respawn with full health: **where you fell** by default (the `RESPAWN_WHERE_DIED_ENABLED` feature flag, **on** since 2026-10-03; turn it off with `RESPAWN_WHERE_DIED=0` to respawn at your spawn spot as before), moved to the nearest hex you can stand on if where you fell is a mountain, deep water (you were flying) or inside an enemy structure. The player who landed the killing blow gets the kill. You **keep your tiles, structures (placed and in your inventory), materials and kills**, and by default **your gun, ammo and upgrades too** (backpacks are off since 2026-10-03, see below). You can still use the Fabricator while you wait.
- **Respawn grace period:** 🧪 (2026-10-03) for **5 seconds after you respawn** (`RESPAWN_GRACE_MS`) nothing can hurt you: shots fly through you, Guard Towers don't target you, and bots neither shoot at nor chase you (one already chasing drops you). You can still move, claim and shoot. Everyone sees it: you **blink between 50% and 100% opacity** (a cycle every 0.3 s, `GRACE_BLINK_MS` on the client). It starts only when you come back from a defeat, not at the start of the match. It was added so a bot can't kill you again the moment you respawn where you fell.
- **Safe area at your spawn:** 🧪 (2026-10-03) within **6 hexes of your own spawn spot** (`SPAWN_SAFE_RADIUS`; it was 3 hexes, for bots only) **Guard Towers won't shoot you**, and a tower's shot already in the air passes through you there, so nobody is shot as they respawn. Bots leave you alone there too ([Bots](#bots-single-player)). Nothing else changes: other players can still shoot you, and the safe area doesn't stop anyone claiming or building.
- **Backpacks (off by default):** 🧪 behind a feature flag, `BACKPACKS_ENABLED` in `server/src/constants.ts`, **off since 2026-10-03** (start the server with `BACKPACKS=1` to turn them on). The rest of this bullet and its sub-bullets describe what happens with the flag on; with it off nothing drops and you keep everything. When you're defeated, your **weapons and upgrades** (your gun, your ammo, and every upgrade level: Booster, Harvester, Armor and Jetpack) drop in a **backpack** on the hex where you fell. Only **you** can see it or pick it up; to everyone else it isn't there. Walk onto its hex (once you've respawned) to get everything back, with a notice saying what was in it ("Got your backpack back: Ion Cannon, 12 ammo, Booster 2").
  - What you get back merges with what you have now: the better gun, each upgrade at the higher level, the ammo added. The upgrade you had equipped comes back equipped only if your slot is empty. Armor's extra health comes back with it.
  - If you had nothing to drop, there's no backpack. Each defeat drops its own backpack, and they stay until you pick them up or the match ends (or you leave the game).
  - If you fell somewhere you can't walk (flying with the Jetpack over a mountain or deep water, whose Jetpack is now in the backpack), it lands on the nearest hex you can walk to. It never lands inside an enemy's structure.
  - Since Armor goes in the backpack, you come back with 100 max health until you pick it up.
  - **Look:** a canvas backpack with a flap, a pocket, straps and a brass buckle, over a softly pulsing gold ring on its hex.
- **Dropped connection:** ✅ your player stays on the map, frozen and drawn dimmed, and keeps its tiles and structures for **3 minutes** while the game tries to reconnect you. A frozen player can still be shot. Everyone sees a notice when you drop and when you return. After 3 minutes your spot is released and your tiles go back to unclaimed.
- **Names:** ✅ 2–25 characters (an emoji counts as one), anything allowed. If someone already has your name (ignoring case), you get the first free "name (1)", "name (2)", …. Your last name is remembered on your device for next time.

Implementation: [Movement](ARCHITECTURE.md#movement), [Reconnection System](ARCHITECTURE.md#reconnection-system), [Lobby, characters and teams](ARCHITECTURE.md#lobby-characters-and-teams).

## Teams

✅ first version. **A team is a color.** There are 10, one per seat in a game: red, blue, green, yellow, purple, teal, orange, gray, pink and brown (the last two added 2026-10-03 so the color picker is two full rows of five). Everything you own (your body, hexes, structures, claim circle) is drawn in your team's color.

- **Default is free-for-all.** A newcomer gets the first color nobody is using yet, so everyone starts on their own team until players deliberately pick the same color.
- **Anyone can join any team.** There is no size limit or balancing (so everyone could pick the same color and have nobody to fight).
- **Teammates are allies:**
  - No friendly fire: your shots pass through teammates and their structures.
  - Teammates' structures don't block you (just like your own).
  - You never take a teammate's hexes, so allies expand around each other instead of stealing back and forth.
- **Everything else is still per player:** tiles, materials and score belong to each player. The results screen adds a team table (total score per team) when any team had two or more players.

📝 Still open: pooling tiles or materials, a team win condition, and balancing ([Open design questions](#open-design-questions-and-plans)).

Implementation: [Lobby, characters and teams](ARCHITECTURE.md#lobby-characters-and-teams).

## Characters

🧪 Five characters, picked in the lobby (default: **Farmer**). A character sets your **starting kit**, given when the match starts. Values are first-pass and expected to change. They live in `CHARACTERS` in `shared/types.ts`.

| Character | Pitch | Gun | Ammo | Materials | Structures | Upgrades |
|---|---|---|---|---|---|---|
| **Farmer** | Starts with a farm. | none | 0 | 50 | farm | — |
| **Engineer** | Starts with a fabricator. | none | 0 | 50 | fabricator | — |
| **Robot** | Moves faster than everyone else. | none | 0 | 50 | — | Booster 1, equipped (133% speed) |
| **Scientist** | Starts with a power plant. | none | 0 | 50 | power plant | — |
| **Explorer** | Starts with Armor (200 health), but few materials. | none | 0 | 15 | — | Armor 1 (200 health) |

- **Nobody starts armed** (since 2026-09-29; the Explorer had a Blaster and 15 shots until then). Everyone has to fabricate a gun (200 materials) or find one in a drop pod.
- The three structure-starting characters (Farmer, Engineer, Scientist) differ in which structure type they get ([Structures](#structures)); the Farmer's farms, the Engineer's fabricators and the Scientist's power plants also score more (150 instead of 100). 📝 Only the Engineer starts with a fabricator, so everyone else buys one (100 materials) in the Build menu before the Fabricator opens to them.
- 📝 Each character is planned to get its own art; today everyone is a circle in their team color.

## Bots (single player)

🧪 Built 2026-09-28. **Bots** are computer-controlled players, so Sector 42 can be played alone, or a multiplayer game filled out. Their numbers are first-pass, tuned in simulated matches, not yet against people.

- **Adding them:** in the lobby, under the players, pick a difficulty (**Easy**, **Medium** or **Hard**; Medium to start with) and press **+ Add bot**. Anyone in the lobby can add bots, and change any bot's color (or team), character and difficulty, or remove it; there's no host. Only in the lobby, not during the countdown or the match.
- **A bot is a player.** It takes one of the 10 places (you plus 9 bots is a full game, and nobody else can join), gets a spawn spot, a color nobody has, a random character, and a name like "Bot Cassini". It plays by every rule people do: it claims hexes, opens drop pods, fabricates, switches upgrades, builds and shoots, and appears on the leaderboard and the results like anyone. The game list counts bots as players ("4 / 10", with "3 bots" in the summary).
- **Always ready.** Bots never hold up the lobby: on your own with bots, the match starts as soon as you're ready. **Bots alone never start a match**: at least one connected person has to be ready.
- **Start delay:** 🧪 (2026-10-03) bots do nothing for the first **2 seconds** of the match (`BOT_START_DELAY_MS`), because they were moving before people's game screens had appeared.
- **Teams:** with teams on, give a bot your color to make it a teammate. With teams off, bots take free colors like anyone.
- **Spawn mercy:** 🧪 bots leave an enemy alone (don't shoot at them or chase them) while that enemy is within **6 hexes of their own spawn spot** (`BOT_SPAWN_MERCY_RADIUS`, the same safe area as for Guard Towers; it was 3), so a bot can't camp your spawn. People get no such protection from people.
- **Backpacks:** a defeated bot goes back for its own backpack once it has respawned, unless an armed enemy is near it (probably whoever defeated it there); then it claims ground meanwhile and tries again later. Bots ignore players who are down.
- **What bots know:** they plan on the server and can see the whole map (every player, hex and pod), like a player with a perfect minimap. They only shoot what they have a clear line to (mountains block their view as they block shots) and within their range.

### Difficulty

Each difficulty is a profile of numbers (`BOT_PROFILES` in `server/src/constants.ts`); angles are how far a shot can stray either side, ranges are on-screen px like shot range (a shot flies 1,200).

| | Easy | Medium | Hard |
|---|---|---|---|
| **Moving** | 75% speed; dawdles now and then; looks 6 hexes ahead and often picks a so-so spot | 85% speed; looks 8 hexes ahead | Full speed; looks 14 hexes ahead; efficient |
| **Shooting** | Fires 1 s after spotting you, a shot every 0.8 s, strays up to ±20°, aims where you are, range 380 | 0.5 s, every 0.4 s, ±8°, allows for half your movement, range 520 | 0.22 s, every 0.25 s, ±3°, leads you fully, range 650 |
| **Chasing** (while armed) | Never | Enemies within 420; stops at 200 and stands its ground; not below 30% health | Within 650; circles at 260, changing direction; not below 35% health |
| **Structures** | Places one only where it happens to own a spot (so it often stays stuck at its tile limit); doesn't shoot structures | Claims the hexes a spot needs, then builds; shoots enemy structures when it has ammo to spare | The same, faster |
| **Fabricating** | Every 8 s: a Fabricator first if it has none, then Blaster, Armor, Booster, in that order, skipping what it can't afford yet; ammo below 5 shots | Every 3 s, saving up for each: a Fabricator if it has none, Blaster, Armor, Harvester, Guard Tower, Booster, Ion Cannon, Armor 2, Guard Tower, then a Guard Tower whenever it has none; ammo below 10 | Every second, saving up: a Fabricator if it has none, Harvester, Blaster, Armor, Guard Tower, Harvester 2, Ion Cannon, Armor 2, Guard Tower, Booster, Harvester 3, Armor 3, three Guard Towers, then more; ammo below 20 |
| **Farms** (all three) | Within 250 hexes of its tile limit it keeps 100 materials back, and within 150 it buys a farm and builds it before the limit (a bot at the limit earns nothing, so one that had spent everything could never afford one) | The same | The same |
| **Upgrade slot** | Never switches | Equips the Harvester once it has one | The Booster to chase, the Harvester to claim |

How they compare, from simulated 5-minute matches on a Small map (`node tools/bot-sim.js`, three seeds), after the tile limit and Fabricator rules (2026-10-03): **alone**, Easy claims about 500–1,000 hexes (it mostly stops at the 500-hex limit, since it only builds where it happens to own a spot), Medium about 2,000–2,300 (and builds 13–20 Guard Towers), Hard about 3,200–3,300 (23–30 Guard Towers); **all three in one match**, Hard takes about 2,300–3,300 hexes, Medium 100–270 and Easy 60–200. Hard's Guard Towers (it builds 24–50) shoot everyone nearby with the Blaster, so the match is a landslide: that's the Blaster still to be nerfed ([Open design questions](#open-design-questions-and-plans)). Before these rules (2026-09-29): alone about 950–1,050, 2,300 and 3,000–3,400 hexes; all three in one match about 180–500, 90–880 and 2,200–2,700. Hard is meant to beat a good player, Easy to lose to a new one; that's still to be checked in real play.

Implementation: [Bots](ARCHITECTURE.md#bots).

## Territory

✅ Holding hexes is how you earn materials and score.

- **Claiming:** during the match, every moment you claim the hex you're standing on **plus every hex whose center is within your claim radius**. The normal radius is about one hex (`BASE_CLAIM_RADIUS`, the hex size): in practice just the hex under you, occasionally a neighbor when you're near an edge.
- **Harvester:** 🧪 while equipped, raises your claim radius so that standing mid-hex you claim **7 / 19 / 37 hexes** at levels 1 / 2 / 3 (1, 2 or 3 rings of neighbors; `EXPANDER_CLAIM_RADII` 80 / 125 / 180 world px, `EXPANDER_HEXES`). Off-center you catch a few more at the edge. Everyone can see a Harvester's claim radius as a tinted circle around its owner. See [Upgrades](#upgrades). The circle belongs to its owner: it is hidden while they are defeated (they have vanished from the map and claim nothing) and comes back when they respawn.
- **Stealing:** walking over (or near, with the Harvester) an **enemy's** hex takes it from them. A **teammate's** hex is never taken.
- **Terrain:** mountain and water hexes can never be claimed, not even the shallow water you wade through ([Terrain](#terrain)).
- **Spawn zones:** 🧪 (2026-10-03) each player's **spawn hex and the six around it** can only be claimed by that player or their teammates. Nobody else can take them, so nobody can build a structure on or beside your spawn (a structure needs every hex to be yours). A player who has left no longer protects theirs. Bots don't try to claim them either.
- **Protected hexes:** the hexes under an **enemy's structure** (7, or 3 for a Guard Tower) can't be claimed. Destroy the structure first.
- **Tile limit:** 🧪 (2026-10-03) you can hold at most **500 hexes** (`BASE_TILE_CAP`), plus **500 for every farm you own** (`TILES_PER_FARM`; `tileCap` on the player). It counts the hexes you hold now, enemy hexes you take included. At the limit, walking over ground you could have claimed claims nothing, from the unclaimed and from enemies alike (and so pays no materials), and you get a notice, "Tile limit reached (500). Build more farms to claim more.", repeated at most every 8 s (`TILE_LIMIT_NOTICE_INTERVAL_MS`) while you keep walking over it. With the Harvester and room for only some of its hexes, the one under you and then the nearest are taken. The HUD shows **Tiles: 312 / 500**, turning red at the limit. Losing a farm lowers the limit but never takes hexes away: over the new limit you keep what you hold and just can't claim more. 📝 See the open question about earning materials at the limit.
- **Ties:** if two players reach the same hex at the same moment, the one who joined the room first gets it. 📝 Not a deliberate rule; see open questions.
- **When a player leaves for good,** their hexes go back to unclaimed.

Implementation: [Tile Claiming](ARCHITECTURE.md#tile-claiming).

## Combat

✅ Shooting needs a **gun** and **ammo**.

🧪 **A per-game setting, off by default (2026-10-03):** the **Guns** choice on Create game (`GameSettings.guns`; it started the same day as a server flag, `GUNS_ENABLED`, replaced by the setting). With guns off, players have no guns or ammo: the Blaster, Ion Cannon and Ammo pack can't be fabricated, they never come out of drop pods, bots don't buy them, and the Build menu, HUD and lobby character card don't show them. **Guard Towers still shoot** (with the Blaster's shot, no ammo), so they are the only way to fight. Everything below is how guns work with the setting on.

- **Guns:** 🧪 `GUN_DAMAGE` in `shared/types.ts`.

  | Gun | Damage per hit | Unarmored player dies in | Armored (200) player dies in |
  |---|---|---|---|
  | **Blaster** | 25 | 4 hits | 8 hits |
  | **Ion Cannon** | 50 | 2 hits | 4 hits |

  You have at most one gun. The Ion Cannon replaces the Blaster, and you can fabricate it without owning the Blaster first. You can't go back to the Blaster.
- **Ammo:** each shot uses 1 (an ammo pack of 30 costs 60 materials). You can fabricate ammo before you have a gun. 📝 Ammo **never regenerates and has no cap**; the only source is buying ammo packs. Running out means you can't shoot until you buy more.
- **Fire rate:** 🧪 (2026-10-03) set per gun in `GUN_FIRE_INTERVAL_MS`: the **Blaster fires once a second** (it was 5 a second) and the **Ion Cannon twice a second** (500 ms; it was 5 a second), a first guess to tune; so a Blaster kill takes 4 hits, about 3 seconds, and an Ion Cannon kill 2 hits, 0.5 seconds. Bots never fire faster than their gun, whatever their difficulty, and since 2026-10-03 only at **half** that rate (`BOT_FIRE_INTERVAL_FACTOR` = 2): a bot's Blaster fires every 2 s and its Ion Cannon every second (the shot-interval figures in the Difficulty table are minimums that the gun's own rate now overrides). 📝 The limit is enforced only by the game client for people (the server limits towers and bots); the server should own it.
- **Shots:** travel in a straight line at the same on-screen speed in every direction, at 🧪 **600 on-screen px/s** (`PROJECTILE_SPEED`; 400 until 2026-09-27), and vanish after the gun's flight time (`GUN_SHOT_LIFETIME_MS`): **2 seconds for the Blaster, a range of about 1,200 px** (roughly 40% of a Small map's width sideways), and **4 seconds for the Ion Cannon, about 2,400 px**. A shot stops at the first enemy player or enemy structure it hits, or at a mountain ([Terrain](#terrain)); it flies over water. Both guns' shots have the same hit size; the Ion Cannon's shots only *look* larger.
- **Friendly fire:** none. Shots pass through teammates and teammates' structures.
- **Kills:** the shooter's kill count goes up; the victim is down for 5 seconds and respawns where they fell (or at their spawn spot with the flag off), keeping their gear (or, with the backpack flag on, dropping it in a backpack only they can see; see [Players](#players)). Kills are permanent and count toward score.

Implementation: [PvP Shooting](ARCHITECTURE.md#pvp-shooting), [Collision Detection](ARCHITECTURE.md#collision-detection).

## Structures

🧪 Rebuilt 2026-10-03: structures are now part of how you play, not just score. Each type has its own cost, health, points and job (`STRUCTURE_SPECS` in `shared/types.ts`).

| Type | Footprint | Cost | Health | Points | What it does |
|---|---|---|---|---|---|
| **Farm** | 7 hexes | 100 | 1000 | 100 (a **Farmer's** farm: 150) | Raises your [tile limit](#territory) by 500 |
| **Fabricator** | 7 hexes | 100 | 1000 | 100 (an **Engineer's**: 150) | Opens the [Fabricator](#fabricator) (guns, ammo, upgrades) while you own one. More than one does nothing extra but score another 100 each |
| **Guard Tower** (the *fort* until 2026-10-03) | **3 hexes** that all touch | 100 | **500** | 50 | Shoots enemy players nearby with the Blaster, with unlimited ammo |
| **Power plant** | 7 hexes | 100 | 1000 | 100 (a **Scientist's**: 150) | 📝 Essential, but its job isn't designed yet |

- **Getting them:** the Engineer, Farmer and Scientist begin with a fabricator, farm and power plant (there is no Builder or Guard Tower start since 2026-10-03). Everyone else buys them for 100 materials in the **Build menu** ([Build menu](#build-menu)), which never needs a Fabricator (so the first one can be bought). You hold them in a **structure inventory** until you place them.
- **Footprint:** a 7-hex structure sits on a center hex and **covers that hex plus its 6 neighbors**. A Guard Tower covers **3 hexes that all touch each other**: the anchor hex and two neighbors next to each other (six ways to turn it).
- **Placing:** click a structure's icon in the **inventory bar** on the right of the screen ([Inventory bar](#inventory-bar)), or press **Place** next to it in the Build menu, then pick a spot. `E` or `P` does the same for the structure you picked last, or the first you have. While placing, **`Tab` switches to the next structure type you hold** (`Shift+Tab` the previous), in catalog order. A hint at the bottom says what you're placing. **Every hex of the footprint must be yours** (a teammate's don't count), all on the map, and none already under another structure. Since terrain can't be claimed, structures never cover mountains or water. Structures can touch but not overlap. While you choose, an outline shows the structure's shape: yellow if you can place it there, red if not. For a Guard Tower the outline follows the pointer: it turns to the clump of three hexes nearest the pointer, so aim at the corner where you want it (on touch, tap near that corner).
- **Solid:** enemies can't walk through your structure; they slide around it. You and your teammates can walk over it.
- **Protection:** enemies can't claim any hex it covers.
- **Health and destruction:** 🧪 1000 health (a Guard Tower 500, `STRUCTURE_HEALTH`). Enemy shots damage it, and at 0 it's destroyed and removed, which also removes what it gave you: a farm's 500 tiles (you keep your hexes but can't claim more over the limit), a fabricator's access to the Fabricator, its points. 📝 There's no visible damage state yet (planned: intact → cracked → heavily damaged).
- **Score:** 🧪 each structure scores its own points while you own it (table above), lost if it's destroyed. Fabricating and buying structures costs materials, never points.
- **Guard Tower limit:** 🧪 (2026-10-03) a player may have at most **10 Guard Towers on the default Small map**, **16 on Big and 23 on Large** (`maxGuardTowers` / `MAP_SIZES`, about in step with each map's area: 1.56x and 2.25x). It counts the towers standing **plus the ones you hold to place**; a destroyed tower makes room again. At the limit you can't buy another (the Build menu disables the button and shows "10 / 10 allowed"), a pod never gives you one, and bots stop buying them. Farms, fabricators and power plants have no limit.
- **Guard Tower fire:** 🧪 each tower fires the Blaster (25 damage, the same shot speed) at the **nearest enemy player within 450 px** (`TOWER_RANGE`; mountains block its line, defeated players aren't targets) at most once a second (`TOWER_FIRE_INTERVAL_MS`, the Blaster's rate). It has no ammo to run out of, shoots players only (never structures), passes through your teammates, and a kill it makes counts for its owner (it scores nothing, since kills are worth 0). It fires from the middle of its three hexes. 📝 Both numbers are first-pass. A tower finds targets within 450 px, although its shots fly about 1,200 px like any Blaster shot.
- 📝 **Not yet:** the power plant's job, and a Fabricator-like use for dorms and processing facilities.

Implementation: [Structures: footprint and shape](ARCHITECTURE.md#structures-footprint-and-shape), [Destructible Structures](ARCHITECTURE.md#destructible-structures).

## Economy and fabrication

### Materials ✅

**Materials** (called *credits* until 2026-09-27) are what items are made from: you gather them by claiming ground and from pickups, and spend them to **fabricate** items (the shop until 2026-09-27; see [Fabricator](#fabricator)). Older Decisions Log rows were reworded to say materials too.

- **Income:** 🧪 you earn **1 material the first time a hex is claimed** this match (`MATERIALS_PER_CLAIM`), paid the moment you take it. **Each hex pays once:** taking an enemy's hex, or one released when its owner left, pays nothing. Losing a hex doesn't cost you the materials it paid. Claiming only happens during the match, so income does too. (History: 1 material per owned hex every 10 seconds until 2026-09-26; then materials for every claim, re-takes included, until 2026-09-27.)
- **Pickups** are the other source: piles of materials lying on the map ([Pickups](#pickups)).
- 🛠️ **Dev only (temporary):** `M` adds 500 materials during the match, in dev builds, so items can be fabricated and tried quickly. The server refuses it when run with `NODE_ENV=production`; remove it before release.
- **Starting materials** come from your character: 50, or 15 for the Explorer.
- **Fabricating** is the only thing that uses materials up.
- **Materials are not part of your score**, so fabricating things never costs you points.

### Pickups

🧪 **Drop pods** lying on the map. They all look the same, so you can't tell what's inside until you open one by walking onto its hex. **Behind a feature flag** (`PICKUPS_ENABLED` in `server/src/constants.ts`, or `PICKUPS=0` / `PICKUPS=1` when starting the server), so they can be switched off. With the game's Guns setting off (the default since 2026-10-03; see [Combat](#combat)) a pod never holds ammo or a gun: those outcomes are left out of the roll and the rest of the row shares their chance.

- **Where:** up to **12 pods** per match, spread evenly: the map is split into a 4 × 3 grid and each cell gets one, near its center (nudged up to 2 hexes at random). Each cell has a **5% chance of getting no pod** (`PICKUP_EMPTY_CHANCE`). A pod on a mountain or water, or inside a spawn area, moves to the nearest ground hex outside the spawn areas. A new layout every match, with the terrain.
- **What's inside** is decided **when you open it**, from your **score tier** at that moment. Everyone is ranked by current score and split into **four tiers**: tier 1 is the leader, tier 4 is at the back. Tied players share the average of their places, so at the start, when everyone is on 0, everyone is in the middle (tier 3). With two players, the leader is tier 1 and the other tier 4. The further behind you are, the better your odds (`PICKUP_TIER_CHANCES`; 🧪 first-pass numbers, to tune):

| Contents | Tier 1 (leader) | Tier 2 | Tier 3 | Tier 4 (back) | Gives |
|---|---|---|---|---|---|
| Materials | 60% | 52% | 42% | 32% | 10–50 materials |
| Ammo | 25% | 20% | 15% | 10% | 10–30 shots |
| Upgrade | 5% | 10% | 15% | 20% | Level 1 of an upgrade you don't have yet |
| Blaster | 5% | 8% | 10% | 10% | The Blaster |
| Ion Cannon | 3% | 5% | 8% | 10% | The Ion Cannon |
| Structure | 2% | 5% | 10% | 18% | One random structure type |

- **Always something useful:** anything you couldn't use (a Blaster when you're armed, the Ion Cannon when you have it, an upgrade when you have them all) is left out of your roll and the rest share its chance. A pod is never empty (the 5% chance is of no pod at all).
- **Respawning:** 🧪 **2:50 into the match** (`PICKUP_RESPAWN_MS`), every grid cell that has no pod left gets a new one, placed the same way (and with the same 5% chance of none), each appearing after its own random **0–15 s** delay. New pods avoid structures and other pods. In a 5-minute match that's one wave; it repeats every 2:50 if matches get longer.
- **Taking one:** stand on its hex during the match. It's gone for everyone once opened (its cell can get a new pod in the next respawn wave). You get a notice with what was inside ("Picked up 30 materials").
- An upgrade from a pod behaves like a fabricated one: into an empty slot it's equipped at once; Armor adds its health straight away.
- **Look** (until art): a small steel drop pod with fins and a glowing cyan band that pulses. It floats over its hex with a shadow and bobs gently.

Implementation: [Pickups](ARCHITECTURE.md#pickups).

### Fabricator

🧪 Items aren't bought, they're **fabricated** from materials. (With the game's Guns setting off, the default since 2026-10-03, the **Weapons** rows below are gone: see [Combat](#combat).) Once you **own a Fabricator** ([Structures](#structures)), open the **Upgrades tab of the Build menu** any time during the match with **`F`** or **`U`**, or the Build button and its tab (since 2026-10-03 the Fabricator is a tab of the Build menu, not a popup of its own; it was the Shop, on `E`, until 2026-09-27). **Until you own one the tab is grayed out** (pressing `F` or `U` then opens the menu on the Structures tab) and the server refuses guns, ammo and upgrades; if your last fabricator is destroyed it locks again. Structures are bought on the menu's other tab, [Structures](#build-menu), which is never locked. Pods can still give you guns and upgrades without one. The game keeps running while the Fabricator is open, so fabricating in the middle of a fight is risky. The catalog is `SHOP_ITEMS` in `shared/types.ts` (the code keeps its shop names). Prices show as "100 mat".

| Category | Item | Cost | What it does | Limit |
|---|---|---|---|---|
| Weapons | **Blaster** | 200 | Lets you shoot; 25 damage per hit, 1 shot a second. | Not if you have any gun |
| Weapons | **Ion Cannon** | 400 | Twice the Blaster: 50 damage per hit, 2 shots a second, double the range (2,400 px). Replaces the Blaster. | One |
| Weapons | **Ammo pack** | 60 | +30 shots (2 materials per shot, `AMMO_MATERIALS_PER_SHOT`). | Unlimited; no ammo cap |
| Upgrades | **Booster** 1–3 | 100 a level | Top speed 133 / 166 / 199% of normal (`BOOSTER_SPEED_PER_LEVEL`, +33% a level). Uses the upgrade slot. | 3 levels |
| Upgrades | **Harvester** 1–3 | 100 a level | Claim 7 / 19 / 37 hexes at once, but top speed drops to 90 / 80 / 70% of normal (`EXPANDER_SLOW_PER_LEVEL`, −10% a level). Uses the upgrade slot. | 3 levels |
| Upgrades | **Armor** 1–3 | 100 a level | Max health 200 / 300 / 400, and +100 health right away. **Always on**, no slot. | 3 levels |
| Upgrades | **Jetpack** | 200 | Walk over mountains and deep water ([Terrain](#terrain)), and 133% of normal speed, like Booster 1 (`JETPACK_SPEED_BONUS`). You still can't claim them, and mountains still stop your shots. Uses the upgrade slot. | One |

- **Each upgrade is listed once**, offering your next level ("Booster 2" once you own Booster 1); a maxed one shows "Max". A gun you can't improve on shows "Owned".
- **Upgrade levels last the match**, and you keep them when you're defeated (unless the backpack flag is on: then they drop in your backpack with your gun and ammo until you pick it up; [Players](#players)). See [Upgrades](#upgrades) for the one-slot rule.
- **Weapons cost double** since 2026-09-29 (they were 100 / 200 / 30): fighting is meant to be an investment rather than the obvious first buy.
- 📝 **Pacing:** starting kits give at most 50 materials, and everything costs 60 or more (a gun 200), so a first real item waits on territory income and pickups, and a gun takes about 150 fresh hexes. Worth watching in playtests.

Implementation: [Fabricator (the shop)](ARCHITECTURE.md#shop), [Economy (Materials)](ARCHITECTURE.md#economy-materials).

### Build menu

🧪 (2026-10-03) One popup with two tabs. The **Build** button or **`B`** opens it on the **Structures** tab, **`F`** or **`U`** on the **Upgrades** tab (the old Fabricator menu: guns, ammo and upgrades, with your ammo and gun at the top). The header shows your materials and **Tiles: 312 / 500** on both tabs. The Structures tab lists the four structures, each with its cost (100 materials), points, health and what it does, a buy button, and, for any you hold, how many and a **Place** button (it closes the menu and starts placing). It needs no Fabricator, which is how you buy the first one. The Upgrades tab is grayed out ("Build a Fabricator to unlock this") until you own one, and the menu drops back to Structures if your Fabricator is destroyed while it shows. The structures are still part of the shared catalog (`SHOP_ITEMS`, bought with the same `purchase` message); only the Upgrades tab hides them.

### Upgrades

🧪 Built 2026-09-26.

- **Levels.** Booster, Harvester and Armor go up to level 3, Jetpack has one level. Each level costs 100 materials (the Jetpack, 200), fabricated one at a time, and lasts the match, except that defeat drops them in your backpack ([Players](#players)).
- **One upgrade slot.** Booster, Harvester and Jetpack are *slot* upgrades: you can own all of them, but **only the equipped one works**. Armor isn't a slot upgrade: it always works once bought.
- **Equipping.** A slot upgrade you fabricate with the slot empty equips itself; otherwise it waits in your inventory. Fabricating the next level of the upgrade you have equipped takes effect at once.
- **Switching** by clicking an upgrade in the [inventory bar](#inventory-bar): change the equipped upgrade any time during the match, **instantly and as often as you like** (a 5-second cooldown was removed 2026-09-27). You can't empty the slot, only switch to another. You **can't take the Jetpack off while you're over a mountain or deep water** (you'd be stuck inside it).

### Inventory bar

✅ Your structures and upgrades are shown **on screen, down the right side** (under the Leaderboard, Fabricator and Build buttons), as clickable icons. It replaced the Build button and the Inventory popup (2026-09-27). **`I` hides and shows it.**

- **Structures:** one icon per type you hold, with how many (a Farm icon with "2"), in catalog order. **Click one to build it**: build mode starts with that type and a hint appears at the bottom ("Pick a spot for the Farm…"). Click it again, press `Esc` or `B` to stop. The icon being built is outlined in yellow.
- **Upgrades:** one icon per upgrade you own, with its level for the three-level ones. **Click one to switch to it**, instantly. The one in use is outlined and can't be clicked. Armor is shown, outlined, because it's always on. While you're over a mountain or deep water with Jetpack on, the others are disabled.
- Hidden when you hold no structures or upgrades. Hover an icon for its name and effect.
- **Look** (until real art): a tiny slab in the structure's color, and a small drawing for each upgrade (2026-10-03): a jet engine with a blue flame (Booster), a tracked harvester with a scoop (Harvester), a knight's breastplate (Armor) and a jetpack with two tanks (Jetpack). They were diamonds in the upgrade's color.



✅ first version. Your score is shown at the top of the screen all match and recalculated continuously (`TILE_POINTS`, `KILL_POINTS`, and `STRUCTURE_SPECS` / `structurePoints`):

**score = hexes owned × 1 + the points of each structure you own** (kills score 0 since 2026-10-03, `KILL_POINTS`) (farm 100, fabricator 100, power plant 100, Guard Tower 50; 150 for a Farmer's farm, an Engineer's fabricator or a Scientist's power plant; see [Structures](#structures))

- Score **goes down** when you lose hexes or structures. Kills are counted (and shown on the results screen) but are worth **0 points**, so fighting is for territory, not score (2026-10-03). 📝 They still break ties, as the placeholder tie-break below goes score, kills, hexes.
- **Results screen breakdown:** each row shows score, tiles, structures as a count with their points ("2 (+250)") and kills, and the note under the table spells out the scoring.
- Materials don't count.
- **Winning:** when time runs out, the **highest score wins**. Players with the same score share a rank, and every rank-1 player is a co-winner. The standings are ordered by score, then kills, then hexes (📝 a placeholder tie-break order).
- **Teams:** the results screen shows each team's total score when a team had two or more players, but 📝 there is no team win condition yet.

Implementation: [Score](ARCHITECTURE.md#score), [Results screen](ARCHITECTURE.md#results-screen).

## Controls

The full list of controls for players is in the README's [Controls](../README.md#controls) section. The design choices behind them:

- **Movement keys move in fixed on-screen directions** (`W`/`A`/`S`/`D` or arrows = up, left, down, right), and the mouse only aims and shoots. The first prototype moved you "forward" toward the cursor instead; it felt like chasing the mouse, because the camera follows you while the cursor stays still.
- **Right-click to walk to a spot** on desktop. Any movement key cancels it.
- **Shooting:** Space (hold to keep firing) or click, toward the mouse. On touch, the **FIRE** button fires along your movement direction, and tapping the map fires toward that spot.
- **Touch:** a virtual joystick (bottom left), the FIRE button (bottom right), and the inventory bar's icons (right side) for building and switching upgrades. The FIRE button only appears once you have a gun.
- **Hotkeys:** `B` the Build menu on its Structures tab, `F` or `U` on its Upgrades tab (once you own a Fabricator), `E` or `P` placement mode (no time limit; press again or `Esc` to leave it; `Tab` / `Shift+Tab` switch structure while in it), `I` hides/shows the inventory bar, `L` leaderboard, `Esc` closes popups. `` ` `` (backtick) shows a performance readout. `M` (dev builds only, temporary) adds 500 materials.
- 📝 **Touch aiming** is limited to your movement direction or a tapped spot; there's no second aiming stick.

Implementation: [Input — desktop and mobile share one message contract](ARCHITECTURE.md#input--desktop-and-mobile-share-one-message-contract), [Movement](ARCHITECTURE.md#movement).

## Look and feel

📝 **Everything is placeholder art** until real art exists.

- **Players:** a circle in the team color with a shadow and a small dot showing which way they face. Disconnected players are drawn faded.
- **Terrain** 🧪 (drawn graphics since 2026-09-29; no image files yet). **Two color schemes** (2026-10-02): each match is drawn in one, picked at random when the game is created, and everyone in it sees the same one. The shapes are the same in both; only the colors change.
  - **Slate** (the original): slate ground drifting into brown and maroon dust; cold gray mountains with white snow; blue lakes and turquoise shallows.
  - **Titan**: the moon under its smoggy orange sky, mostly amber, coffee brown, tan, charcoal and inky black, with no blues or bright whites, but kept readable for Earth eyes: brown earth, dark water, snowy-looking peaks. Described in detail below.
  - **Shallow vs deep** must always be obvious: in each scheme shallow liquid is one flat color of its own, much brighter than deep liquid (even where deep liquid gleams) and clearly different from the ground. In Titan, shallows are a bright golden amber; deep liquid stays dark, with only a dark-bronze sheen and gold glints.
  - The Titan details:
  - **Ground:** coffee-brown tiles of tholin (the organic soot that settles out of Titan's sky) that read as sleek panels: a faint light edge along the top of each, a faint shadow along the bottom. Broad drifts of lighter **tan dune dust** and smaller outcrops of **charcoal ice rock** spread across several tiles each, so the plains aren't one flat color. The texture is quiet: pale frost and sand grains, dark pebbles, rust specks, now and then a hairline crack or a patch of frost. Cliffs, water banks, hex lines and the area around the map are dark earthy browns. Claimed tiles are tinted see-through, so the texture still shows. (Slate with brown and maroon dust, 2026-09-30.)
  - **Mountains:** each is one faceted, low-poly peak of soot-coated ice: charcoal and brown-gray rock with a **cream frost cap** (it reads as snow, without a bright white). It's lit from the upper left, casts a soft shadow, and stands on dark scree. Its lower slopes pick up the plains' tan dust, and the rock has the ground's texture (soot and grit specks, faint strata), so mountains sit in the landscape. A **small mountain** (3 hexes) is a single peak about 60 px tall; a **large mountain** (7 hexes) is a massif about 110 px tall with a second, lower summit. Every mountain's shape varies, and mountains hide whoever walks behind them.
  - **Deep liquid** (lakes, wide rivers: liquid methane): **inky, nearly black**, darker toward the middle of a lake, with bronze ripples. It mirrors the amber sky in broad, smooth patches of dark bronze, with thin gold glints where it gleams most, like dark water at sunset. The liquid sits below the ground: along a shore at the back you see the bank drop to it, and every shore has a pale amber wet line. There are no hex lines inside a lake.
  - **Shallow liquid** (1-hex-wide river stretches you can wade through): a bright golden amber, with its pebbly bed showing and a lower bank. It's much brighter than the deep liquid and more saturated than the dull tan ground, so it can't be mistaken for either. (It was a dark amber-brown on 2026-10-01, too easy to confuse with gleaming deep liquid.)
  - The look lives in `client/src/game/terrainArt.ts` (colors, peak heights, snow line).
- **Hexes:** claimed hexes are tinted in the owner's color, with a slightly darker border so neighboring hexes of one color stay distinguishable.
- **Pickups:** identical drop pods floating over a hex; see [Pickups](#pickups).
- **Spawn platforms:** a low round metal pad on each player's spawn hex, with a small light in their team color. With the respawn-where-you-die flag on (the default), the pad is also where they will come back, so it **moves to where a player falls**: it sits under them while they wait and stays at the spot they reappear on, until their next defeat. (Their spawn zone and safe area stay on the original spawn hex.) With the flag off it never moves.
- **Structures:** a raised slab in the shape of its footprint (a hexagon, or three joined hexes for a Guard Tower). The **top shows the type** (farm pale lime, fabricator dark brown, Guard Tower sandstone, power plant pale cyan, muted so they don't read as team colors) and the **sides and border show the owner's team color**.
- **Shots:** Blaster shots are small white bolts; Ion Cannon shots are larger yellow bolts.
- **Harvester:** a translucent circle in the owner's color on the ground, showing their claim radius.
- **Reference art** (hex tiles with mountains, trees, water and cliff faces) is AI-generated with unclear licensing, so it's for mood only. Planned art direction is under [Open design questions and plans](#open-design-questions-and-plans).

---

## Open design questions and plans

Things that need a design decision, not just code. Where one is also tracked in the technical roadmap, the [Planned Features](ARCHITECTURE.md#planned-features) number is given.

### Teams (Planned Features #2)
- **Pooling:** should hexes belong to the team, and/or should materials earned from a claim be split between teammates? Either one changes claiming, income and score.
- **Team win condition:** does the best team win (by total or average score?), or the best player?
- **Team size and balance:** today anyone can join any color, including everyone on one team.

### Structures and scoring (Planned Features #3)
- **What each structure type does.** ✅ Partly decided 2026-10-03: farms give tile capacity, fabricators open the Fabricator, Guard Towers shoot, each with its own points and health ([Structures](#structures)). Still open: **what a power plant does** (K.C. will add details), and dorms and processing facilities.
- **Earning materials at the tile limit (important).** Materials come only from claiming a hex for the first time and from pods, and a player at their limit can't claim, so they earn nothing. A player who has spent everything by then can never afford the farm that would lift the limit. Bots now keep 100 materials back near the limit to avoid it. Options for players: farms (or something else) produce materials; the first farm is free; claims blocked by the limit still pay out for first-time hexes; a periodic income. Not decided.
- **Duplicate fabricators.** Another fabricator adds nothing but 100 points for 100 materials and 7 hexes (as asked 2026-10-03). Once you're at your limit that is an easy way to turn materials into score. Maybe only the first one scores in full.
- **The Blaster's nerf** (K.C., 2026-10-03): damage 50 → 25 and fire rate 5 → 1 a second are in; the range stays about 1,200 px. The Ion Cannon is now exactly double the Blaster in damage (50), fire rate (2 a second) and range (2,400 px). Still open: the right rates (1 a second is a first guess), and moving the fire-rate limit to the server. Before the nerf, bot simulations had Hard build 24–50 towers and flatten everyone else; to re-check.
- **Guard Tower limit tuning:** 10 / 16 / 23 is a first guess; should it count per team, or should towers be limited by territory instead of by map size?
- **Guard Tower tuning:** its range (450 px; 550 for a while on 2026-10-03) and fire interval (1 s, the Blaster's) are first-pass; should it also shoot structures, or need the owner nearby?
- **Fabricator lock:** should losing your only fabricator lock the Fabricator again (as built), and should the lock apply to pod finds?
- **Tie-break** for the win, beyond shared ranks.
- The point values (1 / 50 / 25) are first-pass, to tune in playtesting.

### Fabrication, weapons and balance (Planned Features #9)
- **Ammo:** a cap? Regeneration? Ammo piles ([Pickups](#pickups)) are a one-off supply; otherwise you fabricate more.
- **Fire rate per gun** (and moving the limit to the server), range, spread.
- **More items:** stronger armor, and whatever structure types end up doing.
- **Shopping risk:** maybe only allow buying while standing on your own territory (or near a city hall). Not decided.
- **Snowballing:** territory income and purchases compound for whoever is ahead. The Harvester in particular is strong (up to 9 hexes at a time) for 100 materials. Options: rising prices, a radius cap, or stackable upgrades with rising costs.
- **Early game:** nothing is affordable at the start (even an ammo pack is 60); at 1 material a fresh hex, a 100-material item is about 50 new hexes away and a gun (200) about 150, so pickups matter. Since nobody starts armed (2026-09-29), the opening minutes are all claiming. Check whether that feels right.
- **Pickups:** should players see where they are from afar (a minimap or edge markers)? Tune the tier odds (and maybe the amounts per tier) in playtests. Is a gun too strong early for whoever reaches a pod first? That matters more now: a pod gun is worth 200 materials and nobody starts armed.

### Map and spawning
- **Starting positions:** ✅ decided 2026-09-26 (spawn line, see [The map](#the-map)). Still open: should teammates start next to each other rather than in join order?
- **Terrain (Planned Features #7):** decided 2026-09-26: gameplay terrain (ground, mountain, water), no elevation; see [Terrain](#terrain). Still open:
  - Mountain and water art: ✅ first version drawn in code (2026-09-29; see [Look and feel](#look-and-feel)). Still open: hand-made sprites to replace it, animated water, and whether rivers should look like flowing rivers rather than chains of hexes.
  - Should terrain slow you down (wading through water, say) rather than only allow or block you?
  - Should rivers connect to lakes or run off the map edge, so they read as rivers rather than long lakes?
  - Should maps be shareable or replayable (a visible seed)?
- **Map outline:** the jagged hex edge versus the rectangular walkable area could be fixed at the same time.

### Inventory bar (follow-ups)
Built 2026-09-27 (see [Inventory bar](#inventory-bar)). Still open: number-key shortcuts for the icons; showing gun and ammo in the bar too; real icons once there's art.

### Art and presentation (Planned Features #7, #10)
- Real art for hexes, terrain, structures and characters, including characters that face six directions to match the hex grid.
- Custom lobby pickers: character cards with art, sized for touch (the color swatch picker is built, 2026-10-03).
- A visible damage state for structures.
- Indicators for players who are off-screen.

### Results and rematch
- A richer results screen (per-player details, match stats) and a same-room **rematch**, instead of Play again starting a fresh lobby.

### Bots (follow-ups)
Built 2026-09-28 ([Bots](#bots-single-player)). Still open:
- **Tuning against people:** the difficulty numbers come from bot-vs-bot simulations. Play each difficulty and adjust `BOT_PROFILES`.
- **A quicker way into single player:** a "Play solo" option on the start screen or Create game (with a number of bots) instead of creating a game and adding bots, and whether such games should stay out of the public game list.
- **Filling empty seats:** should bots automatically join a game that's short of players, or take over a player who disconnects?
- **Joining mid-match:** bots can only be added in the lobby today.
- **Team play:** bots don't coordinate with teammates beyond not shooting them.

### Contested hexes
- When two players reach a hex at the same moment, join order decides. Decide whether that's acceptable or whether it should go to whoever got there first by input order.

---

## Design decisions log

Gameplay, balance, controls and presentation decisions, and why they were made. Technical decisions are in the [ARCHITECTURE Decisions Log](ARCHITECTURE.md#decisions-log). Rows marked **superseded** are kept for history.

| Decision | Chosen | Alternatives considered | Rationale |
|---|---|---|---|
| PvP death handling — **revised 2026-09-29 (respawn delay and backpacks, below)** | Respawn at your spawn spot (the map center until 2026-09-26), full health, kills/tiles preserved | Elimination, sudden-death end-of-match | This is a territory-claiming game, not a deathmatch — PvP is a tool for defending/contesting tiles, not the win condition, so a defeated player should get back in the fight quickly |
| Host concept — **superseded 2026-09-26 (ready-up lobby)** | First player to join a room is `hostId`; only they can send `startGame`; reassigned to next connected player on host departure | No host (auto-start at max players or after a lobby timer), server-side matchmaking-assigned host | Simplest to implement for a scaffold; a lobby timer or player-ready-up voting could replace this later without changing the wire protocol much |
| Ammo — **superseded 2026-09-26 (character kits: only the Explorer starts with ammo, 15; everyone else buys it)** | Finite (30), decrements per shot, no regen yet | Infinite ammo, regen over time, reload mechanic | Left as a known gap — finite ammo without regen makes for a hard stop mid-match, which is a real gameplay concern to resolve before this ships, not just a technical TODO |
| Materials payout scope | Every player earns 1 material per tile they individually own, during `playing` only (formerly `claiming`/`combat`) | Payouts continuing into `results`, or scoped only to the old `combat` phase | Matches the request's "based on number of tiles they control" without over-scoping into phases where tile ownership isn't changing meaningfully or the match is already decided; open questions about team-pooled materials remain in Planned Features #2 |
| Desktop controls | Fixed on-screen WASD/arrows; mouse only aims and shoots (`MOVE_RELATIVE_TO_AIM = false`) | Mouse-relative "forward" with strafing (tried first; still available via the flag) | Mouse-relative movement felt weird: the camera follows the player, so the cursor's world position keeps moving as you approach it (chasing), and strafing orbits it. On-screen keys are predictable and match the view. Aim is still recomputed every frame because the camera moves under a still mouse |
| Leaderboard presentation | Popup over the canvas, toggled by a button or `L` (closed by `Esc`/×/backdrop), hidden by default | Always-on corner panel (previous) | The always-on panel was clipped and covered the play area on small screens; a popup is roomier and only costs space when wanted. The player's own score stays visible in a small always-on badge instead |
| Fire input | Space, click and a touch FIRE button all go through `GameScene.tryShoot` with a 200ms client-side interval | Click only (previous); server-enforced fire rate first | Requested controls; a shared gate avoids three divergent code paths. Server enforcement is the right long-term home but is a game-rule decision, so it's deferred and logged as a Known Issue |
| Match phases | One `playing` phase (5 min) between `lobby` and `results` (a `buying` phase was added before it afterwards — see below) | Separate `claiming` (90s) and `combat` (120s) phases (previous); a separate "buying" phase | Claiming and fighting should happen together, and buying is better as an in-game menu than a phase that pauses everyone. The early-shooting problem the claiming phase solved goes away once guns/ammo are purchases |
| Score formula — **revised 2026-10-03 (kills 0, structure points by type; see the last row)** | `tiles × 1 + kills × 50 + structures × 25`, computed server-side into `Player.score`; materials excluded | Score from materials (previous); client-side derivation | Requested. Materials will be spent, so scoring them would make buying cost points. A synced server field keeps every client identical and lets the leaderboard/badge just read it |
| Damage — **superseded 2026-09-26 (per-gun damage: Basic gun 50, Big gun 100; Armor gives 200 health)** | 50 per hit vs 100 health (two-hit kill) | 25 per hit (previous) | Requested. Armor and better guns will modify this later |
| Structures are solid — **superseded 2026-09-26 (structures now cover 7 hexes and use a hexagon shape; still solid to enemies, and teammates pass too)** | Others can't enter a structure's hex; they slide around it; the owner passes freely; a player already inside can walk out | Structures only stop projectiles (previous); no exceptions for owners | Requested. Implemented as circle-vs-hexagon with rounded corners; sliding uses the push-out direction at the player's *current* position (using the destination's normal leaves players frozen at corners), and a small distance tolerance so tangential slides aren't mistaken for approaching. Validated with a 744-approach sweep (0 overlaps, 0 frozen; the only stops were dead-on flat-wall hits) and a two-client run |
| Buying phase — **superseded 2026-09-26 (ready-up lobby)** | A 30s `buying` phase between lobby and playing (nothing else allowed), plus in-play shopping on the player's own time | No buying phase, only an in-game menu (decided earlier the same day); a long shopping phase | Reversed by request: a quick shared shopping window gives a clean start, while play-time buying keeps the game continuous. Also removes the "shoot before anyone has claimed anything" problem without a protected phase |
| Starting materials — **superseded 2026-09-26 (ready-up lobby)** | 100 (`STARTING_MATERIALS`), set as the schema default | 0 with payouts only | Requested, so there's something to spend in the buying phase |
| Results screen actions | *Play again* (new lobby) and *Main menu* | Auto-drop players into a new lobby when the room closes; rematch in the same room | Deliberate choice rather than a surprise. The 60s room timer plus a persisted screen means nothing is lost when the room closes. Same-room rematch would need a reset flow and is deferred |
| Click-to-move | Right-click sets a world-space target the client walks toward via the normal `input` vector; eases off near it; cancels on arrival, no progress for 1.2 s, or any movement key/joystick | Server-side pathing/targets; left-click to move | Requested. Doing it client-side needs no server change and reuses smoothing, screen-uniform speed and structure sliding. Speed is scaled by distance (not a hard stop) to avoid overshoot despite ~100–200 ms input latency; a no-progress timeout stops it chasing an unreachable spot |
| Ending buying early (temporary) — **superseded 2026-09-26 (ready-up lobby)** | Closing the shop during `buying` sends `endBuying`; only the host's is honored | Waiting out the 30s; letting any player end it | Requested testing shortcut: with a mock shop there's nothing to do while buying. Host-only so one player closing their popup can't start the match for everyone; to be removed when the real buy menu exists |
| Claim radius | Claim the hex you stand on plus every hex whose center is within `claimRadius` (base 32 px = `HEX_SIZE`; Expander 80 px = 4 × `PLAYER_RADIUS`) | Keep "only the hex under you" and make the Expander a different mechanic; a fixed ring of neighbors | A radius makes "2× radius" literal and scales naturally for future upgrades. At base radius it's effectively the old behavior (own hex, occasionally a neighbor near an edge). Implemented as a small search window around the player, verified against a brute-force scan |
| Structures protect their tile — **superseded 2026-09-26 (all 7 footprint hexes are protected, from enemies only)** | A hex with another player's structure can't be claimed | Let radius claiming flip any tile | With a large radius, tiles under structures would flip constantly, leaving a structure on a tile its owner doesn't own (and placing requires owning the tile). Rejected the alternative of destroying the structure on flip |
| Expander — **superseded 2026-09-26 (Expander levels, below)** | 100 materials, claim radius 4 × the player radius (80 px), permanent (kept on respawn), one per player, visible to everyone as a tinted circle | Stackable levels; lost on death; visible only to its owner | Matches the requested spec (one item, 2×). One-per-player keeps the first version simple and bounded; the circle doubles as a warning to opponents |
| Ammo pricing | 1 material per shot, sold in packs of 30 (30 materials), no cap | Per-shot purchase; capped magazine | Requested. No cap is a known gap; tune with playtesting |
| Player size | `PLAYER_RADIUS` raised from 16 to 20 (body, projectile hit radius, structure collision); the Expander's claim radius is *defined* as 4 × `PLAYER_RADIUS` | Keep 16; keep the Expander at 2 × the base claim radius | Requested playtest of a bigger player. The Expander used to be 2 × a 32 px base claim radius, which is independent of body size, so it wouldn't have grown; tying it to `PLAYER_RADIUS` (4 × = 64 at 16, 80 at 20) makes the two move together while the base claim radius (and so base tile-claiming pace) stays put. If instead the base claim radius should also follow the player size, that is a one-line change but speeds up base claiming (~50% more hexes per step at 40 px) |
| Host reassignment — **superseded 2026-09-26 (ready-up lobby)** | Promote the next connected player as soon as the host disconnects; a newcomer also takes over if the recorded host is disconnected; keep a lone disconnected host so a reconnect restores them | Promote only when the reconnect window expires (previous behavior); always keep the original host | A disconnected host can't send `startGame`, and the old behavior blocked a lobby for up to 3 minutes (it also made the shared dev room confusing) |
| Starting the match | Automatic 3s countdown once every connected player is ready; cancelled if anyone un-readies or a newcomer joins; disconnected players don't block it. No Start button and no host | Host presses Start once everyone is ready; auto countdown plus a host force-start | Chosen by the developer (2026-09-26). Nobody has to be in charge, so the host role and its handover logic went away |
| Removing the buying phase | Deleted `buying`, `startGame`, `endBuying` and `STARTING_MATERIALS`; shopping is during play only; starting materials come from the character | Keep a short buying phase after the lobby | Requested: the lobby's character choice now sets the starting kit, which is what the buying phase was for |
| Teams | A team is one of 10 colors (`TEAMS`; 8 until 2026-10-03); `Player.teamId`, with `Player.color` always the team color; newcomers get an empty color first | A `GameState.teams` map with team state; auto-balancing | Picking a team is the same as picking a color (requested), and all existing rendering already used the player color. A team has no state of its own yet, so no map |
| What teammates share | Allies only: no friendly fire (players and structures), teammates' structures walkable, teammates' tiles not taken. Tiles, materials and score per player; results add team totals | Full pooling (tiles owned by the team, materials split evenly, team score); color only, free-for-all | Chosen by the developer (2026-09-26) as the smallest change that makes teams meaningful; pooling stays an open question |
| Characters | 5 characters (6 until 2026-10-03, when the Builder was removed) in a shared `CHARACTERS` catalog; the kit (gun, ammo, materials, structures, upgrades) replaces the player's stats when the countdown ends; locked while ready | Apply the kit at selection time; free choice after readying | Applying once at start means lobby switching can't be abused and a mid-match joiner just gets the default kit applied on join |
| Structure inventory | `Player.structureInventory` (one entry per structure); `placeStructure` names a type from it and uses one up; `Structure.type` recorded; all types identical for now | Unlimited building with the character setting only the type | Chosen by the developer (2026-09-26): the starting structures are part of what distinguishes characters |
| Getting a gun | Unarmed players can't shoot; a Basic gun in the shop (40 materials at first, 100 since the catalog rebuild) | Only Explorers can shoot until a later shop pass | Chosen by the developer (2026-09-26), so the other five characters can still fight |
| Robot boost — **superseded 2026-09-26 (Booster levels, below)** | `boost` upgrade multiplies top speed by 1.25 (`BOOST_SPEED_MULTIPLIER`), acceleration unchanged | Higher acceleration too; a timed boost | "Speed boost" was the spec; 1.25 is a first-pass value to tune |
| Player names | Editable in the lobby, 2–25 characters (code points), any characters; a taken name (ignoring case) gets the first free " (N)"; saved to `localStorage` and sent as a join option | Allow duplicate names; server-side accounts | The developer allowed either; the suffix keeps names readable in the leaderboard and results and fixed the old duplicate "Player N" bug. Saving the typed (unsuffixed) name avoids stacking suffixes over games |
| Structure footprint | A structure occupies its hex plus the 6 neighbors; all 7 must be on the map, owned by the builder, and free of other footprints | Single hex (previous); allowing teammates' hexes | Requested (2026-09-26) |
| Structure shape — **superseded the same day (flat-top, 2 × tile radius)** | One hexagon with exactly the 7 hexes' area, corners on grid vertices, turned ~19.1° from the tiles; used for collision, hits and drawing, while the footprint hexes are used for placement and protection | A tile-aligned hexagon covering the 7 hexes (~29% larger, reaching well into the next ring); the jagged 7-hex outline | "A hexagon the size of 7 tiles" was requested; this is the only hexagon with exactly that area whose corners sit on the grid. Cost: 6 of the 12 touching placements overlap by ≤ 10.5 px, accepted rather than refusing placements whose 7 hexes are all yours |
| Structure colors | Top face by type (farm pale lime, mine dark brown, fort sandstone, power plant pale cyan); sides and border in the owner's team color | Type color only; team color only | Temporary until art (requested). Both pieces of information stay visible |
| Structure shape (revised) | Flat-top hexagon with 2 × the tile radius: the largest flat-top hexagon inside the 7-hex footprint, corners on the footprint's notches | The ~19.1°-turned equal-area hexagon (previous); a smaller hexagon | Requested: ~75% of the previous size with a flat top. 2/√7 ≈ 76% is exactly the size that still fits, and staying inside the footprint means structures can never overlap |
| Build mode | No timeout; B toggles, Esc exits (the Build button still works) | The 5 s auto-disarm (previous) | Requested. Lining up a 7-hex spot takes longer than 5 s |
| Hotkeys | B = build mode, E = shop, L = leaderboard, Esc = leave build mode / close popups | B = shop (previous) | Requested |
| Prices and new items | Basic gun 100, Big gun 200 (100 damage), Speed boost 100, Armor 100 (200 max health), structures 100 each, ammo 30, Expander 100 | — | Prices requested; the Big gun's effect (double damage) and the gun rules (no downgrade, can skip the basic gun) are first-pass choices |
| Shot looks by gun | Basic: small white bolt; big: the original yellow bolt, 1.3× larger. Chosen by `Projectile.damage` (already synced); hit radius unchanged | Syncing the gun id on the projectile; a bigger hit radius for big shots | Requested. Damage is already on the projectile, so no protocol change; the hit radius was left alone since only the look was asked for |
| Terrain types | Three types (ground, mountain, water), one flat height; mountain and water can't be claimed by anyone | Elevation and cliffs; decorative terrain only | Requested (2026-09-26). Gameplay terrain gives the map routes and choke points; no elevation keeps the iso view and the rules simple |
| Water passability — **superseded 2026-09-26 (shallow water, below)** | A lone water hex is wadeable; water with any water neighbor is impassable without Wings. Since lakes became 3+ (below), all generated water is deep | All water impassable; all water passable | Requested. Small ponds shouldn't block anyone; lakes and rivers should |
| Terrain features — **superseded 2026-09-26 (sizes revised the same day)** | Mountain ranges 1 or 2–18 hexes; lakes 1 or 2–10; rivers 2–20 long, 1–2 wide with the width varying along the river; features never touch | Features allowed to merge; fixed river width | Sizes and the varying width requested. Keeping features apart (the separation rule is my addition) keeps each feature's size as generated and stops a lone water hex joining a lake or river and turning deep |
| Terrain density | About 10% of the map; features are added until that's covered, so the counts follow (with the revised sizes, typically ~10 mountain ranges, ~8 lakes, ~5 rivers) | ~5%; ~20%; fixed feature counts | Chosen by the developer as enough to shape routes without crowding. The coverage target is the knob. Tune in playtests |
| Random map per match | A new layout is generated when each match is created | One fixed map; a map picked from a set | Requested: every match should play differently |
| Terrain and shots | Mountains block shots; water doesn't | Neither blocks; both block | Chosen by the developer: ranges become cover, water stays a pure movement barrier |
| Wings | Upgrade, 100 materials, one per player: walk over mountains and deep water (still can't claim them) | 150 or 200 materials | Price chosen by the developer, in line with the other upgrades |
| Terrain fairness | The spawn areas are always ground, and every ground hex is reachable on foot | No guarantee (retry-free generation) | My addition: a player without Wings must never spawn trapped, and no buildable ground may be walled off |
| Terrain look (until sprites) — **superseded 2026-09-29 (terrain graphics, below)** | Mountain: off-white with a thin gray border. Water: dark blue with a dotted border in the normal border color | — | Requested; distinct from each other, from ground and from every team color |
| Terrain features (revised) — **superseded the same day (mountain pieces, gap, compact lakes, below)** | Mountain ranges 3–32 hexes; lakes 3–32; rivers 2–20 long and 1–4 wide, the width changing by one hex at a time; holes at river bends filled; features never touch | The first sizes (singles allowed, rivers 1–2 wide) | Requested: bigger, more substantial features with no single hexes. Filling holes (my addition) stops wide bending rivers leaving ground pockets inside them |
| Shallow water | Water one hex across is shallow and walkable: a water hex with at most two water neighbors that don't touch each other (1-wide river stretches, bends included). Everything else is deep | Only lone water is shallow (previous); a river that's 1 wide along its whole length | Requested (2026-09-26): "single" water meant water you can step across. The rule is purely about shape, so both sides compute it the same way (`shared/terrain.ts`) |
| Mountain pieces | Ranges of 3–35 hexes built from small mountains (3 hexes that all touch) and large ones (a hex and its 6 neighbors), touching but not overlapping; ~40% large | Free-form blobs (previous) | Requested: small and large mountains will map to different sprites |
| Compact ranges and lakes | Each new mountain (every placement beside the range, every orientation) and each new lake hex goes where it touches the most, ties at random | Random placement beside the feature (previous, lacy with arms and holes); also pulling toward the middle (tried: made ranges smaller and more scattered) | Requested: chunky, not lacy. Measured on 40 maps: ~3.9 same-feature neighbors per hex for both, vs ~3.45 for the lacy version |
| Feature gap | At least 3 ground hexes between any two features (`FEATURE_GAP`) | 1 (previous); 2 | Requested ("at least 3 tiles away"); 3 hexes between chosen by the developer |
| Shallow vs deep, small vs large: stored or derived? | Shallow/deep is derived from the water's shape wherever it's needed; small/large mountain pieces are recorded by the generator but not synced yet | Enumerate them as extra terrain values | Deriving shallow water keeps one source of truth. Which hexes form a mountain piece can't be derived, so it'll be synced when the sprites need it |
| Upgrade levels | Booster, Expander and Armor have 3 levels, Wings 1; 100 materials a level; the shop lists each upgrade once and offers the next level | One of each (previous) | Requested (2026-09-26). "Speed boost" renamed "Booster" |
| Booster steps — **superseded 2026-09-27 (+33%, below)** | +25% of base top speed per level: 125 / 150 / 175% | Compounding 25% (125 / 156 / 195%) | Chosen by the developer: even, readable steps |
| Expander steps | Claim 7 / 19 / 37 hexes (1 / 2 / 3 rings; radii 80 / 125 / 180 px) | 7 / 12 / 19 | Chosen by the developer: big, visible jumps |
| One upgrade slot | Only the equipped slot upgrade (Booster, Expander, Wings) works; switch at most every 5 s; can't take Wings off over solid terrain; a purchase into an empty slot equips itself | Every owned upgrade works (previous); instant switching; switching only on your own territory | Requested (one slot); the 5 s cooldown chosen by the developer to stop reflex swaps in a fight. The Wings rule and auto-equip are my additions: no getting stuck inside a mountain, and a first purchase just works |
| Armor | Always on (no slot), 3 levels of +100 max health (200 / 300 / 400) | Armor in the slot, with health capped at 100 when switched off | Chosen by the developer |
| Inventory | A popup like the shop (`I` / Inventory button): gun, ammo, structures, Armor, and owned slot upgrades with Equip (Unequip on the equipped one until 2026-09-26, see *Equipped button* below), a cooldown countdown, and a note when Wings can't come off | Switching from the HUD; a permanent side panel | Requested ("an inventory where they can switch between upgrades and see their owned structures and guns and ammo"). A popup matches the shop and leaderboard and fits phones. The Wings note (checked live on the client with the same `blocksWalking` rule) means a refused switch is never silent |
| Spawn line | Players start near the east edge in one column, first joiner in the middle, later ones alternating above and below, 6 rows apart; you keep your spot all match and respawn there; every spot's area (3 steps) is kept clear of terrain | Everyone at the map center (previous); spots spread by the current player count; respawning at the center or a random spot | Requested (2026-09-26): start on the far right, first player central, more players further toward the top and bottom. Respawning at your own spot and keeping the areas clear are my choices: you come back somewhere you know, can always build where you start, and a whole line of spots is too many to clear at the old 4-step radius (it's now 3) |
| Choosing what Build places | Pick a structure type in the inventory (Select / Selected); Build places it while you have one, else the first in your inventory; the Build button names it and counts that type | Build cycles types; a picker next to the Build button | Requested (2026-09-26). The inventory already lists structures by type, and a pick that runs out falls back instead of disabling Build |
| Equipped button | The equipped upgrade's button is a disabled "Equipped"; there's no way to empty the slot from the inventory | "Unequip", which emptied the slot (previous) | Requested (2026-09-26). The server still accepts an empty-slot request, so this is a client-only change |
| Income from claiming | 5 materials per hex claimed (unclaimed or an enemy's), paid on the claim; no timed income | 1 material per owned hex every 10 s (previous) | Requested (2026-09-26). Rewards moving and taking ground rather than sitting on it. Materials aren't taken back when a hex is lost (my choice: simplest, and it makes the number on screen only go up from play) |
| Dev materials key | `M` adds 500 materials during the match, dev builds only, refused by a production server | A lobby option; an environment variable for starting materials | Requested as a temporary development aid, so shop items and upgrades can be tried without long play |
| Income from claiming (revised) | A hex pays MATERIALS_PER_CLAIM only the first time anyone claims it in the match; re-takes and released hexes pay nothing | Every claim pays (previous, 2026-09-26) | Requested (2026-09-27): border fights shouldn't be a material farm. The value was also lowered from 5 to 1 by the developer |
| Pickups | 12 locations in a 4 × 3 grid, nudged ±2 hexes and moved off terrain and spawn areas; materials 40% (10–50), ammo 25% (10–30), level-1 upgrade 10%, basic gun 10%, big gun 5%, structure 5%, nothing 5%; one-time; behind the PICKUPS_ENABLED flag | Random scatter; respawning items | Locations, chances and amounts requested (2026-09-27). My choices: the grid-plus-nudge reading of "evenly distributed"; keeping them out of spawn areas so nobody starts on one; taking only items you can use (the shop's rules), so a pickup isn't wasted on someone who can't benefit; walking onto the hex (like claiming) to take one |
| Credits become materials | The currency is **materials**, needed to make items; renamed everywhere (UI, code, protocol, docs). Shop prices show as "100 mat"; the pickup pile is a wooden crate instead of a gold coin | Keep "credits" in code and only change the UI text | Requested (2026-09-27) as a new concept. Renaming the code too keeps one word for one thing. Wording like "buy" and "shop" is left for the fabricate change |
| Fabricate, not buy or build | The Shop is now the **Fabricate** menu (still `E`; "Fabricate" buttons, "Fabricating is on your own time"); placing a structure is **Fabricate** too, on `F` (was `B`, which now does nothing); the Mine is now the **Fabricator** | Separate words for the menu and for placing | Requested (2026-09-27): items are fabricated from materials, not bought or built. The Engineer keeps its name (it now starts with a fabricator), and so does the Builder; the fabricator keeps the mine's dark-brown color until art |
| Fabricator, Build and `E` (revised) | The menu is the **Fabricator** (button only; `E` is unbound and kept for later); placing a structure is **Build** on `B` again | "Fabricate" for both, with `F` for placing (previous, same day) | Requested (2026-09-27). The menu shares its name with the Fabricator structure for now |
| No switching cooldown | Switch the equipped upgrade instantly, as often as you like; the Wings-over-terrain rule stays | At most once every 5 s (previous) | Requested (2026-09-27), ahead of the planned HUD inventory where clicking an upgrade switches to it. This allows flicking Wings on to cross a river mid-chase; revisit if it's abused |
| Smuggler renamed Explorer | The armed starting character is the **Explorer** (id `explorer`); same kit (Basic gun, 15 ammo, 15 materials) and description. Older text was reworded | Keep the id `smuggler` and change only the name | Requested (2026-09-27). Renaming the id too keeps code and game in step, as with mine → fabricator |
| Inventory bar | Structures and upgrades as icons down the right side; clicking a structure starts building it, clicking an upgrade switches to it; the Build button is removed and `B` stays; the left HUD drops its Structures and Upgrade lines | Keeping the Build button alongside; a bottom bar | Requested (2026-09-27). The right side is free on desktop and phones (the joystick and FIRE hold the bottom corners). A bottom hint replaces the Build button's "Pick a spot" text. The Inventory popup stays for now |
| Inventory popup removed; `F`, `I`, `Tab` | The Inventory popup and its button are gone (the inventory bar covers structures and upgrades; gun and ammo are in the top-left HUD). `F` opens the Fabricator, `I` hides/shows the inventory bar, `Tab` in build mode cycles structure types | Keeping the popup for gun and ammo | Requested (2026-09-27). `Shift+Tab` going backwards is my addition. Tab only does this in build mode, so it's left alone otherwise |
| Mystery drop pods, tiered odds | Every pickup is the same drop pod; its contents are rolled when opened, from the opener's score tier (four tiers by rank; ties share the average place), with better odds further behind; unusable outcomes are dropped from the roll; no empty pods | Contents fixed at generation (previous); tiers by fixed score bands | Requested (2026-09-27): surprise, and a catch-up mechanism for losing players. Ranking (not score bands) works at any score scale; my choices: ties averaging (so everyone at 0 lands mid-table, not top), dropping unusable outcomes rather than leaving the pod, and removing the 5% empty pod |
| Empty locations, pod respawns, spawn platforms | 5% of locations get no pod (back from before the drop pods); a respawn wave at 2:50 refills empty cells the same way, each pod after a 0–15 s delay, avoiding structures; a metal platform with a team-colored light marks each player's spawn | Respawning each opened pod in place; a fixed respawn position | Requested (2026-09-27). My reading: the wave refills only cells whose pod was opened (or never appeared), and repeats every 2:50; the team light is my addition so players can tell whose pad is whose |
| Start screens and games | Splash (title + Play) → game list (Create game on top, find by code or name, open games) → Create game (map size, length, then switches for teams, drop pods and guns) → lobby; every game has a 4-character code and a `/game/CODE` URL | Quick-play (join any open game); a host-controlled lobby | Requested (2026-09-27). My choices: map sizes 64/80/96 (bigger costs too much graphics memory on phones), 4-character codes without look-alike characters, a game name field (the list filters by name), "Play again" going back to the list, drop-pod grid scaled with the map, and no connection-status line on the start screen |
| Menu header, Create buttons, 7-minute games | The game list, Create game and joining screens share a header: back on the left, "SECTOR 42" centered, the right kept free for a settings button. Create game's buttons are centered, with a plain-text Cancel left of a green Create game. Game length adds 7 minutes | — | Requested (2026-09-27) |
| Colors with teams off; lobby header and phone layout | With teams off, players pick a color no one else has (the picker's title becomes Color, taken colors crossed out and disabled); the lobby uses the menu header (Leave left, SECTOR 42 centered); on phones the pickers sit side by side under your name | No choice of color with teams off (previous, same day) | Requested (2026-09-27). The server enforces "not taken" in `selectTeam` |
| Compact lobby rows; footer | On phones other players take one line (name with color dot, character, ready); with teams off their team/color isn't spelled out (the dot shows it); every menu screen has a "© 2026 kenecaswell" footer with space above it | — | Requested (2026-09-27) |
| Booster, Expander and shot speeds (revised) | Booster +33% a level (133 / 166 / 199%); the Expander now slows you 10% a level (90 / 80 / 70%) while equipped; shots 50% faster (600 on-screen px/s, same 2 s lifetime, so 50% more range) | +25% Booster, no Expander penalty, 400 px/s shots (previous) | Requested (2026-09-27). The Expander's wide claims get a cost; faster shots are easier to land. Keeping the lifetime (my choice) means the range grows too; shorten `PROJECTILE_LIFETIME_MS` if that's too far |
| Bots | Computer-controlled players added in the lobby, each with its own difficulty (Easy, Medium, Hard), color and character; anyone in the lobby can add, change or remove them; always ready; they take one of the 10 places and play by the same rules, through the same actions, as people | A separate single-player mode or button; one difficulty for the whole game; bots that fill empty seats automatically | Requested (2026-09-28): single player, with the bots' difficulty settable (Easy, Medium, Hard). My choices: single player is just a game with bots (no separate mode, so bots also work in multiplayer games), difficulty per bot so a match can mix them, anyone can manage bots since there's no host, a newcomer's free color and a random character, and lobby only |
| Bots don't start a match on their own | The match needs at least one connected, ready person; bots are always ready | Bots count like anyone | My addition: otherwise a lobby whose people had all dropped would start with only bots |
| Spawn mercy for bots | Bots don't shoot or chase an enemy within 3 hexes of that enemy's own spawn spot (`BOT_SPAWN_MERCY_RADIUS`) | No protection | My addition, from simulation: a Hard bot scored 222 kills in 5 minutes by camping the others' respawns, which would feel awful to play against. It applies only to bots; people can still fight anywhere |
| Difficulty as profiles | Each difficulty is a set of numbers (think rate, speed, look-ahead, reaction time, aim error and lead, fire rate, range, chasing, what to fabricate and in what order, building, upgrade switching); first-pass values tuned in headless simulations | Separate hand-written behavior per difficulty | One behavior with different numbers is easier to tune and keeps the difficulties consistent; `tools/bot-sim.js` plays a match in about 2 seconds, so a change can be compared on the same maps |
| Respawn delay and backpacks | A defeated player is out for 5 s (`RESPAWN_DELAY_MS`), then respawns at their spawn. Their gun, ammo and every upgrade level drop in a backpack on the hex where they fell, which only they can see and pick up; tiles, structures, materials and kills stay theirs | Instant respawn keeping everything (previous); dropping gear anyone can take | Requested (2026-09-29): 5 s delay; weapons and upgrades (not structures) dropped where you died; nobody else can see or take them; a backpack icon. My choices: **ammo goes in the backpack with the gun** ("weapons"; otherwise you'd respawn with shots and nothing to fire them with); getting it back merges with what you've fabricated since (better gun, higher levels, ammo added) so re-buying is never wasted; while down you can't be hit, act or open pods, but can use the Fabricator; a backpack you couldn't walk to (dropped flying over terrain, with the Wings inside) moves to the nearest walkable hex; backpacks last until picked up or the match ends |
| Bots and backpacks | Bots go back for their own backpack unless an armed enemy is within their shot range of it; they ignore downed players | Always go back | From simulation: weaker bots kept walking back to where a Hard bot had just defeated them and dying there again, spending up to 40% of the match in "recover" |
| Weapons cost double | Basic gun 200, Big gun 400, ammo pack 60 (2 materials a shot) | 100 / 200 / 30 (previous) | Requested (2026-09-29). My reading: "weapons" is the Fabricator's Weapons category, so the ammo pack doubles too |
| Explorer starts with Armor | The Explorer has no gun or ammo; it starts with Armor 1 (200 health) and keeps its 15 materials. Nobody starts armed | Basic gun and 15 shots (previous) | Requested (2026-09-29). Keeping 15 materials (my choice): Armor 1 is worth 100 materials, so it's still the kit with the least to spend |
| Terrain graphics | Mountains are one sprite per mountain (small 3-hex and large 7-hex): a faceted, lit, snow-capped peak built from its own footprint, varied per mountain, depth-sorted like players. Water is drawn into the terrain: deep blue with waves, darker mid-lake, turquoise shallows with a sandy bed, a bank along back shores and foam on every shore, no hex lines inside lakes, and a few glints | Hand-drawn sprite images; flat colors (previous) | Requested (2026-09-29): my best shot at mountains, water and shallow water, with the two mountain sizes. Drawn in code for now, since there are no art files yet: the shapes follow the real footprints, cost nothing per frame (baked once), and can be swapped for real sprites later. The cold palette and snow suit Titan |
| Ground texture | Slate tiles with a subtle texture (grains, the odd crack or frost patch) and a soft bevel; smooth patches of brown and maroon dust across the map; claim tints see-through | Per-tile random colors; a strong pattern | Requested (2026-09-30): texture that stays subtle, using the brown and maroon of the look-and-feel notes (Titan: icy, hazy, futuristic, sleek yet cartoony). My choices: the brown and maroon as tholin dust (it's real on Titan) in patches that span several tiles rather than tile by tile, so it reads as terrain and not noise; the bevel for the "sleek panel" feel; see-through claim tints so owned ground keeps its texture |
| Titan palette | Ground coffee brown with tan dune drifts and charcoal ice-rock outcrops; mountains charcoal and brown-gray with cream frost caps, dusty lower slopes and the ground's texture; deep liquid inky black with patches of metallic gold sky reflection; shallow liquid dark amber-brown; dark warm browns for cliffs, outlines and the area around the map | Slate ground with blue water and white snow (previous); a full orange-sky look | Requested (2026-10-01) from research on Titan's colors (amber, tangerine, coffee, cocoa, rust, tan, inky black, charcoal, brick red), but without looking too alien. My choices: keep shapes that read as Earth-like (brown earth, dark water with sunset reflections, snowcap-like frost) and only shift the colors; gold in smooth patches across a lake, not per tile; shallow water darker than the ground so walkable liquid still reads as liquid; the gold kept saturated so it never looks like the dull tan dunes |
| Two color schemes | Slate (the original) and Titan; the server picks one at random for each game, and everyone in it sees the same one. Shallow liquid is one flat, much brighter color in each, so it's never confused with deep | Titan only (previous); letting the creator pick a scheme; a scheme per player | Requested (2026-10-02): keep the original scheme too and have the game choose randomly. My choices: per game, not per player, so everyone sees the same map; in Titan, deep liquid's gold sheen toned down to dark bronze plus glints and shallows made a bright golden amber, because gleaming deep liquid looked like the old amber shallows. A unit check holds every scheme to that rule |
| Structures become essential (tile limit, Fabricator, Guard Tower, power plant) | Tile limit of 500 hexes, +500 per farm, enforced on every claim (enemy hexes too) with a notice and a Tiles x / y readout. Points: farm 100 points (Farmer 150), fabricator 100, Guard Tower 50, power plant 100; all health 1000 except the Guard Tower's 500; all cost 100. The Fabricator menu and the server's gun, ammo and upgrade purchases need an owned fabricator. The fort is now the Guard Tower: 3 touching hexes, fires the Basic gun with unlimited ammo | Structures all identical (previous); a hard cap that takes hexes away when a farm is lost; a notice on every blocked tick | Requested (2026-10-03). My choices: structures are bought in a separate **Build menu** (`B`), never locked, because the Fabricator menu used to sell them and nobody but the Engineer could otherwise buy a first fabricator (K.C. picked this); losing a farm or fabricator takes away its effect but never your hexes (K.C. picked this); towers auto-fire at the nearest enemy player (K.C. picked this) with their own range and fire interval, never at structures; the notice repeats at most every 8 s; a Guard Tower's rotation follows the pointer so there's no rotate key; "farmers score 50% more" means the Farmer character's farms; placing a structure moved from `B` to `P` |
| Kills score nothing; Engineer rename | `KILL_POINTS` is 0: score is tiles plus structure points. Kills are still counted and shown. The results screen breaks the score down per player (tiles, structures with their points, kills) and its footnote states the rule. The Miner is now the **Engineer** (id `engineer`) | Kills 50 points (previous); dropping kills from the results table | Requested (2026-10-03): deincentivize killing. My choices: keep the kill counter, the column and the tie-break (kills, then tiles) rather than remove them, and keep `KILL_POINTS` as a constant at 0 so it can be turned back on; the final standings carry `structurePoints` so the breakdown adds up |
| Basic gun nerf; pod odds | Basic gun and Guard Tower damage 50 → 25 (four hits kill an unarmored player); Basic gun fire rate 5 → 1 a second (`GUN_FIRE_INTERVAL_MS`, the Big gun stays at 5 a second), which the Guard Tower shares; every pod tier gets 10 points more materials and 10 less ammo (60/52/42/32% materials, 25/20/15/10% ammo) | 50 damage, 5 a second (previous); the tower on its own 0.7 s interval | Requested (2026-10-03): the Basic gun was too strong now that towers use it, and players who run out of materials but need a farm can find materials in pods. My choices: the rate is per gun, in shared code, so the client, the tower and the bots agree (bots can't fire faster than their gun); I read "ammo to 25%" as the leader's row (35 → 25) and moved every tier's ammo down by the same 10 points that materials gained, so each row still adds up to 100; the Big gun's damage and rate are untouched |
| Blaster and Ion Cannon | The Basic gun is now the **Blaster** and the Big gun the **Ion Cannon** (display names; the ids `basic` / `big` and `basicGun` / `bigGun` stay in code). The Ion Cannon is double the Blaster in every spec: damage 50 (was 100), fire rate 2 a second (was 5), range 2,400 px (a 4 s flight, was 1,200). Its price (400) was already double. Guard Towers still fire the Blaster | Big gun 100 damage at 5 a second (previous); renaming the ids too | Requested (2026-10-03): nerf the Big gun to double the Basic gun's specs, and rename both. My reading of "all the specs": damage, rate of fire and range (the price was already double); say if you meant fewer. Shot flight time is now per gun (`GUN_SHOT_LIFETIME_MS`). Ids kept to avoid renaming dozens of identifiers with no player-visible effect. Older rows in this log use the old names |
| Harvester, Jetpack and the bot start delay | The Expander is now the **Harvester** and the Wings the **Jetpack** (display names; the ids `expander` / `wings` stay in code). The Jetpack also gives Booster 1's speed (133% while equipped) and costs **200** (the one upgrade priced apart: `cost` per upgrade in `UPGRADES`). Bots wait 2 s after the match starts (`BOT_START_DELAY_MS`) | The Jetpack at 100 and walking only (previous); renaming the ids | Requested (2026-10-03). My choices: the speed bonus counts only while the Jetpack is the equipped slot upgrade, like every slot upgrade, so it replaces Booster rather than adding to it (equal to "the equivalent of Booster 1"); ids kept, as with the guns; the delay is scaled by `PHASE_TIME_SCALE` like other timers. Older rows use the old names |
| Specialist structure points; tower range; icons | A Farmer's farm, an Engineer's fabricator and a Scientist's power plant score 150 instead of 100 (`SPECIALTIES`, `SPECIALIST_STRUCTURE_POINTS`); the Guard Tower's sight range goes back to 450 px; the Booster, Harvester, Armor and Jetpack have drawn icons (a jet engine with a blue flame, a tracked harvester, a knight's breastplate, a jetpack) | The Farmer alone; 550 px; the placeholder diamonds | Requested (2026-10-03). My reading: the Engineer's and Scientist's bonus is for the structure they start with, as the Farmer's was, and the Builder gets none (not asked) |
| Builder removed; icon tweaks | The **Builder** character (it started with a Guard Tower) is gone, leaving five characters. Booster icon off-white with curved bands, Armor a torso-shaped cuirass, Jetpack matte slate gray with its two tanks almost touching | Keeping the Builder | Requested (2026-10-03). Guard Towers are now only bought (100 materials) or found in pods. The four-structure-starting-characters wording becomes three (Farmer, Engineer, Scientist) |
| Guard Tower limit by map size | At most 10 Guard Towers per player on Small (the default), 16 on Big, 23 on Large, counting standing and held ones together; enforced on purchases and pods, shown in the Build menu, and respected by bots | No limit (previous); a limit by territory or a cooldown | Requested (2026-10-03): a limit that grows with map size, 10 on the default map. My choices: Big and Large scale with map area (1.56x, 2.25x, rounded), the limit counts held towers so you can't stockpile past it, and a pod re-rolls to another structure type rather than giving a tower you can't hold |
| Backpacks off by default; wider spawn safe area | Backpacks sit behind `BACKPACKS_ENABLED` (off; `BACKPACKS=1` turns them on), so by default a defeated player keeps all their stuff and only loses the 5 s. Guard Towers don't shoot a player within 6 hexes of their own spawn (`SPAWN_SAFE_RADIUS`; was 3 for bots only), and a tower's shot in flight passes through them there. Bots use the same 6 | Backpacks always on (previous); a smaller safe area | Requested (2026-10-03). My choices: 6 hexes (wider than the 3 kept clear for building, about a tower's reach); the flag is a server-wide switch copied into `GameState.dropBackpacks`, like the pod flag; the safe area applies to a player's own spawn only; it stops tower targeting and tower shots, not other players' |
| Spawn zones; respawn where you die | The 7 hexes of each player's spawn (hex and neighbors) can only be claimed by that player or their team. A feature flag, `RESPAWN_WHERE_DIED_ENABLED`, **on** for now, has defeated players respawn where they fell (nearest walkable, non-enemy-structure hex if that's unusable) instead of at their spawn spot | Respawn at the spawn spot (previous, still the flag-off behavior); protecting only the single spawn hex | Requested (2026-10-03). My choices: the zone is the same 7-hex shape as a structure, so no structure can be built on or touching it by anyone else; a player's zone vanishes when they leave; the flag is a server-wide switch copied into `GameState.respawnWhereDied`, like the other flags; with respawn-where-died on, the spawn safe area from Guard Towers only helps near a spawn, since people no longer return there |
| One Build menu with two tabs | The Fabricator popup and the Build popup are one **Build** menu: a **Structures** tab (never locked) and an **Upgrades** tab (guns, ammo, upgrades; grayed out until you own a Fabricator). `B` opens Structures, `F` and `U` open Upgrades, `E` and `P` toggle placement mode; one Build button replaces the Fabricator and Build buttons | Two popups and two buttons (previous) | Requested (2026-10-03). My choices: `F` or `U` without a Fabricator opens the menu on Structures (where one can be bought) rather than doing nothing; pressing a hotkey for the tab already showing closes the menu; materials and tiles show in the header of both tabs; the code keeps its shop names (`UpgradesPanel`, `purchase`). `E` is bound again, to placement, after being free since 2026-09-27 |
| Spawn platform follows the respawn point | With respawn-where-you-die on, each player's spawn platform moves to where they fall and stays there until they next fall | Leaving it on the spawn hex (it then marked a spot nobody came back to) | Requested (2026-10-03). My choices: it moves permanently to the latest death spot, not just while the player is down, so it always marks their last respawn point; the spawn zone and tower safe area do not move with it, since they belong to the spawn spot; the flag is synced to clients as `GameState.respawnWhereDied` so the client knows when to move it |
| Hard bot engage range −20% — **reverted 2026-10-03 (respawn grace period, below)** | A Hard bot shot at, and chased, enemies within 520 px (it was 650) for a short while | 650 (restored) | Requested after a playtest: out of ammo, killed, and respawned (where you fell) with the Hard bot still chasing, with no time to open the Upgrades tab to buy ammo. Reverted when the grace period below fixed the cycle more directly |
| Bots fire at half rate; the Harvester circle goes with its owner | Bots wait twice as long between shots (`BOT_FIRE_INTERVAL_FACTOR` = 2 on top of their gun's rate and difficulty): a Blaster every 2 s, an Ion Cannon every 1 s. A defeated player's Harvester claim circle is hidden until they respawn | Bots at their gun's full rate (previous); only Hard slowed; the circle left on the ground while its owner was down | Requested (2026-10-03) after a playtest against four Hard bots. My choice: one factor applied to every difficulty, since the gun's own rate (not the difficulty's interval) had been the limit for all three |
| Respawn grace period | After respawning, a player is untouchable for 5 s (`RESPAWN_GRACE_MS`): shots, Guard Towers and bots ignore them; they blink between 50% and 100% opacity every 0.3 s | Shrinking the Hard bot's range (tried first, then reverted); a longer or shorter grace; ending it when the player shoots | Requested (2026-10-03) after a playtest where a Hard bot killed the same player again and again, so they never had time to buy ammo. My choices: 5 s as asked; the player can still move, claim and shoot during it (shooting does not end it); it applies only after a defeat, not at the match start; the blink period of 0.3 s was set by request ("more like blinking") |
| Guns are a per-game setting, off by default | `GameSettings.guns` (Create game: Guns Off / On, default Off): with it off no player guns or ammo in the shop, drop pods, bots' shopping or any menu; Guard Towers unaffected. Shown in the game list and lobby ("Guns" / "No guns") | A server flag (`GUNS_ENABLED`, tried first the same day); removing guns from the catalog | We want to play without player weapons by default but keep the guns and their numbers one click away. The flag was replaced by the setting so a game can switch them back on without restarting the server. |
| Swatch color picker; ten colors | The lobby's team/color `<select>` became a swatch that opens a popup of swatches in two rows of five, titled "Color" ("Team color" with teams on). Two colors, pink and brown, were added so there is one per seat (10) | Keeping eight colors and a 4 × 2 grid; a row of always-visible swatches; keeping the dropdown | Requested (2026-10-03): "two rows of 5" because the player limit is 10. With ten colors nobody has to share a color with teams off. Taken colors are crossed out rather than hidden so the grid never changes shape. Swatches are 44 px on touch screens (30 px with a mouse), the usual minimum tap size, chosen by the device's pointer type rather than the screen width. |
