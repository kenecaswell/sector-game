// Systems are plain modules, not Room subclasses, so they don't have direct
// access to `this.broadcast(...)`. GameRoom passes this thin callback down
// into each system's update() instead, keeping the systems unit-testable
// without a live Colyseus Room.
export type Broadcast = (type: string, payload: unknown) => void;
