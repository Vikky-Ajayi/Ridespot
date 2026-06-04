import { z } from "zod";

export const manualIngestionSchema = z.object({
  cities: z.array(z.string()).optional()
});
