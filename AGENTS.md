After any context compaction or when you receive a "continue" / "proceed" signal, immediately resume the previous task. Never stop and wait for the user unless you have fully completed every remaining todo item and verified the final result. Treat "Session compacted" as a signal to continue, not to stop.

## Feature tracking
- `FEATURES.md` is the single source of truth for what the game currently does. Keep it in sync with the code.
- **Whenever you add (or meaningfully change/remove) a feature, update `FEATURES.md` in the same change** so no feature is missed.
- **Before finishing work, verify every feature listed in `FEATURES.md` still works and none was missed or broken.** At minimum:
  - `node --check maze.js` and `node --check game.js` pass.
  - Re-read each code path you touched and confirm it matches what `FEATURES.md` claims (values, keys, behavior).
  - If a feature depends on runtime behavior that can't be checked statically, note that and how to verify it in a browser.
- If you are unsure whether a feature works, say so explicitly rather than assuming it does.