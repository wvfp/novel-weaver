import { createSignal, onMount, For, Show } from "solid-js"

interface TaskModelInfo {
  model: string
  source: "default" | "config" | "session"
}

interface ConfigData {
  taskModel: Record<string, TaskModelInfo>
  temperature: Record<string, number>
}

const TASK_LABELS: Record<string, string> = {
  write: "写章",
  review: "审查",
  query: "查询",
  summary: "摘要",
  consistency: "一致性",
  agent: "Agent",
  extract: "提取",
  planning: "规划",
}

const MODEL_OPTIONS = [
  { value: "anthropic/claude-opus-4", label: "Claude Opus 4 (高质)" },
  { value: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4 (均衡)" },
  { value: "anthropic/claude-haiku-4", label: "Claude Haiku 4 (快速)" },
  { value: "openai/gpt-4o", label: "GPT-4o" },
  { value: "openai/gpt-4o-mini", label: "GPT-4o mini" },
  { value: "google/gemini-2.0-flash", label: "Gemini 2.0 Flash" },
]

const SOURCE_LABELS: Record<string, string> = {
  default: "默认",
  config: "配置文件",
  session: "临时覆盖",
}

export default function SettingsPage() {
  const [config, setConfig] = createSignal<ConfigData | null>(null)
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)
  const [saving, setSaving] = createSignal<string | null>(null)

  async function loadConfig() {
    try {
      setLoading(true)
      const res = await fetch("/api/config")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setConfig(await res.json())
      setError(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function setModel(task: string, model: string) {
    try {
      setSaving(task)
      const res = await fetch("/api/config/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, model }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await loadConfig()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(null)
    }
  }

  async function resetTask(task: string) {
    try {
      setSaving(task)
      const res = await fetch(`/api/config/model/${task}`, { method: "DELETE" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await loadConfig()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(null)
    }
  }

  async function resetAll() {
    if (!confirm("确定要重置所有任务的模型为默认吗？")) return
    try {
      const res = await fetch("/api/config/model/all", { method: "DELETE" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await loadConfig()
    } catch (e) {
      setError(String(e))
    }
  }

  onMount(loadConfig)

  return (
    <div class="max-w-4xl mx-auto">
      <header class="mb-6">
        <h1 class="text-2xl font-bold">设置</h1>
        <p class="text-[var(--color-text-weak)] mt-1 text-sm">
          任务模型配置 · 临时覆盖立即生效，重启后回到配置文件
        </p>
      </header>

      <Show when={loading()}>
        <p class="text-[var(--color-text-weak)]">加载中...</p>
      </Show>

      <Show when={error()}>
        <div class="mb-4 p-3 bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 rounded-lg">
          <p class="text-[var(--color-danger)] text-sm">错误: {error()}</p>
        </div>
      </Show>

      <Show when={config() && !loading()}>
        <div class="space-y-3">
          <For each={Object.entries(config()!.taskModel)}>
            {([task, info]) => (
              <TaskRow
                task={task}
                info={info}
                saving={saving() === task}
                onChange={(model) => setModel(task, model)}
                onReset={() => resetTask(task)}
              />
            )}
          </For>
        </div>

        <div class="mt-6 flex gap-3">
          <button
            type="button"
            onClick={resetAll}
            class="px-4 py-2 bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded text-sm transition-colors"
          >
            重置全部
          </button>
        </div>
      </Show>
    </div>
  )
}

function TaskRow(props: {
  task: string
  info: TaskModelInfo
  saving: boolean
  onChange: (model: string) => void
  onReset: () => void
}) {
  return (
    <div class="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex items-center gap-4">
      <div class="w-24 flex-shrink-0">
        <div class="font-semibold">{TASK_LABELS[props.task] ?? props.task}</div>
        <div class="text-xs text-[var(--color-text-weak)]">
          来源: {SOURCE_LABELS[props.info.source] ?? props.info.source}
        </div>
      </div>

      <select
        aria-label={`${TASK_LABELS[props.task] ?? props.task} 任务模型选择`}
        value={props.info.model}
        onChange={(e) => props.onChange(e.currentTarget.value)}
        disabled={props.saving}
        class="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-3 py-2 text-sm disabled:opacity-50 focus:outline-none focus:border-[var(--color-accent)]"
      >
        <For each={MODEL_OPTIONS}>
          {(opt) => <option value={opt.value}>{opt.label}</option>}
        </For>
      </select>

      <Show when={props.saving}>
        <span class="text-[var(--color-text-weak)] text-sm">保存中...</span>
      </Show>

      <button
        type="button"
        onClick={props.onReset}
        disabled={props.saving || props.info.source === "default"}
        class="px-3 py-1 text-sm bg-[var(--color-bg)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded disabled:opacity-30 transition-colors"
      >
        重置
      </button>
    </div>
  )
}
