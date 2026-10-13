/**
 * T84: back that can never dead-end. A deep-linked screen (widget,
 * notification) may have nothing beneath it; then `router.back()` is a no-op
 * and the user is trapped. Fall back to the tabs instead.
 */
export interface BackRouter {
  canGoBack(): boolean;
  back(): void;
  replace(href: '/(tabs)'): void;
}

export function safeBack(router: BackRouter): 'back' | 'home' {
  if (router.canGoBack()) {
    router.back();
    return 'back';
  }
  router.replace('/(tabs)');
  return 'home';
}
