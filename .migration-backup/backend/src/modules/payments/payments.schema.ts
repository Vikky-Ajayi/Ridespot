import { z } from "zod";

export const checkoutSchema = z.object({
  tier: z.enum(["pro", "fleet"])
});
