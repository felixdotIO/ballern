#!/bin/bash
#
# Keep the working tree and GitHub in step, once per turn.
#
# Runs from the Stop hook in settings.json. Everything here is best-effort: a
# sync that fails must never fail the turn, so every path ends at exit 0.

cd /Users/felix/ballern 2>/dev/null || exit 0

# Homebrew is not on the login PATH on this machine — which is why node, npm,
# brew and gh all report "command not found" from a plain shell. git lives in
# /usr/bin so it would be found anyway, but gh's credential helper may not be.
export PATH="/opt/homebrew/bin:/usr/bin:/bin:$PATH"

git rev-parse --git-dir >/dev/null 2>&1 || exit 0

# Nothing changed is the common case: no commit, no push, no noise.
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  count=$(git diff --cached --name-only | wc -l | tr -d ' ')
  files=$(git diff --cached --name-only | head -6 | tr '\n' ' ')
  git commit -q -m "Autosync: ${count} file(s) — ${files}" >/dev/null 2>&1
fi

# Push anything unpushed — including commits made by hand earlier in the turn,
# which is why this sits outside the block above. HEAD rather than a branch
# name, so it still works on a branch that has no upstream yet.
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
if ! git rev-parse '@{u}' >/dev/null 2>&1 || [ -n "$(git log '@{u}'..HEAD --oneline 2>/dev/null)" ]; then
  if ! git push -q origin HEAD >/dev/null 2>&1; then
    printf '{"systemMessage":"Autosync: committed on %s, but the push failed."}\n' "$branch"
  fi
fi

exit 0
