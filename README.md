# dsh-password-prompt

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that lets an agent ask the user for a password through a **masked HTML password panel** in the Web GUI — no interactive terminal required.

When the agent calls the `password_prompt` tool, the browser pops the panel and waits. The user types the password (masked, with a show/hide toggle), and the value is returned to the agent, which can then use it — e.g. feed it to `ssh` through an askpass script.

```
agent calls password_prompt("SSH password for root@1.2.3.4")
  └─ ctx.userQuestions.ask({ id: 'password', ... })     ← public seam, tool pauses
      └─ host → browser: question/requested frame
          └─ this plugin's composer entry (priority -1) claims it
              └─ masked panel renders in the GUI
                  └─ user types → answer flows back → tool returns { password }
```

## Why this needs no DSH core changes

The plugin only uses public, shipped capability seams:

- `ctx.userQuestions.ask()` — the same service behind the built-in `ask_user_question` tool (pauses the tool call until the UI answers).
- The browser `conversation.composer` chain — a selector-routed slot; this plugin registers an entry at priority `-1` that claims single questions whose id is the reserved literal `password`, and every other question falls through to the generic composer untouched.
- The dual-face plugin convention: a package declaring `dsh.client` + an `exports["./client"]` bundle is auto-scanned into `window.__DSH_BOOT__` and served at `/plugins/<id>/client.js`.

It works on a **stock, unmodified** DSH installation.

## Install

The package is not yet published to npm. Install from a local checkout / git:

```bash
# in your DSH profile tree (e.g. ~/.dsh/profiles/web), add the row:
cat >> ~/.dsh/profiles/web/cordis.patch.yml <<'EOF'
- insert:
    - id: password-prompt
      name: dsh-password-prompt
EOF

# link the package into the profile's node_modules
ln -s /path/to/dsh-password-prompt ~/.dsh/profiles/node_modules/dsh-password-prompt

# restart `dsh web` — plugin-set changes apply on restart
```

Once published to npm: `pnpm add dsh-password-prompt` in the profile tree (or the bundle package that owns your profile), keep the cordis row above, restart.

## Usage

Tell the agent something like:

> 连 192.168.1.10 需要密码，用 password_prompt 问我要。

The agent calls `password_prompt`, the masked panel pops up, you type, and the agent continues. **The value never enters the model context**: the tool writes it to the private 0600 file the agent named (`outFile`, e.g. `<cwd>/.dsh-secrets/ssh-pass`) and returns only that path. The agent feeds the command from the file — an askpass script that `cat`s it for SSH, `sudo -S < file` for sudo — then deletes the file. The model cannot echo a secret it never possessed.

## Security notes

- **The password never reaches the model.** It travels browser → host RPC → a private 0600 file on disk, and the model sees only the file path. It therefore cannot appear in reasoning or chat output.
- The file holds the value in plaintext (mode 0600, same user only) for the short window until the consuming command finishes; the agent is instructed to delete it immediately, and the panel card shows only the path.
- Prefer SSH keys over passwords whenever possible. This plugin is for the cases where a password is unavoidable.
- The panel is a **convenience, not a vault**: no encryption, no persistence, no autofill store. The host process (and anyone with access to the disk) can read the file while it exists.

## Building from source

```bash
pnpm install            # dev-time: also needs the DSH @deepseek-ai peers resolvable
pnpm run build          # tsc (types → lib/types) + tsdown (lib/index.js + lib/client.js)
```

Dev-time dependency note: the `@deepseek-ai/*` packages are peer dependencies provided by the host DSH at runtime. For local development, link a DSH checkout's package scope into `node_modules` (the browser half externalizes only `react`, so the peer surface is minimal):

```bash
ln -s ~/.dsh/profiles/node_modules/@deepseek-ai node_modules/@deepseek-ai
```

## License

MIT
