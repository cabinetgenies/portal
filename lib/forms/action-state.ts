import { z } from "zod";

/**
 * The shared result shape for every Server Action backed by a form.
 *
 * Living outside any single domain module keeps the compensation and commission
 * features from having to import each other.
 */
export type ActionState =
  | {
      status: "error";
      message: string;
      fieldErrors?: Record<string, string[]>;
    }
  | {
      status: "success";
      message: string;
    }
  | undefined;

/** Reads a FormData payload into a plain object the schemas can consume. */
export function formDataToObject(formData: FormData): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      values[key] = value;
    }
  }

  return values;
}

/** Converts a Zod failure into the shared action state shape. */
export function validationErrorState(error: z.ZodError): ActionState {
  const flattened = z.flattenError(error).fieldErrors as Record<
    string,
    string[] | undefined
  >;
  const fieldErrors: Record<string, string[]> = {};

  for (const [field, messages] of Object.entries(flattened)) {
    if (messages && messages.length > 0) {
      fieldErrors[field] = messages;
    }
  }

  const firstMessage =
    Object.values(fieldErrors).flat()[0] ?? "Check the highlighted fields and try again.";

  return { status: "error", message: firstMessage, fieldErrors };
}

export function successState(message: string): ActionState {
  return { status: "success", message };
}

export function failureState(message: string): ActionState {
  return { status: "error", message };
}
