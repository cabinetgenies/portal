"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSessionContext } from "@/lib/auth/dal";
import { formDataToObject } from "@/lib/forms/action-state";
import { saveDraftArtifact } from "@/lib/ai/persistence";

/**
 * The only optional confirmable artifact action in Phase 7A: save a private
 * draft. Saving is not sending, and reviewing is not approving a payment. These
 * statuses stay explicit and separate.
 */

const saveDraftSchema = z.object({
  conversationId: z.string().min(1),
  runId: z.string().min(1),
  kind: z.string().min(1),
  title: z.string().min(1),
  subject: z.string().nullable().optional(),
  body: z.string().min(1),
});

export async function saveDraftAction(
  formData: FormData,
): Promise<void> {
  const session = await getSessionContext();
  if (!session || session.status !== "authorized") {
    return;
  }

  const parsed = saveDraftSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return;

  try {
    await saveDraftArtifact({
      userId: session.userId,
      conversationId: parsed.data.conversationId,
      runId: parsed.data.runId,
      kind: parsed.data.kind,
      title: parsed.data.title,
      subject: parsed.data.subject ?? null,
      body: parsed.data.body,
    });

    revalidatePath("/assistant");
  } catch (error) {
    console.error("Could not save draft:", error);
  }
}
