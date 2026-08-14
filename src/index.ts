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
export const inject = ['tools', 'userQuestions']

const description = 'Ask the user to type a password (or other secret) into the masked password panel in the Web GUI, '
  + 'wait for their input, and return the value. '
  + 'Use this when a remote command or connection needs a secret only the user knows, '
  + 'for example an SSH password: the panel input is masked, and the returned value is '
  + 'meant to be passed straight into the command that needs it — do not repeat it in prose, '
  + 'and do not write it into files on disk unless the user asks.'

export function apply(ctx: Context): void {
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
