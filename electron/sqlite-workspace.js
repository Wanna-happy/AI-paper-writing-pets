const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA_VERSION = 3;

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

class SqliteWorkspaceRepository {
  constructor(databasePath) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.databasePath = databasePath;
    this.database = new DatabaseSync(databasePath);
    this.database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        sort_order INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS documents_project_order ON documents(project_id, sort_order);
      CREATE TABLE IF NOT EXISTS drafts (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        sort_order INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS drafts_project_order ON drafts(project_id, sort_order);
      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS agent_runs_project_started ON agent_runs(project_id, started_at DESC);
      CREATE TABLE IF NOT EXISTS tool_runs (
        id TEXT PRIMARY KEY,
        agent_run_id TEXT,
        cache_key TEXT,
        tool_name TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS tool_runs_cache_key ON tool_runs(cache_key);
      CREATE TRIGGER IF NOT EXISTS delete_project_runs BEFORE DELETE ON projects BEGIN
        DELETE FROM tool_runs WHERE agent_run_id IN (SELECT id FROM agent_runs WHERE project_id=OLD.id);
        DELETE FROM agent_runs WHERE project_id=OLD.id;
      END;
      CREATE TABLE IF NOT EXISTS conversation_turns (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        conversation_id TEXT NOT NULL,
        id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY(project_id, conversation_id, id)
      );
      CREATE TABLE IF NOT EXISTS conversation_memories (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        conversation_id TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY(project_id, conversation_id)
      );
    `);
    this.setMetadata('schema_version', String(SCHEMA_VERSION));
  }

  getMetadata(key) {
    return this.database.prepare('SELECT value FROM metadata WHERE key = ?').get(key)?.value ?? null;
  }

  setMetadata(key, value) {
    this.database.prepare(`
      INSERT INTO metadata(key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, String(value));
  }

  isEmpty() {
    return this.database.prepare('SELECT COUNT(*) AS count FROM projects').get().count === 0;
  }

  loadWorkspace() {
    const projects = this.database.prepare('SELECT id, data FROM projects ORDER BY sort_order, rowid').all()
      .map((row) => ({ ...JSON.parse(row.data), id: row.id, documents: [], drafts: [], messages: [] }));
    const projectsById = new Map(projects.map((project) => [project.id, project]));
    for (const row of this.database.prepare('SELECT id, project_id, data FROM documents ORDER BY project_id, sort_order, rowid').all()) {
      const project = projectsById.get(row.project_id);
      if (project) project.documents.push({ ...JSON.parse(row.data), id: row.id });
    }
    for (const row of this.database.prepare('SELECT id, project_id, data FROM drafts ORDER BY project_id, sort_order, rowid').all()) {
      const project = projectsById.get(row.project_id);
      if (project) project.drafts.push({ ...JSON.parse(row.data), id: row.id });
    }
    const activeProjectId = this.getMetadata('active_project_id');
    for (const row of this.database.prepare("SELECT project_id,conversation_id,data FROM conversation_turns WHERE json_extract(data,'$.channel')='chat' ORDER BY created_at,rowid").all()) {
      projectsById.get(row.project_id)?.messages.push({ ...JSON.parse(row.data), conversationId: row.conversation_id });
    }
    return {
      revision: Number(this.getMetadata('workspace_revision') || 0),
      activeProjectId: projectsById.has(activeProjectId) ? activeProjectId : (projects[0]?.id ?? null),
      projects,
    };
  }

  saveWorkspace(state) {
    const projects = Array.isArray(state?.projects) ? state.projects : [];
    const projectStatement = this.database.prepare(`
      INSERT INTO projects(id, sort_order, data) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET sort_order = excluded.sort_order, data = excluded.data
    `);
    const documentStatement = this.database.prepare(`
      INSERT INTO documents(id, project_id, sort_order, data) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, sort_order = excluded.sort_order, data = excluded.data
    `);
    const draftStatement = this.database.prepare(`
      INSERT INTO drafts(id, project_id, sort_order, data) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, sort_order = excluded.sort_order, data = excluded.data
    `);
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const revision = Number(this.getMetadata('workspace_revision') || 0);
      if (state.revision != null && state.revision !== revision) throw new Error('工作区已由另一个操作更新，请重新加载后重试；未覆盖已有数据。');
      const projectIds = [];
      const documentIds = [];
      const draftIds = [];
      projects.forEach((project, projectIndex) => {
        projectIds.push(project.id);
        const { documents = [], drafts = [], messages: _messages, ...projectData } = project;
        projectStatement.run(project.id, projectIndex, JSON.stringify(projectData));
        documents.forEach((document, documentIndex) => {
          documentIds.push(document.id);
          const { text: _cachedText, ...documentData } = document;
          documentStatement.run(document.id, project.id, documentIndex, JSON.stringify(documentData));
        });
        drafts.forEach((draft, draftIndex) => {
          draftIds.push(draft.id);
          draftStatement.run(draft.id, project.id, draftIndex, JSON.stringify(draft));
        });
      });
      this.deleteMissing('drafts', draftIds);
      this.deleteMissing('documents', documentIds);
      this.deleteMissing('projects', projectIds);
      this.setMetadata('active_project_id', state?.activeProjectId || '');
      this.setMetadata('workspace_revision', String(revision + 1));
      this.database.exec('COMMIT');
      state.revision = revision + 1;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
    return state;
  }

  deleteMissing(table, ids) {
    if (!ids.length) {
      this.database.exec(`DELETE FROM ${table}`);
      return;
    }
    const placeholders = ids.map(() => '?').join(',');
    this.database.prepare(`DELETE FROM ${table} WHERE id NOT IN (${placeholders})`).run(...ids);
  }

  saveAgentRun(run) {
    this.database.prepare(`
      INSERT INTO agent_runs(id, project_id, status, started_at, completed_at, data)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET status = excluded.status, completed_at = excluded.completed_at, data = excluded.data
    `).run(run.id, run.projectId || null, run.status, run.startedAt, run.completedAt || null, JSON.stringify(run));
    return run;
  }

  saveConversationTurn(projectId, conversationId, turn) {
    this.database.prepare(`INSERT INTO conversation_turns(project_id,conversation_id,id,created_at,data) VALUES(?,?,?,?,?)
      ON CONFLICT(project_id,conversation_id,id) DO UPDATE SET data=excluded.data`).run(projectId, conversationId, turn.id, turn.createdAt, JSON.stringify(turn));
  }

  listConversationTurns(projectId, conversationId) {
    return this.database.prepare('SELECT data FROM conversation_turns WHERE project_id=? AND conversation_id=? ORDER BY created_at,rowid').all(projectId, conversationId).map(row => parseJson(row.data));
  }

  getConversationMemory(projectId, conversationId) {
    return parseJson(this.database.prepare('SELECT data FROM conversation_memories WHERE project_id=? AND conversation_id=?').get(projectId, conversationId)?.data, null);
  }

  saveConversationMemory(projectId, conversationId, memory) {
    this.database.prepare(`INSERT INTO conversation_memories(project_id,conversation_id,data) VALUES(?,?,?)
      ON CONFLICT(project_id,conversation_id) DO UPDATE SET data=excluded.data`).run(projectId, conversationId, JSON.stringify(memory));
  }

  deleteConversationMemory(projectId, conversationId) {
    this.database.prepare("DELETE FROM tool_runs WHERE agent_run_id IN (SELECT id FROM agent_runs WHERE project_id=? AND (json_extract(data,'$.conversationId')=? OR json_extract(data,'$.checkpoint.conversationId')=?))").run(projectId, conversationId, conversationId);
    this.database.prepare("DELETE FROM agent_runs WHERE project_id=? AND (json_extract(data,'$.conversationId')=? OR json_extract(data,'$.checkpoint.conversationId')=?)").run(projectId, conversationId, conversationId);
    this.database.prepare('DELETE FROM conversation_turns WHERE project_id=? AND conversation_id=?').run(projectId, conversationId);
    this.database.prepare('DELETE FROM conversation_memories WHERE project_id=? AND conversation_id=?').run(projectId, conversationId);
  }

  listAgentRuns(projectId, limit = 100) {
    const rows = projectId
      ? this.database.prepare('SELECT data FROM agent_runs WHERE project_id = ? ORDER BY started_at DESC LIMIT ?').all(projectId, limit)
      : this.database.prepare('SELECT data FROM agent_runs ORDER BY started_at DESC LIMIT ?').all(limit);
    return rows.map((row) => parseJson(row.data));
  }

  saveToolRun(run) {
    this.database.prepare(`
      INSERT INTO tool_runs(id, agent_run_id, cache_key, tool_name, status, created_at, data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET status = excluded.status, data = excluded.data
    `).run(run.id, run.agentRunId || null, run.cacheKey || null, run.toolName, run.status, run.createdAt, JSON.stringify(run));
    return run;
  }

  close() {
    this.database.close();
  }
}

module.exports = { SCHEMA_VERSION, SqliteWorkspaceRepository };
