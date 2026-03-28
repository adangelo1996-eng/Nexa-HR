import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

/**
 * Accesso email/password (stesso utente Supabase Auth delle altre app Synapse).
 * Ospite: `/` reindirizza qui; `/welcome` reindirizza a `/` (poi a `/login` senza cookie).
 */
export default function LoginPage(): React.JSX.Element {
  return <LoginForm />;
}
