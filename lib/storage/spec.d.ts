/**
 * 记忆系统领域声明（DSH storage-domain）。
 *
 * 以 zod schema 定义持久化形状，`ctx.storageDomain.open(spec)` 后经
 * `domain.table(name)` 获得类型化 KvTable。这是 json/sqlite 后端共用的单一权威。
 * @module @dsh/dsh-memory/storage/spec
 */
import { z } from 'zod';
import type { AtomicFact, FactStatus } from '../model/fact.js';
/** 持久化的事实记录：与模型 `AtomicFact` 对齐（id 为表键，其余全量存储）。 */
export declare const factRecord: z.ZodObject<{
    id: z.ZodString;
    subject: z.ZodObject<{
        type: z.ZodString;
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    predicate: z.ZodString;
    object: z.ZodObject<{
        type: z.ZodString;
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    qualifiers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    content: z.ZodString;
    type: z.ZodEnum<{
        semantic: "semantic";
        episodic: "episodic";
        procedural: "procedural";
    }>;
    scope: z.ZodString;
    source: z.ZodObject<{
        type: z.ZodEnum<{
            conversation: "conversation";
            user_edit: "user_edit";
            document: "document";
            llm_inference: "llm_inference";
        }>;
        uri: z.ZodString;
        extracted_by: z.ZodString;
        credibility: z.ZodNumber;
    }, z.core.$strip>;
    confidence: z.ZodNumber;
    version: z.ZodNumber;
    supersedes: z.ZodOptional<z.ZodString>;
    semantic_key: z.ZodString;
    status: z.ZodEnum<{
        active: "active";
        superseded: "superseded";
        archived: "archived";
        disputed: "disputed";
        expired: "expired";
    }>;
    privacy: z.ZodEnum<{
        private: "private";
        project: "project";
        org: "org";
        public: "public";
    }>;
    ttl: z.ZodOptional<z.ZodString>;
    embedding: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
    entities: z.ZodOptional<z.ZodArray<z.ZodString>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    episodic: z.ZodOptional<z.ZodObject<{
        event_time: z.ZodString;
        participants: z.ZodArray<z.ZodString>;
        outcome: z.ZodString;
        duration: z.ZodOptional<z.ZodString>;
        artifacts: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    procedural: z.ZodOptional<z.ZodObject<{
        steps: z.ZodArray<z.ZodString>;
        preconditions: z.ZodArray<z.ZodString>;
        tool_chain: z.ZodArray<z.ZodString>;
        success_rate: z.ZodNumber;
    }, z.core.$strip>>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
}, z.core.$strip>;
/** 一条持久化事实（zod 推断类型）。 */
export type FactRecord = z.infer<typeof factRecord>;
/** 记忆系统持久化领域：`facts` 表按 id 存原子事实。 */
export declare const memoryDomainSpec: {
    name: string;
    version: number;
    tables: {
        facts: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<string, {
            id: string;
            subject: {
                type: string;
                id: string;
                name?: string | undefined;
            };
            predicate: string;
            object: {
                type: string;
                id: string;
                name?: string | undefined;
            };
            content: string;
            type: "semantic" | "episodic" | "procedural";
            scope: string;
            source: {
                type: "conversation" | "user_edit" | "document" | "llm_inference";
                uri: string;
                extracted_by: string;
                credibility: number;
            };
            confidence: number;
            version: number;
            semantic_key: string;
            status: "active" | "superseded" | "archived" | "disputed" | "expired";
            privacy: "private" | "project" | "org" | "public";
            created_at: string;
            updated_at: string;
            qualifiers?: Record<string, unknown> | undefined;
            supersedes?: string | undefined;
            ttl?: string | undefined;
            embedding?: number[] | undefined;
            entities?: string[] | undefined;
            tags?: string[] | undefined;
            episodic?: {
                event_time: string;
                participants: string[];
                outcome: string;
                duration?: string | undefined;
                artifacts?: string[] | undefined;
            } | undefined;
            procedural?: {
                steps: string[];
                preconditions: string[];
                tool_chain: string[];
                success_rate: number;
            } | undefined;
        }>;
    };
};
/** 校验一条 AtomicFact 是否为可持久化形状（非法即抛）。 */
export declare function toFactRecord(fact: AtomicFact): FactRecord;
/** 兼容：把存储上的记录还原为模型类型（类型层面一致，JSON 直通）。 */
export declare function fromFactRecord(record: FactRecord): AtomicFact;
export type { FactStatus };
//# sourceMappingURL=spec.d.ts.map