/**
 * Shared constants between the node half and the browser half.
 *
 * This module must stay free of any runtime import: the browser bundle
 * inlines it, and the node half imports it, so a dependency here would leak
 * host-only code into the client artifact (or vice versa).
 */

/**
 * Reserved question id that links the two halves of this plugin: the
 * `password_prompt` tool asks a question with this id, and the browser half
 * claims exactly questions carrying it and renders the masked-input panel.
 */
export const PASSWORD_QUESTION_ID = 'password' as const
