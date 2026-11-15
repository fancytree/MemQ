import { AssertionReplay } from '../../src/assertionReplay.js';
export { AssertionReplay };

// Local-only fixture. Never deploy this unauthenticated test route.
export default {
  async fetch(req: Request, env: { REPLAY: DurableObjectNamespace<AssertionReplay> }): Promise<Response> {
    const { id } = await req.json() as { id: string };
    return Response.json({ claimed: await env.REPLAY.getByName(id).claim() });
  },
};
