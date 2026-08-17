# dsh-password-prompt

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that lets an agent ask the user for a password through a **masked HTML password panel** in the Web GUI — or for an **account + password** through the same panel with an extra account field — no interactive terminal required.

When the agent calls the `password_prompt` tool, the browser pops the panel and waits. The user types the password (masked, with a show/hide toggle); with `account: true` the panel also shows an account field. The password is written to a private 0600 file and only its path is returned to the agent; the account is returned in the clear. The agent can then use them — e.g. feed the password to `ssh` through an askpass script.

## ⚠️ SECURITY WARNING — READ BEFORE USE

> **This plugin has NOT undergone strict security testing or any independent security audit.**
>
> **It provides NO guarantee whatsoever for the security, confidentiality, or integrity of any password handled through it.**
>
> **Before using this plugin, make sure you clearly understand and fully accept the security risks.** Do not use it with passwords for production, financial, or other highly sensitive systems unless you have personally reviewed the code and accepted the exposure. Use at your own risk.

```
agent calls password_prompt("SSH password for root@1.2.3.4")
  └─ ctx.userQuestions.ask({ id: 'password', ... })     ← public seam, tool pauses
      └─ host → browser: question/requested frame
          └─ this plugin's composer entry (priority -1) claims it
              └─ masked panel renders in the GUI
                  └─ user types → answer flows back → tool returns { secretFile }

agent calls password_prompt("SSH login for 1.2.3.4", account: true)
  └─ ctx.userQuestions.ask({ id: 'account', ... }, { id: 'password', ... })
      └─ host → browser: question/requested frame
          └─ this plugin's composer entry (priority -1) claims it
              └─ account + masked-password panel renders in the GUI
                  └─ user types both → answer flows back → tool returns { account, secretFile }
```

## Why this needs no DSH core changes

The plugin only uses public, shipped capability seams:

- `ctx.userQuestions.ask()` — the same service behind the built-in `ask_user_question` tool (pauses the tool call until the UI answers).
- The browser `conversation.composer` chain — a selector-routed slot; this plugin registers an entry at priority `-1` that claims a single question whose id is the reserved literal `password`, or two questions whose ids are the reserved literals `account` and `password` (in that order), and every other question falls through to the generic composer untouched.
- The dual-face plugin convention: a package declaring `dsh.client` + an `exports["./client"]` bundle is auto-scanned into `window.__DSH_BOOT__` and served at `/plugins/<id>/client.js`.
- The `dsh.bundle` manifest: a `cordis.patch.yml` layer shipped inside the package, so `dsh plugin add` appends the plugin to the profile's bundle list and the `password-prompt` row activates with no manual patch edits.

It works on a **stock, unmodified** DSH installation.

## Install

The package is distributed as a **bundle + dual-face plugin**: it declares `dsh.bundle` (a patch layer that activates the plugin automatically) and `dsh.client` (the browser half served to the Web GUI). Anyone with a DSH installation can add it from GitHub with `dsh plugin add` — no manual `cordis.patch.yml` edits and no DSH core changes.

### Quick start — new profile (recommended)

Profiles are just directories under `$DSH_HOME/profiles/<name>` (default `~/.dsh/profiles/<name>`); one DSH installation manages any number of them, and the profile directory is auto-created on first use. `web` and `headless` are the only names with shipped templates; any other name initializes with `@deepseek-ai/dsh-base` alone.

**1. Create the profile and install the plugin**

```sh
# from a DSH source checkout; omit the `pnpm` prefix when `dsh` is on PATH
pnpm dsh plugin --profile demo add github:MagicCrazyMan/dsh-password-prompt
```

**2. Allow the install-time build (pnpm ≥ 10)**

The first `add` fails **by design**: pnpm refuses to run a git dependency's `prepare` script until it is explicitly allowed. The error prints the exact key to add — note it is **bound to the commit SHA**, not the package name:

```yaml
# in ~/.dsh/profiles/demo/pnpm-workspace.yaml
allowBuilds:
  dsh-password-prompt@https://codeload.github.com/MagicCrazyMan/dsh-password-prompt/tar.gz/<commit-sha>: true
```

Copy the full key pnpm printed (the `<commit-sha>` part differs per version), then re-run step 1. Every plugin update fetches a new SHA, so a later reinstall prints a new key — add it and re-run again.

Treat this as what it is: **permission to execute the package's build code on your machine at install time**. Only install from commits you trust — pin one (`github:MagicCrazyMan/dsh-password-prompt#<sha>`) so a later push cannot silently change what runs.

**3. Add the Web app bundle (only needed for a GUI profile)**

A non-`web` profile starts with only `@deepseek-ai/dsh-base`, which has no Web UI. Do **not** try `dsh plugin add @deepseek-ai/dsh-web-app`: the npm-published `@deepseek-ai` packages are incomplete (internal packages such as `@deepseek-ai/dsh-client-ui-slash` are absent), so the pnpm install fails. In-box bundles resolve from the DSH installation itself — add the name to the profile manifest's `dsh.profile.bundles` by hand, exactly like the shipped `web` template:

```json
// ~/.dsh/profiles/demo/package.json
{
  "name": "dsh-profile-demo",
  "private": true,
  "dependencies": {
    "dsh-password-prompt": "github:MagicCrazyMan/dsh-password-prompt"
  },
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-password-prompt"]
    }
  }
}
```

**4. Boot and verify**

```sh
pnpm dsh --profile demo --host 127.0.0.1 --port 3082
# in another shell (bypass any local HTTP proxy for loopback):
curl --noproxy '*' -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3082/        # → 200
curl --noproxy '*' -o /dev/null -w '%{http_code}\n' \
  http://127.0.0.1:3082/plugins/dsh-password-prompt/client.js                     # → 200
```

The bundle layer activates the `password-prompt` row automatically — confirm with `pnpm dsh --profile demo --dump-config | grep -A2 password-prompt`.

### Install into the existing `web` profile

The `web` profile already composes `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app` (shipped template; `dsh web` is an alias for `--profile web`), so only steps 1–2 apply:

```sh
pnpm dsh plugin --profile web add github:MagicCrazyMan/dsh-password-prompt   # + allowBuilds, see above
# restart the running web server — plugin-set changes apply on restart
```

### Manual install (no `dsh` CLI, or from a local checkout)

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

### npm (once published)

`dsh plugin --profile web add dsh-password-prompt` — the bundle layer activates the same row. Restart.

## Usage

Tell the agent something like:

> 连 192.168.1.10 需要密码，用 password_prompt 问我要。
> 连 192.168.1.10 的账号密码都问我。

The agent calls `password_prompt`, the masked panel pops up, you type, and the agent continues. **The password never enters the model context**: the tool writes it to the private 0600 file the agent named (`outFile`, e.g. `<cwd>/.dsh-secrets/ssh-pass`) and returns only that path. The agent feeds the command from the file — an askpass script that `cat`s it for SSH, `sudo -S < file` for sudo — then deletes the file. If the agent needs an account/username too, it calls `password_prompt` with `account: true`; the panel asks for both, the account is returned to the agent in the clear, and the password still stays file-only. The model cannot echo a secret it never possessed.

## Optional: companion skill

A skill makes the agent **proactively** route every secret through `password_prompt` — before an `ssh`/`sudo`/remote-login command fails, and after a `Permission denied` — instead of relying on the tool description alone. Install the copy shipped in this repo:

```bash
mkdir -p ~/.dsh/skills/password-prompt
cp skills/password-prompt/SKILL.md ~/.dsh/skills/password-prompt/SKILL.md
```

The skill is user-level (rank 400), so it applies to every profile/project. It shows up in the model's session skill catalog (the catalog may refresh live in the current session); its `description` is the trigger, so the agent loads it exactly when a task needs a secret.

## Security notes

- **The password never reaches the model.** It travels browser → host RPC → a private 0600 file on disk, and the model sees only the file path. It therefore cannot appear in reasoning or chat output. In account+password mode the account is returned to the model in the clear (accounts are treated as non-secret); the password remains file-only.
- The file holds the password in plaintext (mode 0600, same user only) for the short window until the consuming command finishes; the agent is instructed to delete it immediately, and the panel card shows only the path.
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
