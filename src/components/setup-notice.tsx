type SetupNoticeProps = {
  message: string;
};

export function SetupNotice({ message }: SetupNoticeProps) {
  return (
    <div className="w-full rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-amber-50">
      <h2 className="text-lg font-semibold text-amber-100">
        Database setup required
      </h2>
      <p className="mt-2 text-sm leading-6 text-amber-100/90">{message}</p>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-amber-50/90">
        <li>
          Open your{" "}
          <a
            href="https://supabase.com/dashboard/project/zsowljeodhwtgcuhzbzv/sql/new"
            className="font-medium underline underline-offset-2"
            target="_blank"
            rel="noopener noreferrer"
          >
            Supabase SQL Editor
          </a>
        </li>
        <li>
          Run migrations in order:{" "}
          <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs">
            002
          </code>
          ,{" "}
          <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs">
            003
          </code>
          ,{" "}
          <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs">
            004
          </code>
          , then run{" "}
          <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs">
            npm run import:data
          </code>
        </li>
        <li>Refresh this page</li>
      </ol>
    </div>
  );
}
