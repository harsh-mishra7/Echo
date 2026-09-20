"use node";

import { ConvexError, v } from "convex/values";
import { action } from "../_generated/server";
import { extractTextContent } from "../lib/extractTextContent";
import rag from "../system/ai/rag";
import type { EntryMetadata } from "./files";

export const addFile = action({
  args: {
    filename: v.string(),
    mimeType: v.string(),
    storageId: v.id("_storage"),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Identity not found",
      });
    }

    const orgId = identity.orgId as string;

    if (!orgId) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Organization not found",
      });
    }

    const { storageId, filename, mimeType, category } = args;

    const metadata = await ctx.storage.getMetadata(storageId);

    if (!metadata) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Uploaded file not found",
      });
    }

    const text = await extractTextContent(ctx, {
      storageId,
      filename,
      mimeType,
    });

    const { entryId, created } = await rag.add(ctx, {
      // SUPER IMPORTANT: What search space to add this to. You cannot search across namespaces,
      // if not added, it will be considered global (we do not want this)
      namespace: orgId,
      text,
      key: filename,
      title: filename,
      metadata: {
        storageId, // Important for File deletion
        uploadedBy: orgId, // Important for deletion
        filename,
        category: category ?? null,
      } as EntryMetadata,
      contentHash: metadata.sha256, // Prevent duplicate files
    });

    if (!created) {
      console.debug("entry already exists, skipping upload metadata");
      await ctx.storage.delete(storageId);
    }

    return {
      url: await ctx.storage.getUrl(storageId),
      entryId,
    };
  },
});
