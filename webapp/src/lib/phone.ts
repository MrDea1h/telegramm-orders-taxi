/**
 * Formats a Russian phone number as the user types: "+7 (911) 222-33-44"
 * if they start with 7/+7/9, or "8 (911) 222-33-44" if they start with 8.
 * Always re-derives from the raw digits rather than editing the previous
 * formatted string in place, so backspace/paste/autofill all just work.
 */
export function formatPhoneInput(raw: string): string {
  const allDigits = raw.replace(/\D/g, '')
  if (!allDigits) return ''

  const usesEight = allDigits[0] === '8'
  const rest = usesEight || allDigits[0] === '7' ? allDigits.slice(1) : allDigits
  const digits = rest.slice(0, 10)

  let out = usesEight ? '8' : '+7'
  if (digits.length > 0) out += ` (${digits.slice(0, 3)}`
  if (digits.length >= 3) out += ')'
  if (digits.length > 3) out += digits.slice(3, 6)
  if (digits.length > 6) out += `-${digits.slice(6, 8)}`
  if (digits.length > 8) out += `-${digits.slice(8, 10)}`
  return out
}

/** True once all 10 significant digits (after the 7/8 country/trunk code) are present. */
export function isPhoneComplete(formatted: string): boolean {
  const digits = formatted.replace(/\D/g, '')
  return digits.length === 11
}
