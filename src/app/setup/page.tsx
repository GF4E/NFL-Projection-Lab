export default function SetupPage() {
  return <main className="auth-page"><div className="auth-card"><span className="eyebrow">SETUP REQUIRED</span><h1>Connect the private workspace</h1><p>Add the Supabase URL and keys from <code>.env.example</code>, then run the owner-only migration and seed.</p><small>The teammate seat remains locked until an explicit owner release.</small></div></main>;
}
