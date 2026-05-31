import type { DatabaseInterface } from '../DatabaseInterface.js';
import type { AgentConversationEvent, AgentEventKind, AgentEventStatus } from '../../types/index.js';

export interface AgentEventRow {
  id: string;
  agent_id: string;
  kind: AgentEventKind;
  title: string | null;
  content: string;
  status: AgentEventStatus | null;
  metadata: string | null;
  created_at: number;
}

export class AgentEventRepository {
  constructor(private db: DatabaseInterface) {}

  async insert(event: AgentConversationEvent): Promise<void> {
    await this.db.execute(
      `INSERT INTO agent_events (id, agent_id, kind, title, content, status, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.id,
        event.agentId,
        event.kind,
        event.title ?? null,
        event.content,
        event.status ?? null,
        event.metadata ? JSON.stringify(event.metadata) : null,
        event.createdAt,
      ],
    );
  }

  async findByAgent(agentId: string, limit: number = 500): Promise<AgentConversationEvent[]> {
    const rows = await this.db.query<AgentEventRow>(
      `SELECT id, agent_id, kind, title, content, status, metadata, created_at
       FROM agent_events
       WHERE agent_id = ?
       ORDER BY created_at ASC
       LIMIT ?`,
      [agentId, limit],
    );
    return rows.map((row) => this.toEvent(row));
  }

  private toEvent(row: AgentEventRow): AgentConversationEvent {
    return {
      id: row.id,
      agentId: row.agent_id,
      kind: row.kind,
      title: row.title ?? undefined,
      content: row.content,
      status: row.status ?? undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) as Record<string, unknown> : undefined,
      createdAt: row.created_at,
    };
  }
}
