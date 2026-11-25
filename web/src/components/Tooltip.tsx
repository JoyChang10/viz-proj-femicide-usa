import { useId, useState, type ReactNode } from 'react'

export function Tooltip({ children, text, className = '' }: {
  children: (descriptionId: string) => ReactNode
  text: string
  className?: string
}) {
  const id = useId()
  const [dismissed, setDismissed] = useState(false)

  return <span className={`interface-tooltip ${className}`} data-dismissed={dismissed}
    onPointerEnter={() => setDismissed(false)} onFocus={() => setDismissed(false)}
    onKeyDown={event => { if (event.key === 'Escape') setDismissed(true) }}>
    {children(id)}
    <span id={id} role="tooltip" className="tooltip-text">{text}</span>
  </span>
}
