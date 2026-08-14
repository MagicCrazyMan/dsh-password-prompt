---
name: password-prompt
description: Use whenever a task needs a password, passphrase, SSH/sudo/remote login, API token, or any other secret input — including when a command fails with "Permission denied" or an authentication error. Route every such secret through the password_prompt panel; never ask for or handle passwords in plain chat, command arguments, or environment variables.
---

# Handling passwords with the password_prompt panel

Whenever a step needs a secret (SSH/sudo/remote login, passphrase, token, …), ask for it through the `password_prompt` tool instead of plain chat or command-line arguments. The panel is masked; the value is written to a private 0600 file; only the file path is returned. You never see the secret itself.

## When to trigger

- **Proactively**, before running a command that will obviously need a password: `ssh`, `sudo`, `su`, database/remote clients, VPN, passphrase prompts, tools with `-p`/`--password` flags.
- **Reactively**, after a command fails with `Permission denied`, `authentication failure`, `password authentication failed`, exit 255, or any prompt for a password/passphrase.
- When the user asks to connect to a remote host, unlock something, or otherwise supply credentials — ask via `password_prompt` rather than letting the command fail first.
- Do **not** trigger for non-secret inputs (filenames, ports, choices) — the panel is for secrets only.

## Procedure

1. Call `password_prompt` with a clear prompt (what the password is for) and an `outFile` inside the working directory, e.g. `<cwd>/.dsh-secrets/<name>`.
2. Pass the file path **only** to the single command that consumes the secret:
   - SSH: an askpass script that `cat`s the file, e.g.
     `printf '#!/bin/bash\ncat %q\n' "$file" > askpass.sh && chmod +x askpass.sh && SSH_ASKPASS="$PWD/askpass.sh" SSH_ASKPASS_REQUIRE=force ssh -F /dev/null -p PORT user@host "command"`
   - sudo: `sudo -S < "$file" command`
3. Delete the file (and any askpass script) as soon as the consuming command finishes — in the same turn.
4. Never read, print, or echo the secret; never put it in command arguments, environment variables, shell history, logs, or notes; never reuse it from memory — call `password_prompt` again if you need it later.

## On failure

- If authentication is rejected (e.g. SSH exit 255 + `Permission denied`): clean up the secret file, then call `password_prompt` again for a retry. Limit to ~2–3 attempts; after that, investigate username/port/server-side causes (fail2ban, key-only auth) instead of blind retries.
- Distinguish password failures from network failures (`Connection refused`, `timed out`, `No route to host`) — do not re-prompt for a password when the problem is connectivity.
