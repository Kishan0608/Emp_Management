/** Signup hint helper (deprecated: test mode removed; OTP codes are delivered exclusively via email). */
export const signupHint = {
  set: (_code?: string) => {},
  take: (): string | undefined => undefined,
};
