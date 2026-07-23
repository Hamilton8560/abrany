import "../setup.ts"; // MUST be first — sets DATA_DIR before lib modules load
import {
  createUser,
  createGoal,
  createPlan,
  createLessonStubs,
  setLessonContent,
  type Lesson,
} from "../../lib/repo.ts";

let counter = 0;

/** Seed one isolated user → goal → plan → milestone → lesson. `ready` gives it content+status. */
export function seedReadyLesson({ ready = true }: { ready?: boolean } = {}): {
  userId: number;
  goalId: number;
  planItemId: number;
  lesson: Lesson;
} {
  const i = ++counter;
  const user = createUser(`test${i}@example.com`, "hash");
  const goal = createGoal(user.id, `Goal ${i}`);
  const plan = createPlan(goal.id, `Plan ${i}`, "summary", [{ title: `Milestone ${i}` }]);
  const planItem = plan.items[0];
  const [lesson] = createLessonStubs(planItem.id, [
    { title: `Lesson ${i}`, objective: "Recall the key idea." },
  ]);
  if (ready) setLessonContent(lesson.id, "# Body\nThe content of the lesson.");
  return { userId: user.id, goalId: goal.id, planItemId: planItem.id, lesson };
}
