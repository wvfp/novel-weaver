import { createSignal, Show, For, onMount } from "solid-js"
import { opencodeClient, type Session, type StreamEvent } from "@/lib/opencode-client"

interface ChatMessage {
  role: "user" | "assistant"
  content: string
  toolCalls: Array<{ name: string; output: string; expanded: boolean }>
  streaming: boolean
}

export default function Chat() {
  const [input, setInput] = createSignal("")
  const [messages, setMessages] = createSignal<ChatMessage[]>([])
  const [loading, setLoading] = createSignal(false)
  const [session, setSession] = createSignal<Session | null>(null)
  const [error, setError] = createSignal<string | null>(null)
  const [initializing, setInitializing] = createSignal(true)
  let messagesEnd: HTMLDivElement | undefined

  onMount(async () => {
    try {
      const sessions = await opencodeClient.listSessions()
      const novelSession = sessions.find((s) => s.title?.includes("novel"))
      if (novelSession) {
        setSession(novelSession)
      } else {
        const created = await opencodeClient.createSession("novel-writing")
        setSession(created)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法连接到写作会话")
    } finally {
      setInitializing(false)
    }
  })

  function scrollToBottom() {
    setTimeout(() => messagesEnd?.scrollIntoView({ behavior: "smooth" }), 50)
  }

  async function sendMessage() {
    const text = input().trim()
    if (!text || loading()) return
    const sid = session()?.id
    if (!sid) {
      setError("会话未就绪，请稍候")
      return
    }

    setError(null)
    setMessages((prev) => [...prev, { role: "user", content: text, toolCalls: [], streaming: false }])
    setInput("")
    setLoading(true)
    scrollToBottom()

    const assistantMsg: ChatMessage = { role: "assistant", content: "", toolCalls: [], streaming: true }
    setMessages((prev) => [...prev, assistantMsg])
    scrollToBottom()

    try {
      await opencodeClient.sendMessage(sid, text)

      for await (const event of opencodeClient.streamEvents(sid)) {
        handleStreamEvent(event)
      }

      setMessages((prev) => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last?.role === "assistant") {
          updated[updated.length - 1] = { ...last, streaming: false }
        }
        return updated
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "发送消息失败")
      setMessages((prev) => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last?.role === "assistant") {
          updated[updated.length - 1] = { ...last, streaming: false, content: last.content || "消息发送失败，请重试" }
        }
        return updated
      })
    } finally {
      setLoading(false)
    }
  }

  function handleStreamEvent(event: StreamEvent) {
    if (event.type === "message.delta" || event.type === "content_block_delta") {
      const delta = event.data as { text?: string; content?: string } | null
      const text = delta?.text ?? delta?.content ?? ""
      if (text) {
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last?.role === "assistant") {
            updated[updated.length - 1] = { ...last, content: last.content + text }
          }
          return updated
        })
        scrollToBottom()
      }
    }

    if (event.type === "tool_use" || event.type === "tool.call") {
      const tool = event.data as { name?: string; output?: string } | null
      if (tool?.name) {
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last?.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              toolCalls: [...last.toolCalls, { name: tool.name!, output: tool.output ?? "", expanded: false }],
            }
          }
          return updated
        })
      }
    }

    if (event.type === "tool_result" || event.type === "tool.output") {
      const result = event.data as { name?: string; output?: string } | null
      if (result?.name) {
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last?.role === "assistant") {
            const calls = last.toolCalls.map((tc) =>
              tc.name === result.name ? { ...tc, output: result.output ?? tc.output } : tc,
            )
            updated[updated.length - 1] = { ...last, toolCalls: calls }
          }
          return updated
        })
      }
    }
  }

  function toggleToolCall(msgIndex: number, toolIndex: number) {
    setMessages((prev) => {
      const updated = [...prev]
      const msg = updated[msgIndex]
      if (msg?.role === "assistant") {
        const calls = msg.toolCalls.map((tc, i) =>
          i === toolIndex ? { ...tc, expanded: !tc.expanded } : tc,
        )
        updated[msgIndex] = { ...msg, toolCalls: calls }
      }
      return updated
    })
  }

  return (
    <div class="max-w-3xl mx-auto flex flex-col h-[calc(100dvh-80px)]">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-bold">对话式写作</h1>
        <Show when={session()}>
          <span class="text-xs text-[var(--color-text-weak)]">会话 {session()!.id.slice(0, 8)}</span>
        </Show>
      </div>

      <Show when={initializing()}>
        <div class="flex-1 flex items-center justify-center">
          <p class="text-[var(--color-text-weak)] animate-pulse">正在连接写作会话...</p>
        </div>
      </Show>

      <Show when={!initializing() && error() && !session()}>
        <div class="flex-1 flex flex-col items-center justify-center gap-3">
          <p class="text-[var(--color-danger)]">{error()}</p>
          <button
            onClick={() => window.location.reload()}
            class="px-4 py-2 bg-[var(--color-accent)] rounded-lg text-white text-sm"
          >
            重试
          </button>
        </div>
      </Show>

      <Show when={!initializing() && session()}>
        <div class="flex-1 overflow-y-auto space-y-4 mb-4 pr-1">
          <Show when={messages().length === 0}>
            <div class="flex items-center justify-center h-full">
              <p class="text-[var(--color-text-weak)]">输入写作指令开始对话，例如「续写下一章」或「创建新角色」</p>
            </div>
          </Show>

          <For each={messages()}>
            {(msg, index) => (
              <div class={msg.role === "user" ? "ml-12" : "mr-12"}>
                <div
                  class={`p-3 rounded-lg ${msg.role === "user" ? "bg-[var(--color-accent)]/20" : "bg-[var(--color-surface)] border border-[var(--color-border)]"}`}
                >
                  <p class="text-sm whitespace-pre-wrap">
                    {msg.content}
                    <Show when={msg.streaming}>
                      <span class="inline-block w-1.5 h-4 bg-[var(--color-accent)] animate-pulse ml-0.5 align-text-bottom" />
                    </Show>
                  </p>
                </div>
                <Show when={msg.toolCalls.length > 0}>
                  <div class="mt-2 space-y-1">
                    <For each={msg.toolCalls}>
                      {(tc, ti) => (
                        <div class="bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-xs">
                          <button
                            onClick={() => toggleToolCall(index(), ti())}
                            class="w-full flex items-center justify-between px-3 py-1.5 text-[var(--color-text-weak)] hover:text-[var(--color-text)]"
                          >
                            <span class="font-mono">{tc.name}</span>
                            <span>{tc.expanded ? "收起" : "展开"}</span>
                          </button>
                          <Show when={tc.expanded}>
                            <div class="px-3 py-2 border-t border-[var(--color-border)] max-h-40 overflow-y-auto">
                              <pre class="whitespace-pre-wrap text-[var(--color-text-weak)]">
                                {tc.output.length > 500 ? tc.output.slice(0, 500) + "..." : tc.output}
                              </pre>
                            </div>
                          </Show>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            )}
          </For>

          <Show when={loading() && messages().length > 0 && !messages()[messages().length - 1]?.content}>
            <div class="mr-12">
              <div class="p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]">
                <p class="text-sm text-[var(--color-text-weak)] animate-pulse">正在思考...</p>
              </div>
            </div>
          </Show>

          <div ref={messagesEnd} />
        </div>

        <Show when={error() && session()}>
          <div class="mb-2 px-3 py-2 bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 rounded text-sm text-[var(--color-danger)]">
            {error()}
          </div>
        </Show>

        <div class="flex gap-2">
          <input
            type="text"
            value={input()}
            onInput={(e) => setInput(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder="输入写作指令..."
            disabled={loading()}
            class="flex-1 px-4 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={loading() || !input().trim()}
            class="px-6 py-2 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] rounded-lg text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            发送
          </button>
        </div>
      </Show>
    </div>
  )
}
