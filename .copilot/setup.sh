#!/bin/bash
# .copilot/setup.sh

# Copy .env from the main worktree if it exists
MAIN_WORKTREE=$(git worktree list --porcelain | head -1 | sed 's/worktree //')
if [ -f "$MAIN_WORKTREE/.env" ]; then
  cp "$MAIN_WORKTREE/.env" .env
fi