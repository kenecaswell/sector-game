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
5. [Players](#players)
6. [Teams](#teams)
7. [Characters](#characters)
8. [Territory](#territory)
9. [Combat](#combat)
10. [Structures](#structures)
11. [Economy and shop](#economy-and-shop)
12. [Scoring and winning](#scoring-and-winning)
13. [Controls](#controls)
14. [Look and feel](#look-and-feel)
15. [Open design questions and plans](#open-design-questions-and-plans)
16. [Design decisions log](#design-decisions-log)

---

## The game at a glance

Sector 42 is a real-time multiplayer **territory-claiming** game for mobile and desktop web browsers, inspired by hexar.io. Up to **10 players** share an isometric hex map for a **5-minute match**. You claim hexes by walking over them, earn credits from the territory you hold, spend them on guns, upgrades and structures, and fight other players and teams for ground.

- **Core loop:** move → claim hexes → earn credits from them → buy things that help you claim, defend or attack → repeat until time runs out.
- **Territory is the point.** Fighting is a tool for taking and defending ground, not the goal: defeated players respawn straight away, so a match never ends early from combat.
- **Mobile is first-class.** Every action works with touch (a joystick and on-screen buttons) as well as keyboard and mouse.

## Setting and story

The human race is expanding across the solar system. The new frontier is Titan, the moon of Saturn. Settlers, explorers, scientists, and grifters and looking for new opportunities for prosperity and discovery. To encourage exploration and growth across the solar system, the International Exploration Agency (IEA) has created the Interplanetary Homestead Act (IHA), which grants land rights to individuals on designated planetary bodies. Titan is one of these planetary bodies. The moon has been divided into 120 sectors by IEA (each sector is about the size of Texas). **Sector 42** is the latest to be opened for settlement.

On the opening day of Sector 42 all participants begin on the East side of the sector. When everyone is ready the race to claim land begins expanding West across the sector. The IEA has placed supply caches across the sector to aid the new settlers. Participants are given 5 days to claim their land. What happens during those 5 days is not policed or governed. It is in essence the "Wild West".

### Setting

Titan has a harsh environment. There are mountains and lakes and rivers that cannot be crossed. It is brutally cold, averaging a surface temperature of –179°C (–290°F). There is no oxygen in the atmosphere, it is 95% nitrogen and 5% methane. Water needs to be mined as well as purified. The ground is not suitable for growing food as it is a mix of rock-hard ice and toxic sludge. Settlers will need heat suits and enclosed dormitories for the cold, respirators for oxygen, mines and processing facilities for water, oxygen and methane collection, enclosed hydroponic farms, and nuclear or methane combustion power plants.

### Inspiration

This game was has a few primary inspirational sources:

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

✅ A **64 × 64 grid of flat-top hexes**, viewed at an isometric tilt. The map is one flat height for now; terrain is planned ([Open design questions](#open-design-questions-and-plans)).

- **Size in play:** crossing the map takes about **15 s left to right** and **11 s top to bottom** at normal speed. (The vertical trip is shorter because the tilted view squashes the map vertically and speed is measured on screen.)
- **Edges:** you can walk right up to the edge but not off it. The camera always keeps you centered, even at the edge.
- **Corners:** the map's outline is jagged (it's made of hexes), so at a few edge spots you can stand over no hex at all. Those spots can't be claimed.
- **Spawning:** everyone starts and respawns at the **center of the map** for now. 📝 See [Open design questions](#open-design-questions-and-plans) for the planned spawn line.

Implementation: [Map — hex grid and coordinate spaces](ARCHITECTURE.md#map--hex-grid-and-coordinate-spaces).

## Players

- **Body:** a circle a little smaller than a hex (`PLAYER_RADIUS`, 20, against a hex radius of 32).
- **Movement:** ✅ continuous, in any direction, with smooth acceleration, turning and stopping rather than snapping. Top speed (`PLAYER_SPEED`) is the same in every direction **as seen on screen**. A joystick pushed part-way moves you more slowly.
- **Health:** 🧪 100 (`BASE_MAX_HEALTH`), or 200 with Armor (`ARMOR_MAX_HEALTH`).
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
| **Robot** | Moves faster than everyone else. | none | 0 | 50 | — | Speed boost (+25%) |
| **Scientist** | Starts with a power plant. | none | 0 | 50 | power plant | — |
| **Smuggler** | The only one who starts armed, but with few credits. | Basic gun | 15 | 15 | — | — |

- Only the Smuggler can shoot from the start. Everyone else has to buy a gun.
- The four structure-starting characters differ only in which structure type they get, and 📝 structure types don't behave differently yet ([Structures](#structures)).
- 📝 Each character is planned to get its own art; today everyone is a circle in their team color.

## Territory

✅ Holding hexes is how you earn credits and score.

- **Claiming:** during the match, every moment you claim the hex you're standing on **plus every hex whose center is within your claim radius**. The normal radius is about one hex (`BASE_CLAIM_RADIUS`, the hex size): in practice just the hex under you, occasionally a neighbor when you're near an edge.
- **Expander:** 🧪 raises your claim radius to 4 × your body radius (`EXPANDER_CLAIM_RADIUS`, 80). That claims 7 hexes when you stand in the middle of one, and up to 9 depending on where you are. Everyone can see an Expander owner's claim radius as a tinted circle around them.
- **Stealing:** walking over (or near, with the Expander) an **enemy's** hex takes it from them. A **teammate's** hex is never taken.
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
- **Shots:** travel in a straight line at the same on-screen speed in every direction, and vanish after **2 seconds** (`PROJECTILE_LIFETIME_MS`), which is roughly a quarter of the map's width sideways. A shot stops at the first enemy player or enemy structure it hits. Both guns' shots have the same hit size; the Big gun's shots only *look* larger.
- **Friendly fire:** none. Shots pass through teammates and teammates' structures.
- **Kills:** the shooter's kill count goes up and the victim respawns at the center (see [Players](#players)). Kills are permanent and count toward score.

Implementation: [PvP Shooting](ARCHITECTURE.md#pvp-shooting), [Collision Detection](ARCHITECTURE.md#collision-detection).

## Structures

✅ Structures claim a large area permanently, block enemies, and add to your score.

- **Getting them:** each structure-starting character begins with one, and the shop sells more (100 credits each). You hold them in a **structure inventory** until you place them.
- **Footprint:** a structure sits on a center hex and **covers that hex plus its 6 neighbors**.
- **Placing:** press Build, then pick a spot. **All 7 hexes must be yours** (a teammate's don't count), all on the map, and none already under another structure. Structures can touch but not overlap. While you choose, an outline shows the structure's shape: yellow if you can build there, red if not.
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
| Upgrades | **Speed boost** | 100 | +25% top speed (`BOOST_SPEED_MULTIPLIER`). | One (the Robot already has it) |
| Upgrades | **Armor** | 100 | Max health 100 → 200, and +100 health right away. | One |
| Upgrades | **Expander** | 100 | Claim radius becomes 80 (4 × your body radius), shown as a tinted circle. | One |
| Structures | **Farm**, **Mine**, **Fort**, **Power plant** | 100 each | One more of that structure to place. | Unlimited |

- **Upgrades are permanent for the match**, and survive respawns.
- Items you already have show as "Owned".
- 📝 **Pacing:** starting kits give at most 50 credits and everything except ammo costs 100 or more, so a first real purchase waits on territory income. Worth watching in playtests.

Implementation: [Shop](ARCHITECTURE.md#shop), [Economy (Credits)](ARCHITECTURE.md#economy-credits).

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
- **Hotkeys:** `B` build mode (no time limit; `B` again or `Esc` to leave it), `E` shop, `L` leaderboard, `Esc` closes popups. `` ` `` (backtick) shows a performance readout.
- 📝 **Touch aiming** is limited to your movement direction or a tapped spot; there's no second aiming stick.

Implementation: [Input — desktop and mobile share one message contract](ARCHITECTURE.md#input--desktop-and-mobile-share-one-message-contract), [Movement](ARCHITECTURE.md#movement).

## Look and feel

📝 **Everything is placeholder art** until real art exists.

- **Players:** a circle in the team color with a shadow and a small dot showing which way they face. Disconnected players are drawn faded.
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
- **Terrain (Planned Features #7):** is water, mountains and cliffs **gameplay** (blocking movement or shots, maybe unclaimable) or **decoration**? Decide this before building terrain, because gameplay terrain changes movement, combat and claiming.
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
| Ammo | Finite (30), decrements per shot, no regen yet | Infinite ammo, regen over time, reload mechanic | Left as a known gap — finite ammo without regen makes for a hard stop mid-match, which is a real gameplay concern to resolve before this ships, not just a technical TODO |
| Credits payout scope | Every player earns 1 credit per tile they individually own, during `playing` only (formerly `claiming`/`combat`) | Payouts continuing into `results`, or scoped only to the old `combat` phase | Matches the request's "based on number of tiles they control" without over-scoping into phases where tile ownership isn't changing meaningfully or the match is already decided; open questions about team-pooled credits remain in Planned Features #2 |
| Desktop controls | Fixed on-screen WASD/arrows; mouse only aims and shoots (`MOVE_RELATIVE_TO_AIM = false`) | Mouse-relative "forward" with strafing (tried first; still available via the flag) | Mouse-relative movement felt weird: the camera follows the player, so the cursor's world position keeps moving as you approach it (chasing), and strafing orbits it. On-screen keys are predictable and match the view. Aim is still recomputed every frame because the camera moves under a still mouse |
| Leaderboard presentation | Popup over the canvas, toggled by a button or `L` (closed by `Esc`/×/backdrop), hidden by default | Always-on corner panel (previous) | The always-on panel was clipped and covered the play area on small screens; a popup is roomier and only costs space when wanted. The player's own score stays visible in a small always-on badge instead |
| Fire input | Space, click and a touch FIRE button all go through `GameScene.tryShoot` with a 200ms client-side interval | Click only (previous); server-enforced fire rate first | Requested controls; a shared gate avoids three divergent code paths. Server enforcement is the right long-term home but is a game-rule decision, so it's deferred and logged as a Known Issue |
| Match phases | One `playing` phase (5 min) between `lobby` and `results` (a `buying` phase was added before it afterwards — see below) | Separate `claiming` (90s) and `combat` (120s) phases (previous); a separate "buying" phase | Claiming and fighting should happen together, and buying is better as an in-game menu than a phase that pauses everyone. The early-shooting problem the claiming phase solved goes away once guns/ammo are purchases |
| Score formula | `tiles × 1 + kills × 50 + structures × 25`, computed server-side into `Player.score`; credits excluded | Score from credits (previous); client-side derivation | Requested. Credits will be spent, so scoring them would make buying cost points. A synced server field keeps every client identical and lets the leaderboard/badge just read it |
| Damage | 50 per hit vs 100 health (two-hit kill) | 25 per hit (previous) | Requested. Armor and better guns will modify this later |
| Structures are solid | Others can't enter a structure's hex; they slide around it; the owner passes freely; a player already inside can walk out | Structures only stop projectiles (previous); no exceptions for owners | Requested. Implemented as circle-vs-hexagon with rounded corners; sliding uses the push-out direction at the player's *current* position (using the destination's normal leaves players frozen at corners), and a small distance tolerance so tangential slides aren't mistaken for approaching. Validated with a 744-approach sweep (0 overlaps, 0 frozen; the only stops were dead-on flat-wall hits) and a two-client run |
| Buying phase — **superseded 2026-09-26 (ready-up lobby)** | A 30s `buying` phase between lobby and playing (nothing else allowed), plus in-play shopping on the player's own time | No buying phase, only an in-game menu (decided earlier the same day); a long shopping phase | Reversed by request: a quick shared shopping window gives a clean start, while play-time buying keeps the game continuous. Also removes the "shoot before anyone has claimed anything" problem without a protected phase |
| Starting credits — **superseded 2026-09-26 (ready-up lobby)** | 100 (`STARTING_CREDITS`), set as the schema default | 0 with payouts only | Requested, so there's something to spend in the buying phase |
| Results screen actions | *Play again* (new lobby) and *Main menu* | Auto-drop players into a new lobby when the room closes; rematch in the same room | Deliberate choice rather than a surprise. The 60s room timer plus a persisted screen means nothing is lost when the room closes. Same-room rematch would need a reset flow and is deferred |
| Click-to-move | Right-click sets a world-space target the client walks toward via the normal `input` vector; eases off near it; cancels on arrival, no progress for 1.2 s, or any movement key/joystick | Server-side pathing/targets; left-click to move | Requested. Doing it client-side needs no server change and reuses smoothing, screen-uniform speed and structure sliding. Speed is scaled by distance (not a hard stop) to avoid overshoot despite ~100–200 ms input latency; a no-progress timeout stops it chasing an unreachable spot |
| Ending buying early (temporary) — **superseded 2026-09-26 (ready-up lobby)** | Closing the shop during `buying` sends `endBuying`; only the host's is honored | Waiting out the 30s; letting any player end it | Requested testing shortcut: with a mock shop there's nothing to do while buying. Host-only so one player closing their popup can't start the match for everyone; to be removed when the real buy menu exists |
| Claim radius | Claim the hex you stand on plus every hex whose center is within `claimRadius` (base 32 px = `HEX_SIZE`; Expander 80 px = 4 × `PLAYER_RADIUS`) | Keep "only the hex under you" and make the Expander a different mechanic; a fixed ring of neighbors | A radius makes "2× radius" literal and scales naturally for future upgrades. At base radius it's effectively the old behavior (own hex, occasionally a neighbor near an edge). Implemented as a small search window around the player, verified against a brute-force scan |
| Structures protect their tile | A hex with another player's structure can't be claimed | Let radius claiming flip any tile | With a large radius, tiles under structures would flip constantly, leaving a structure on a tile its owner doesn't own (and placing requires owning the tile). Rejected the alternative of destroying the structure on flip |
| Expander | 100 credits, claim radius 4 × the player radius (80 px), permanent (kept on respawn), one per player, visible to everyone as a tinted circle | Stackable levels; lost on death; visible only to its owner | Matches the requested spec (one item, 2×). One-per-player keeps the first version simple and bounded; the circle doubles as a warning to opponents. Balance is untested — see Planned Features #9 |
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
| Robot boost | `boost` upgrade multiplies top speed by 1.25 (`BOOST_SPEED_MULTIPLIER`), acceleration unchanged | Higher acceleration too; a timed boost | "Speed boost" was the spec; 1.25 is a first-pass value to tune |
| Player names | Editable in the lobby, 2–25 characters (code points), any characters; a taken name (ignoring case) gets the first free " (N)"; saved to `localStorage` and sent as a join option | Allow duplicate names; server-side accounts | The developer allowed either; the suffix keeps names readable in the leaderboard and results and fixed the old duplicate "Player N" bug. Saving the typed (unsuffixed) name avoids stacking suffixes over games |
| Structure footprint | A structure occupies its hex plus the 6 neighbors; all 7 must be on the map, owned by the builder, and free of other footprints | Single hex (previous); allowing teammates' hexes | Requested (2026-09-26) |
| Structure shape — **superseded the same day (flat-top, 2 × tile radius)** | One hexagon with exactly the 7 hexes' area, corners on grid vertices, turned ~19.1° from the tiles; used for collision, hits and drawing, while the footprint hexes are used for placement and protection | A tile-aligned hexagon covering the 7 hexes (~29% larger, reaching well into the next ring); the jagged 7-hex outline | "A hexagon the size of 7 tiles" was requested; this is the only hexagon with exactly that area whose corners sit on the grid. Cost: 6 of the 12 touching placements overlap by ≤ 10.5 px, accepted rather than refusing placements whose 7 hexes are all yours |
| Structure colors | Top face by type (farm pale lime, mine dark brown, fort sandstone, power plant pale cyan); sides and border in the owner's team color | Type color only; team color only | Temporary until art (requested). Both pieces of information stay visible |
| Structure shape (revised) | Flat-top hexagon with 2 × the tile radius: the largest flat-top hexagon inside the 7-hex footprint, corners on the footprint's notches | The ~19.1°-turned equal-area hexagon (previous); a smaller hexagon | Requested: ~75% of the previous size with a flat top. 2/√7 ≈ 76% is exactly the size that still fits, and staying inside the footprint means structures can never overlap |
| Build mode | No timeout; B toggles, Esc exits (the Build button still works) | The 5 s auto-disarm (previous) | Requested. Lining up a 7-hex spot takes longer than 5 s |
| Hotkeys | B = build mode, E = shop, L = leaderboard, Esc = leave build mode / close popups | B = shop (previous) | Requested |
| Prices and new items | Basic gun 100, Big gun 200 (100 damage), Speed boost 100, Armor 100 (200 max health), structures 100 each, ammo 30, Expander 100 | — | Prices requested; the Big gun's effect (double damage) and the gun rules (no downgrade, can skip the basic gun) are first-pass choices |
| Shot looks by gun | Basic: small white bolt; big: the original yellow bolt, 1.3× larger. Chosen by `Projectile.damage` (already synced); hit radius unchanged | Syncing the gun id on the projectile; a bigger hit radius for big shots | Requested. Damage is already on the projectile, so no protocol change; the hit radius was left alone since only the look was asked for |
