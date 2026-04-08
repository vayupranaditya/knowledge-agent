export type IntentType = "store_knowledge" | "update_knowledge" | "red_flag" | "register_person" | "none";

export interface ValidatedIntent {
  intent: IntentType;
  valid: boolean;
  data?: Record<string, unknown>;
  reason?: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateIntent(raw: Record<string, unknown>): ValidatedIntent {
  const action = raw.action;

  if (!isNonEmptyString(action)) {
    return { intent: "none", valid: false, reason: "Missing or empty action field" };
  }

  switch (action) {
    case "store": {
      const missing: string[] = [];
      for (const field of ["topic", "subtopic", "content", "source"]) {
        if (!isNonEmptyString(raw[field])) missing.push(field);
      }
      if (missing.length > 0) {
        return {
          intent: "store_knowledge",
          valid: false,
          reason: `Missing or empty required fields: ${missing.join(", ")}`,
        };
      }
      return { intent: "store_knowledge", valid: true, data: { ...raw } };
    }

    case "update": {
      const missing: string[] = [];
      if (!isNonEmptyString(raw.id)) missing.push("id");
      if (!isNonEmptyString(raw.content)) missing.push("content");
      if (missing.length > 0) {
        return {
          intent: "update_knowledge",
          valid: false,
          reason: `Missing or empty required fields: ${missing.join(", ")}`,
        };
      }
      return { intent: "update_knowledge", valid: true, data: { ...raw } };
    }

    case "red_flag": {
      const missing: string[] = [];
      for (const field of ["topic", "subtopic", "content", "source"]) {
        if (!isNonEmptyString(raw[field])) missing.push(field);
      }
      if (missing.length > 0) {
        return {
          intent: "red_flag",
          valid: false,
          reason: `Missing or empty required fields: ${missing.join(", ")}`,
        };
      }
      return { intent: "red_flag", valid: true, data: { ...raw } };
    }

    case "register_person": {
      const missing: string[] = [];
      if (!isNonEmptyString(raw.name)) missing.push("name");
      if (!isNonEmptyString(raw.role)) missing.push("role");
      if (missing.length > 0) {
        return {
          intent: "register_person",
          valid: false,
          reason: `Missing or empty required fields: ${missing.join(", ")}`,
        };
      }
      return { intent: "register_person", valid: true, data: { ...raw } };
    }

    default:
      return { intent: "none", valid: false, reason: `Unknown action: ${action}` };
  }
}
