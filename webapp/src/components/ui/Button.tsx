import { motion } from 'framer-motion'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import { haptics } from '../../lib/haptics'

type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'
>

interface ButtonProps extends NativeButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'md' | 'lg'
  full?: boolean
  icon?: ReactNode
}

const variants: Record<string, string> = {
  primary:
    'text-white bg-gradient-to-r from-primary to-secondary shadow-[var(--shadow-soft)] active:brightness-95',
  secondary: 'bg-[var(--tg-surface)] text-primary dark:text-white active:brightness-95',
  ghost: 'bg-transparent text-[var(--tg-text)] active:bg-black/5 dark:active:bg-white/5',
  danger: 'bg-danger/10 text-danger active:bg-danger/20',
}

const sizes: Record<string, string> = {
  md: 'h-11 px-4 text-[15px] rounded-2xl',
  lg: 'h-13 px-5 text-[16px] rounded-2xl min-h-[52px]',
}

export function Button({
  variant = 'primary',
  size = 'md',
  full,
  icon,
  className,
  children,
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.15 }}
      onClick={(e) => {
        haptics.impact('light')
        onClick?.(e)
      }}
      className={clsx(
        'inline-flex items-center justify-center gap-2 font-medium select-none transition-colors',
        'disabled:opacity-40 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        full && 'w-full',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </motion.button>
  )
}
