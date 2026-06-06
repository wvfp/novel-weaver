import { createResource, Show, For } from "solid-js"
import { novelApi } from "@/context/novel-api"

const PHASES = ["setting", "planning", "writing", "reviewing", "completed"]

export default function Home() {
  const [project, { refetch: refetchProject }] = createResource(() => novelApi.project())
  const [pipeline, { refetch: refetchPipeline }] = createResource(() => novelApi.pipeline())

  return (
    <div class="max-w-4xl mx-auto">
      <h1 class="text-2xl font-bold mb-6">项目概览</h1>

      <Show
        when={!project.loading}
        fallback={
          <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        }
      >
        <Show
          when={!project.error}
          fallback={
            <div class="mb-8 p-4 bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 rounded-lg">
              <p class="text-[var(--color-danger)] text-sm mb-2">加载项目信息失败：{project.error?.message}</p>
              <button
                onClick={() => refetchProject()}
                class="px-3 py-1 bg-[var(--color-accent)] rounded text-white text-sm"
              >
                重试
              </button>
            </div>
          }
        >
          <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <StatCard label="世界观" value={project()!.stats.worlds} />
            <StatCard label="角色" value={project()!.stats.characters} />
            <StatCard label="篇章" value={project()!.stats.arcs} />
            <StatCard label="章节" value={project()!.stats.chapters} />
            <StatCard label="总字数" value={project()!.stats.totalWords} />
          </div>
        </Show>
      </Show>

      <Show
        when={!pipeline.loading}
        fallback={
          <div class="bg-[var(--color-surface)] rounded-lg p-4 border border-[var(--color-border)]">
            <div class="h-5 w-32 bg-[var(--color-border)] rounded animate-pulse mb-3" />
            <div class="h-4 w-48 bg-[var(--color-border)] rounded animate-pulse" />
          </div>
        }
      >
        <Show
          when={!pipeline.error}
          fallback={
            <div class="p-4 bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 rounded-lg">
              <p class="text-[var(--color-danger)] text-sm mb-2">加载 Pipeline 状态失败：{pipeline.error?.message}</p>
              <button
                onClick={() => refetchPipeline()}
                class="px-3 py-1 bg-[var(--color-accent)] rounded text-white text-sm"
              >
                重试
              </button>
            </div>
          }
        >
          <PipelineProgress pipeline={pipeline()!} />
        </Show>
      </Show>

      <div class="mt-8 flex gap-4">
        <a href="/chat" class="px-6 py-3 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-lg text-white font-medium transition-colors">
          开始写作
        </a>
        <a href="/world" class="px-6 py-3 bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] rounded-lg border border-[var(--color-border)] transition-colors">
          世界观管理
        </a>
      </div>
    </div>
  )
}

function PipelineProgress(props: { pipeline: { current_phase: string; phases_completed: string[]; status: string } }) {
  const currentIdx = () => PHASES.indexOf(props.pipeline.current_phase)
  const completedCount = () => props.pipeline.phases_completed.length

  return (
    <div class="bg-[var(--color-surface)] rounded-lg p-4 border border-[var(--color-border)]">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-lg font-semibold">Pipeline 状态</h2>
        <span class={`px-2 py-0.5 rounded text-xs ${
          props.pipeline.status === "running" ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)]" :
          props.pipeline.status === "completed" ? "bg-[var(--color-success)]/20 text-[var(--color-success)]" :
          "bg-[var(--color-warning)]/20 text-[var(--color-warning)]"
        }`}>
          {props.pipeline.status}
        </span>
      </div>

      <div class="flex items-center gap-1 mb-2">
        <For each={PHASES}>
          {(phase, i) => (
            <Show
              when={i() < currentIdx() || props.pipeline.phases_completed.includes(phase)}
              fallback={
                <Show
                  when={i() === currentIdx()}
                  fallback={
                    <div class="flex-1 h-2 bg-[var(--color-border)] rounded" title={phase} />
                  }
                >
                  <div class="flex-1 h-2 bg-[var(--color-accent)]/50 rounded animate-pulse" title={phase} />
                </Show>
              }
            >
              <div class="flex-1 h-2 bg-[var(--color-accent)] rounded" title={phase} />
            </Show>
          )}
        </For>
      </div>

      <div class="flex justify-between text-xs text-[var(--color-text-weak)]">
        <span>设定</span>
        <span>规划</span>
        <span>写作</span>
        <span>审查</span>
        <span>完成</span>
      </div>

      <p class="text-sm text-[var(--color-text-weak)] mt-3">
        当前阶段：{props.pipeline.current_phase}（已完成 {completedCount()}/{PHASES.length}）
      </p>
    </div>
  )
}

function StatCard(props: { label: string; value: number }) {
  return (
    <div class="bg-[var(--color-surface)] rounded-lg p-4 border border-[var(--color-border)]">
      <p class="text-[var(--color-text-weak)] text-sm">{props.label}</p>
      <p class="text-2xl font-bold mt-1">{props.value.toLocaleString()}</p>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div class="bg-[var(--color-surface)] rounded-lg p-4 border border-[var(--color-border)]">
      <div class="h-3 w-12 bg-[var(--color-border)] rounded animate-pulse" />
      <div class="h-7 w-16 bg-[var(--color-border)] rounded animate-pulse mt-2" />
    </div>
  )
}
