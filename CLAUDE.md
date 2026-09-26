# CLAUDE.md

Hi! My name is K.C.

## Claude Memory

I have turned on the "Search and reference chats" option. However, I only want to search past chats if I explicitly ask you to. To save you time searching I don't normally want you searching past chats.

## Git

I like to run my own git commands. Please ask me to run these. It helps me keep track of what's being committed to the repo.

## Code style

Use 4-space indentation (Prettier `tabWidth: 4`, see `client/.prettierrc.json` and `server/.prettierrc.json`), single quotes, semicolons, 100-column lines. Some older files are still 2-space until `npm run format` is run; match the file you're editing unless asked to reformat it.

## Project docs — read these first

- `README.md`: how to run, build and lint; controls; troubleshooting.
- `docs/ARCHITECTURE.md`: the source of truth for the design, protocol, decisions and status. It is long, so read its **"Start here"** section first (includes a next-steps proposal and the list of files that must be kept in sync by hand), then search for only the sections you need. The Decisions Log at the end explains why things are the way they are.
- `tools/README.md`: verification scripts. After server changes, build (`cd server && npm run build`) and run `node tools/check-rules.js`, `node tools/check-collisions.js` and `node tools/e2e.js`. When you add or change a rule, add or update a check there.
- When you change behavior, update `docs/ARCHITECTURE.md` (and the README for anything user-facing) in the same change, including a Decisions Log row for design choices.

## Testing

I usually have my own dev server and browser open (ports 2567 and 5173). Don't start anything on those ports and don't join my rooms. For anything that joins a game, use private ports (for example server `PORT=2599` and client `VITE_SERVER_URL=ws://localhost:2599 npx vite --port 5199`) and stop what you started when you're done.
