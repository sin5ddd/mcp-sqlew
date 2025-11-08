/**
 * Master table entity interfaces
 * These represent the master/reference data tables (m_* tables)
 */

export interface Agent {
  readonly id: number;
  readonly name: string;
}

export interface File {
  readonly id: number;
  readonly path: string;
}

export interface ContextKey {
  readonly id: number;
  readonly key: string;
}

export interface ConstraintCategory {
  readonly id: number;
  readonly name: string;
}

export interface Layer {
  readonly id: number;
  readonly name: string;
}

export interface Tag {
  readonly id: number;
  readonly name: string;
}

export interface Scope {
  readonly id: number;
  readonly name: string;
}
