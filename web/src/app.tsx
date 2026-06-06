import { type ParentProps } from "solid-js"
import { createSignal } from "solid-js"

const NAV_LINKS = [
  { href: "/", label: "概览" },
  { href: "/chat", label: "写作" },
  { href: "/world", label: "世界观" },
  { href: "/review", label: "审查" },
  { href: "/pacing", label: "节奏" },
]

export function App(props: ParentProps) {
  const [menuOpen, setMenuOpen] = createSignal(false)

  return (
    <div class="min-h-screen bg-[var(--color-bg)]">
      <nav class="flex items-center gap-6 px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <a href="/" class="text-lg font-bold text-[var(--color-accent)]">Novel Weaver</a>

        {/* Desktop nav links */}
        <div class="hidden md:flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <a href={link.href} class="text-sm text-[var(--color-text-weak)] hover:text-[var(--color-text)]">
              {link.label}
            </a>
          ))}
        </div>

        {/* Hamburger button — mobile only */}
        <button
          type="button"
          class="ml-auto md:hidden text-[var(--color-text-weak)] hover:text-[var(--color-text)]"
          onClick={() => setMenuOpen(!menuOpen())}
          aria-label="Toggle menu"
        >
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </nav>

      {/* Mobile dropdown menu */}
      {menuOpen() && (
        <div class="md:hidden border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-2 flex flex-col gap-2">
          {NAV_LINKS.map((link) => (
            <a
              href={link.href}
              class="text-sm text-[var(--color-text-weak)] hover:text-[var(--color-text)] py-1"
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </a>
          ))}
        </div>
      )}

      <main class="p-6">
        {props.children}
      </main>
    </div>
  )
}
