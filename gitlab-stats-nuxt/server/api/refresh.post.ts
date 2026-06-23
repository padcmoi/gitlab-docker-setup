import { cacheClear } from "../utils/cache";

export default defineEventHandler(() => {
  cacheClear();
  return { ok: true };
});
