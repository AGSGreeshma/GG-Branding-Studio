import { NextResponse } from "next/server";
import { runInterviewer } from "@/lib/agents/interviewer";
import { AiCallError } from "@/lib/ai/llm";
import {
  addInterviewTurn,
  getLatestContext,
  getLockedPaths,
  getProject,
  listInterviewTurns,
  recordRun,
  saveContext,
  updateProjectWorkflow,
} from "@/lib/db/queries";
import { AppError } from "@/lib/schemas/errors";
import {
  InterviewRequestSchema,
  type InterviewResponse,
  type InterviewTurn,
} from "@/lib/schemas/interview";
import { DEFAULT_PROJECT_NAME } from "@/lib/schemas/project";
import { applyInterviewerOutput } from "@/lib/services/context-manager";
import { decideCompletion } from "@/lib/services/interview";
import { logEvent } from "@/lib/services/log";
import { withErrors } from "@/lib/services/route";
import { completeStep, defaultPlanFor, planHasModule } from "@/lib/services/workflow-engine";
import { getOwnerId } from "@/lib/session";

/*
 * One Brand Interviewer turn (plan §18.3, H7).
 * Saves the user's answer, runs the agent, applies the extracted updates to the
 * Brand Context with provenance, records the run trace, saves the assistant turn
 * and decides completion in code (§7.4). One model call per request, so no
 * streaming here (Phase 3 adds it for the slower modules).
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

/** Only turns that carried a question count towards the six-question limit. */
function countQuestions(turns: InterviewTurn[]): number {
  return turns.filter((turn) => turn.role === "assistant" && turn.question_reason !== null).length;
}

export const POST = withErrors<Params>(async (request, { params }, meta) => {
  const ownerId = await getOwnerId();
  const { id } = await params;
  const project = await getProject(ownerId, id);

  const rawBody = await request.json().catch(() => ({}));
  const body = InterviewRequestSchema.parse(rawBody ?? {});

  const plan = project.currentPlanJson ?? defaultPlanFor(project.entryStage);
  if (!planHasModule(plan, "interviewer")) {
    throw new AppError("VALIDATION_ERROR", {
      message: `Project ${project.id} (${project.entryStage}) has no interviewer step`,
      publicMessage: "This project doesn't start with an interview.",
    });
  }

  const [snapshot, turns, lockedPaths] = await Promise.all([
    getLatestContext(project.id),
    listInterviewTurns(project.id),
    getLockedPaths(project.id),
  ]);

  const interviewStep = plan.steps.find((step) => step.module === "interviewer");
  const alreadyComplete = interviewStep?.status === "complete";

  const respond = (over: Partial<InterviewResponse> = {}): Response =>
    NextResponse.json({
      turn: null,
      user_turn: null,
      context: snapshot.context,
      version: snapshot.version,
      complete: alreadyComplete,
      completion_reason: null,
      questions_asked: countQuestions(turns),
      plan,
      declined: false,
      ...over,
    } satisfies InterviewResponse);

  // Already finished, or the page was reloaded with an unanswered question open:
  // return the current state instead of spending another model call.
  if (alreadyComplete) return respond();
  const lastTurn = turns[turns.length - 1];
  if (!body.answer && !body.skip && lastTurn?.role === "assistant") {
    return respond({ turn: lastTurn });
  }

  const finish = async (
    reason: NonNullable<InterviewResponse["completion_reason"]>,
    context = snapshot.context,
    version = snapshot.version,
    answerTurn: InterviewTurn | null = null,
  ) => {
    const nextPlan = completeStep(plan, "interviewer");
    await updateProjectWorkflow(project.id, {
      workflowState: "WORKFLOW_PLANNING",
      plan: nextPlan,
    });
    logEvent("info", "interview.completed", {
      request_id: meta.requestId,
      project_id: project.id,
      reason,
      questions_asked: countQuestions(turns),
    });
    return NextResponse.json({
      turn: null,
      user_turn: answerTurn,
      context,
      version,
      complete: true,
      completion_reason: reason,
      questions_asked: countQuestions(turns),
      plan: nextPlan,
      declined: false,
    } satisfies InterviewResponse);
  };

  // "That's enough, continue" (§7.4): no model call needed.
  if (body.skip) return finish("user_skipped");

  // A retry after a failed turn re-sends the same answer; don't store it twice.
  let userTurn: InterviewTurn | null =
    body.answer && lastTurn?.role === "user" && lastTurn.content === body.answer ? lastTurn : null;
  if (body.answer && !userTurn) {
    userTurn = await addInterviewTurn({
      projectId: project.id,
      role: "user",
      content: body.answer,
    });
    turns.push(userTurn);
  }

  const questionsAsked = countQuestions(turns);

  let result;
  try {
    result = await runInterviewer({
      entryStage: project.entryStage,
      context: snapshot.context,
      turns,
      questionsAsked,
      lockedPaths,
    });
  } catch (err) {
    if (err instanceof AiCallError) {
      // The failed call is still part of the project's history (F9, E11).
      await recordRun({
        projectId: project.id,
        trace: err.trace,
        module: "interviewer",
        stage: "DISCOVERY",
        status: "failed",
      }).catch(() => undefined);
    }
    throw err;
  }

  const runId = await recordRun({
    projectId: project.id,
    trace: result.trace,
    module: "interviewer",
    stage: "DISCOVERY",
    outputContext: result.output,
  });

  const applied = applyInterviewerOutput(snapshot.context, result.output, {
    agent: "interviewer",
    source: "user",
    runId,
    lockedPaths,
  });
  if (applied.blockedPaths.length) {
    logEvent("warn", "context.locked_paths_skipped", {
      request_id: meta.requestId,
      project_id: project.id,
      paths: applied.blockedPaths.join(","),
    });
  }

  const saved = await saveContext(project.id, applied.context, snapshot.version);

  // Give the project a real title as soon as the user names it.
  const extractedName = saved.context.project.name.trim();
  if (
    extractedName &&
    extractedName !== project.name &&
    project.name === DEFAULT_PROJECT_NAME[project.entryStage]
  ) {
    await updateProjectWorkflow(project.id, { name: extractedName });
  }

  if (result.output.refusal) {
    const turn = await addInterviewTurn({
      projectId: project.id,
      role: "assistant",
      content: result.output.refusal,
      runId,
    });
    logEvent("warn", "interview.declined", {
      request_id: meta.requestId,
      project_id: project.id,
    });
    return NextResponse.json({
      turn,
      user_turn: userTurn,
      context: saved.context,
      version: saved.version,
      complete: false,
      completion_reason: null,
      questions_asked: questionsAsked,
      plan,
      declined: true,
    } satisfies InterviewResponse);
  }

  // Completion is decided here, in code, never by the model (§7.4).
  const decision = decideCompletion({
    context: saved.context,
    questionsAsked,
    skipRequested: false,
  });
  if (decision.complete && decision.reason) {
    return finish(decision.reason, saved.context, saved.version, userTurn);
  }

  const question = result.output.next_question.trim();
  if (!question) {
    throw new AppError("AI_OUTPUT_INVALID", {
      message: `Interviewer returned an empty question for project ${project.id}`,
    });
  }

  const turn = await addInterviewTurn({
    projectId: project.id,
    role: "assistant",
    content: question,
    questionReason: result.output.question_reason.trim(),
    suggestedAnswers: result.output.suggested_answers,
    runId,
  });

  return NextResponse.json({
    turn,
    user_turn: userTurn,
    context: saved.context,
    version: saved.version,
    complete: false,
    completion_reason: null,
    questions_asked: questionsAsked + 1,
    plan,
    declined: false,
  } satisfies InterviewResponse);
});
