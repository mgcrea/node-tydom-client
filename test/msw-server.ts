import { setupServer } from "msw/node";

// No default handlers: every spec declares the exchange it expects via
// `server.use(...)`, so an unstubbed request fails loudly instead of reaching
// a real Tydom gateway.
export const server = setupServer();
