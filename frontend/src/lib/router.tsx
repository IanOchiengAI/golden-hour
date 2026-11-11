import React, { useEffect, useState } from 'react'

/*
 * Tiny hash router (no dependency): #/ , #/login , #/app/<section>[/<id>].
 * Hash URLs work on any static host without server rewrites.
 */

const current = () => window.location.hash.replace(/^#/, '') || '/'

export function useRoute(): string {
  const [path, setPath] = useState(current)
  useEffect(() => {
    const on = () => setPath(current())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return path
}

export function navigate(path: string) {
  if (current() !== path) window.location.hash = path
}

export const Link: React.FC<React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }> = ({ to, ...props }) => (
  <a href={`#${to}`} {...props} />
)
