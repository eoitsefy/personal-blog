export default function PostsLoading() {
  return (
    <main className="min-h-screen bg-[#f0eee8] px-4 py-20 text-[#17191c]" aria-busy="true" aria-label="正在载入日志">
      <div className="mx-auto w-full max-w-4xl animate-pulse">
        <p className="font-mono text-xs tracking-[0.2em] text-[#8a681b]">SYNCING ARCHIVE</p>
        <div className="mt-5 h-14 w-56 bg-[#d9d6ce]" />
        <div className="mt-16 space-y-5">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-40 border-y border-[#d2cfc7] bg-[#e9e6de]" />
          ))}
        </div>
      </div>
    </main>
  );
}
