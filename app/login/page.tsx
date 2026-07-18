import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { loginAction } from "@/lib/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getSession()) redirect("/dashboard");
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="card">
        <h1 className="text-xl font-bold text-brand-700">Registry</h1>
        <p className="mt-1 text-sm text-slate-500">
          AI Governance &amp; Compliance Platform
        </p>

        {error && (
          <p className="mt-4 rounded-md bg-red-50 p-2 text-sm text-red-700">
            No account found for that email. Try a demo account below.
          </p>
        )}

        <form action={loginAction} className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="email">
              Work email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="admin@demo.test"
              className="input"
              defaultValue="admin@demo.test"
            />
          </div>
          <button className="btn w-full" type="submit">
            Sign in
          </button>
        </form>

        <div className="mt-6 rounded-md bg-slate-50 p-3 text-xs text-slate-500">
          <p className="font-semibold text-slate-600">Demo accounts (local auth)</p>
          <ul className="mt-1 space-y-0.5">
            <li>admin@demo.test — ADMIN</li>
            <li>contrib@demo.test — CONTRIBUTOR</li>
            <li>viewer@demo.test — VIEWER</li>
          </ul>
          <p className="mt-2">
            Production uses WorkOS / Entra ID / Google SSO — see{" "}
            <code>AUTH_MODE=workos</code>.
          </p>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-slate-400">
        This product provides compliance tooling, not legal advice.
      </p>
    </main>
  );
}
