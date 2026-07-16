/** Usernames become <username>@vigneshwara.local behind the scenes —
 *  Supabase identifies accounts by email, but users only type a username. */
export const LOGIN_DOMAIN = "vigneshwara.local";

export function loginToEmail(login: string): string {
  const v = login.trim().toLowerCase();
  return v.includes("@") ? v : `${v}@${LOGIN_DOMAIN}`;
}

/** Show "ramana" instead of "ramana@vigneshwara.local" in the UI */
export function displayLogin(emailOrName: string): string {
  return emailOrName.endsWith(`@${LOGIN_DOMAIN}`)
    ? emailOrName.slice(0, -(LOGIN_DOMAIN.length + 1))
    : emailOrName;
}
