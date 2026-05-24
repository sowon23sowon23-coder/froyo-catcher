import { getServiceSupabaseOrThrow } from "./couponData";
import { GAME_ACCESS_CONFIG_KEY, normalizeGameAccessConfig, resolveGameAccessState } from "./gameAccess";

export async function getGameAccessStateForServer(supabase = getServiceSupabaseOrThrow()) {
  const result = await supabase
    .from("coupon_config")
    .select("value")
    .eq("key", GAME_ACCESS_CONFIG_KEY)
    .maybeSingle();

  if (result.error) {
    console.error("Game access config lookup failed", result.error);
    return resolveGameAccessState(null);
  }

  return resolveGameAccessState(normalizeGameAccessConfig(result.data?.value));
}
