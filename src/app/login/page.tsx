import { sendMagicLink } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const query = await searchParams;
  return <main className="auth-page"><div className="auth-card"><span className="eyebrow">PRIVATE ACCESS</span><h1>NFL Projection Lab</h1><p>{query.sent ? "Check your inbox for the secure sign-in link." : "Sign in with the email invited to the shared team."}</p>{query.error && <p className="negative">{query.error}</p>}<form action={sendMagicLink}><label>Email<input type="email" name="email" placeholder="you@example.com" required /></label><button type="submit">Send secure sign-in link</button></form><small>The application never places a wager. It records jointly approved decisions.</small></div></main>;
}
