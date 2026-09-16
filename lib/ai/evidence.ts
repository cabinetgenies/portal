import type { SourceReference } from "@/lib/ai/schema";

/**
 * The per-run evidence registry.
 *
 * Only the server can mint a trusted source id. Tools register an authorized
 * record here and hand the model a small, safe reference (id, title, type,
 * sensitivity). After the model returns, the controller re-resolves every id
 * against this registry and discards anything the model invented.
 */

export type EvidenceInput = {
  recordType: string;
  recordId: string;
  title: string;
  version?: string | null;
  sensitivity: "public" | "internal" | "financial" | "personal" | "confidential";
};

export type EvidenceRecord = EvidenceInput & {
  id: string;
  retrievedAt: string;
};

function safeSlug(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

export class EvidenceRegistry {
  private readonly records = new Map<string, EvidenceRecord>();

  register(input: EvidenceInput): EvidenceRecord {
    const retrievedAt = new Date().toISOString();
    const version = input.version ?? "current";
    const id = `src_${safeSlug(input.recordType)}_${safeSlug(input.recordId)}_${safeSlug(version)}`;

    const existing = this.records.get(id);
    if (existing) return existing;

    const record: EvidenceRecord = { ...input, id, retrievedAt };
    this.records.set(id, record);
    return record;
  }

  resolve(id: string): EvidenceRecord | null {
    return this.records.get(id) ?? null;
  }

  toReference(id: string): SourceReference | null {
    const record = this.resolve(id);
    if (!record) return null;

    return {
      id: record.id,
      title: record.title,
      recordType: record.recordType,
      recordId: record.recordId,
      version: record.version ?? null,
      retrievedAt: record.retrievedAt,
      sensitivity: record.sensitivity,
    };
  }

  size() {
    return this.records.size;
  }
}

