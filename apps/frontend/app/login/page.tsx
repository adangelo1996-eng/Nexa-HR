import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

/**
 * Accesso email/password (stesso utente Supabase Auth delle altre app Synapse).
 * La landing pubblica è /welcome con il pulsante "Login".
 */
export default function LoginPage(): React.JSX.Element {
  return <LoginForm />;
}
