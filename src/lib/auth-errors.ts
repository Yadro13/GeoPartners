export function oauthErrorKey(code: string | null) {
  if (!code) return null;

  switch (code.toLowerCase()) {
    case "access_denied":
      return "oauthAccessDenied";
    case "account_not_linked":
      return "oauthNotLinked";
    case "forbidden":
      return "oauthForbidden";
    case "signup_disabled":
      return "oauthSignupDisabled";
    default:
      return "oauthFailed";
  }
}
