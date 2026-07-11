import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-3xl flex-col justify-center px-4 py-16">
      <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
        EastherPhil Blog
      </p>
      <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
        Notes, ideas, and technical writing.
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-600 dark:text-neutral-300">
        A personal publishing space for practical articles and ongoing learning.
      </p>
      <div className="mt-8">
        <Link
          href="/posts"
          className="inline-flex rounded-full bg-neutral-900 px-5 py-3 font-medium text-white dark:bg-white dark:text-neutral-900"
        >
          Browse published posts
        </Link>
      </div>
    </main>
  );
}
