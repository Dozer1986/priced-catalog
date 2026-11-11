interface HeaderProps {
  currentPath: string;
  syncStatus: string;
}

export function Header({ currentPath, syncStatus }: HeaderProps) {
  let statusColor = 'bg-rule';
  if (syncStatus.startsWith('Synced')) {
    statusColor = 'bg-mark';
  } else if (syncStatus === 'Syncing…') {
    statusColor = 'bg-tag-water animate-pulse';
  } else if (syncStatus.startsWith('Offline')) {
    statusColor = 'bg-tag-comms';
  } else if (syncStatus.startsWith('Sync error')) {
    statusColor = 'bg-red-500';
  }

  const isNavActive = (hash: string) => {
    if (hash === '#/' && (currentPath === '#/' || currentPath === '' || currentPath === '#')) {
      return true;
    }
    return currentPath.startsWith(hash);
  };

  return (
    <header className="no-print border-b border-rule bg-paper">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <a
            href="#/"
            className="flex items-center gap-2 text-lg font-bold tracking-tight text-ink hover:text-mark"
          >
            <span className="inline-block h-3.5 w-3.5 rounded-full bg-mark" />
            <span>KAMOTec Hours</span>
          </a>
        </div>

        <div className="flex items-center gap-4">
          <div
            className="flex items-center gap-1.5 text-xs text-ink-2"
            title={syncStatus}
            aria-label={`Sync status: ${syncStatus}`}
          >
            <span className={`inline-block h-2 w-2 rounded-full ${statusColor}`} />
            <span className="truncate max-w-[200px] sm:max-w-none">{syncStatus}</span>
          </div>

          <nav className="flex items-center gap-1">
            <a
              href="#/"
              className={`rounded px-2.5 py-1 text-sm font-medium transition-colors ${
                isNavActive('#/') && !currentPath.startsWith('#/invoice') && !currentPath.startsWith('#/settings')
                  ? 'bg-field text-ink'
                  : 'text-ink-2 hover:text-ink'
              }`}
            >
              Jobs
            </a>
            <a
              href="#/invoices"
              className={`rounded px-2.5 py-1 text-sm font-medium transition-colors ${
                isNavActive('#/invoice')
                  ? 'bg-field text-ink'
                  : 'text-ink-2 hover:text-ink'
              }`}
            >
              Invoices
            </a>
            <a
              href="#/settings"
              className={`rounded px-2.5 py-1 text-sm font-medium transition-colors ${
                isNavActive('#/settings')
                  ? 'bg-field text-ink'
                  : 'text-ink-2 hover:text-ink'
              }`}
            >
              Settings
            </a>
          </nav>
        </div>
      </div>
    </header>
  );
}
