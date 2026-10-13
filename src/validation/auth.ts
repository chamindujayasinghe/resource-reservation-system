import { z } from "zod";

// Emails are stored lowercase, so input is normalised before the lookup.
export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(200),
});

export type Credentials = z.infer<typeof credentialsSchema>;
