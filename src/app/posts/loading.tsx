export default function PostsLoading() {
  return (
    <main className="min-h-screen bg-[#f0eee8] px-4 py-20 text-[#17191c]" aria-busy="true" aria-label="正在载入日志">
      <div className="mx-auto w-full max-w-4xl animate-pulse">
        <div className="h-14 w-56 bg-[#d9d6ce]" />
        <div className="mt-16 space-y-5">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-40 border-y border-[#d2cfc7] bg-[#e9e6de]" />
          ))}
        </div>
      </div>
    </main>
  );
}
