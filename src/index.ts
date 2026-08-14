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
 * Because it only uses public seams and a plain question id, the plugin
 * requires NO modification of the DeepSeek Harness core — it works on a
 * stock installation.
 *
 * @module dsh-password-prompt
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import '@deepseek-ai/dsh-user-questions'
import { PASSWORD_QUESTION_ID } from './shared.ts'

export const name = 'password-prompt'
export const inject = ['tools', 'userQuestions', 'systemPrompt']

/** Prompt-section order: tool guidance lives in 100–199 (see system-prompt docs). */
const SECRECY_SECTION_ORDER = 150

const description = 'Ask the user to type a password (or other secret) into the masked password panel in the Web GUI, '
  + 'wait for their input, and return the value. '
  + 'Use this when a remote command or connection needs a secret only the user knows, '
  + 'for example an SSH password. '
  + 'SECRET HANDLING RULES — these are mandatory: '
  + '(1) Never repeat the returned password in your own message text, summaries, titles, or file names — '
  + 'not even masked or partial forms. '
  + '(2) Pass the value only to the single command that needs it, in the same turn, '
  + 'and never print it back. '
  + '(3) Do not write the password into files on disk unless the user explicitly asks, '
  + 'and delete any temporary file holding it as soon as the command finishes. '
  + '(4) If you need the password again later, call this tool again instead of recalling it from memory. '
  + 'The panel input and the rendered result card are already masked; your prose must stay masked too.'

/** Secrecy rules injected into every assembled system prompt while this plugin is mounted. */
const secrecySectionText = 'Passwords and other secrets the user typed into the password_prompt panel are confidential '
  + 'and must never appear in your visible output. Concretely: '
  + '(1) never echo the secret in your own message text, summaries, explanations, titles, or file names — '
  + 'not even masked or partial forms; '
  + '(2) pass the value only to the single command that needs it (for example an askpass script or an ssh invocation), '
  + 'in the same turn, and never print it back; '
  + '(3) do not write the secret into files on disk unless the user explicitly asks, and delete any temporary '
  + 'file holding it as soon as the consuming command finishes; '
  + '(4) never put the secret into tool arguments other than the command that consumes it; '
  + '(5) if you need the secret again later, request it again through the password_prompt tool '
  + 'instead of recalling it from memory or your transcript; '
  + '(6) if you are about to include the secret anywhere, redact it (for example replace it with •••• or <redacted>) '
  + 'before producing the output.'

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
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          password: { type: 'string', required: true },
        },
      },
      // Presentation only: the model still receives the full result; the
      // rendered tool-result card in the transcript hides the value.
      render: () => [{ type: 'text', text: 'password received (redacted in this view)' }],
    },
    async execute(args, exec) {
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
      return { password }
    },
  }))
}
