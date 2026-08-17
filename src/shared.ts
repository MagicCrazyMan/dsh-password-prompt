/**
 * Shared constants between the node half and the browser half.
 *
 * This module must stay free of any runtime import: the browser bundle
 * inlines it, and the node half imports it, so a dependency here would leak
 * host-only code into the client artifact (or vice versa).
 */

/**
 * Reserved question ids that link the two halves of this plugin:
 *
 * - `password` alone marks the single-question wait the `password_prompt`
 *   tool sends in password-only mode; the browser half claims exactly that
 *   wait and renders the masked-password panel.
 * - `account` followed by `password` marks the two-question wait sent in
 *   account+password mode; the browser half claims exactly that wait and
 *   renders the account + masked-password panel.
 */
export const PASSWORD_QUESTION_ID = 'password' as const
export const ACCOUNT_QUESTION_ID = 'account' as const
