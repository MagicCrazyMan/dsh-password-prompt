/**
 * The password-wait domain face over the runtime's pending-question carrier.
 *
 * The browser runtime mints a `PendingWait<'question'>` whenever the host
 * pushes a `question/requested` mux frame. This class owns the password
 * protocol over that carrier: which questions it claims, how the masked value
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

/** One question item in the claimed wait. */
type QuestionItem = PasswordWait['payload']['questions'][number]

/**
 * Domain face over one password wait.
 *
 * The selector claims two shapes, both sent by the `password_prompt` tool:
 * - one question whose id is the reserved `password` literal — password-only
 *   mode, rendered as a single masked input;
 * - two questions whose ids are the reserved `account` and `password`
 *   literals (in that order) — account+password mode, rendered as an account
 *   input plus a masked password input.
 *
 * The answer encoding stays the standard question answer batch either way, so
 * the host resolves this wait through the exact same path as a normal
 * question.
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

  /** The whole question batch carried by the wait. */
  get questions(): PasswordWait['payload']['questions'] {
    return this.wait.payload.questions
  }

  /** The first question item; in password-only mode this is the only one. */
  get item(): QuestionItem {
    return this.questions[0] as QuestionItem
  }

  /** Which panel shape this wait asks for. */
  get mode(): 'password' | 'credentials' {
    return this.questions.length === 2 ? 'credentials' : 'password'
  }

  /** The panel's title text (the tool's `prompt` argument). */
  get prompt(): string {
    if (this.mode === 'credentials') {
      return this.item.header ?? this.item.question
    }
    return this.item.question
  }

  /** The account field label in credentials mode. */
  get accountQuestion(): string {
    return this.item.question
  }

  /** The password field label in credentials mode. */
  get passwordQuestion(): string {
    if (this.mode !== 'credentials') return 'Password'
    return this.questions[1]?.question ?? 'Password'
  }

  /**
   * Deliver the typed password as the single question's free-text answer; a
   * rejected carrier receipt throws.
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

  /**
   * Deliver the typed account and password as the two-question answer batch;
   * a rejected carrier receipt throws.
   * @param account - the account/username input value.
   * @param password - the masked password input value.
   */
  async answerCredentials(account: string, password: string): Promise<void> {
    const accountItem = this.questions[0] as QuestionItem
    const passwordItem = this.questions[1] as QuestionItem
    const receipt = await this.wait.respond({
      ok: true,
      value: {
        sessionId: this.wait.sessionId,
        answer: {
          answers: [
            { id: accountItem.id, selected: [], custom: account },
            { id: passwordItem.id, selected: [], custom: password },
          ],
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
