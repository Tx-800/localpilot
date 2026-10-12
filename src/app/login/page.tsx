import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-brand-600 text-xl text-white">✦</div>
          <h1 className="font-display text-3xl font-semibold">LocalPilot</h1>
          <p className="mt-1 text-sm text-ink-500">One cockpit for every local client.</p>
        </div>
        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            That confirmation link didn&apos;t work. Try signing in.
          </p>
        )}
        <LoginForm next={next ?? '/dashboard'} />
      </div>
    </main>
  );
}
