// Astro content collection schema for revision notes.
//
// The shape mirrors what scripts/clean-and-structure.js emits — keep them
// in sync. Frontmatter validation here means a malformed note file
// surfaces at build time with a clear path + field error.

import { defineCollection, z } from "astro:content";

const notes = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    module: z.string(),       // module id, e.g. "cp-22"
    moduleName: z.string(),   // full module name, e.g. "Markets"
    order: z.number(),        // sort key within a module; _index.md is 0
    summary: z.string().optional(),
    sources: z.array(z.string()).optional(),
  }),
});

export const collections = { notes };
