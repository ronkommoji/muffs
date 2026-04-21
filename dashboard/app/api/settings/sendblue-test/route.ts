import { testConnection, getSendblueEnv } from "@/lib/sendblue";

export const dynamic = "force-dynamic";

export async function POST() {
  const toNumber = getSendblueEnv().toNumber;
  if (!toNumber) {
    return Response.json({
      ok: false,
      error: "SENDBLUE_TO_NUMBER is not set in the environment.",
    });
  }
  const result = await testConnection(toNumber);
  return Response.json(result);
}
