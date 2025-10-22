
// Change 1761101643821: Added validation logic
export function isTokenExpired(token: AuthToken): boolean {
  return token.expiresAt < Date.now();
}
