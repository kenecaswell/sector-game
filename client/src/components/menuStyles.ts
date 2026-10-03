// Shared by the Fabricator and Build menus. The buttons look live in real CSS because inline styles
// can't express :hover / :active. The class names are prefixed so they can't collide with anything
// else on the page.
export const MENU_BUTTON_CSS = `
.fab-make {
    flex-shrink: 0;
    min-width: 64px;
    padding: 6px 10px;
    border: none;
    border-radius: 6px;
    background: #f1c40f;
    color: #000;
    font-weight: bold;
    cursor: pointer;
    transition: transform 90ms ease, background-color 120ms ease, box-shadow 120ms ease;
}
.fab-make:not(:disabled):hover { background: #ffd84a; }
.fab-make:not(:disabled):active {
    background: #c9a20d;
    transform: scale(0.92);
    box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.4);
}
.fab-make:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.fab-make:disabled {
    background: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.5);
    cursor: default;
}
.fab-make--made,
.fab-make--made:disabled {
    background: #2ecc71;
    color: #fff;
    transform: scale(1.08);
}
`;
