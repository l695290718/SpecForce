import { z } from "zod";

export const Invoice = z.object({ id: z.string() });

router.post("/invoices", async (_request, response) => {
  events.emit("invoice.created");
  response.sendStatus(202);
});
