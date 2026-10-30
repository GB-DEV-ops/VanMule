# VanMule Arcade game spec

Each game is ONE standalone file `app/arcade/<id>.js` (plain browser JavaScript, no imports, no libraries, no network, no images from the web). It runs inside an Electron desktop app page.

## Interface
```js
(function(){
  'use strict';
  window.VanArcade = window.VanArcade || {};
  window.VanArcade['<id>'] = {
    mount(el, api) { ... },   // build the game inside el (a div). el is already empty.
    unmount() { ... }         // remove EVERY listener, timer, requestAnimationFrame, AudioContext node; empty el.
  };
})();
```
`api`:
- `api.load(key)` returns a previously saved JSON value or null (e.g. high scores, bankroll, settings).
- `api.save(key, value)` stores a JSON value (keep it small).
- `api.sound` boolean: whether sound is on at mount time. Offer a small 🔊/🔇 toggle in the game and remember it with api.save('sound', bool).
- `api.toast(msg)` shows a short message in the app.

## Performance rules (important)
- No work at all when the game isn't visible: every rAF/timer tick must first check `document.hidden || el.offsetParent === null` and do nothing (real-time games should also auto-pause in that case).
- Turn-based games (cards, minesweeper, etc.) must not run any loop; only redraw on input. Small CSS transitions are fine.
- Keyboard listeners go on `window`, but must ignore events when `el.offsetParent === null` or when the target is an INPUT/TEXTAREA/SELECT. preventDefault only for keys the game uses.
- unmount() must leave nothing running.

## Look
- Dark UI matching the app. CSS variables available: --bg --panel --panel2 --line --fg --muted --dim --ember (orange accent) --ember-ink --gold --cool (teal) --bad (red) --ok (green); fonts --display (Unbounded, for big headings/scores), --body (Figtree), --mono (JetBrains Mono, for numbers/LEDs).
- Button classes already styled by the app: `btn pri`, `btn sec`, add `small` for compact. Use them.
- Inject the game's own CSS once via a `<style id="ag-<id>-css">` element appended to document.head (check the id first). Prefix every selector with a game-specific class like `.ag-<id>` so nothing leaks. Remove nothing global on unmount except your own listeners (the style tag can stay).
- Layout: the game area is roughly 900-1100px wide and ~700px tall available; must also work down to ~700px wide. Canvas games should scale crisply with devicePixelRatio and fit the available height (window.innerHeight minus el's top, minus ~40px), but keep a sensible max size.
- Cards: draw playing cards yourself with HTML/CSS or canvas (white rounded rect, rank + suit symbols ♠♥♦♣ in corners, big suit pip in the middle; red for hearts/diamonds). A nice card back pattern using the ember/orange color with a small "VM" mark. No copyrighted artwork. Smooth deal/flip CSS animations are nice.
- Characters and names must be ORIGINAL (VanMule-themed is great: a mule mascot, ember/orange colors). Don't copy trademarked characters, names, or exact layouts of commercial games.
- Each game shows: title, short how-to-play line, score/bankroll, New game/Reset button, and its controls. A collapsible "Tips" / "Strategy" panel where asked.
- Sounds: tiny WebAudio blips created lazily on first user input (no audio files). Respect the sound toggle.
- Persist high scores / bankroll / options with api.save.

## Testing
`app/arcade/test.html?g=<id>` loads the game with a fake api and the same CSS variables and button styles. Test with Python Playwright headless Chromium (already installed: `from playwright.sync_api import sync_playwright`; `p.chromium.launch()` needs no options) by opening `file:///home/claude/vanmule/app/arcade/test.html?g=<id>`, waiting for `window.__mounted`, interacting, collecting `page.on('pageerror')` and console errors, and taking screenshots to check the visuals (Read the PNG to look at it). Also test that calling `VanArcade['<id>'].unmount()` leaves no running timers (e.g. count rAF calls after unmount) and that a second mount works.
Do not modify files outside app/arcade/ (other than temporary test scripts in your scratch area).
