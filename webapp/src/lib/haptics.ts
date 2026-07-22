// Stub for Telegram Mini Apps SDK haptic feedback (@telegram-apps/sdk).
// In the real app this calls window.Telegram.WebApp.HapticFeedback.*;
// here it just gives the demo a physical vibration on supporting devices.
type ImpactStyle = 'light' | 'medium' | 'heavy'

export const haptics = {
  impact(style: ImpactStyle = 'light') {
    const ms = style === 'heavy' ? 25 : style === 'medium' ? 15 : 8
    navigator.vibrate?.(ms)
  },
  notification(type: 'success' | 'warning' | 'error') {
    const pattern = type === 'success' ? [10, 30, 10] : type === 'warning' ? [15, 20, 15] : [30]
    navigator.vibrate?.(pattern)
  },
  selection() {
    navigator.vibrate?.(5)
  },
}
