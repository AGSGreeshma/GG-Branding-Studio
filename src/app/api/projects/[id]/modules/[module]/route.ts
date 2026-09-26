import { NextResponse } from "next/server";
import { moduleSpec } from "@/lib/agents/registry";
import { getProject } from "@/lib/db/queries";
import { AppError } from "@/lib/schemas/errors";
import { MODULE_NAMES, type ModuleName } from "@/lib/schemas/workflow";
import { handleAntiGenericAction } from "@/lib/services/modules/anti-generic-actions";
import { handleBattleAction } from "@/lib/services/modules/battle-actions";
import { handleWorldsAction } from "@/lib/services/modules/worlds-actions";
import { withErrors } from "@/lib/services/route";
import { getOwnerId } from "@/lib/session";

/*
 * Explicit module runs (plan §18.3): the user's own actions on a module's
 * results. The orchestrator calls the same agents internally through
 * /workflow/next; this route exists for Choose, Combine, Revise, Explore and
 * Apply (§11.1).
 *
 * Thin by design (§18.2): resolve the owner, find the module, hand over to
 * that module's action service. JSON rather than SSE, because each action is
 * one call behind one loading message.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string; module: string }> };

function parseModule(value: string): ModuleName {
  const name = value.replace(/-/g, "_");
  if (!(MODULE_NAMES as readonly string[]).includes(name)) {
    throw new AppError("NOT_FOUND", { message: `Unknown module ${value}` });
  }
  return name as ModuleName;
}

export const POST = withErrors<Params>(async (request, { params }, meta) => {
  const ownerId = await getOwnerId();
  const { id, module: moduleParam } = await params;
  const moduleName = parseModule(moduleParam);
  const project = await getProject(ownerId, id);
  const body: unknown = await request.json();
  const handlerInput = { project, body, requestId: meta.requestId };

  switch (moduleName) {
    case "brand_battle":
      return NextResponse.json(await handleBattleAction(handlerInput));
    case "five_worlds":
      return NextResponse.json(await handleWorldsAction(handlerInput));
    case "anti_generic":
      return NextResponse.json(await handleAntiGenericAction(handlerInput));
    default: {
      const spec = moduleSpec(moduleName);
      throw new AppError("VALIDATION_ERROR", {
        message: `Module ${moduleName} has no explicit runner yet`,
        publicMessage: `"${spec.label}" arrives in the next build.`,
        retryable: false,
      });
    }
  }
});
