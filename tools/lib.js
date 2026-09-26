// Tiny shared helpers for the check scripts: locate the compiled server, tally results, and set
// the exit code. No test framework on purpose (see README.md).
const path = require('path');

const root = path.resolve(__dirname, '..');

/** require() a module from the compiled server (server/dist), e.g. dist('systems/MovementSystem.js'). */
function dist(relativePath) {
    return require(path.join(root, 'server', 'dist', relativePath));
}

/** The colyseus.js client, borrowed from the client's node_modules. */
function colyseusClient() {
    return require(path.join(root, 'client', 'node_modules', 'colyseus.js'));
}

let passed = 0;
let failed = 0;

function section(title) {
    console.log(`\n${title}`);
}

/** Record one check. `detail` is printed on failure (or always, if `showDetail`). */
function check(name, ok, detail = '') {
    if (ok) {
        passed++;
        console.log(`  ✔ ${name}${detail ? ` (${detail})` : ''}`);
    } else {
        failed++;
        console.log(`  ✘ ${name}${detail ? ` — ${detail}` : ''}`);
    }
}

function finish() {
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = { root, dist, colyseusClient, section, check, finish, sleep };
