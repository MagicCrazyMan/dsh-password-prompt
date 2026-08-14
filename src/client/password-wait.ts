/**
 * The password-wait domain face over the runtime's pending-question carrier.
 *
 * The browser runtime mints a `PendingWait<'question'>` whenever the host
 * pushes a `question/requested` mux frame. This class owns the password
 * protocol over that carrier: which question it claims, how the masked value
 * is encoded into the answer, and how cancellation is expressed — mirroring
 * the shipped ui-user-questions contract, so the host resolves this wait
 * through the exact same response path as a normal question.
 */

import type { PendingWait } from '@deepseek-ai/dsh-client-runtime/client'
import type { QuestionResponsePayload } from '@deepseek-ai/dsh-api-remotes/client'

/** The pending question carrier this plugin claims. */
export type PasswordWait = PendingWait<'question'>

/** The wire answer batch shape the host expects for a question wait. */
export type PasswordAnswer = QuestionResponsePayload['answer']

/**
 * Domain face over one password wait: the claim (single question whose id is
 * the reserved `password` literal, as sent by the `password_prompt` tool),
 * the masked answer encoding, and cancellation.
 */
export class PendingPassword {
  /**
   * @param wait - the runtime carrier for one pending question request.
   */
  constructor(private readonly wait: PasswordWait) {}

  /** Opaque render identity (React key), forwarded from the carrier. */
  get key(): string {
    return this.wait.key
  }

  /** The question item this panel answers. */
  get item(): PasswordWait['payload']['questions'][number] {
    // The selector only claims single-question waits; the index read is the
    // narrowing tax, not a guess.
    return this.wait.payload.questions[0] as PasswordWait['payload']['questions'][number]
  }

  /** The panel's prompt text (the tool's `prompt` argument). */
  get prompt(): string {
    return this.item.question
  }

  /**
   * Deliver the typed password as the question's free-text answer; a rejected
   * carrier receipt throws.
   * @param password - the masked input value.
   */
  async answer(password: string): Promise<void> {
    const receipt = await this.wait.respond({
      ok: true,
      value: {
        sessionId: this.wait.sessionId,
        answer: {
          answers: [{ id: this.item.id, selected: [], custom: password }],
        },
      },
    })
    if (!receipt.accepted) {
      throw new Error(`password response rejected: ${receipt.reason}`)
    }
  }

  /** Reject the whole wait (the host resolves the tool call as cancelled). */
  async cancel(): Promise<void> {
    const receipt = await this.wait.respond({
      ok: false,
      error: {
        code: 'cancelled',
        message: 'the user closed this password prompt',
        details: {},
      },
    })
    if (!receipt.accepted) {
      throw new Error(`password cancellation rejected: ${receipt.reason}`)
    }
  }
}
