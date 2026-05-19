import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { Button, Card } from "@/components/ui";

/**
 * Dev-only stub sign-in.
 *
 * The connector deliberately doesn't ship with a real auth provider — the
 * intent is that you drop in NextAuth / Clerk / Supabase Auth and replace
 * `getCurrentUser()` in [src/lib/auth/session.ts].
 *
 * This page exists so the install + repo flows are end-to-end runnable while
 * you wire up real auth: enter an email, get a User row + a session cookie,
 * and you can use the rest of the app.
 */
export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  async function signIn(formData: FormData) {
    "use server";
    const emailRaw = formData.get("email");
    const email =
      typeof emailRaw === "string" ? emailRaw.trim().toLowerCase() : "";
    if (!email || !email.includes("@")) {
      redirect("/login?error=invalid_email");
    }

    const user = await prisma.user.upsert({
      where: { email },
      create: { email },
      update: {},
    });

    const store = await cookies();
    store.set("session_user_id", user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    const params = await searchParams;
    redirect(params.next ?? "/repositories");
  }

  return (
    <main className="grid min-h-screen place-items-center px-6">
      <Card className="w-full max-w-sm">
        <form action={signIn} className="space-y-5 px-6 py-7">
          <div>
            <h1 className="text-lg font-medium text-white">Sign in</h1>
            <p className="mt-1 text-xs text-gray-7">
              Dev stub — replace with your real auth provider.
            </p>
          </div>
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-xs font-medium text-gray-8"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoFocus
              required
              placeholder="you@example.com"
              className="h-9 w-full rounded-md border border-gray-4 bg-gray-1 px-3 text-sm text-white placeholder:text-gray-7 focus:border-gray-6 focus:outline-none focus:ring-1 focus:ring-gray-6"
            />
          </div>
          <Button type="submit" variant="primary" size="md" className="w-full">
            Continue
          </Button>
        </form>
      </Card>
    </main>
  );
}
