import { createResource, For, Show, createSignal, type JSX } from "solid-js"
import { novelApi, type WorldInfo, type CharacterInfo, type ArcInfo } from "@/context/novel-api"

type Tab = "worlds" | "characters" | "arcs"

export default function World() {
  const [activeTab, setActiveTab] = createSignal<Tab>("worlds")

  const [worlds, { refetch: refetchWorlds }] = createResource(() => novelApi.worlds())
  const [characters, { refetch: refetchCharacters }] = createResource(() => novelApi.characters())
  const [arcs, { refetch: refetchArcs }] = createResource(() => novelApi.arcs())

  return (
    <div class="max-w-4xl mx-auto">
      <h1 class="text-2xl font-bold mb-6">世界观与角色</h1>

      <div class="flex gap-1 mb-6 bg-[var(--color-surface)] rounded-lg p-1 border border-[var(--color-border)]">
        <TabButton active={activeTab() === "worlds"} onClick={() => setActiveTab("worlds")}>世界观</TabButton>
        <TabButton active={activeTab() === "characters"} onClick={() => setActiveTab("characters")}>角色</TabButton>
        <TabButton active={activeTab() === "arcs"} onClick={() => setActiveTab("arcs")}>篇章</TabButton>
      </div>

      <Show when={activeTab() === "worlds"}>
        <ResourceSection
          data={worlds}
          refetch={refetchWorlds}
          emptyText="暂无世界观设定"
        >
          {(items) => (
            <For each={items as WorldInfo[]}>
              {(world) => (
                <div class="p-4 mb-3 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)]/50 transition-colors">
                  <div class="flex items-center justify-between mb-1">
                    <p class="font-medium">{world.name}</p>
                    <span class={`px-2 py-0.5 rounded text-xs ${
                      world.status === "completed" ? "bg-[var(--color-success)]/20 text-[var(--color-success)]" :
                      "bg-[var(--color-accent)]/20 text-[var(--color-accent)]"
                    }`}>
                      {world.status}
                    </span>
                  </div>
                  <p class="text-sm text-[var(--color-text-weak)]">{world.type}</p>
                </div>
              )}
            </For>
          )}
        </ResourceSection>
      </Show>

      <Show when={activeTab() === "characters"}>
        <ResourceSection
          data={characters}
          refetch={refetchCharacters}
          emptyText="暂无角色"
        >
          {(items) => (
            <For each={items as CharacterInfo[]}>
              {(char) => (
                <div class="p-4 mb-3 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)]/50 transition-colors">
                  <div class="flex items-center justify-between mb-1">
                    <p class="font-medium">{char.name}</p>
                    <span class="px-2 py-0.5 rounded text-xs bg-[var(--color-accent)]/20 text-[var(--color-accent)]">
                      {char.role_type}
                    </span>
                  </div>
                  <p class="text-sm text-[var(--color-text-weak)]">{char.world_name}</p>
                </div>
              )}
            </For>
          )}
        </ResourceSection>
      </Show>

      <Show when={activeTab() === "arcs"}>
        <ResourceSection
          data={arcs}
          refetch={refetchArcs}
          emptyText="暂无篇章"
        >
          {(items) => (
            <For each={items as ArcInfo[]}>
              {(arc) => (
                <div class="p-4 mb-3 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)]/50 transition-colors">
                  <div class="flex items-center justify-between mb-1">
                    <p class="font-medium">{arc.name}</p>
                    <span class={`px-2 py-0.5 rounded text-xs ${
                      arc.status === "completed" ? "bg-[var(--color-success)]/20 text-[var(--color-success)]" :
                      arc.status === "active" ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)]" :
                      "bg-[var(--color-warning)]/20 text-[var(--color-warning)]"
                    }`}>
                      {arc.status}
                    </span>
                  </div>
                  <p class="text-sm text-[var(--color-text-weak)]">{arc.arc_type} · {arc.theme}</p>
                </div>
              )}
            </For>
          )}
        </ResourceSection>
      </Show>
    </div>
  )
}

function TabButton(props: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      onClick={props.onClick}
      class={`flex-1 px-4 py-2 rounded text-sm font-medium transition-colors ${
        props.active
          ? "bg-[var(--color-accent)] text-white"
          : "text-[var(--color-text-weak)] hover:text-[var(--color-text)]"
      }`}
    >
      {props.children}
    </button>
  )
}

function ResourceSection(props: {
  data: { loading: boolean; error: unknown; (): { items: unknown[] } | undefined }
  refetch: () => void
  emptyText: string
  children: (items: unknown[]) => JSX.Element
}) {
  const resource = props.data

  return (
    <Show
      when={!resource.loading}
      fallback={
        <div class="space-y-3">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      }
    >
      <Show
        when={!resource.error}
        fallback={
          <div class="p-4 bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 rounded-lg">
            <p class="text-[var(--color-danger)] text-sm mb-2">加载失败：{(resource.error as Error)?.message ?? "未知错误"}</p>
            <button
              onClick={() => props.refetch()}
              class="px-3 py-1 bg-[var(--color-accent)] rounded text-white text-sm"
            >
              重试
            </button>
          </div>
        }
      >
        <Show
          when={resource() && resource()!.items.length > 0}
          fallback={<p class="text-[var(--color-text-weak)] text-center py-8">{props.emptyText}</p>}
        >
          {props.children(resource()!.items)}
        </Show>
      </Show>
    </Show>
  )
}

function SkeletonRow() {
  return (
    <div class="p-4 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)]">
      <div class="flex items-center justify-between mb-1">
        <div class="h-4 w-24 bg-[var(--color-border)] rounded animate-pulse" />
        <div class="h-4 w-16 bg-[var(--color-border)] rounded animate-pulse" />
      </div>
      <div class="h-3 w-32 bg-[var(--color-border)] rounded animate-pulse" />
    </div>
  )
}
