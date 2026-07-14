import { describe, expect, test } from "vitest";
import { countContextEntries, isContextEffectivelyEmpty } from "../src/context.js";
import { CONTEXT_HEADER } from "../src/constants.js";

describe("context helpers", () => {
  test("treats header-only file as empty", () => {
    expect(isContextEffectivelyEmpty(CONTEXT_HEADER)).toBe(true);
  });

  test("counts prompt blocks", () => {
    const content = `${CONTEXT_HEADER}
## 2026-05-01T00:00:00.000Z

### prompt
test

---

## 2026-05-02T00:00:00.000Z

### prompt
test2
`;
    expect(countContextEntries(content)).toBe(2);
  });
});
