/**
 * Browser half of the dsh-password-prompt plugin: claims password questions
 * and renders a masked-input panel over the conversation composer.
 *
 * The composer chain routes by selector: this entry runs at priority -1 (the
 * generic question composer registers at the default 0), so it is tried
 * first. It claims exactly the waits this plugin owns — a single question
 * whose id is the reserved `password` literal sent by the `password_prompt`
 * tool — and returns null for everything else, letting the generic question
 * flow keep every ordinary ask_user_question untouched. If this bundle fails
 * to load for any reason, password questions simply fall through to the
 * generic composer (unmasked) instead of blocking the session.
 *
 * @module dsh-password-prompt/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ComposerChainProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { PASSWORD_QUESTION_ID } from '../shared.ts'
import type { PasswordWait } from './password-wait.ts'
import { PasswordPromptPanel } from './PasswordPromptPanel.tsx'

export { PendingPassword } from './password-wait.ts'
export type { PasswordAnswer, PasswordWait } from './password-wait.ts'

/** Required services: the slot registry (the composer chain seat). */
export const inject = ['slots']

/**
 * Chain routing: claim the composer only for a single password question.
 * Pure — a function of the owner props only.
 * @param interactions - the conversation's pending interactions.
 * @returns the password wait, or null to pass to the next chain entry.
 */
function selectPassword({ interactions }: ComposerChainProps): PasswordWait | null {
  const wait = interactions.find((i): i is PasswordWait => i.kind === 'question')
  if (wait === undefined) return null
  if (wait.payload.questions.length !== 1) return null
  // Length-checked above; the index read is the narrowing tax, not a guess.
  const item = wait.payload.questions[0] as PasswordWait['payload']['questions'][number]
  return item.id === PASSWORD_QUESTION_ID ? wait : null
}

/**
 * Client plugin body: register the password panel into the composer chain.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.composer', () => ctx.slots.register(
    { name: 'conversation.composer', select: selectPassword, priority: -1 },
    PasswordPromptPanel,
  ))
}
