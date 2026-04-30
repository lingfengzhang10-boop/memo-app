import { ClientSurfaceKind } from '@/lib/clientSurfaces'

export function getClientSurfaceFromPath(pathname?: string | null): ClientSurfaceKind {
  if (pathname?.startsWith('/mobile')) {
    return 'app'
  }

  return 'web'
}

export function resolveSurfaceHref(pathname: string | null | undefined, target: string) {
  const surface = getClientSurfaceFromPath(pathname)

  if (surface === 'web') {
    return target
  }

  if (target === '/') {
    return '/mobile'
  }

  if (target.startsWith('/mobile')) {
    return target
  }

  if (target === '/twin') {
    return '/mobile/more'
  }

  if (target === '/me') {
    return '/mobile/profile'
  }

  if (target.startsWith('/twin')) {
    return `/mobile${target}`
  }

  return target
}
