import { useParams } from "@solidjs/router"
import { createSignal, createResource, Show, For } from "solid-js"
import { novelApi } from "@/context/novel-api"

export default function Editor() {
  const params = useParams()
  const [chapter, { refetch }] = createResource(() => params.id, (id) => novelApi.chapter(id))
  const [preview, setPreview] = createSignal(true)

  return (
    <div class="max-w-5xl mx-auto">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-bold">
          <Show
            when={!chapter.loading}
            fallback={<span class="text-[var(--color-text-weak)]">加载中...</span>}
          >
            <Show
              when={!chapter.error}
              fallback={<span class="text-[var(--color-danger)]">加载失败</span>}
            >
              {chapter()!.title}
            </Show>
          </Show>
        </h1>
        <Show when={chapter()}>
          <button
            type="button"
            onClick={() => setPreview((p) => !p)}
            class="px-4 py-1.5 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            {preview() ? "源码" : "预览"}
          </button>
        </Show>
      </div>

      <Show
        when={!chapter.loading}
        fallback={
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div class="lg:col-span-2 bg-[var(--color-surface)] rounded-lg p-6 border border-[var(--color-border)]">
              <div class="space-y-3">
                <div class="h-5 w-3/4 bg-[var(--color-border)] rounded animate-pulse" />
                <div class="h-4 w-full bg-[var(--color-border)] rounded animate-pulse" />
                <div class="h-4 w-5/6 bg-[var(--color-border)] rounded animate-pulse" />
                <div class="h-4 w-full bg-[var(--color-border)] rounded animate-pulse" />
                <div class="h-4 w-2/3 bg-[var(--color-border)] rounded animate-pulse" />
              </div>
            </div>
            <div class="bg-[var(--color-surface)] rounded-lg p-4 border border-[var(--color-border)]">
              <div class="space-y-3">
                <div class="h-4 w-20 bg-[var(--color-border)] rounded animate-pulse" />
                <div class="h-4 w-32 bg-[var(--color-border)] rounded animate-pulse" />
                <div class="h-4 w-28 bg-[var(--color-border)] rounded animate-pulse" />
              </div>
            </div>
          </div>
        }
      >
        <Show
          when={!chapter.error}
          fallback={
            <div class="p-4 bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 rounded-lg">
              <p class="text-[var(--color-danger)] text-sm mb-2">加载章节失败：{chapter.error?.message}</p>
              <button
                type="button"
                onClick={() => refetch()}
                class="px-3 py-1 bg-[var(--color-accent)] rounded text-white text-sm"
              >
                重试
              </button>
            </div>
          }
        >
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div class="lg:col-span-2">
              <Show
                when={preview()}
                fallback={
                  <textarea
                    aria-label="章节内容源码"
                    class="w-full h-[60vh] p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] font-mono text-sm resize-none focus:outline-none focus:border-[var(--color-accent)]"
                    value={chapter()!.content}
                    readOnly
                  />
                }
              >
                <div class="bg-[var(--color-surface)] rounded-lg p-6 border border-[var(--color-border)]">
                  <MarkdownContent content={chapter()!.content} />
                </div>
              </Show>
            </div>
            <div class="bg-[var(--color-surface)] rounded-lg p-4 border border-[var(--color-border)]">
              <h3 class="text-sm font-semibold mb-3 text-[var(--color-text-weak)]">章节信息</h3>
              <dl class="space-y-2 text-sm">
                <div class="flex justify-between">
                  <dt class="text-[var(--color-text-weak)]">卷号</dt>
                  <dd>第 {chapter()!.volume_num} 卷</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-[var(--color-text-weak)]">章节</dt>
                  <dd>第 {chapter()!.chapter_num} 章</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-[var(--color-text-weak)]">字数</dt>
                  <dd>{chapter()!.word_count.toLocaleString()}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-[var(--color-text-weak)]">状态</dt>
                  <dd>
                    <span class={`px-2 py-0.5 rounded text-xs ${
                      chapter()!.status === "completed" ? "bg-[var(--color-success)]/20 text-[var(--color-success)]" :
                      chapter()!.status === "draft" ? "bg-[var(--color-warning)]/20 text-[var(--color-warning)]" :
                      "bg-[var(--color-accent)]/20 text-[var(--color-accent)]"
                    }`}>
                      {chapter()!.status}
                    </span>
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </Show>
      </Show>
    </div>
  )
}

function MarkdownContent(props: { content: string }) {
  const lines = () => props.content.split("\n")

  return (
    <div class="prose-invert max-w-none text-sm leading-relaxed">
      <For each={lines()}>
        {(line) => {
          const trimmed = line.trim()
          if (trimmed.startsWith("# ")) return <h1 class="text-xl font-bold mt-6 mb-3">{trimmed.slice(2)}</h1>
          if (trimmed.startsWith("## ")) return <h2 class="text-lg font-semibold mt-5 mb-2">{trimmed.slice(3)}</h2>
          if (trimmed.startsWith("### ")) return <h3 class="text-base font-semibold mt-4 mb-2">{trimmed.slice(4)}</h3>
          if (trimmed.startsWith("---")) return <hr class="border-[var(--color-border)] my-4" />
          if (trimmed === "") return <div class="h-3" />
          return <p class="mb-2">{renderInline(trimmed)}</p>
        }}
      </For>
    </div>
  )
}

function renderInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[\[(.+?)\]\]/g, "$1")
}
