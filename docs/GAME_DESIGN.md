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
9. [Territory](#territory)
10. [Combat](#combat)
11. [Structures](#structures)
12. [Economy and shop](#economy-and-shop)
13. [Scoring and winning](#scoring-and-winning)
14. [Controls](#controls)
15. [Look and feel](#look-and-feel)
16. [Open design questions and plans](#open-design-questions-and-plans)
17. [Design decisions log](#design-decisions-log)

---

## The game at a glance

Sector 42 is a real-time multiplayer **territory-claiming** game for mobile and desktop web browsers, inspired by hexar.io. Up to **10 players** share an isometric hex map for a **5-minute match**. You claim hexes by walking over them, earn credits from the territory you hold, spend them on guns, upgrades and structures, and fight other players and teams for ground.

- **Core loop:** move → claim hexes → earn credits from them → buy things that help you claim, defend or attack → repeat until time runs out.
- **Territory is the point.** Fighting is a tool for taking and defending ground, not the goal: defeated players respawn straight away, so a match never ends early from combat.
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

- A cast of six roles: Farmer, Miner, Builder, Robot, Scientist and Smuggler ([Characters](#characters)).
- Four kinds of structure: farm, mine, fort and power plant ([Structures](#structures)). Dorm? Processing facilities?
- Reference art showing hex terrain with mountains, trees, water and cliffs (mood only, see [Look and feel](#look-and-feel)).

This is the section to grow as the world takes shape.

---

## Match flow

A match moves through four phases. ✅

| Phase | What happens | How long |
|---|---|---|
| **Lobby** | Players join, set a name, pick a team color and a character, and press **Ready**. | Until every connected player is ready |
| **Countdown** | Everyone is ready: "Starting in 3…". Nobody can move yet. If anyone un-readies or a new player joins, it cancels back to the lobby. | 3 s (`COUNTDOWN_DURATION_MS`) |
| **Playing** | The whole match. Claiming, shooting, building, earning and shopping all happen at once. | 5 min (`MATCH_DURATION_MS`) |
| **Results** | Final standings and the winner. No new players can join. The room closes when the timer ends (or when the last player leaves), but each player's results stay on screen until they choose **Play again** or **Main menu**. | 60 s (`RESULTS_DURATION_MS`) |

- **Nobody is in charge.** There is no host and no Start button: the match starts itself once everyone is ready.
- **Characters apply at the start.** Your character's starting kit is given to you when the countdown ends, replacing anything you had.
- **Team and character are locked while you're ready.** Un-ready to change them, so what everyone saw when they readied is what starts. Your name can still change while you're ready, but not once the match starts.
- **Players who drop don't hold up the lobby.** A disconnected player is left out of the ready check.
- **Joining mid-match** is allowed during the playing phase. The newcomer plays the default character (Farmer).
- **Play again** puts you in a fresh lobby (not a rematch in the same room).

Implementation: [Game Phases](ARCHITECTURE.md#game-phases), [Room Lifecycle](ARCHITECTURE.md#room-lifecycle).

## The map

✅ A **64 × 64 grid of flat-top hexes**, viewed at an isometric tilt, all at one flat height (no elevation). 📝 Each match gets a freshly generated layout of ground, mountains and water; see [Terrain](#terrain).

- **Size in play:** crossing the map takes about **15 s left to right** and **11 s top to bottom** at normal speed. (The vertical trip is shorter because the tilted view squashes the map vertically and speed is measured on screen.)
- **Edges:** you can walk right up to the edge but not off it. The camera always keeps you centered, even at the edge.
- **Corners:** the map's outline is jagged (it's made of hexes), so at a few edge spots you can stand over no hex at all. Those spots can't be claimed.
- **Spawning:** everyone starts and respawns at the **center of the map** for now. 📝 See [Open design questions](#open-design-questions-and-plans) for the planned spawn line.

Implementation: [Map — hex grid and coordinate spaces](ARCHITECTURE.md#map--hex-grid-and-coordinate-spaces).

## Terrain

🧪 **Built** (2026-09-26): every match gets a random layout; mountains and deep water block movement unless you have **Wings**, nobody can claim terrain, and mountains stop shots. The numbers are first-pass. Every hex is one of three terrain types. There's **no elevation**: mountains are a kind of hex, not a height.

| Terrain | Walk on it? | Claim it? | Shots |
|---|---|---|---|
| **Ground** | Yes | Yes | Pass |
| **Mountain** | Only with **Wings** | Never | **Blocked** |
| **Water, shallow** (1 hex across: narrow river stretches) | Yes | Never | Pass |
| **Water, deep** (lakes, and rivers 2+ hexes wide) | Only with **Wings** | Never | Pass |

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
- **Wings** (upgrade, [shop](#economy-and-shop)) let you walk over mountains and deep water. Winged or not, you still can't claim them.

### Claiming and building

- **Nobody can claim mountain or water hexes**, Wings or not. They stay neutral all match and never count toward anyone's hexes or income.
- **Structures can't sit on terrain.** A structure needs all 7 hexes of its footprint to be yours, and terrain can't be yours. So a structure never covers a mountain or water hex.

### Combat

- **Mountains block shots.** A shot stops at the first mountain hex it enters, so ranges make cover to hide behind.
- **Water doesn't block shots.** Shots fly over lakes and rivers.

### Fairness

- **The spawn area is always open ground.** Everyone starts and respawns at the map center, and the generator keeps that area clear.
- **Every ground hex can be reached on foot.** The generator never walls off ground with mountains or deep water (shallow water counts as walkable), so players without Wings can always get anywhere a structure could be built.

Implementation: [Terrain](ARCHITECTURE.md#terrain).

## Players

- **Body:** a circle a little smaller than a hex (`PLAYER_RADIUS`, 20, against a hex radius of 32).
- **Movement:** ✅ continuous, in any direction, with smooth acceleration, turning and stopping rather than snapping. Top speed (`PLAYER_SPEED`) is the same in every direction **as seen on screen**. A joystick pushed part-way moves you more slowly.
- **Health:** 🧪 100 (`BASE_MAX_HEALTH`), +100 per Armor level (200 / 300 / 400; `ARMOR_HEALTH_PER_LEVEL`).
- **Death and respawn:** ✅ at 0 health you respawn instantly at the map center with full health. **You keep your tiles, credits, upgrades and kills.** The player who landed the killing blow gets the kill.
- **Dropped connection:** ✅ your player stays on the map, frozen and drawn dimmed, and keeps its tiles and structures for **3 minutes** while the game tries to reconnect you. A frozen player can still be shot. Everyone sees a notice when you drop and when you return. After 3 minutes your spot is released and your tiles go back to unclaimed.
- **Names:** ✅ 2–25 characters (an emoji counts as one), anything allowed. If someone already has your name (ignoring case), you get the first free "name (1)", "name (2)", …. Your last name is remembered on your device for next time.

Implementation: [Movement](ARCHITECTURE.md#movement), [Reconnection System](ARCHITECTURE.md#reconnection-system), [Lobby, characters and teams](ARCHITECTURE.md#lobby-characters-and-teams).

## Teams

✅ first version. **A team is a color.** There are 8: red, blue, green, yellow, purple, teal, orange and gray. Everything you own (your body, hexes, structures, claim circle) is drawn in your team's color.

- **Default is free-for-all.** A newcomer gets the first color nobody is using yet, so everyone starts on their own team until players deliberately pick the same color.
- **Anyone can join any team.** There is no size limit or balancing (so everyone could pick the same color and have nobody to fight).
- **Teammates are allies:**
  - No friendly fire: your shots pass through teammates and their structures.
  - Teammates' structures don't block you (just like your own).
  - You never take a teammate's hexes, so allies expand around each other instead of stealing back and forth.
- **Everything else is still per player:** tiles, credits and score belong to each player. The results screen adds a team table (total score per team) when any team had two or more players.

📝 Still open: pooling tiles or credits, a team win condition, and balancing ([Open design questions](#open-design-questions-and-plans)).

Implementation: [Lobby, characters and teams](ARCHITECTURE.md#lobby-characters-and-teams).

## Characters

🧪 Six characters, picked in the lobby (default: **Farmer**). A character sets your **starting kit**, given when the match starts. Values are first-pass and expected to change. They live in `CHARACTERS` in `shared/types.ts`.

| Character | Pitch | Gun | Ammo | Credits | Structures | Upgrades |
|---|---|---|---|---|---|---|
| **Farmer** | Starts with a farm. | none | 0 | 50 | farm | — |
| **Miner** | Starts with a mine. | none | 0 | 50 | mine | — |
| **Builder** | Starts with a fort. | none | 0 | 50 | fort | — |
| **Robot** | Moves faster than everyone else. | none | 0 | 50 | — | Booster 1, equipped (125% speed) |
| **Scientist** | Starts with a power plant. | none | 0 | 50 | power plant | — |
| **Smuggler** | The only one who starts armed, but with few credits. | Basic gun | 15 | 15 | — | — |

- Only the Smuggler can shoot from the start. Everyone else has to buy a gun.
- The four structure-starting characters differ only in which structure type they get, and 📝 structure types don't behave differently yet ([Structures](#structures)).
- 📝 Each character is planned to get its own art; today everyone is a circle in their team color.

## Territory

✅ Holding hexes is how you earn credits and score.

- **Claiming:** during the match, every moment you claim the hex you're standing on **plus every hex whose center is within your claim radius**. The normal radius is about one hex (`BASE_CLAIM_RADIUS`, the hex size): in practice just the hex under you, occasionally a neighbor when you're near an edge.
- **Expander:** 🧪 while equipped, raises your claim radius so that standing mid-hex you claim **7 / 19 / 37 hexes** at levels 1 / 2 / 3 (1, 2 or 3 rings of neighbors; `EXPANDER_CLAIM_RADII` 80 / 125 / 180 world px, `EXPANDER_HEXES`). Off-center you catch a few more at the edge. Everyone can see an Expander's claim radius as a tinted circle around its owner. See [Upgrades](#upgrades).
- **Stealing:** walking over (or near, with the Expander) an **enemy's** hex takes it from them. A **teammate's** hex is never taken.
- **Terrain:** mountain and water hexes can never be claimed, not even the shallow water you wade through ([Terrain](#terrain)).
- **Protected hexes:** the 7 hexes under an **enemy's structure** can't be claimed. Destroy the structure first.
- **Ties:** if two players reach the same hex at the same moment, the one who joined the room first gets it. 📝 Not a deliberate rule; see open questions.
- **When a player leaves for good,** their hexes go back to unclaimed.

Implementation: [Tile Claiming](ARCHITECTURE.md#tile-claiming).

## Combat

✅ Shooting needs a **gun** and **ammo**.

- **Guns:** 🧪 `GUN_DAMAGE` in `shared/types.ts`.

  | Gun | Damage per hit | Unarmored player dies in | Armored (200) player dies in |
  |---|---|---|---|
  | **Basic gun** | 50 | 2 hits | 4 hits |
  | **Big gun** | 100 | 1 hit | 2 hits |

  You have at most one gun. The Big gun replaces the Basic gun, and you can buy it without owning the Basic gun first. You can't go back to the Basic gun.
- **Ammo:** each shot uses 1. You can buy ammo before you have a gun. 📝 Ammo **never regenerates and has no cap**; the only source is buying ammo packs. Running out means you can't shoot until you buy more.
- **Fire rate:** up to 5 shots per second while you hold the fire control (200 ms apart, `FIRE_INTERVAL_MS`). 📝 This limit is currently enforced only by the game client; the server should own it.
- **Shots:** travel in a straight line at the same on-screen speed in every direction, and vanish after **2 seconds** (`PROJECTILE_LIFETIME_MS`), which is roughly a quarter of the map's width sideways. A shot stops at the first enemy player or enemy structure it hits, or at a mountain ([Terrain](#terrain)); it flies over water. Both guns' shots have the same hit size; the Big gun's shots only *look* larger.
- **Friendly fire:** none. Shots pass through teammates and teammates' structures.
- **Kills:** the shooter's kill count goes up and the victim respawns at the center (see [Players](#players)). Kills are permanent and count toward score.

Implementation: [PvP Shooting](ARCHITECTURE.md#pvp-shooting), [Collision Detection](ARCHITECTURE.md#collision-detection).

## Structures

✅ Structures claim a large area permanently, block enemies, and add to your score.

- **Getting them:** each structure-starting character begins with one, and the shop sells more (100 credits each). You hold them in a **structure inventory** until you place them.
- **Footprint:** a structure sits on a center hex and **covers that hex plus its 6 neighbors**.
- **Placing:** press Build, then pick a spot. **All 7 hexes must be yours** (a teammate's don't count), all on the map, and none already under another structure. Since terrain can't be claimed, structures never cover mountains or water. Structures can touch but not overlap. While you choose, an outline shows the structure's shape: yellow if you can build there, red if not.
- **Solid:** enemies can't walk through your structure; they slide around it. You and your teammates can walk over it.
- **Protection:** enemies can't claim any of its 7 hexes.
- **Health and destruction:** 🧪 100 health. Enemy shots damage it, and at 0 it's destroyed and removed. 📝 There's no visible damage state yet (planned: intact → cracked → heavily damaged).
- **Score:** 🧪 +25 per structure you own (`STRUCTURE_POINTS`), lost if it's destroyed.
- **Types:** farm, mine, fort and power plant. 📝 **They all behave the same for now**, with the same health and points. They differ only in color. Giving each type a purpose is the biggest open design task ([Open design questions](#open-design-questions-and-plans)).

Implementation: [Structures: footprint and shape](ARCHITECTURE.md#structures-footprint-and-shape), [Destructible Structures](ARCHITECTURE.md#destructible-structures).

## Economy and shop

### Credits ✅

- **Income:** every 10 seconds (`CREDIT_PAYOUT_INTERVAL_MS`) you earn **1 credit for each hex you own**. Income only runs during the match.
- **Starting credits** come from your character: 50, or 15 for the Smuggler.
- **Spending** in the shop is the only thing that uses credits up.
- **Credits are not part of your score**, so buying things never costs you points.

### Shop 🧪

Open the shop any time during the match (**Shop** button or `E`). The game keeps running while it's open, so shopping in the middle of a fight is risky. The catalog is `SHOP_ITEMS` in `shared/types.ts`.

| Category | Item | Cost | What it does | Limit |
|---|---|---|---|---|
| Weapons | **Basic gun** | 100 | Lets you shoot; 50 damage per hit. | Not if you have any gun |
| Weapons | **Big gun** | 200 | 100 damage per hit. Replaces the Basic gun. | One |
| Weapons | **Ammo pack** | 30 | +30 shots (1 credit per shot). | Unlimited; no ammo cap |
| Upgrades | **Booster** 1–3 | 100 a level | Top speed 125 / 150 / 175% of normal (`BOOSTER_SPEED_PER_LEVEL`). Uses the upgrade slot. | 3 levels |
| Upgrades | **Expander** 1–3 | 100 a level | Claim 7 / 19 / 37 hexes at once. Uses the upgrade slot. | 3 levels |
| Upgrades | **Armor** 1–3 | 100 a level | Max health 200 / 300 / 400, and +100 health right away. **Always on**, no slot. | 3 levels |
| Upgrades | **Wings** | 100 | Walk over mountains and deep water ([Terrain](#terrain)). You still can't claim them, and mountains still stop your shots. Uses the upgrade slot. | One |
| Structures | **Farm**, **Mine**, **Fort**, **Power plant** | 100 each | One more of that structure to place. | Unlimited |

- **Each upgrade is listed once**, offering your next level ("Booster 2" once you own Booster 1); a maxed one shows "Max". A gun you can't improve on shows "Owned".
- **Upgrade levels are permanent for the match**, and survive respawns. See [Upgrades](#upgrades) for the one-slot rule.
- 📝 **Pacing:** starting kits give at most 50 credits and everything except ammo costs 100 or more, so a first real purchase waits on territory income. Worth watching in playtests.

Implementation: [Shop](ARCHITECTURE.md#shop), [Economy (Credits)](ARCHITECTURE.md#economy-credits).

### Upgrades

🧪 Built 2026-09-26.

- **Levels.** Booster, Expander and Armor go up to level 3, Wings has one level. Each level costs 100 credits, bought one at a time in the shop, and is kept all match (respawns included).
- **One upgrade slot.** Booster, Expander and Wings are *slot* upgrades: you can own all of them, but **only the equipped one works**. Armor isn't a slot upgrade: it always works once bought.
- **Equipping.** A slot upgrade you buy with the slot empty equips itself; otherwise it waits in your inventory. Buying the next level of the upgrade you have equipped takes effect at once.
- **Switching** in the **inventory** (`I`, or the Inventory button under Shop): change the equipped upgrade, or empty the slot, any time during the match, at most **once every 5 seconds** (`UPGRADE_SWITCH_COOLDOWN_MS`), so switching is a decision, not a reflex (no flicking Wings on to hop a river mid-chase and straight back to the Booster). You **can't take Wings off while you're over a mountain or deep water** (you'd be stuck inside it).
- **The inventory** also shows your gun, ammo and structures by type, and your Armor level. Each owned slot upgrade has an **Equip** button (**Unequip** on the equipped one, which empties the slot); while the cooldown runs the buttons are disabled with a countdown ("You can switch again in 3s"), and while you're over a mountain or deep water with Wings on, it says why you can't switch.
- The HUD shows your equipped upgrade with its level ("Upgrade: Booster 2") and your Armor level.

## Scoring and winning

✅ first version. Your score is shown at the top of the screen all match and recalculated continuously (`TILE_POINTS`, `KILL_POINTS`, `STRUCTURE_POINTS`):

**score = hexes owned × 1 + kills × 50 + structures owned × 25**

- Score **goes down** when you lose hexes or structures. Kills are banked for good.
- Credits don't count.
- **Winning:** when time runs out, the **highest score wins**. Players with the same score share a rank, and every rank-1 player is a co-winner. The standings are ordered by score, then kills, then hexes (📝 a placeholder tie-break order).
- **Teams:** the results screen shows each team's total score when a team had two or more players, but 📝 there is no team win condition yet.

Implementation: [Score](ARCHITECTURE.md#score), [Results screen](ARCHITECTURE.md#results-screen).

## Controls

The full list of controls for players is in the README's [Controls](../README.md#controls) section. The design choices behind them:

- **Movement keys move in fixed on-screen directions** (`W`/`A`/`S`/`D` or arrows = up, left, down, right), and the mouse only aims and shoots. The first prototype moved you "forward" toward the cursor instead; it felt like chasing the mouse, because the camera follows you while the cursor stays still.
- **Right-click to walk to a spot** on desktop. Any movement key cancels it.
- **Shooting:** Space (hold to keep firing) or click, toward the mouse. On touch, the **FIRE** button fires along your movement direction, and tapping the map fires toward that spot.
- **Touch:** a virtual joystick (bottom left) and FIRE and Build buttons (bottom right). The FIRE button only appears once you have a gun.
- **Hotkeys:** `B` build mode (no time limit; `B` again or `Esc` to leave it), `E` shop, `I` inventory, `L` leaderboard, `Esc` closes popups. `` ` `` (backtick) shows a performance readout.
- 📝 **Touch aiming** is limited to your movement direction or a tapped spot; there's no second aiming stick.

Implementation: [Input — desktop and mobile share one message contract](ARCHITECTURE.md#input--desktop-and-mobile-share-one-message-contract), [Movement](ARCHITECTURE.md#movement).

## Look and feel

📝 **Everything is placeholder art** until real art exists.

- **Players:** a circle in the team color with a shadow and a small dot showing which way they face. Disconnected players are drawn faded.
- **Terrain** 🧪 (colors and borders until there are sprites):
  - **Ground:** the current slate-blue hex top.
  - **Mountain:** off-white, with a thin gray border.
  - **Water:** dark blue when deep, a lighter blue when shallow (wadeable), with a dotted border in the normal border color.
- **Hexes:** claimed hexes are tinted in the owner's color, with a slightly darker border so neighboring hexes of one color stay distinguishable.
- **Structures:** a raised hexagonal slab. The **top shows the type** (farm pale lime, mine dark brown, fort sandstone, power plant pale cyan, muted so they don't read as team colors) and the **sides and border show the owner's team color**.
- **Shots:** Basic-gun shots are small white bolts; Big-gun shots are larger yellow bolts.
- **Expander:** a translucent circle in the owner's color on the ground, showing their claim radius.
- **Reference art** (hex tiles with mountains, trees, water and cliff faces) is AI-generated with unclear licensing, so it's for mood only. Planned art direction is under [Open design questions and plans](#open-design-questions-and-plans).

---

## Open design questions and plans

Things that need a design decision, not just code. Where one is also tracked in the technical roadmap, the [Planned Features](ARCHITECTURE.md#planned-features) number is given.

### Teams (Planned Features #2)
- **Pooling:** should hexes belong to the team, and/or should credits be split between teammates on each payout? Either one changes claiming, income and score.
- **Team win condition:** does the best team win (by total or average score?), or the best player?
- **Team size and balance:** today anyone can join any color, including everyone on one team.

### Structures and scoring (Planned Features #3)
- **What each structure type does.** Farm, mine, fort and power plant are identical except for color. Each needs a purpose and probably its own point value in place of the flat 25. (An earlier idea had city hall 1000, school 250, house 100 and fort 25 points.)
- **Tie-break** for the win, beyond shared ranks.
- The point values (1 / 50 / 25) are first-pass, to tune in playtesting.

### Shop, weapons and balance (Planned Features #9)
- **Ammo:** a cap? Regeneration or pickups? Today you can run out for good unless you buy more.
- **Fire rate per gun** (and moving the limit to the server), range, spread.
- **More items:** stronger armor, and whatever structure types end up doing.
- **Shopping risk:** maybe only allow buying while standing on your own territory (or near a city hall). Not decided.
- **Snowballing:** territory income and purchases compound for whoever is ahead. The Expander in particular is strong (up to 9 hexes at a time) for 100 credits. Options: rising prices, a radius cap, or stackable upgrades with rising costs.
- **Early game:** nothing but ammo is affordable at the start; check whether that feels right.

### Map and spawning
- **Starting positions:** players should start in a line on the right side of the map, as if "going west". Needs spawn spots for up to 10 players, and a decision on whether respawns use them too (today: the center).
- **Terrain (Planned Features #7):** decided 2026-09-26: gameplay terrain (ground, mountain, water), no elevation; see [Terrain](#terrain). Still open:
  - Mountain sprites: small and large mountains will map to different sprites; the generator already records which hexes form each one.
  - Should terrain slow you down (wading through water, say) rather than only allow or block you?
  - Should rivers connect to lakes or run off the map edge, so they read as rivers rather than long lakes?
  - Should maps be shareable or replayable (a visible seed)?
  - Should the planned spawn line on the east side stay clear of terrain too?
- **Map outline:** the jagged hex edge versus the rectangular walkable area could be fixed at the same time.

### Art and presentation (Planned Features #7, #10)
- Real art for hexes, terrain, structures and characters, including characters that face six directions to match the hex grid.
- Custom lobby pickers: color swatches for teams and character cards with art, sized for touch.
- A visible damage state for structures.
- Indicators for players who are off-screen.

### Results and rematch
- A richer results screen (per-player details, match stats) and a same-room **rematch**, instead of Play again starting a fresh lobby.

### Contested hexes
- When two players reach a hex at the same moment, join order decides. Decide whether that's acceptable or whether it should go to whoever got there first by input order.

---

## Design decisions log

Gameplay, balance, controls and presentation decisions, and why they were made. Technical decisions are in the [ARCHITECTURE Decisions Log](ARCHITECTURE.md#decisions-log). Rows marked **superseded** are kept for history.

| Decision | Chosen | Alternatives considered | Rationale |
|---|---|---|---|
| PvP death handling | Respawn at map center, full health, kills/tiles preserved | Elimination, sudden-death end-of-match | This is a territory-claiming game, not a deathmatch — PvP is a tool for defending/contesting tiles, not the win condition, so a defeated player should get back in the fight quickly |
| Host concept — **superseded 2026-09-26 (ready-up lobby)** | First player to join a room is `hostId`; only they can send `startGame`; reassigned to next connected player on host departure | No host (auto-start at max players or after a lobby timer), server-side matchmaking-assigned host | Simplest to implement for a scaffold; a lobby timer or player-ready-up voting could replace this later without changing the wire protocol much |
| Ammo — **superseded 2026-09-26 (character kits: only the Smuggler starts with ammo, 15; everyone else buys it)** | Finite (30), decrements per shot, no regen yet | Infinite ammo, regen over time, reload mechanic | Left as a known gap — finite ammo without regen makes for a hard stop mid-match, which is a real gameplay concern to resolve before this ships, not just a technical TODO |
| Credits payout scope | Every player earns 1 credit per tile they individually own, during `playing` only (formerly `claiming`/`combat`) | Payouts continuing into `results`, or scoped only to the old `combat` phase | Matches the request's "based on number of tiles they control" without over-scoping into phases where tile ownership isn't changing meaningfully or the match is already decided; open questions about team-pooled credits remain in Planned Features #2 |
| Desktop controls | Fixed on-screen WASD/arrows; mouse only aims and shoots (`MOVE_RELATIVE_TO_AIM = false`) | Mouse-relative "forward" with strafing (tried first; still available via the flag) | Mouse-relative movement felt weird: the camera follows the player, so the cursor's world position keeps moving as you approach it (chasing), and strafing orbits it. On-screen keys are predictable and match the view. Aim is still recomputed every frame because the camera moves under a still mouse |
| Leaderboard presentation | Popup over the canvas, toggled by a button or `L` (closed by `Esc`/×/backdrop), hidden by default | Always-on corner panel (previous) | The always-on panel was clipped and covered the play area on small screens; a popup is roomier and only costs space when wanted. The player's own score stays visible in a small always-on badge instead |
| Fire input | Space, click and a touch FIRE button all go through `GameScene.tryShoot` with a 200ms client-side interval | Click only (previous); server-enforced fire rate first | Requested controls; a shared gate avoids three divergent code paths. Server enforcement is the right long-term home but is a game-rule decision, so it's deferred and logged as a Known Issue |
| Match phases | One `playing` phase (5 min) between `lobby` and `results` (a `buying` phase was added before it afterwards — see below) | Separate `claiming` (90s) and `combat` (120s) phases (previous); a separate "buying" phase | Claiming and fighting should happen together, and buying is better as an in-game menu than a phase that pauses everyone. The early-shooting problem the claiming phase solved goes away once guns/ammo are purchases |
| Score formula | `tiles × 1 + kills × 50 + structures × 25`, computed server-side into `Player.score`; credits excluded | Score from credits (previous); client-side derivation | Requested. Credits will be spent, so scoring them would make buying cost points. A synced server field keeps every client identical and lets the leaderboard/badge just read it |
| Damage — **superseded 2026-09-26 (per-gun damage: Basic gun 50, Big gun 100; Armor gives 200 health)** | 50 per hit vs 100 health (two-hit kill) | 25 per hit (previous) | Requested. Armor and better guns will modify this later |
| Structures are solid — **superseded 2026-09-26 (structures now cover 7 hexes and use a hexagon shape; still solid to enemies, and teammates pass too)** | Others can't enter a structure's hex; they slide around it; the owner passes freely; a player already inside can walk out | Structures only stop projectiles (previous); no exceptions for owners | Requested. Implemented as circle-vs-hexagon with rounded corners; sliding uses the push-out direction at the player's *current* position (using the destination's normal leaves players frozen at corners), and a small distance tolerance so tangential slides aren't mistaken for approaching. Validated with a 744-approach sweep (0 overlaps, 0 frozen; the only stops were dead-on flat-wall hits) and a two-client run |
| Buying phase — **superseded 2026-09-26 (ready-up lobby)** | A 30s `buying` phase between lobby and playing (nothing else allowed), plus in-play shopping on the player's own time | No buying phase, only an in-game menu (decided earlier the same day); a long shopping phase | Reversed by request: a quick shared shopping window gives a clean start, while play-time buying keeps the game continuous. Also removes the "shoot before anyone has claimed anything" problem without a protected phase |
| Starting credits — **superseded 2026-09-26 (ready-up lobby)** | 100 (`STARTING_CREDITS`), set as the schema default | 0 with payouts only | Requested, so there's something to spend in the buying phase |
| Results screen actions | *Play again* (new lobby) and *Main menu* | Auto-drop players into a new lobby when the room closes; rematch in the same room | Deliberate choice rather than a surprise. The 60s room timer plus a persisted screen means nothing is lost when the room closes. Same-room rematch would need a reset flow and is deferred |
| Click-to-move | Right-click sets a world-space target the client walks toward via the normal `input` vector; eases off near it; cancels on arrival, no progress for 1.2 s, or any movement key/joystick | Server-side pathing/targets; left-click to move | Requested. Doing it client-side needs no server change and reuses smoothing, screen-uniform speed and structure sliding. Speed is scaled by distance (not a hard stop) to avoid overshoot despite ~100–200 ms input latency; a no-progress timeout stops it chasing an unreachable spot |
| Ending buying early (temporary) — **superseded 2026-09-26 (ready-up lobby)** | Closing the shop during `buying` sends `endBuying`; only the host's is honored | Waiting out the 30s; letting any player end it | Requested testing shortcut: with a mock shop there's nothing to do while buying. Host-only so one player closing their popup can't start the match for everyone; to be removed when the real buy menu exists |
| Claim radius | Claim the hex you stand on plus every hex whose center is within `claimRadius` (base 32 px = `HEX_SIZE`; Expander 80 px = 4 × `PLAYER_RADIUS`) | Keep "only the hex under you" and make the Expander a different mechanic; a fixed ring of neighbors | A radius makes "2× radius" literal and scales naturally for future upgrades. At base radius it's effectively the old behavior (own hex, occasionally a neighbor near an edge). Implemented as a small search window around the player, verified against a brute-force scan |
| Structures protect their tile — **superseded 2026-09-26 (all 7 footprint hexes are protected, from enemies only)** | A hex with another player's structure can't be claimed | Let radius claiming flip any tile | With a large radius, tiles under structures would flip constantly, leaving a structure on a tile its owner doesn't own (and placing requires owning the tile). Rejected the alternative of destroying the structure on flip |
| Expander — **superseded 2026-09-26 (Expander levels, below)** | 100 credits, claim radius 4 × the player radius (80 px), permanent (kept on respawn), one per player, visible to everyone as a tinted circle | Stackable levels; lost on death; visible only to its owner | Matches the requested spec (one item, 2×). One-per-player keeps the first version simple and bounded; the circle doubles as a warning to opponents |
| Ammo pricing | 1 credit per shot, sold in packs of 30 (30 credits), no cap | Per-shot purchase; capped magazine | Requested. No cap is a known gap; tune with playtesting |
| Player size | `PLAYER_RADIUS` raised from 16 to 20 (body, projectile hit radius, structure collision); the Expander's claim radius is *defined* as 4 × `PLAYER_RADIUS` | Keep 16; keep the Expander at 2 × the base claim radius | Requested playtest of a bigger player. The Expander used to be 2 × a 32 px base claim radius, which is independent of body size, so it wouldn't have grown; tying it to `PLAYER_RADIUS` (4 × = 64 at 16, 80 at 20) makes the two move together while the base claim radius (and so base tile-claiming pace) stays put. If instead the base claim radius should also follow the player size, that is a one-line change but speeds up base claiming (~50% more hexes per step at 40 px) |
| Host reassignment — **superseded 2026-09-26 (ready-up lobby)** | Promote the next connected player as soon as the host disconnects; a newcomer also takes over if the recorded host is disconnected; keep a lone disconnected host so a reconnect restores them | Promote only when the reconnect window expires (previous behavior); always keep the original host | A disconnected host can't send `startGame`, and the old behavior blocked a lobby for up to 3 minutes (it also made the shared dev room confusing) |
| Starting the match | Automatic 3s countdown once every connected player is ready; cancelled if anyone un-readies or a newcomer joins; disconnected players don't block it. No Start button and no host | Host presses Start once everyone is ready; auto countdown plus a host force-start | Chosen by the developer (2026-09-26). Nobody has to be in charge, so the host role and its handover logic went away |
| Removing the buying phase | Deleted `buying`, `startGame`, `endBuying` and `STARTING_CREDITS`; shopping is during play only; starting credits come from the character | Keep a short buying phase after the lobby | Requested: the lobby's character choice now sets the starting kit, which is what the buying phase was for |
| Teams | A team is one of 8 colors (`TEAMS`); `Player.teamId`, with `Player.color` always the team color; newcomers get an empty color first | A `GameState.teams` map with team state; auto-balancing | Picking a team is the same as picking a color (requested), and all existing rendering already used the player color. A team has no state of its own yet, so no map |
| What teammates share | Allies only: no friendly fire (players and structures), teammates' structures walkable, teammates' tiles not taken. Tiles, credits and score per player; results add team totals | Full pooling (tiles owned by the team, credits split evenly, team score); color only, free-for-all | Chosen by the developer (2026-09-26) as the smallest change that makes teams meaningful; pooling stays an open question |
| Characters | 6 characters in a shared `CHARACTERS` catalog; the kit (gun, ammo, credits, structures, upgrades) replaces the player's stats when the countdown ends; locked while ready | Apply the kit at selection time; free choice after readying | Applying once at start means lobby switching can't be abused and a mid-match joiner just gets the default kit applied on join |
| Structure inventory | `Player.structureInventory` (one entry per structure); `placeStructure` names a type from it and uses one up; `Structure.type` recorded; all types identical for now | Unlimited building with the character setting only the type | Chosen by the developer (2026-09-26): the starting structures are part of what distinguishes characters |
| Getting a gun | Unarmed players can't shoot; a Basic gun in the shop (40 credits at first, 100 since the catalog rebuild) | Only Smugglers can shoot until a later shop pass | Chosen by the developer (2026-09-26), so the other five characters can still fight |
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
| Wings | Upgrade, 100 credits, one per player: walk over mountains and deep water (still can't claim them) | 150 or 200 credits | Price chosen by the developer, in line with the other upgrades |
| Terrain fairness | The spawn area is always ground, and every ground hex is reachable on foot | No guarantee (retry-free generation) | My addition: a player without Wings must never spawn trapped, and no buildable ground may be walled off |
| Terrain look (until sprites) | Mountain: off-white with a thin gray border. Water: dark blue with a dotted border in the normal border color | — | Requested; distinct from each other, from ground and from every team color |
| Terrain features (revised) — **superseded the same day (mountain pieces, gap, compact lakes, below)** | Mountain ranges 3–32 hexes; lakes 3–32; rivers 2–20 long and 1–4 wide, the width changing by one hex at a time; holes at river bends filled; features never touch | The first sizes (singles allowed, rivers 1–2 wide) | Requested: bigger, more substantial features with no single hexes. Filling holes (my addition) stops wide bending rivers leaving ground pockets inside them |
| Shallow water | Water one hex across is shallow and walkable: a water hex with at most two water neighbors that don't touch each other (1-wide river stretches, bends included). Everything else is deep | Only lone water is shallow (previous); a river that's 1 wide along its whole length | Requested (2026-09-26): "single" water meant water you can step across. The rule is purely about shape, so both sides compute it the same way (`shared/terrain.ts`) |
| Mountain pieces | Ranges of 3–35 hexes built from small mountains (3 hexes that all touch) and large ones (a hex and its 6 neighbors), touching but not overlapping; ~40% large | Free-form blobs (previous) | Requested: small and large mountains will map to different sprites |
| Compact ranges and lakes | Each new mountain (every placement beside the range, every orientation) and each new lake hex goes where it touches the most, ties at random | Random placement beside the feature (previous, lacy with arms and holes); also pulling toward the middle (tried: made ranges smaller and more scattered) | Requested: chunky, not lacy. Measured on 40 maps: ~3.9 same-feature neighbors per hex for both, vs ~3.45 for the lacy version |
| Feature gap | At least 3 ground hexes between any two features (`FEATURE_GAP`) | 1 (previous); 2 | Requested ("at least 3 tiles away"); 3 hexes between chosen by the developer |
| Shallow vs deep, small vs large: stored or derived? | Shallow/deep is derived from the water's shape wherever it's needed; small/large mountain pieces are recorded by the generator but not synced yet | Enumerate them as extra terrain values | Deriving shallow water keeps one source of truth. Which hexes form a mountain piece can't be derived, so it'll be synced when the sprites need it |
| Upgrade levels | Booster, Expander and Armor have 3 levels, Wings 1; 100 credits a level; the shop lists each upgrade once and offers the next level | One of each (previous) | Requested (2026-09-26). "Speed boost" renamed "Booster" |
| Booster steps | +25% of base top speed per level: 125 / 150 / 175% | Compounding 25% (125 / 156 / 195%) | Chosen by the developer: even, readable steps |
| Expander steps | Claim 7 / 19 / 37 hexes (1 / 2 / 3 rings; radii 80 / 125 / 180 px) | 7 / 12 / 19 | Chosen by the developer: big, visible jumps |
| One upgrade slot | Only the equipped slot upgrade (Booster, Expander, Wings) works; switch at most every 5 s; can't take Wings off over solid terrain; a purchase into an empty slot equips itself | Every owned upgrade works (previous); instant switching; switching only on your own territory | Requested (one slot); the 5 s cooldown chosen by the developer to stop reflex swaps in a fight. The Wings rule and auto-equip are my additions: no getting stuck inside a mountain, and a first purchase just works |
| Armor | Always on (no slot), 3 levels of +100 max health (200 / 300 / 400) | Armor in the slot, with health capped at 100 when switched off | Chosen by the developer |
| Inventory | A popup like the shop (`I` / Inventory button): gun, ammo, structures, Armor, and owned slot upgrades with Equip / Unequip, a cooldown countdown, and a note when Wings can't come off | Switching from the HUD; a permanent side panel | Requested ("an inventory where they can switch between upgrades and see their owned structures and guns and ammo"). A popup matches the shop and leaderboard and fits phones. The Wings note (checked live on the client with the same `blocksWalking` rule) means a refused switch is never silent |
