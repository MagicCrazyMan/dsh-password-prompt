/**
 * The masked password panel: an HTML password input rendered as a composer
 * takeover card in the DSH Web GUI. Input is masked, autofocused, submitted
 * with Enter, cancellable with Escape, with a show/hide toggle.
 *
 * In account+password mode (two reserved questions `account` + `password`)
 * the same card renders an account text field plus the masked password field;
 * Enter moves from the account field to the password field, and the answer is
 * delivered as the standard two-question batch.
 *
 * Styling rides the DSW theme tokens (the same --dsw-alias-* variables the
 * shipped UI uses) through a single injected <style> element, so the panel
 * matches the active theme without importing the shared ui-primitives
 * package — keeping this plugin's browser bundle dependency surface at
 * exactly `react`.
 */

import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { PendingPassword, type PasswordWait } from './password-wait.ts'

/** Full component props: the framework runtime share plus the chain `matched` share. */
export type PasswordPromptProps = PropsRuntime<'conversation.composer'> & { matched: PasswordWait }

/** Eye / eye-off inline SVG (feather icons, MIT). */
function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      {off
        ? (
          <>
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </>
        )
        : (
          <>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </>
        )}
    </svg>
  )
}

/**
 * The password panel: one masked input over one prompt, or an account field
 * plus a masked input in credentials mode. Answers or cancels through the
 * pending wait carrier; the busy state guards double submission.
 * @param props - the selector-matched password wait plus the framework kit.
 */
export function PasswordPromptPanel({ matched }: PasswordPromptProps) {
  // Domain-face mint rides the carrier's stable identity (never minted in a
  // select/render dispatch — per-dispatch minting would churn memo identity).
  const pending = useMemo(() => new PendingPassword(matched), [matched])
  const credentialMode = pending.mode === 'credentials'
  const [value, setValue] = useState('')
  const [account, setAccount] = useState('')
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState<'answer' | 'cancel' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const accountRef = useRef<HTMLInputElement>(null)

  const submit = (): void => {
    const password = value
    if (credentialMode) {
      const accountValue = account.trim()
      if (accountValue === '') {
        setError('Account cannot be empty')
        accountRef.current?.focus()
        return
      }
      if (password === '') {
        setError('Password cannot be empty')
        passwordRef.current?.focus()
        return
      }
      setBusy('answer')
      setError(null)
      void pending.answerCredentials(accountValue, password).catch((cause: unknown) => {
        setBusy(null)
        setError(cause instanceof Error ? cause.message : String(cause))
      })
      return
    }
    if (password === '') {
      setError('Password cannot be empty')
      passwordRef.current?.focus()
      return
    }
    setBusy('answer')
    setError(null)
    void pending.answer(password).catch((cause: unknown) => {
      setBusy(null)
      setError(cause instanceof Error ? cause.message : String(cause))
    })
  }

  const cancel = (): void => {
    setBusy('cancel')
    setError(null)
    void pending.cancel().catch((cause: unknown) => {
      setBusy(null)
      setError(cause instanceof Error ? cause.message : String(cause))
    })
  }

  const onAccountKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (busy === null) passwordRef.current?.focus()
  }

  const onPasswordKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (busy === null) submit()
  }

  const onCardKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    if (busy === null) cancel()
  }

  return (
    <div className="dshpp-frame" data-password-key={pending.key}>
      <section
        className="dshpp-card" role="dialog" aria-modal="true"
        aria-labelledby={`dshpp-title-${pending.key}`}
        onKeyDown={onCardKeyDown}
      >
        <header className="dshpp-header">
          <div className="dshpp-heading">
            <div className="dshpp-eyebrow">{credentialMode ? 'Account & password required' : 'Password required'}</div>
            <h2 className="dshpp-title" id={`dshpp-title-${pending.key}`}>{pending.prompt}</h2>
          </div>
          <button
            type="button" className="dshpp-iconButton" aria-label="Cancel" title="Cancel"
            disabled={busy !== null} onClick={cancel}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="dshpp-body">
          {credentialMode && (
            <div className="dshpp-fieldGroup">
              <label className="dshpp-label" htmlFor={`dshpp-account-${pending.key}`}>{pending.accountQuestion}</label>
              <div className="dshpp-field">
                <input
                  ref={accountRef}
                  id={`dshpp-account-${pending.key}`}
                  type="text"
                  className="dshpp-input"
                  value={account}
                  disabled={busy !== null}
                  placeholder="Account or username"
                  autoFocus
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={event => { setAccount(event.target.value); setError(null) }}
                  onKeyDown={onAccountKeyDown}
                />
              </div>
            </div>
          )}
          <div className="dshpp-fieldGroup">
            {credentialMode && (
              <label className="dshpp-label" htmlFor={`dshpp-password-${pending.key}`}>{pending.passwordQuestion}</label>
            )}
            <div className="dshpp-field">
              <input
                ref={passwordRef}
                id={`dshpp-password-${pending.key}`}
                type={reveal ? 'text' : 'password'}
                className="dshpp-input"
                value={value}
                disabled={busy !== null}
                placeholder={credentialMode ? 'Password' : '••••••••'}
                autoFocus={!credentialMode}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                onChange={event => { setValue(event.target.value); setError(null) }}
                onKeyDown={onPasswordKeyDown}
              />
              <button
                type="button" className="dshpp-toggle" tabIndex={-1}
                aria-label={reveal ? 'Hide password' : 'Show password'}
                title={reveal ? 'Hide password' : 'Show password'}
                disabled={busy !== null}
                onClick={() => setReveal(current => !current)}
              >
                <EyeIcon off={reveal} />
              </button>
            </div>
          </div>
          {error !== null && <div className="dshpp-error" role="status">{error}</div>}
          <p className="dshpp-note">
            {credentialMode
              ? 'The account is returned to the agent. The password is written to a private 0600 file and the agent sees only its path. Nothing is stored by this plugin.'
              : 'The password is written to a private 0600 file and the agent sees only its path. It is not stored by this plugin.'}
          </p>
        </div>

        <footer className="dshpp-footer">
          <div className="dshpp-feedback" />
          <div className="dshpp-actions">
            <button
              type="button" className="dshpp-button dshpp-outline"
              disabled={busy !== null} onClick={cancel}
            >
              {busy === 'cancel' ? 'Cancelling…' : 'Cancel'}
            </button>
            <button
              type="button" className="dshpp-button dshpp-primary"
              disabled={busy !== null || value === '' || (credentialMode && account.trim() === '')}
              onClick={submit}
            >
              {busy === 'answer' ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </footer>
      </section>
      <style>{PANEL_CSS}</style>
    </div>
  )
}

/**
 * Panel styles on the DSW theme tokens (same variables as the shipped
 * composer card), injected once per mounted panel.
 */
const PANEL_CSS = `
.dshpp-frame {
  display: flex;
  justify-content: center;
  padding: 6px calc(var(--dsh-composer-side-clearance, 0px) + 16px) 10px;
}
.dshpp-card {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: var(--dsh-chat-content-width, 720px);
  padding: 0 0 10px;
  border: 1px solid var(--dsw-alias-border-l2-darkmode-thin);
  border-radius: 20px;
  background: var(--dsw-specific-input-major);
  box-shadow: var(--dsw-shadow-lv2);
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
}
.dshpp-card, .dshpp-card * { box-sizing: border-box; }
.dshpp-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-shrink: 0;
  padding: 20px 16px 0 24px;
}
.dshpp-heading { min-width: 0; }
.dshpp-eyebrow {
  margin-bottom: 5px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}
.dshpp-title {
  margin: 0;
  font-size: 16px;
  line-height: 22px;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.dshpp-iconButton {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
.dshpp-iconButton:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dshpp-iconButton:disabled { color: var(--dsw-alias-label-dimmed); cursor: default; }
.dshpp-body { padding: 14px 24px 0; }
.dshpp-fieldGroup + .dshpp-fieldGroup { margin-top: 10px; }
.dshpp-label {
  display: block;
  margin: 0 0 6px 4px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 16px;
}
.dshpp-field {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px 0 14px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-bg-module-platform);
  transition: border-color 120ms ease;
}
.dshpp-field:focus-within { border-color: var(--dsw-alias-state-business-primary); }
.dshpp-input {
  flex: 1;
  min-width: 0;
  height: 40px;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  caret-color: var(--dsw-alias-state-business-primary);
  font: inherit;
  font-size: 14px;
  line-height: 24px;
  letter-spacing: 0.04em;
}
.dshpp-input::placeholder { color: var(--dsw-alias-label-caption); }
.dshpp-input:disabled { cursor: default; }
.dshpp-toggle {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
.dshpp-toggle:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dshpp-toggle:disabled { color: var(--dsw-alias-label-dimmed); cursor: default; }
.dshpp-error {
  margin-top: 8px;
  color: var(--dsw-alias-state-error-primary);
  font-size: 11px;
  line-height: 16px;
}
.dshpp-note {
  margin: 10px 0 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}
.dshpp-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  margin-top: 14px;
  padding: 0 10px 0 18px;
}
.dshpp-feedback { flex: 1; }
.dshpp-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.dshpp-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: 18px;
  cursor: pointer;
  font-size: 14px;
  line-height: 22px;
}
.dshpp-button:disabled { cursor: not-allowed; opacity: 0.4; }
.dshpp-primary {
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.dshpp-primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.dshpp-outline {
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent;
  color: var(--dsw-alias-label-primary);
}
.dshpp-outline:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
@media (max-width: 720px) {
  .dshpp-card { border-radius: 16px; }
  .dshpp-header { padding: 10px 12px 0 18px; }
  .dshpp-body { padding: 12px 16px 0; }
  .dshpp-footer { align-items: flex-end; padding: 0 10px; }
  .dshpp-actions { flex-shrink: 0; }
}
`
