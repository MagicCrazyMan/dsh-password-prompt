/**
 * Node half of the dsh-password-prompt plugin: registers the model-facing
 * `password_prompt` tool.
 *
 * The tool does not collect the credentials itself. It rides the SAME public
 * capability seam as the shipped `ask_user_question` tool —
 * `ctx.userQuestions.ask()` — which pauses the tool call until the active UI
 * provider returns a human answer. The difference: in password-only mode it
 * asks one question whose id is the reserved literal `password`; in
 * account+password mode (`account: true`) it asks two questions whose ids
 * are the reserved literals `account` and `password`. The browser half of
 * this plugin claims exactly those question shapes and renders the matching
 * masked-input panel instead of the generic question card.
 *
 * LEAK-PROOF BY CONSTRUCTION: the typed password NEVER enters the model
 * context. The tool writes it to a private 0600 file at the path the caller
 * names (`outFile`) and returns only that path. The model consumes the value
 * through the file (an askpass script that `cat`s it, `sudo -S < file`, …)
 * and deletes it afterwards — so the secret cannot be echoed in reasoning or
 * output, because the model never possessed the string. In account+password
 * mode the account/username is returned in the clear (it is not a secret);
 * the password remains file-only.
 *
 * Because it only uses public seams and a plain question id, the plugin
 * requires NO modification of the DeepSeek Harness core — it works on a
 * stock installation.
 *
 * @module dsh-password-prompt
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import '@deepseek-ai/dsh-user-questions'
import { ACCOUNT_QUESTION_ID, PASSWORD_QUESTION_ID } from './shared.ts'

export const name = 'password-prompt'
export const inject = ['tools', 'userQuestions', 'systemPrompt']

/** Prompt-section order: tool guidance lives in 100–199 (see system-prompt docs). */
const SECRECY_SECTION_ORDER = 150

const description = 'Ask the user to type a password (or other secret) into the masked password panel in the Web GUI, '
  + 'wait for their input, and return a private file path that holds the password. '
  + 'Use this when a remote command or connection needs a secret only the user knows (for example an SSH password). '
  + 'If the command also needs an account/username, set `account: true`; the panel then shows an account field plus the masked password field, '
  + 'and the account is returned in the tool result while the password is still only written to the file. '
  + 'The password is NEVER returned to you — it is written to `outFile` with mode 0600, and only the path is returned. '
  + 'Feed the command from the file instead of the password: '
  + 'for SSH use an askpass script that cats the file, e.g. '
  + '`printf \'#!/bin/bash\\ncat %q\\n\' "$file" > askpass.sh && chmod +x askpass.sh && '
  + 'SSH_ASKPASS="$PWD/askpass.sh" SSH_ASKPASS_REQUIRE=force ssh -F /dev/null -p PORT user@host "command"`; '
  + 'for sudo use `sudo -S < "$file" command`. '
  + 'Delete the file as soon as the command finishes (`rm -f "$file"`). '
  + 'Never read or print the file content yourself, and never put the path in file names or titles of your output.'

/** Secrecy rules injected into every assembled system prompt while this plugin is mounted. */
const secrecySectionText = 'Passwords and other secrets collected through the password_prompt panel are written to a '
  + 'private 0600 file and are NEVER part of your context — only the file path is. '
  + 'When password_prompt was called with `account: true`, the account/username is returned to you in the clear and is not a secret; '
  + 'the password remains file-only. Concretely: '
  + '(1) never read or print the secret file\'s content — do not cat it into your own context, your output, '
  + 'or any tool argument other than the single command that consumes the file; '
  + '(2) pass the file path only to the command that needs the secret (an askpass script, `sudo -S < file`, sshpass -f); '
  + '(3) delete the file as soon as the consuming command finishes, in the same turn; '
  + '(4) never copy the secret into other files, shell history, or your working notes; '
  + '(5) if you need the secret again later, call password_prompt again instead of reusing or recalling anything; '
  + '(6) file paths are not secrets, but if a command would print the secret\'s content into your context, '
  + 'redirect or suppress that output (e.g. `> /dev/null 2>&1`).'

export function apply(ctx: Context): void {
  ctx.systemPrompt.section({
    name: 'tool:password-prompt',
    order: SECRECY_SECTION_ORDER,
    text: secrecySectionText,
  })

  ctx.tools.register(defineTool({
    name: 'password_prompt',
    description,
    parameters: {
      prompt: {
        type: 'string',
        required: true,
        description: 'What this credential is for, shown as the panel title — e.g. "SSH login for 192.168.1.10".',
      },
      account: {
        type: 'boolean',
        description: 'Set true when the command also needs an account/username in addition to the password '
          + '(e.g. SSH or database login). The panel then shows an account field plus the masked password field; '
          + 'the account is returned in the result, while the password is only written to outFile.',
      },
      outFile: {
        type: 'string',
        required: true,
        description: 'Absolute path of the private file to write the password into (mode 0600, parent dirs created). '
          + 'Use a path inside your working directory, e.g. <cwd>/.dsh-secrets/ssh-pass. '
          + 'The password never enters the model context; commands read it from this file.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          account: { type: 'string' },
          secretFile: { type: 'string', required: true },
        },
      },
      // Presentation only: the model already sees only the password path;
      // the card re-states it without any value. In account mode the account
      // itself is returned in the clear and echoed here for the model.
      render: (_args, value) => value.account === undefined
        ? [{ type: 'text', text: `password written to ${value.secretFile} (0600, redacted)` }]
        : [{ type: 'text', text: `account ${value.account}; password written to ${value.secretFile} (0600, redacted)` }],
    },
    async execute(args, exec) {
      if (!isAbsolute(args.outFile)) {
        throw new Error('password_prompt: outFile must be an absolute path inside your working directory')
      }
      const credentialMode = args.account === true
      const questions = credentialMode
        ? [
            { id: ACCOUNT_QUESTION_ID, question: 'Account or username', header: args.prompt },
            { id: PASSWORD_QUESTION_ID, question: 'Password', header: args.prompt },
          ]
        : [{ id: PASSWORD_QUESTION_ID, question: args.prompt }]
      const result = await ctx.userQuestions.ask({
        questions,
        ...(exec.agent !== undefined ? { agent: exec.agent } : {}),
        signal: exec.signal,
      })

      const account = credentialMode
        ? result.answers.find(item => item.id === ACCOUNT_QUESTION_ID)?.custom?.trim()
        : undefined
      if (credentialMode && (account === undefined || account === '')) {
        throw new Error('password_prompt: no account was provided')
      }

      const password = result.answers.find(item => item.id === PASSWORD_QUESTION_ID)?.custom
      if (password === undefined || password === '') {
        throw new Error('password_prompt: no password was provided')
      }

      await mkdir(dirname(args.outFile), { recursive: true })
      await writeFile(args.outFile, password, { mode: 0o600 })
      return credentialMode ? { account, secretFile: args.outFile } : { secretFile: args.outFile }
    },
  }))
}
