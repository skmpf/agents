export const NotificationPlugin = async ({
  project,
  client,
  $,
  directory,
  worktree,
}) => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        const repo = (directory || worktree || project?.name || "OpenCode")
          .split("/")
          .filter(Boolean)
          .pop();

        await $`afplay /System/Library/Sounds/Purr.aiff`;
        await $`zsh -lc 'command -v nf >/dev/null 2>&1 && nf "OpenCode finished - ${repo}" || true'`;
      }
    },
  };
};
