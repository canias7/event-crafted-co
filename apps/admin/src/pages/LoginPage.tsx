import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (error) {
      setError(error);
      return;
    }
    navigate("/", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bone p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-lg border border-ink/10 bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold">Admin sign in</h1>
        <p className="mt-1 text-xs text-ink/60">
          Use your Vendora admin email and password.
        </p>

        <label className="mt-4 block text-xs text-ink/60">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mt-1 block w-full rounded border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-gold"
        />

        <label className="mt-3 block text-xs text-ink/60">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="mt-1 block w-full rounded border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-gold"
        />

        {error ? (
          <p className="mt-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="mt-4 w-full rounded bg-ink px-3 py-2 text-sm font-medium text-bone disabled:opacity-50"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
