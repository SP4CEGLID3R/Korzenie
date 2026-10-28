import { setTaskStatusAction, autoSearchTaskAction } from "@/app/drzewa/[treeId]/tropiciel/actions";
import type { Suggestion } from "@/lib/detective/suggest";
import { TaskCard } from "./task-card";

type Status = { status: "OPEN" | "DONE" | "DISMISSED"; fromMatch: boolean };

/** Lista propozycji Tropiciela (karta osoby i strona Tropiciela). */
export function TaskList({
  treeId,
  tasks,
  statuses,
  canEdit,
  autoEnabled,
  showDone = false,
  personLabels,
}: {
  treeId: string;
  tasks: Suggestion[];
  statuses: Map<string, Status>;
  canEdit: boolean;
  autoEnabled: boolean;
  showDone?: boolean;
  personLabels?: Map<string, string>;
}) {
  const withStatus = tasks.map((t) => ({ task: t, s: statuses.get(`${t.personId}|${t.key}`) ?? { status: "OPEN" as const, fromMatch: false } }));
  const visible = withStatus.filter(({ s }) => showDone || s.status === "OPEN");
  const hidden = withStatus.length - visible.length;
  if (withStatus.length === 0) return null;

  return (
    <div>
      {visible.length === 0 ? (
        <p className="text-ink-muted">Wszystkie propozycje są zrobione albo pominięte.</p>
      ) : (
        <ul className="space-y-3">
          {visible.map(({ task, s }) => (
            <TaskCard
              key={`${task.personId}|${task.key}`}
              task={task}
              status={s.status}
              isNew={s.fromMatch}
              canEdit={canEdit}
              personLabel={personLabels?.get(task.personId)}
              personHref={personLabels ? `/drzewa/${treeId}/osoby/${task.personId}` : undefined}
              setStatus={setTaskStatusAction.bind(null, treeId, task.personId, task.key)}
              autoSearch={autoEnabled ? autoSearchTaskAction.bind(null, treeId, task.personId, task.key) : undefined}
            />
          ))}
        </ul>
      )}
      {hidden > 0 && !showDone && <p className="mt-2 text-sm text-ink-muted">Zrobione lub pominięte: {hidden}.</p>}
    </div>
  );
}
