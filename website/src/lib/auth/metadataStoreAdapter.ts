import type { MetadataStore, MetadataWhere, MetadataWhereOp } from "@engineering-notebook/shared";
import { createAdapterFactory } from "@better-auth/core/db/adapter";
import type { CleanedWhere, CustomAdapter } from "@better-auth/core/db/adapter";

function mapOp(operator: string): MetadataWhereOp {
  switch (operator) {
    case "eq":
      return "==";
    case "ne":
      return "!=";
    case "lt":
      return "<";
    case "lte":
      return "<=";
    case "gt":
      return ">";
    case "gte":
      return ">=";
    default:
      return "==";
  }
}

function normalizeVal(v: unknown): unknown {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string" && (v.includes("T") || v.endsWith("Z")) && !isNaN(Date.parse(v))) {
    return Date.parse(v);
  }
  return v;
}

function matchInProcess(row: Record<string, unknown>, where: CleanedWhere[]): boolean {
  for (const clause of where) {
    const rawVal = row[clause.field];
    const rawTarget = clause.value;

    const val = normalizeVal(rawVal);
    const target = normalizeVal(rawTarget);

    switch (clause.operator) {
      case "eq":
        if (typeof val === "string" && typeof target === "string") {
          if (val.toLowerCase() !== target.toLowerCase()) return false;
        } else if (val !== target) {
          return false;
        }
        break;
      case "ne":
        if (val === target) return false;
        break;
      case "lt":
        if ((val as number) >= (target as number)) return false;
        break;
      case "lte":
        if ((val as number) > (target as number)) return false;
        break;
      case "gt":
        if ((val as number) <= (target as number)) return false;
        break;
      case "gte":
        if ((val as number) < (target as number)) return false;
        break;
      case "in":
        if (Array.isArray(target) && !(target as unknown[]).includes(val)) return false;
        break;
      case "contains":
        if (typeof rawVal === "string" && typeof rawTarget === "string" && !rawVal.includes(rawTarget)) return false;
        break;
      case "starts_with":
        if (typeof rawVal === "string" && typeof rawTarget === "string" && !rawVal.startsWith(rawTarget)) return false;
        break;
      case "ends_with":
        if (typeof rawVal === "string" && typeof rawTarget === "string" && !rawVal.endsWith(rawTarget)) return false;
        break;
    }
  }
  return true;
}

/**
 * Creates a Better Auth database adapter backed by any implementation of MetadataStore.
 */
export const metadataStoreAdapter = (store: MetadataStore) => {
  return createAdapterFactory({
    config: {
      adapterId: "metadata-store",
      adapterName: "MetadataStore Adapter",
      supportsDates: false,
      supportsBooleans: true,
      supportsJSON: true,
      supportsArrays: true,
      supportsNumericIds: true,
      supportsUUIDs: false,
    },
    adapter: (): CustomAdapter => ({
      async create({ model, data }) {
        const id = String(data.id || (data as Record<string, unknown>)._id || crypto.randomUUID());
        const record = { ...data, id };
        const docPath = `${model}/${id}`;
        await store.set(docPath, record as Record<string, unknown>, { merge: false });
        return record;
      },

      async findOne({ model, where }) {
        const idClause = where.find((w) => w.field === "id");
        if (idClause && (!idClause.operator || idClause.operator === "eq")) {
          const doc = await store.get(`${model}/${String(idClause.value)}`);
          if (!doc) return null;
          if (!matchInProcess(doc, where)) return null;
          return doc as any;
        }

        const storeWheres: MetadataWhere[] = where
          .filter((w) => ["eq", "ne", "lt", "lte", "gt", "gte"].includes(w.operator))
          .map((w) => ({
            field: w.field,
            op: mapOp(w.operator),
            value: w.value,
          }));

        const results = await store.query(model, {
          where: storeWheres,
          limit: 10,
        });

        for (const row of results) {
          if (matchInProcess(row, where)) {
            return row as any;
          }
        }
        return null;
      },

      async findMany({ model, where, limit, sortBy }) {
        const idClause = (where || []).find((w) => w.field === "id");
        if (idClause && (!idClause.operator || idClause.operator === "eq")) {
          const doc = await store.get(`${model}/${String(idClause.value)}`);
          if (!doc || !matchInProcess(doc, where || [])) return [];
          return [doc as any];
        }

        const storeWheres: MetadataWhere[] = (where || [])
          .filter((w) => ["eq", "ne", "lt", "lte", "gt", "gte"].includes(w.operator))
          .map((w) => ({
            field: w.field,
            op: mapOp(w.operator),
            value: w.value,
          }));

        const results = await store.query(model, {
          where: storeWheres.length > 0 ? storeWheres : undefined,
          orderBy: sortBy ? { field: sortBy.field, direction: sortBy.direction } : undefined,
          limit: limit && limit > 0 ? limit * 2 : 100,
        });

        let filtered = where ? results.filter((r) => matchInProcess(r, where)) : results;
        if (limit && limit > 0) {
          filtered = filtered.slice(0, limit);
        }
        return filtered as any[];
      },

      async update({ model, where, update: updates }) {
        const idClause = where.find((w) => w.field === "id");
        if (idClause && idClause.operator === "eq") {
          const docPath = `${model}/${String(idClause.value)}`;
          const existing = await store.get(docPath);
          if (!existing || !matchInProcess(existing, where)) return null;
          const merged = { ...existing, ...updates, id: existing.id };
          await store.update(docPath, updates as Record<string, unknown>);
          return merged as any;
        }

        const target = await this.findOne({ model, where });
        if (!target) return null;
        const id = String((target as Record<string, unknown>).id);
        const docPath = `${model}/${id}`;
        await store.update(docPath, updates as Record<string, unknown>);
        return { ...(target as Record<string, unknown>), ...updates, id } as any;
      },

      async updateMany({ model, where, update: updates }) {
        const targets = await this.findMany({ model, where, limit: 100 });
        for (const t of targets) {
          const id = String((t as Record<string, unknown>).id);
          await store.update(`${model}/${id}`, updates as Record<string, unknown>);
        }
        return targets.length;
      },

      async delete({ model, where }) {
        const idClause = where.find((w) => w.field === "id");
        if (idClause && (!idClause.operator || idClause.operator === "eq")) {
          await store.delete(`${model}/${String(idClause.value)}`);
          return;
        }
        const target = await this.findOne({ model, where });
        if (target) {
          const id = String((target as Record<string, unknown>).id);
          await store.delete(`${model}/${id}`);
        }
      },

      async deleteMany({ model, where }) {
        const targets = await this.findMany({ model, where, limit: 500 });
        for (const t of targets) {
          const id = String((t as Record<string, unknown>).id);
          await store.delete(`${model}/${id}`);
        }
        return targets.length;
      },

      async count({ model, where }) {
        if (!where || where.length === 0) {
          if (store.count) {
            return await store.count(model);
          }
        }
        const targets = await this.findMany({ model, where, limit: 1000 });
        return targets.length;
      },
    }),
  });
};
