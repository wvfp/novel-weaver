import { createResource, For, Show, createSignal } from "solid-js"
import { novelApi, type ChapterInfo } from "@/context/novel-api"

export default function Review() {
  const [chapters, { refetch }] = createResource(() => novelApi.chapters())
  const [expandedId, setExpandedId] = createSignal<string | null>(null)

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  return (
    <div class="max-w-4xl mx-auto">
      <h1 class="text-2xl font-bold mb-6">审查与一致性</h1>

      <Show
        when={!chapters.loading}
        fallback={
          <div class="space-y-2">
            <SkeletonChapter />
            <SkeletonChapter />
            <SkeletonChapter />
          </div>
        }
      >
        <Show
          when={!chapters.error}
          fallback={
            <div class="p-4 bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 rounded-lg">
              <p class="text-[var(--color-danger)] text-sm mb-2">加载章节列表失败：{chapters.error?.message}</p>
              <button
                onClick={() => refetch()}
                class="px-3 py-1 bg-[var(--color-accent)] rounded text-white text-sm"
              >
                重试
              </button>
            </div>
          }
        >
          <Show
            when={chapters() && chapters()!.items.length > 0}
            fallback={<p class="text-[var(--color-text-weak)] text-center py-8">暂无章节</p>}
          >
            <div class="space-y-2">
              <For each={chapters()!.items}>
                {(chapter) => (
                  <ChapterCard
                    chapter={chapter}
                    expanded={expandedId() === chapter.id}
                    onToggle={() => toggleExpand(chapter.id)}
                  />
                )}
              </For>
            </div>
          </Show>
        </Show>
      </Show>
    </div>
  )
}

function ChapterCard(props: {
  chapter: ChapterInfo
  expanded: boolean
  onToggle: () => void
}) {
  const [review] = createResource(() => (props.expanded ? novelApi.reviews(props.chapter.id) : undefined))

  return (
    <div class="bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] overflow-hidden">
      <button
        onClick={props.onToggle}
        class="w-full flex items-center justify-between p-3 hover:bg-[var(--color-surface-hover)] transition-colors"
      >
        <div class="flex items-center gap-3">
          <span class="text-sm font-medium">第{props.chapter.chapter_num}章 · {props.chapter.title}</span>
          <span class="text-sm text-[var(--color-text-weak)]">{props.chapter.word_count} 字</span>
        </div>
        <div class="flex items-center gap-2">
          <StatusBadge status={props.chapter.status} />
          <span class="text-[var(--color-text-weak)] text-xs">{props.expanded ? "收起" : "展开"}</span>
        </div>
      </button>

      <Show when={props.expanded}>
        <div class="border-t border-[var(--color-border)] p-4">
          <Show
            when={!review.loading}
            fallback={<p class="text-sm text-[var(--color-text-weak)] animate-pulse">加载审查信息...</p>}
          >
            <Show
              when={!review.error}
              fallback={<p class="text-sm text-[var(--color-danger)]">加载审查信息失败</p>}
            >
              <Show
                when={review() && review()!.length > 0}
                fallback={
                  <p class="text-sm text-[var(--color-text-weak)]">暂无审查记录</p>
                }
              >
                <div class="space-y-3">
                  <For each={review()}>
                    {(r) => (
                      <div class="bg-[var(--color-bg)] rounded p-3 border border-[var(--color-border)]">
                        <div class="flex items-center justify-between mb-2">
                          <span class="text-sm font-medium">{(r as { reviewer?: string }).reviewer ?? "审查员"}</span>
                          <VerdictBadge verdict={(r as { verdict?: string }).verdict ?? ""} />
                        </div>
                        <Show when={(r as { issues?: unknown[] }).issues && (r as { issues: unknown[] }).issues.length > 0}>
                          <div class="space-y-1">
                            <For each={(r as { issues: unknown[] }).issues}>
                              {(issue) => (
                                <p class="text-xs text-[var(--color-text-weak)]">
                                  {typeof issue === "string" ? issue : JSON.stringify(issue)}
                                </p>
                              )}
                            </For>
                          </div>
                        </Show>
                        <p class="text-xs text-[var(--color-text-weak)] mt-2">
                          {(r as { reviewed_at?: string }).reviewed_at ?? ""}
                        </p>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </Show>

          <div class="mt-3 flex gap-2">
            <a
              href={`/editor/${props.chapter.id}`}
              class="px-3 py-1.5 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded text-white text-xs transition-colors"
            >
              查看章节
            </a>
          </div>
        </div>
      </Show>
    </div>
  )
}

function StatusBadge(props: { status: string }) {
  const colorClass = () => {
    if (props.status === "completed") return "bg-[var(--color-success)]/20 text-[var(--color-success)]"
    if (props.status === "draft") return "bg-[var(--color-warning)]/20 text-[var(--color-warning)]"
    if (props.status === "reviewing") return "bg-[var(--color-accent)]/20 text-[var(--color-accent)]"
    return "bg-[var(--color-text-weak)]/20 text-[var(--color-text-weak)]"
  }
  return <span class={`px-2 py-0.5 rounded text-xs ${colorClass()}`}>{props.status}</span>
}

function VerdictBadge(props: { verdict: string }) {
  const colorClass = () => {
    if (props.verdict === "pass") return "bg-[var(--color-success)]/20 text-[var(--color-success)]"
    if (props.verdict === "fail") return "bg-[var(--color-danger)]/20 text-[var(--color-danger)]"
    return "bg-[var(--color-warning)]/20 text-[var(--color-warning)]"
  }
  return <span class={`px-2 py-0.5 rounded text-xs ${colorClass()}`}>{props.verdict}</span>
}

function SkeletonChapter() {
  return (
    <div class="p-3 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)]">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="h-4 w-32 bg-[var(--color-border)] rounded animate-pulse" />
          <div class="h-3 w-16 bg-[var(--color-border)] rounded animate-pulse" />
        </div>
        <div class="h-4 w-14 bg-[var(--color-border)] rounded animate-pulse" />
      </div>
    </div>
  )
}
