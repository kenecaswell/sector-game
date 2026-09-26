// The synced room state's shape lives in shared/state.ts — the one copy, which the server's schema
// classes implement. Re-exported here so client code imports from this file as usual.
export type * from '../../../shared/state';
