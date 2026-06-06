import { createSignal, onMount, For, Show } from "solid-js"

type Status = "🟢" | "🟡" | "🔴" | "⚪"
type PacingPoint = "climax" | "satisfaction" | "suffering" | "hook"

interface PacingInfo {
  status: Status
  climax: { detected: boolean; score: number }
  satisfaction: { density: number; status: Status }
  hook: { score: number; status: Status }
  points: PacingPoint[]
}

interface PacingChapter {
  id: string
  chapter_num: number
  title: string
  word_count: number
  status: string
  pacing: PacingInfo
}

interface PacingVolume {
  volume_num: number
  name: string
  chapters: PacingChapter[]
}

interface PacingData {
  volumes: PacingVolume[]
  meta: { totalChapters: number; totalWords: number; genre: string | null }
}

export default function PacingPage() {
  const [data, setData] = createSignal<PacingData | null>(null)
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)
  const [selectedChapter, setSelectedChapter] = createSignal<PacingChapter | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/pacing")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData((await res.json()) as PacingData)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  onMount(load)

  return (
    <div class="max-w-6xl mx-auto">
      <header class="mb-6">
        <h1 class="text-2xl font-bold">节奏图谱</h1>
        <p class="text-[var(--color-text-weak)] mt-1">网文节奏顾问 · 爆点 / 爽点 / 虐点 / 钩子</p>
      </header>

      <Show when={loading()}>
        <div class="space-y-4">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SkeletonStat />
            <SkeletonStat />
            <SkeletonStat />
            <SkeletonStat />
          </div>
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </Show>

      <Show when={!loading() && error()}>
        <div class="p-4 bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 rounded-lg">
          <p class="text-[var(--color-danger)] text-sm mb-2">加载节奏数据失败：{error()}</p>
          <button
            onClick={load}
            class="px-3 py-1 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded text-white text-sm transition-colors"
          >
            重试
          </button>
        </div>
      </Show>

      <Show when={!loading() && !error() && data()}>
        <PacingMap data={data()!} onSelect={setSelectedChapter} />
        <Show when={selectedChapter()}>
          <ChapterDetail chapter={selectedChapter()!} onClose={() => setSelectedChapter(null)} />
        </Show>
      </Show>
    </div>
  )
}

function PacingMap(props: { data: PacingData; onSelect: (ch: PacingChapter) => void }) {
  return (
    <div class="space-y-6">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="总章节" value={props.data.meta.totalChapters} />
        <StatCard label="总字数" value={props.data.meta.totalWords.toLocaleString()} />
        <StatCard label="题材" value={props.data.meta.genre ?? "未设置"} />
        <StatCard label="卷数" value={props.data.volumes.length} />
      </div>

      <For each={props.data.volumes} fallback={<p class="text-[var(--color-text-weak)] text-center py-8">暂无章节</p>}>
        {(vol) => (
          <div class="bg-[var(--color-surface)] rounded-lg p-4 border border-[var(--color-border)]">
            <h2 class="text-lg font-semibold mb-3">
              第{vol.volume_num}卷 · {vol.name}
            </h2>
            <Show
              when={vol.chapters.length > 0}
              fallback={<p class="text-sm text-[var(--color-text-weak)]">本卷暂无章节</p>}
            >
              <div class="flex flex-wrap gap-2">
                <For each={vol.chapters}>
                  {(ch) => (
                    <button
                      type="button"
                      onClick={() => props.onSelect(ch)}
                      class={`p-3 rounded text-left min-w-[120px] border transition-colors hover:border-[var(--color-accent)] ${statusBorderClass(ch.pacing.status)}`}
                    >
                      <div class="text-2xl leading-none">{ch.pacing.status}</div>
                      <div class="text-sm font-medium mt-1">第{ch.chapter_num}章</div>
                      <div class="text-xs text-[var(--color-text-weak)] truncate max-w-[160px]">{ch.title}</div>
                      <div class="flex gap-1 mt-1 text-base">
                        <For each={ch.pacing.points}>
                          {(p) => <span title={p}>{pointIcon(p)}</span>}
                        </For>
                      </div>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        )}
      </For>
    </div>
  )
}

function ChapterDetail(props: { chapter: PacingChapter; onClose: () => void }) {
  function onBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) props.onClose()
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") props.onClose()
  }

  return (
    <div
      class="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
      onClick={onBackdropClick}
      onKeyDown={onKeyDown}
      role="dialog"
      aria-modal="true"
      tabindex={-1}
    >
      <div class="bg-[var(--color-surface)] rounded-lg p-6 max-w-md w-full border border-[var(--color-border)] shadow-xl">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h3 class="text-xl font-bold">第{props.chapter.chapter_num}章「{props.chapter.title}」</h3>
            <p class="text-sm text-[var(--color-text-weak)] mt-1">
              {props.chapter.word_count.toLocaleString()} 字 · {props.chapter.status}
            </p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            class="text-[var(--color-text-weak)] hover:text-[var(--color-text)] text-xl leading-none px-2"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <div class="flex items-center gap-2 mb-4">
          <span class="text-2xl">{props.chapter.pacing.status}</span>
          <div class="flex gap-1 text-lg">
            <For each={props.chapter.pacing.points}>
              {(p) => <span title={p}>{pointIcon(p)}</span>}
            </For>
          </div>
        </div>

        <div class="space-y-3">
          <PacingRow
            label="爆点"
            status={props.chapter.pacing.climax.detected ? "🟢" : "🔴"}
            value={`${props.chapter.pacing.climax.detected ? "已检测" : "未检测"} (${props.chapter.pacing.climax.score}/10)`}
          />
          <PacingRow
            label="爽点密度"
            status={props.chapter.pacing.satisfaction.status}
            value={`${props.chapter.pacing.satisfaction.density.toFixed(1)} / 千字`}
          />
          <PacingRow
            label="钩子评分"
            status={props.chapter.pacing.hook.status}
            value={`${props.chapter.pacing.hook.score}/10`}
          />
        </div>

        <div class="mt-6 flex justify-end">
          <button
            type="button"
            onClick={props.onClose}
            class="px-4 py-2 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded text-white text-sm transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

function PacingRow(props: { label: string; status: Status; value: string }) {
  return (
    <div class="flex items-center justify-between p-2 rounded bg-[var(--color-bg)] border border-[var(--color-border)]">
      <div class="flex items-center gap-2">
        <span class="text-lg">{props.status}</span>
        <span class="text-sm font-medium">{props.label}</span>
      </div>
      <span class="text-sm text-[var(--color-text-weak)]">{props.value}</span>
    </div>
  )
}

function StatCard(props: { label: string; value: string | number }) {
  return (
    <div class="bg-[var(--color-surface)] rounded-lg p-4 border border-[var(--color-border)]">
      <p class="text-[var(--color-text-weak)] text-sm">{props.label}</p>
      <p class="text-2xl font-bold mt-1">{props.value}</p>
    </div>
  )
}

function SkeletonStat() {
  return (
    <div class="bg-[var(--color-surface)] rounded-lg p-4 border border-[var(--color-border)]">
      <div class="h-3 w-12 bg-[var(--color-border)] rounded animate-pulse" />
      <div class="h-7 w-16 bg-[var(--color-border)] rounded animate-pulse mt-2" />
    </div>
  )
}

function SkeletonRow() {
  return (
    <div class="bg-[var(--color-surface)] rounded-lg p-4 border border-[var(--color-border)]">
      <div class="h-4 w-32 bg-[var(--color-border)] rounded animate-pulse mb-3" />
      <div class="flex gap-2">
        <div class="h-20 w-[120px] bg-[var(--color-border)] rounded animate-pulse" />
        <div class="h-20 w-[120px] bg-[var(--color-border)] rounded animate-pulse" />
        <div class="h-20 w-[120px] bg-[var(--color-border)] rounded animate-pulse" />
      </div>
    </div>
  )
}

function statusBorderClass(status: Status): string {
  switch (status) {
    case "🟢":
      return "border-[var(--color-success)]/50 bg-[var(--color-success)]/10"
    case "🟡":
      return "border-[var(--color-warning)]/50 bg-[var(--color-warning)]/10"
    case "🔴":
      return "border-[var(--color-danger)]/50 bg-[var(--color-danger)]/10"
    default:
      return "border-[var(--color-border)] bg-[var(--color-bg)]"
  }
}

function pointIcon(point: PacingPoint): string {
  switch (point) {
    case "climax":
      return "💥"
    case "satisfaction":
      return "✨"
    case "suffering":
      return "💔"
    case "hook":
      return "🎣"
  }
}
