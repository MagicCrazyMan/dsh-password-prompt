/**
 * Node half of the dsh-password-prompt plugin: registers the model-facing
 * `password_prompt` tool.
 *
 * The tool does not collect the password itself. It rides the SAME public
 * capability seam as the shipped `ask_user_question` tool —
 * `ctx.userQuestions.ask()` — which pauses the tool call until the active UI
 * provider returns a human answer. The one difference: it asks a question
 * whose id is the reserved literal `password`, and the browser half of this
 * plugin claims exactly those questions and renders a masked-input panel
 * instead of the generic question card.
 *
 * LEAK-PROOF BY CONSTRUCTION: the typed password NEVER enters the model
 * context. The tool writes it to a private 0600 file at the path the caller
 * names (`outFile`) and returns only that path. The model consumes the value
 * through the file (an askpass script that `cat`s it, `sudo -S < file`, …)
 * and deletes it afterwards — so the secret cannot be echoed in reasoning or
 * output, because the model never possessed the string.
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
import { PASSWORD_QUESTION_ID } from './shared.ts'

export const name = 'password-prompt'
export const inject = ['tools', 'userQuestions', 'systemPrompt']

/** Prompt-section order: tool guidance lives in 100–199 (see system-prompt docs). */
const SECRECY_SECTION_ORDER = 150

const description = 'Ask the user to type a password (or other secret) into the masked password panel in the Web GUI, '
  + 'wait for their input, and return a private file path that holds the value. '
  + 'Use this when a remote command or connection needs a secret only the user knows (for example an SSH password). '
  + 'The value is NEVER returned to you — it is written to `outFile` with mode 0600, and only the path is returned. '
  + 'Feed the command from the file instead of the value: '
  + 'for SSH use an askpass script that cats the file, e.g. '
  + '`printf \'#!/bin/bash\\ncat %q\\n\' "$file" > askpass.sh && chmod +x askpass.sh && '
  + 'SSH_ASKPASS="$PWD/askpass.sh" SSH_ASKPASS_REQUIRE=force ssh -F /dev/null -p PORT user@host "command"`; '
  + 'for sudo use `sudo -S < "$file" command`. '
  + 'Delete the file as soon as the command finishes (`rm -f "$file"`). '
  + 'Never read or print the file content yourself, and never put the path in file names or titles of your output.'

/** Secrecy rules injected into every assembled system prompt while this plugin is mounted. */
const secrecySectionText = 'Passwords and other secrets collected through the password_prompt panel are written to a '
  + 'private 0600 file and are NEVER part of your context — only the file path is. Concretely: '
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
        description: 'What this password is for, shown in the panel — e.g. "SSH password for root@192.168.1.10".',
      },
      outFile: {
        type: 'string',
        required: true,
        description: 'Absolute path of the private file to write the password into (mode 0600, parent dirs created). '
          + 'Use a path inside your working directory, e.g. <cwd>/.dsh-secrets/ssh-pass. '
          + 'The value never enters the model context; commands read it from this file.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          secretFile: { type: 'string', required: true },
        },
      },
      // Presentation only: the model already sees only the path; the card
      // re-states it without any value.
      render: (_args, value) => [{ type: 'text', text: `password written to ${value.secretFile} (0600, redacted)` }],
    },
    async execute(args, exec) {
      if (!isAbsolute(args.outFile)) {
        throw new Error('password_prompt: outFile must be an absolute path inside your working directory')
      }
      const result = await ctx.userQuestions.ask({
        questions: [{ id: PASSWORD_QUESTION_ID, question: args.prompt }],
        ...(exec.agent !== undefined ? { agent: exec.agent } : {}),
        signal: exec.signal,
      })
      const answer = result.answers.find(item => item.id === PASSWORD_QUESTION_ID)
      const password = answer?.custom
      if (password === undefined || password === '') {
        throw new Error('password_prompt: no password was provided')
      }
      await mkdir(dirname(args.outFile), { recursive: true })
      await writeFile(args.outFile, password, { mode: 0o600 })
      return { secretFile: args.outFile }
    },
  }))
}
