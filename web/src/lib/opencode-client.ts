const API_BASE = "/v2"

export interface Session {
  id: string
  title: string
  created_at: string
}

export interface Part {
  type: "text" | "tool"
  text?: string
  tool?: { name: string; state: { status: string }; output?: string }
}

export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  parts?: Part[]
}

export interface StreamEvent {
  type: string
  data: unknown
}

class OpenCodeClient {
  private async fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...options?.headers },
      ...options,
    })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json()
  }

  async listSessions(): Promise<Session[]> {
    const data = await this.fetchApi<{ sessions: Session[] }>("/sessions")
    return data.sessions ?? []
  }

  async createSession(title?: string): Promise<Session> {
    return this.fetchApi("/sessions", {
      method: "POST",
      body: JSON.stringify(title ? { title } : {}),
    })
  }

  async sendMessage(sessionId: string, content: string): Promise<Response> {
    return fetch(`${API_BASE}/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    })
  }

  async *streamEvents(sessionId: string): AsyncGenerator<StreamEvent> {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/events`, {
      headers: { Accept: "text/event-stream" },
    })
    if (!res.body) return
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            yield JSON.parse(line.slice(6))
          } catch {
            /* skip malformed */
          }
        }
      }
    }
  }
}

export const opencodeClient = new OpenCodeClient()
