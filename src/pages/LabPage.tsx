import { Navigate } from "react-router-dom";
import { EvidenceSection } from "../components/sections/EvidenceSection";
import { HeadlineSection } from "../components/sections/HeadlineSection";
import { PersonaSection } from "../components/sections/PersonaSection";
import { ResultSummarySection, SurveyQuestionSection } from "../components/sections/ResultsSection";
import { ComputePanel } from "../components/compute/ComputePanel";
import { demoMeta } from "../config/demoContent";
import { useLabController } from "../hooks/useLabController";
import { getQuestionBankEntry, getSourceReferences } from "../lib/contentRepository";

export function LabPage() {
  const {
    activeDemo,
    scenario,
    simulation,
    result,
    runLabel,
    runSelectedScenario,
  } = useLabController();

  if (!activeDemo) {
    return <Navigate to="/lab/opinion" replace />;
  }

  const question = result?.packet.question ?? getQuestionBankEntry(scenario.questionBankId);
  const primaryQuestionSource = getSourceReferences(question.sourceIds)[0] ?? null;

  return (
    <div className="lab-stack lab-editorial">
      <div className="lab-command-main">
        <HeadlineSection
          kicker={demoMeta[activeDemo].kicker}
          title={demoMeta[activeDemo].title}
          strap={demoMeta[activeDemo].strap}
          source={primaryQuestionSource}
        />
        {result ? (
          <SurveyQuestionSection
            packet={result.packet}
            label={scenario.title}
            status={simulation.status}
            progress={simulation.progress}
            stages={simulation.computeStages}
            onRun={runSelectedScenario}
            error={simulation.error}
            runLabel={runLabel}
          />
        ) : (
          <section className="result-card primary result-placeholder">
            <div className="card-topline">
              <span>{scenario.title}</span>
            </div>
            <div className="survey-question-head">
              <h1 className="survey-question-copy">{question.canonicalQuestion}</h1>
              <button className="accent-button survey-run-button" onClick={runSelectedScenario} disabled={simulation.status === "running"}>
                {runLabel}
              </button>
            </div>
            <ComputePanel
              status={simulation.status}
              progress={simulation.progress}
              stages={simulation.computeStages}
              onRun={runSelectedScenario}
              error={simulation.error}
              runLabel={runLabel}
              embedded
              showButton={false}
            />
          </section>
        )}
      </div>
      {result ? <ResultSummarySection summary={result.summary} segments={result.segments} /> : null}
      {result ? <PersonaSection responses={result.responses} /> : null}
      {result ? (
        <EvidenceSection
          activeDemo={activeDemo}
          packet={result.packet}
        />
      ) : null}
    </div>
  );
}
